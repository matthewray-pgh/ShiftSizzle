// Per-org AI usage limits. The counting and the insert happen atomically in
// the `consume_ai_quota` Postgres function (migration 0009); this file owns
// the numbers. No Deno globals or URL imports, so Vitest can load it.
import { logAi } from './log.ts';

// Calls allowed per org, per function, over a trailing 24 hours. Every org
// is on `default` until billing adds a plan to `organizations`; pass that
// plan name to `aiLimitFor` then.
export const AI_PLAN_LIMITS = {
  default: {
    'setup-assistant': 20,
    'build-schedule': 100,
  },
};

export const aiLimitFor = (fn, plan = 'default') =>
  (AI_PLAN_LIMITS[plan] ?? AI_PLAN_LIMITS.default)[fn] ?? 0;

const QUOTA_MESSAGES = {
  'setup-assistant': 'Your workspace has used all of its AI setup requests for today. Try again later, or set things up by hand.',
  'build-schedule': 'Your workspace has used all of its AI schedule drafts for today. Try again later, or use Auto-fill.',
};

// Reserves one call against the org's allowance. Returns
// `{ ok: true, eventId }` or `{ ok: false, error, status, code }`. A failed
// check refuses the call rather than letting unmetered usage through.
export const consumeAiQuota = async (adminClient, { fn, orgId, userId, plan }) => {
  const limit = aiLimitFor(fn, plan);
  const { data, error } = await adminClient.rpc('consume_ai_quota', {
    p_org_id: orgId,
    p_user_id: userId,
    p_function: fn,
    p_limit: limit,
  });
  const row = Array.isArray(data) ? data[0] : data;

  if (error || !row) {
    logAi('error', fn, { org_id: orgId, code: 'quota_check_failed', status: 500, detail: error?.message ?? 'no row returned' });

    return { ok: false, error: 'Could not check your AI usage. Try again.', status: 500, code: 'internal_error' };
  }

  if (!row.allowed) {
    logAi('error', fn, { org_id: orgId, code: 'ai_quota_exceeded', status: 429, used: row.used, limit });

    return { ok: false, error: QUOTA_MESSAGES[fn] ?? 'Your workspace has reached its AI limit for today.', status: 429, code: 'ai_quota_exceeded' };
  }

  return { ok: true, eventId: row.event_id };
};

// Called after the model answers (or fails). A call that never produced a
// response is handed back; otherwise the token counts are saved on the row.
export const settleAiQuota = async (adminClient, { fn, orgId, eventId, result }) => {
  const query = result.refund
    ? adminClient.from('ai_usage_events').delete().eq('id', eventId)
    : adminClient.from('ai_usage_events').update({
        input_tokens: result.usage?.input_tokens ?? null,
        output_tokens: result.usage?.output_tokens ?? null,
      }).eq('id', eventId);
  const { error } = await query;

  if (error) {
    logAi('error', fn, { org_id: orgId, code: 'quota_settle_failed', detail: error.message });
  }
};
