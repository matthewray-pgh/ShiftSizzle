import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_PLAN_LIMITS, aiLimitFor, consumeAiQuota, settleAiQuota } from './aiQuota.ts';

// Stands in for the service-role client: `rpc` answers like
// consume_ai_quota, and table writes are recorded.
const fakeAdminClient = (rpcResult) => {
  const writes = [];
  const rpc = vi.fn(async () => rpcResult);
  const from = (table) => ({
    update: (values) => ({ eq: async (column, value) => { writes.push({ table, op: 'update', values, [column]: value }); return { error: null }; } }),
    delete: () => ({ eq: async (column, value) => { writes.push({ table, op: 'delete', [column]: value }); return { error: null }; } }),
  });

  return { rpc, from, writes };
};

const args = { fn: 'build-schedule', orgId: 'org-1', userId: 'user-1' };

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('aiLimitFor', () => {
  it('reads the default plan and falls back to it for unknown plans', () => {
    expect(aiLimitFor('setup-assistant')).toBe(AI_PLAN_LIMITS.default['setup-assistant']);
    expect(aiLimitFor('build-schedule', 'no-such-plan')).toBe(AI_PLAN_LIMITS.default['build-schedule']);
  });

  it('allows nothing for a function with no limit defined', () => {
    expect(aiLimitFor('mystery-function')).toBe(0);
  });
});

describe('consumeAiQuota', () => {
  it('passes the org, user, function and plan limit to the database', async () => {
    const client = fakeAdminClient({ data: [{ allowed: true, used: 4, event_id: 'evt-1' }], error: null });

    expect(await consumeAiQuota(client, args)).toEqual({ ok: true, eventId: 'evt-1' });
    expect(client.rpc).toHaveBeenCalledWith('consume_ai_quota', {
      p_org_id: 'org-1',
      p_user_id: 'user-1',
      p_function: 'build-schedule',
      p_limit: AI_PLAN_LIMITS.default['build-schedule'],
    });
  });

  it('answers 429 with a clear message once the limit is reached', async () => {
    const client = fakeAdminClient({ data: [{ allowed: false, used: 100, event_id: null }], error: null });
    const result = await consumeAiQuota(client, args);

    expect(result).toMatchObject({ ok: false, status: 429, code: 'ai_quota_exceeded' });
    expect(result.error).toMatch(/used all of its AI schedule drafts/);
  });

  it('refuses the call when the check itself fails', async () => {
    const client = fakeAdminClient({ data: null, error: { message: 'function consume_ai_quota does not exist' } });

    expect(await consumeAiQuota(client, args)).toMatchObject({ ok: false, status: 500, code: 'internal_error' });
  });
});

describe('settleAiQuota', () => {
  it('records token counts for a call the model answered', async () => {
    const client = fakeAdminClient();

    await settleAiQuota(client, { ...args, eventId: 'evt-1', result: { ok: true, usage: { input_tokens: 900, output_tokens: 300 } } });

    expect(client.writes).toEqual([{ table: 'ai_usage_events', op: 'update', values: { input_tokens: 900, output_tokens: 300 }, id: 'evt-1' }]);
  });

  it('hands the call back when the model was never reached', async () => {
    const client = fakeAdminClient();

    await settleAiQuota(client, { ...args, eventId: 'evt-1', result: { ok: false, refund: true } });

    expect(client.writes).toEqual([{ table: 'ai_usage_events', op: 'delete', id: 'evt-1' }]);
  });
});
