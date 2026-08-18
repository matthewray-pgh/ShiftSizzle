// Invites a manager or staff member into the caller's organization.
//
// Runs under the service_role key because inviting a user is an Admin API
// call (auth.admin.inviteUserByEmail) that provisions an auth.users row and
// sends the invite email — something no RLS policy can grant a browser
// client, since it isn't a table operation at all.
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

  const { email, accountRole, employeeId } = body ?? {};

  if (!email || !['manager', 'staff'].includes(accountRole)) {
    return jsonResponse({ error: 'email and a valid accountRole (manager or staff) are required' }, 400);
  }

  const { data: callerMembership, error: membershipError } = await adminClient
    .from('memberships')
    .select('org_id, account_role')
    .eq('user_id', callerData.user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (membershipError || !callerMembership || !['owner', 'manager'].includes(callerMembership.account_role)) {
    return jsonResponse({ error: 'Not authorized to invite members' }, 403);
  }

  const orgId = callerMembership.org_id;

  const { data: membershipRow, error: upsertError } = await adminClient
    .from('memberships')
    .upsert(
      {
        org_id: orgId,
        invited_email: email,
        account_role: accountRole,
        employee_id: employeeId ?? null,
        invited_by: callerData.user.id,
        status: 'invited',
      },
      { onConflict: 'org_id,invited_email' }
    )
    .select()
    .single();

  if (upsertError) {
    return jsonResponse({ error: upsertError.message }, 500);
  }

  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { org_id: orgId, invited_membership_id: membershipRow.id },
  });

  if (inviteError) {
    return jsonResponse({ error: inviteError.message }, 500);
  }

  return jsonResponse({ ok: true, membershipId: membershipRow.id });
});
