import { describe, expect, it } from 'vitest';

import { normalizeDraft, normalizeScheduleRequest, normalizeSetup, readModelJson, SCHEDULE_LIMITS } from './aiOutput.ts';
import { errorResponse, readJsonBody } from './http.ts';

const message = (text, stopReason = 'end_turn') => ({
  stop_reason: stopReason,
  content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }],
});

describe('readModelJson', () => {
  it('parses the text block, ignoring thinking blocks', () => {
    expect(readModelJson(message('{"a":1}'))).toEqual({ ok: true, value: { a: 1 } });
  });

  it('reports a refusal as 422', () => {
    expect(readModelJson(message('', 'refusal'))).toMatchObject({ ok: false, status: 422, code: 'ai_refused' });
  });

  it('reports an empty response as 502', () => {
    expect(readModelJson({ stop_reason: 'end_turn', content: [] })).toMatchObject({ ok: false, status: 502, code: 'ai_empty_output' });
    expect(readModelJson(null)).toMatchObject({ ok: false, status: 502, code: 'ai_empty_output' });
  });

  it('reports a max_tokens cut-off rather than parsing partial JSON', () => {
    expect(readModelJson(message('{"assignments":[', 'max_tokens'))).toMatchObject({ ok: false, status: 502, code: 'ai_truncated' });
  });

  it('reports non-JSON and non-object output as malformed', () => {
    expect(readModelJson(message('Sure! Here you go'))).toMatchObject({ ok: false, status: 502, code: 'ai_malformed_output' });
    expect(readModelJson(message('[1,2]'))).toMatchObject({ ok: false, status: 502, code: 'ai_malformed_output' });
  });
});

describe('normalizeSetup', () => {
  const raw = {
    week_starts_on: 'Monday',
    shift_types: [
      { label: ' Open ', start_time: '06:00', end_time: '25:00' },
      { label: 'Open', start_time: null, end_time: null },
      { label: '', start_time: null, end_time: null },
    ],
    team_roles: ['Barista', 'Barista', '  '],
    operating_hours: [
      { day: 'Monday', is_open: true, open_time: '06:00', close_time: '15:00' },
      { day: 'Funday', is_open: true, open_time: '06:00', close_time: '15:00' },
    ],
    coverage: [
      { role: 'Barista', shift_label: 'Open', count: -3 },
      { role: 'Barista', shift_label: 'Open', count: 2.9 },
      { role: 'Ghost', shift_label: 'Open', count: 1 },
    ],
    summary: 'A cafe.',
  };

  it('dedupes labels, drops bad times, and always returns seven days', () => {
    const setup = normalizeSetup(raw);

    expect(setup.shift_types).toEqual([{ label: 'Open', start_time: '06:00', end_time: null }]);
    expect(setup.team_roles).toEqual(['Barista']);
    expect(setup.operating_hours).toHaveLength(7);
    expect(setup.operating_hours[1]).toEqual({ day: 'Monday', is_open: true, open_time: '06:00', close_time: '15:00' });
    expect(setup.operating_hours[0]).toEqual({ day: 'Sunday', is_open: false, open_time: null, close_time: null });
  });

  it('enforces non-negative integer headcounts and known roles/shifts', () => {
    expect(normalizeSetup(raw).coverage).toEqual([
      { role: 'Barista', shift_label: 'Open', count: 0 },
      { role: 'Barista', shift_label: 'Open', count: 2 },
    ]);
  });

  it('returns null without shift types or roles', () => {
    expect(normalizeSetup({ ...raw, shift_types: [] })).toBeNull();
    expect(normalizeSetup({ ...raw, team_roles: 'Barista' })).toBeNull();
    expect(normalizeSetup('nope')).toBeNull();
  });
});

const scheduleBody = () => ({
  role: 'Barista',
  week_label: 'Oct 12 – Oct 18',
  days: ['Monday', 'Tuesday'],
  shift_types: ['Open', 'Close'],
  employees: [
    { id: 'e1', name: 'Ada', shifts_per_week: 3, availability: { Monday: ['Open', 'Nights'], Tuesday: 'all' }, email: 'ada@example.com' },
    { id: 'e2', name: 'Bo', shifts_per_week: 'lots', availability: null },
  ],
  requirements: { Monday: { Open: 2, Close: -1 }, Tuesday: { Open: '1' } },
  existing_assignments: [
    { employee_id: 'e1', day: 'Monday', shift: 'Open', role: 'Cook' },
    { employee_id: 'stranger', day: 'Monday', shift: 'Open', role: 'Cook' },
  ],
});

