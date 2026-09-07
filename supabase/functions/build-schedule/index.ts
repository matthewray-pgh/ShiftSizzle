// Drafts one role's weekly assignments. Given the coverage targets, the
// eligible people and their availability + weekly shift caps, and (when
// copying) last week's assignments, it returns a list of {employee_id, day,
// shift} picks. The client re-validates every pick against the same rules
// the reducer enforces before applying it, so a bad model response can only
// produce a smaller schedule, never an invalid one.
//
// Service_role key: membership check without the caller's RLS, as elsewhere.
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

  const { role, days, shift_types, employees, requirements, existing_assignments, last_week, week_label } = body ?? {};

  if (!role || !Array.isArray(days) || !Array.isArray(shift_types) || !Array.isArray(employees) || !requirements) {
    return jsonResponse({ error: 'role, days, shift_types, employees and requirements are required' }, 400);
  }

  if (employees.length === 0) {
    return jsonResponse({ ok: true, draft: { assignments: [], notes: 'No eligible employees for this role.' } });
  }

  const { data: callerMembership, error: membershipError } = await adminClient
    .from('memberships')
    .select('account_role')
    .eq('user_id', callerData.user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (membershipError || !callerMembership || !['owner', 'manager'].includes(callerMembership.account_role)) {
    return jsonResponse({ error: 'Not authorized to build schedules' }, 403);
  }

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const payload = {
    role,
    week_label: week_label ?? null,
    days,
    shift_types,
    employees,
    requirements,
    existing_assignments: existing_assignments ?? [],
    last_week: last_week ?? null,
  };

  try {
    const response = await anthropic.messages.parse({
      model: 'claude-sonnet-5',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: 'json_schema', schema: SCHEDULE_SCHEMA },
      },
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
    });

    if (response.stop_reason === 'refusal') {
      return jsonResponse({ error: 'The schedule could not be generated.' }, 422);
    }

    return jsonResponse({ ok: true, draft: response.parsed_output });
  } catch (error) {
    return jsonResponse({ error: error.message ?? 'Schedule generation failed' }, 500);
  }
});
