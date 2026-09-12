// Grants an employee shared access to a second (non-home) location.
//
// RLS on employee_location_access already enforces "owner, or a manager
// with membership_locations access to the target location" for inserts —
// this function doesn't grant any capability RLS wouldn't already allow.
// It exists purely so an unauthorized attempt gets a clear 403 with a
// message instead of a silent insert failure, mirroring invite-member's
// auth/role-check shape.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');

  if (!authHeader) {
    return jsonResponse({ error: 'Missing authorization header' }, 401);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const token = authHeader.replace('Bearer ', '');
  const { data: callerData, error: callerError } = await adminClient.auth.getUser(token);

  if (callerError || !callerData.user) {
    return jsonResponse({ error: 'Invalid session' }, 401);
  }

  let body;

  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400);
  }

  const { employeeId, locationId } = body ?? {};

  if (!employeeId || !locationId) {
    return jsonResponse({ error: 'employeeId and locationId are required' }, 400);
  }

  const { data: callerMembership, error: membershipError } = await adminClient
    .from('memberships')
    .select('id, org_id, account_role')
    .eq('user_id', callerData.user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (membershipError || !callerMembership) {
    return jsonResponse({ error: 'Not authorized to grant location access' }, 403);
  }

  const isOwner = callerMembership.account_role === 'owner';

  if (!isOwner) {
    if (callerMembership.account_role !== 'manager') {
      return jsonResponse({ error: 'Not authorized to grant location access' }, 403);
    }

    const { data: grantedLocation, error: accessError } = await adminClient
      .from('membership_locations')
      .select('location_id')
      .eq('membership_id', callerMembership.id)
      .eq('location_id', locationId)
      .maybeSingle();

    if (accessError || !grantedLocation) {
      return jsonResponse({ error: 'You do not have access to that location' }, 403);
    }
  }

  // Confirm both the location and the employee actually belong to the
  // caller's org — never trust ids from the request body on their own.
  const [{ data: location, error: locationError }, { data: employee, error: employeeError }] = await Promise.all([
    adminClient.from('locations').select('id').eq('id', locationId).eq('org_id', callerMembership.org_id).maybeSingle(),
    adminClient.from('employees').select('id, location_id').eq('id', employeeId).eq('org_id', callerMembership.org_id).maybeSingle(),
  ]);

  if (locationError || !location) {
    return jsonResponse({ error: 'Location not found in your organization' }, 404);
  }

  if (employeeError || !employee) {
    return jsonResponse({ error: 'Employee not found in your organization' }, 404);
  }

  if (employee.location_id === locationId) {
    return jsonResponse({ error: 'This is already the employee\'s home location' }, 400);
  }

  const { data: grantRow, error: grantError } = await adminClient
    .from('employee_location_access')
    .upsert(
      { employee_id: employeeId, location_id: locationId, granted_by: callerData.user.id },
      { onConflict: 'employee_id,location_id' }
    )
    .select()
    .single();

  if (grantError) {
    return jsonResponse({ error: grantError.message }, 500);
  }

  return jsonResponse({ ok: true, grantId: grantRow.id });
});