describe('normalizeScheduleRequest', () => {
  it('keeps only the fields the prompt uses', () => {
    const { ok, payload } = normalizeScheduleRequest(scheduleBody());

    expect(ok).toBe(true);
    expect(payload.employees).toEqual([
      { id: 'e1', name: 'Ada', shifts_per_week: 3, availability: { Monday: ['Open'], Tuesday: [] } },
      { id: 'e2', name: 'Bo', shifts_per_week: null, availability: { Monday: [], Tuesday: [] } },
    ]);
    expect(payload.requirements).toEqual({ Monday: { Open: 2, Close: 0 }, Tuesday: { Open: 1, Close: 0 } });
    expect(payload.existing_assignments).toEqual([{ employee_id: 'e1', day: 'Monday', shift: 'Open', role: 'Cook' }]);
    expect(payload.last_week).toBeNull();
  });

  it('filters last_week to known people, days and shifts', () => {
    const { payload } = normalizeScheduleRequest({
      ...scheduleBody(),
      last_week: [
        { employee_id: 'e2', day: 'Tuesday', shift: 'Close' },
        { employee_id: 'e2', day: 'Sunday', shift: 'Close' },
      ],
    });

    expect(payload.last_week).toEqual([{ employee_id: 'e2', day: 'Tuesday', shift: 'Close' }]);
  });

  it('rejects missing or oversized input', () => {
    expect(normalizeScheduleRequest({}).ok).toBe(false);
    expect(normalizeScheduleRequest({ ...scheduleBody(), days: ['Someday'] }).ok).toBe(false);
    expect(normalizeScheduleRequest({ ...scheduleBody(), existing_assignments: 'none' }).ok).toBe(false);
    expect(normalizeScheduleRequest({
      ...scheduleBody(),
      employees: Array.from({ length: SCHEDULE_LIMITS.employees + 1 }, (_, index) => ({ id: `e${index}` })),
    }).ok).toBe(false);
  });
});

describe('normalizeDraft', () => {
  const { payload } = normalizeScheduleRequest(scheduleBody());

  it('drops invented ids, days and shifts, and duplicate picks', () => {
    const draft = normalizeDraft({
      assignments: [
        { employee_id: 'e1', day: 'Monday', shift: 'Open' },
        { employee_id: 'e1', day: 'Monday', shift: 'Open' },
        { employee_id: 'e9', day: 'Monday', shift: 'Open' },
        { employee_id: 'e2', day: 'Friday', shift: 'Open' },
        { employee_id: 'e2', day: 'Tuesday', shift: 'Mid' },
        null,
      ],
      notes: ' Short on Tuesday. ',
    }, payload);

    expect(draft).toEqual({
      assignments: [{ employee_id: 'e1', day: 'Monday', shift: 'Open' }],
      notes: 'Short on Tuesday.',
      dropped: 5,
    });
  });

  it('returns null when there is no assignments list', () => {
    expect(normalizeDraft({ notes: 'hi' }, payload)).toBeNull();
    expect(normalizeDraft(null, payload)).toBeNull();
  });
});

describe('readJsonBody', () => {
  const post = (body, headers = {}) => new Request('http://localhost/fn', { method: 'POST', body, headers });

  it('returns the parsed object', async () => {
    expect(await readJsonBody(post('{"description":"cafe"}'), 1024)).toEqual({ ok: true, body: { description: 'cafe' } });
  });

  it('rejects bodies over the limit, whatever Content-Length says', async () => {
    const big = JSON.stringify({ description: 'x'.repeat(2000) });

    expect(await readJsonBody(post(big), 1024)).toMatchObject({ ok: false, status: 413, code: 'payload_too_large' });
    expect(await readJsonBody(post('{}', { 'content-length': '99999' }), 1024)).toMatchObject({ ok: false, status: 413 });
  });

  it('rejects invalid JSON and non-objects', async () => {
    expect(await readJsonBody(post('{nope'), 1024)).toMatchObject({ ok: false, status: 400, code: 'invalid_request' });
    expect(await readJsonBody(post('[1]'), 1024)).toMatchObject({ ok: false, status: 400 });
  });
});

describe('errorResponse', () => {
  it('answers with the status, message and code', async () => {
    const response = errorResponse('Nope', 403, 'forbidden');

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Nope', code: 'forbidden' });
  });
});
