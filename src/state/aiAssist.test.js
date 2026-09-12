import { describe, expect, it, vi } from 'vitest';

import { DAYS } from './AppState';
import { AI_UNAVAILABLE, aiSetupToSettingsPayload, requestAiSchedule, requestAiSetup, requestTunedCoverage } from './aiAssist';

const SAMPLE_SETUP = {
  week_starts_on: 'Monday',
  shift_types: [
    { label: 'Open', start_time: '07:00', end_time: '12:00' },
    { label: 'Close', start_time: '12:00', end_time: '18:00' },
    { label: 'Bad', start_time: 'nope', end_time: null },
  ],
  team_roles: ['Barista', 'Shift Lead', 'Barista'],
  operating_hours: [
    { day: 'Monday', is_open: true, open_time: '07:00', close_time: '18:00' },
    { day: 'Tuesday', is_open: true, open_time: '07:00', close_time: '18:00' },
    { day: 'Sunday', is_open: false, open_time: null, close_time: null },
  ],
  coverage: [
    { role: 'Barista', shift_label: 'Open', count: 2 },
    { role: 'Barista', shift_label: 'Close', count: 1 },
    { role: 'Shift Lead', shift_label: 'Open', count: 1 },
    { role: 'Ghost', shift_label: 'Open', count: 5 },
  ],
  summary: 'Cafe open Mon–Sat.',
};

describe('aiSetupToSettingsPayload', () => {
  it('maps the assistant JSON into a settings payload', () => {
    const payload = aiSetupToSettingsPayload(SAMPLE_SETUP);

    expect(payload.shiftTypes).toEqual(['Open', 'Close', 'Bad']);
    expect(payload.shiftTimes.Open).toEqual({ startTime: '07:00', endTime: '12:00' });
    expect(payload.shiftTimes.Bad).toEqual({ startTime: '', endTime: '' });
    expect(payload.teamRoles).toEqual(['Barista', 'Shift Lead']);
    expect(payload.weekStartsOn).toBe('Monday');
  });

  it('fills all 7 days and closes days the model marked closed', () => {
    const payload = aiSetupToSettingsPayload(SAMPLE_SETUP);

    expect(Object.keys(payload.operatingHours)).toEqual(DAYS);
    expect(payload.operatingHours.Monday).toEqual({ isOpen: true, openTime: '07:00', closeTime: '18:00' });
    expect(payload.operatingHours.Sunday).toEqual({ isOpen: false, openTime: '', closeTime: '' });
    // Days the model didn't mention default to closed rather than guessed-open.
    expect(payload.operatingHours.Friday.isOpen).toBe(false);
  });

  it('keeps coverage only for known roles and shifts, expanded to open days', () => {
    const payload = aiSetupToSettingsPayload(SAMPLE_SETUP);

    // Only shifts the model gave a count for appear here; AppState's
    // normalizeRoleCoverage backfills the rest to 0 when the payload lands.
    expect(payload.roleCoverage.Barista.Monday).toEqual({ Open: 2, Close: 1 });
    expect(payload.roleCoverage.Barista.Sunday).toEqual({ Open: 0, Close: 0 });
    expect(payload.roleCoverage.Ghost).toBeUndefined();
  });

  it('returns null when essentials are missing', () => {
    expect(aiSetupToSettingsPayload(null)).toBeNull();
    expect(aiSetupToSettingsPayload({ shift_types: [], team_roles: ['x'] })).toBeNull();
    expect(aiSetupToSettingsPayload({ shift_types: [{ label: 'Open', start_time: null, end_time: null }], team_roles: [] })).toBeNull();
  });
});

const fakeSupabase = (invokeImpl) => ({ functions: { invoke: vi.fn(invokeImpl) } });

