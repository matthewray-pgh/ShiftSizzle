// Drafts one role's weekly assignments. Given the coverage targets, the
// eligible people and their availability + weekly shift caps, and (when
// copying) last week's assignments, it returns a list of {employee_id, day,
// shift} picks. The client re-validates every pick against the same rules
// the reducer enforces before applying it, so a bad model response can only
// produce a smaller schedule, never an invalid one.
//
// Service_role key: membership check without the caller's RLS, as elsewhere.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizeDraft, normalizeScheduleRequest } from '../_shared/aiOutput.ts';
import { generateJson, logAi } from '../_shared/anthropic.ts';
import { corsHeaders, errorResponse, jsonResponse, readJsonBody } from '../_shared/http.ts';

const FN = 'build-schedule';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const MAX_BODY_BYTES = 512 * 1024;
// Edge Functions must answer within 150s; leave room for auth + parsing.
const TIMEOUT_MS = 120_000;

const SCHEDULE_SCHEMA = {
  type: 'object',
  properties: {
    assignments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          employee_id: { type: 'string' },
          day: { type: 'string' },
          shift: { type: 'string' },
        },
        required: ['employee_id', 'day', 'shift'],
        additionalProperties: false,
      },
    },
    notes: { type: 'string', description: 'Short note on trade-offs or gaps that could not be filled.' },
  },
  required: ['assignments', 'notes'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You build a fair weekly staff schedule for one role.
Rules you must not break:
- Only assign a person to a (day, shift) they are available for.
- Never exceed a person's weekly shift cap (shifts_per_week), counting shifts they already hold in existing_assignments.
- Never put the same person on two shifts on the same day.
Optimize, in order:
1. Meet each (day, shift) coverage target.
2. Spread shifts evenly across people rather than maxing a few out.
3. Avoid giving someone a closing shift immediately followed by an opening shift the next day.
4. Keep each person's days consistent week to week when last_week is provided.
If you cannot fully cover a shift, leave it short and explain briefly in notes. Do not invent employee ids, days, or shift labels.`;

const handle = async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405, 'method_not_allowed');
  }

  const authHeader = req.headers.get('Authorization');

  if (!authHeader) {
    return errorResponse('Missing authorization header', 401, 'unauthenticated');
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const token = authHeader.replace('Bearer ', '');
  const { data: callerData, error: callerError } = await adminClient.auth.getUser(token);

  if (callerError || !callerData.user) {
    return errorResponse('Invalid session', 401, 'unauthenticated');
  }

  const request = await readJsonBody(req, MAX_BODY_BYTES);

  if (!request.ok) {
    return errorResponse(request.error, request.status, request.code);
  }

  const normalized = normalizeScheduleRequest(request.body);

  if (!normalized.ok) {
    return errorResponse(normalized.error, 400, 'invalid_request');
  }

  const { payload } = normalized;

  const { data: callerMembership, error: membershipError } = await adminClient
    .from('memberships')
    .select('org_id, account_role')
    .eq('user_id', callerData.user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (membershipError) {
    logAi('error', FN, { code: 'membership_lookup_failed', status: 500, detail: membershipError.message });

    return errorResponse('Could not verify your workspace access. Try again.', 500, 'internal_error');
  }

  if (!callerMembership || !['owner', 'manager'].includes(callerMembership.account_role)) {
    return errorResponse('Not authorized to build schedules', 403, 'forbidden');
  }

  const orgId = callerMembership.org_id;

  if (payload.employees.length === 0) {
    return jsonResponse({ ok: true, draft: { assignments: [], notes: 'No eligible employees for this role.' } });
  }

  const result = await generateJson({
    fn: FN,
    orgId,
    system: SYSTEM_PROMPT,
    content: JSON.stringify(payload),
    schema: SCHEDULE_SCHEMA,
    effort: 'medium',
    maxTokens: 32000,
    timeoutMs: TIMEOUT_MS,
  });

  if (!result.ok) {
    return errorResponse(result.error, result.status, result.code);
  }

  const draft = normalizeDraft(result.value, payload);

  if (!draft) {
    logAi('error', FN, { org_id: orgId, code: 'ai_malformed_output', status: 502 });

    return errorResponse('The AI service returned a malformed response.', 502, 'ai_malformed_output');
  }

  if (draft.dropped > 0) {
    logAi('error', FN, { org_id: orgId, code: 'ai_invalid_picks_dropped', dropped: draft.dropped, kept: draft.assignments.length });
  }

  return jsonResponse({ ok: true, draft: { assignments: draft.assignments, notes: draft.notes } });
};

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (error) {
    logAi('error', FN, { code: 'internal_error', status: 500, detail: `${error?.name ?? 'Error'}: ${error?.message ?? ''}`.slice(0, 500) });

    return errorResponse('Something went wrong generating that.', 500, 'internal_error');
  }
});
