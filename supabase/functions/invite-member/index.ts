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

  const { accountRole, employeeId, locationIds } = body ?? {};
  // Stored lowercased so it matches the address on the account the invitee
  // creates; the invite-acceptance trigger compares the two.
  const email = `${body?.email ?? ''}`.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !['manager', 'staff'].includes(accountRole)) {
    return jsonResponse({ error: 'A valid email and accountRole (manager or staff) are required' }, 400);
  }

  const { data: callerMembership, error: membershipError } = await adminClient
    .from('memberships')
    .select('id, org_id, account_role')
    .eq('user_id', callerData.user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (membershipError || !callerMembership || !['owner', 'manager'].includes(callerMembership.account_role)) {
    return jsonResponse({ error: 'Not authorized to invite members' }, 403);
  }

  const orgId = callerMembership.org_id;

  // Only meaningful for manager invites — a staff member's location access
  // comes from employees.location_id / employee_location_access, not from
  // their membership.
  const requestedLocationIds = accountRole === 'manager' && Array.isArray(locationIds)
    ? [...new Set(locationIds.filter(Boolean))]
    : [];

  if (requestedLocationIds.length > 0) {
    const { data: validLocations, error: locationsError } = await adminClient
      .from('locations')
      .select('id')
      .eq('org_id', orgId)
      .in('id', requestedLocationIds);

    if (locationsError) {
      return jsonResponse({ error: 'Could not check locations' }, 500);
    }

    // Trust nothing from the request body beyond "these ids, if they're
    // actually this caller's own locations" — same rule orgId already
    // follows (it comes from the caller's membership, never the body).
    if ((validLocations ?? []).length !== requestedLocationIds.length) {
      return jsonResponse({ error: 'One or more locationIds do not belong to your organization' }, 400);
    }

    // A manager can only hand out access to locations they have themselves.
    if (callerMembership.account_role !== 'owner') {
      const { data: callerLocations, error: callerLocationsError } = await adminClient
        .from('membership_locations')
        .select('location_id')
        .eq('membership_id', callerMembership.id);

      if (callerLocationsError) {
        return jsonResponse({ error: 'Could not check your location access' }, 500);
      }

      const allowed = new Set((callerLocations ?? []).map((row) => row.location_id));

      if (requestedLocationIds.some((locationId) => !allowed.has(locationId))) {
        return jsonResponse({ error: 'You can only grant access to locations you manage' }, 403);
      }
    }
  }

  if (employeeId) {
    const { data: employee, error: employeeError } = await adminClient
      .from('employees')
      .select('id')
      .eq('id', employeeId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (employeeError || !employee) {
      return jsonResponse({ error: 'That team member is not in your organization' }, 400);
    }
  }

  // Re-inviting is only for invites still pending. Anyone who already has a
  // membership here (the owner included) is left alone: rewriting their row
  // to 'invited' would lock them out, since only a brand-new account ever
  // flips an invite back to active.
  const { data: orgMemberships, error: existingError } = await adminClient
    .from('memberships')
    .select('id, invited_email, status')
    .eq('org_id', orgId);

  if (existingError) {
    return jsonResponse({ error: 'Could not check existing members' }, 500);
  }

  const existing = (orgMemberships ?? []).find((row) => `${row.invited_email}`.toLowerCase() === email);

  if (existing && existing.status !== 'invited') {
    return jsonResponse({ error: 'That person is already a member of this workspace' }, 409);
  }

  const invite = {
    org_id: orgId,
    invited_email: email,
    account_role: accountRole,
    employee_id: employeeId ?? null,
    invited_by: callerData.user.id,
    status: 'invited',
  };

  const { data: membershipRow, error: saveError } = existing
    ? await adminClient.from('memberships').update(invite).eq('id', existing.id).select().single()
    : await adminClient.from('memberships').insert(invite).select().single();

  if (saveError) {
    return jsonResponse({ error: 'Could not save the invite' }, 500);
  }

  if (accountRole === 'manager') {
    // Re-invites replace the membership's location grants wholesale rather
    // than merging, so this call is always the authoritative list.
    const { error: clearLocationsError } = await adminClient
      .from('membership_locations')
      .delete()
      .eq('membership_id', membershipRow.id);

    if (clearLocationsError) {
      return jsonResponse({ error: 'Could not update location access' }, 500);
    }

    if (requestedLocationIds.length > 0) {
      const { error: grantLocationsError } = await adminClient
        .from('membership_locations')
        .insert(requestedLocationIds.map((locationId) => ({
          membership_id: membershipRow.id,
          location_id: locationId,
          granted_by: callerData.user.id,
        })));

      if (grantLocationsError) {
        return jsonResponse({ error: 'Could not update location access' }, 500);
      }
    }
  }

  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { org_id: orgId, invited_membership_id: membershipRow.id },
  });

  if (inviteError) {
    return jsonResponse({ error: inviteError.message }, 500);
  }

  return jsonResponse({ ok: true, membershipId: membershipRow.id });
});
