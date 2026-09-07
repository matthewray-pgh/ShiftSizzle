// Turns a one-line description of a business ("coffee shop open 6-3 weekdays,
// two baristas and a lead at open") into a full scheduling setup: shift
// types, roles, operating hours, and a per-role coverage template. The
// client reviews the result before anything is saved.
//
// Runs under the service_role key for the same reason scan-employee does:
// verifying the caller's membership means reading the memberships table
// without being subject to their own RLS policy.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const SETUP_SCHEMA = {
  type: 'object',
  properties: {
    week_starts_on: { type: ['string', 'null'], enum: [...DAYS, null] },
    shift_types: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          start_time: { type: ['string', 'null'], description: 'HH:MM 24-hour, or null' },
          end_time: { type: ['string', 'null'], description: 'HH:MM 24-hour, or null' },
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
          open_time: { type: ['string', 'null'], description: 'HH:MM 24-hour, or null when closed' },
          close_time: { type: ['string', 'null'], description: 'HH:MM 24-hour, or null when closed' },
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
          count: { type: 'integer', minimum: 0 },
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

  const description = `${body?.description ?? ''}`.trim();

  if (description.length < 8) {
    return jsonResponse({ error: 'Describe your business in a sentence or two.' }, 400);
  }

  if (description.length > 2000) {
    return jsonResponse({ error: 'That description is too long — keep it to a few sentences.' }, 400);
  }

  const { data: callerMembership, error: membershipError } = await adminClient
    .from('memberships')
    .select('account_role')
    .eq('user_id', callerData.user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (membershipError || !callerMembership || !['owner', 'manager'].includes(callerMembership.account_role)) {
    return jsonResponse({ error: 'Not authorized to configure this workspace' }, 403);
  }

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  try {
    const response = await anthropic.messages.parse({
      model: 'claude-sonnet-5',
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: 'json_schema', schema: SETUP_SCHEMA },
      },
      messages: [{ role: 'user', content: description }],
    });

    if (response.stop_reason === 'refusal') {
      return jsonResponse({ error: 'That description could not be processed.' }, 422);
    }

    return jsonResponse({ ok: true, setup: response.parsed_output });
  } catch (error) {
    return jsonResponse({ error: error.message ?? 'Setup generation failed' }, 500);
  }
});
