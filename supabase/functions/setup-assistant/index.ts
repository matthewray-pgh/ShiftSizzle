// Turns a one-line description of a business ("coffee shop open 6-3 weekdays,
// two baristas and a lead at open") into a full scheduling setup: shift
// types, roles, operating hours, and a per-role coverage template. The
// client reviews the result before anything is saved.
//
// Runs under the service_role key for the same reason scan-employee does:
// verifying the caller's membership means reading the memberships table
// without being subject to their own RLS policy.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizeSetup } from '../_shared/aiOutput.ts';
import { consumeAiQuota, settleAiQuota } from '../_shared/aiQuota.ts';
import { generateJson } from '../_shared/anthropic.ts';
import { corsHeaders, errorResponse, jsonResponse, readJsonBody } from '../_shared/http.ts';
import { logAi } from '../_shared/log.ts';

const FN = 'setup-assistant';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const MAX_BODY_BYTES = 16 * 1024;
const TIMEOUT_MS = 60_000;

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Structured outputs reject numeric and length keywords (`minimum`,
// `minItems`, ...), so ranges are enforced in `normalizeSetup` instead.
const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });

const SETUP_SCHEMA = {
  type: 'object',
  properties: {
    week_starts_on: nullable({ type: 'string', enum: DAYS }),
    shift_types: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          start_time: nullable({ type: 'string', description: 'HH:MM 24-hour' }),
          end_time: nullable({ type: 'string', description: 'HH:MM 24-hour' }),
        },
        required: ['label', 'start_time', 'end_time'],
        additionalProperties: false,
      },
    },
    team_roles: { type: 'array', items: { type: 'string' } },
    operating_hours: {
      type: 'array',
      description: 'Exactly 7 entries, one per day Sunday..Saturday.',
      items: {
        type: 'object',
        properties: {
          day: { type: 'string', enum: DAYS },
          is_open: { type: 'boolean' },
          open_time: nullable({ type: 'string', description: 'HH:MM 24-hour; null when closed' }),
          close_time: nullable({ type: 'string', description: 'HH:MM 24-hour; null when closed' }),
        },
        required: ['day', 'is_open', 'open_time', 'close_time'],
        additionalProperties: false,
      },
    },
    coverage: {
      type: 'array',
      description: 'Headcount per role per shift, applied to every open day.',
      items: {
        type: 'object',
        properties: {
          role: { type: 'string' },
          shift_label: { type: 'string' },
          count: { type: 'integer', description: 'Zero or more.' },
        },
        required: ['role', 'shift_label', 'count'],
        additionalProperties: false,
      },
    },
    summary: { type: 'string', description: 'One sentence describing what was set up.' },
  },
  required: ['week_starts_on', 'shift_types', 'team_roles', 'operating_hours', 'coverage', 'summary'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You configure staff-scheduling setups for small hospitality and retail businesses.
From the owner's description, produce:
- shift_types: the named parts of a working day (e.g. Open, Mid, Close). 2-4 of them. Include times only if the description implies them.
- team_roles: the job roles that get scheduled (e.g. Server, Cook, Barista, Manager). 2-6 of them.
- operating_hours: exactly 7 entries, Sunday through Saturday. Mark days closed if the description says so; otherwise open with sensible hours.
- coverage: how many people of each role each shift needs, on a normal open day. Every role should appear at least once with a non-zero count for at least one shift.
- week_starts_on: only if the description states it; otherwise null.
Use 24-hour HH:MM times. Do not invent roles or days the description contradicts.`;

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

  const description = `${request.body.description ?? ''}`.trim();

  if (description.length < 8) {
    return errorResponse('Describe your business in a sentence or two.', 400, 'invalid_request');
  }

  if (description.length > 2000) {
    return errorResponse('That description is too long — keep it to a few sentences.', 400, 'invalid_request');
  }

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
    return errorResponse('Not authorized to configure this workspace', 403, 'forbidden');
  }

  const orgId = callerMembership.org_id;

  const quota = await consumeAiQuota(adminClient, { fn: FN, orgId, userId: callerData.user.id });

  if (!quota.ok) {
    return errorResponse(quota.error, quota.status, quota.code);
  }

  const result = await generateJson({
    fn: FN,
    orgId,
    system: SYSTEM_PROMPT,
    content: description,
    schema: SETUP_SCHEMA,
    effort: 'low',
    maxTokens: 8000,
    timeoutMs: TIMEOUT_MS,
  });

  await settleAiQuota(adminClient, { fn: FN, orgId, eventId: quota.eventId, result });

  if (!result.ok) {
    return errorResponse(result.error, result.status, result.code);
  }

  const setup = normalizeSetup(result.value);

  if (!setup) {
    logAi('error', FN, { org_id: orgId, code: 'ai_incomplete_output', status: 422 });

    return errorResponse('That description didn’t give enough to build a setup — add a bit more detail and try again.', 422, 'ai_incomplete_output');
  }

  return jsonResponse({ ok: true, setup });
};

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (error) {
    logAi('error', FN, { code: 'internal_error', status: 500, detail: `${error?.name ?? 'Error'}: ${error?.message ?? ''}`.slice(0, 500) });

    return errorResponse('Something went wrong generating that.', 500, 'internal_error');
  }
});