describe('requestAiSetup', () => {
  it('returns a dispatch-ready payload on success', async () => {
    const supabase = fakeSupabase(async () => ({ data: { ok: true, setup: SAMPLE_SETUP }, error: null }));

    const result = await requestAiSetup(supabase, 'A cafe open weekdays');

    expect(result.ok).toBe(true);
    expect(result.payload.teamRoles).toEqual(['Barista', 'Shift Lead']);
    expect(result.summary).toBe('Cafe open Mon–Sat.');
  });

  it('signals AI_UNAVAILABLE when the function is not deployed', async () => {
    const supabase = fakeSupabase(async () => ({
      data: null,
      error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' },
    }));

    expect(await requestAiSetup(supabase, 'A cafe')).toEqual({ error: AI_UNAVAILABLE });
  });

  it('passes a real server error through', async () => {
    const supabase = fakeSupabase(async () => ({ data: { error: 'Not authorized to configure this workspace' }, error: null }));

    expect(await requestAiSetup(supabase, 'A cafe')).toEqual({ error: 'Not authorized to configure this workspace' });
  });

  it('rejects an incomplete generated setup', async () => {
    const supabase = fakeSupabase(async () => ({ data: { ok: true, setup: { shift_types: [], team_roles: [] } }, error: null }));

    const result = await requestAiSetup(supabase, 'A cafe');
    expect(result.error).toMatch(/incomplete/i);
  });
});

describe('requestTunedCoverage', () => {
  const args = { templateLabel: 'Full-service restaurant', roles: ['Server', 'Cook'], shiftTypes: ['Open', 'Close'], note: 'we seat 60' };

  it('keeps only the headcounts for the template\'s own roles and shifts', async () => {
    const supabase = fakeSupabase(async () => ({
      data: {
        ok: true,
        setup: {
          ...SAMPLE_SETUP,
          shift_types: [{ label: 'Open', start_time: null, end_time: null }, { label: 'Close', start_time: null, end_time: null }],
          team_roles: ['Server', 'Cook'],
          coverage: [
            { role: 'Server', shift_label: 'Open', count: 3 },
            { role: 'Server', shift_label: 'Close', count: 4 },
            { role: 'Cook', shift_label: 'Open', count: 2 },
            { role: 'Host', shift_label: 'Open', count: 9 },
          ],
          summary: 'Bumped dinner staffing.',
        },
      },
      error: null,
    }));

    const result = await requestTunedCoverage(supabase, args);

    expect(result.ok).toBe(true);
    expect(result.coverageByRole).toEqual({ Server: { Open: 3, Close: 4 }, Cook: { Open: 2 } });
    expect(result.summary).toBe('Bumped dinner staffing.');
  });

  it('passes AI_UNAVAILABLE through', async () => {
    const supabase = fakeSupabase(async () => ({ data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send' } }));
    expect(await requestTunedCoverage(supabase, args)).toEqual({ error: AI_UNAVAILABLE });
  });

  it('errors when nothing usable came back', async () => {
    const supabase = fakeSupabase(async () => ({
      data: { ok: true, setup: { ...SAMPLE_SETUP, shift_types: [{ label: 'Open', start_time: null, end_time: null }], team_roles: ['Server'], coverage: [{ role: 'Ghost', shift_label: 'Nope', count: 5 }] } },
      error: null,
    }));

    const result = await requestTunedCoverage(supabase, args);
    expect(result.error).toMatch(/empty/i);
  });
});

describe('requestAiSchedule', () => {
  it('normalizes the draft assignments', async () => {
    const supabase = fakeSupabase(async () => ({
      data: {
        ok: true,
        draft: {
          assignments: [
            { employee_id: 'e1', day: 'Monday', shift: 'Open' },
            { employee_id: '', day: 'Monday', shift: 'Open' },
            { day: 'Tuesday', shift: 'Close' },
          ],
          notes: 'Tuesday close is short one.',
        },
      },
      error: null,
    }));

    const result = await requestAiSchedule(supabase, { role: 'Barista' });

    expect(result.ok).toBe(true);
    expect(result.assignments).toEqual([{ employeeId: 'e1', day: 'Monday', shift: 'Open' }]);
    expect(result.notes).toBe('Tuesday close is short one.');
  });

  it('signals AI_UNAVAILABLE on a 404', async () => {
    const supabase = fakeSupabase(async () => ({ data: null, error: { message: 'Requested function was not found', context: { status: 404 } } }));

    expect(await requestAiSchedule(supabase, { role: 'Barista' })).toEqual({ error: AI_UNAVAILABLE });
  });
});
