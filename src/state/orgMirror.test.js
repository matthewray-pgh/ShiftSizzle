import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mirrorKey, readOrgMirror, writeOrgMirror } from './AppState';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('org mirror (offline-reload cache)', () => {
  const bundle = {
    settings: { businessName: 'ShiftSizzle', shiftTypes: ['Open'] },
    locations: [{ id: 'loc-1', name: 'Main location' }],
    employees: [{ id: 'e1', name: 'Ana' }],
    schedules: [{ id: '2026-05-25__Server', role: 'Server', status: 'draft' }],
    callOuts: [],
  };

  it('round-trips a bundle through localStorage under a per-org key', () => {
    writeOrgMirror('org-1', bundle);

    expect(window.localStorage.getItem(mirrorKey('org-1'))).toContain('ShiftSizzle');
    expect(readOrgMirror('org-1')).toEqual(bundle);
  });

  it('keeps orgs separate', () => {
    writeOrgMirror('org-1', bundle);

    expect(readOrgMirror('org-2')).toBeNull();
  });

  it('returns null for missing, malformed, or wrong-shaped data', () => {
    expect(readOrgMirror('nope')).toBeNull();

    window.localStorage.setItem(mirrorKey('bad-json'), '{not json');
    expect(readOrgMirror('bad-json')).toBeNull();

    window.localStorage.setItem(mirrorKey('half'), JSON.stringify({ settings: {}, employees: [] }));
    expect(readOrgMirror('half')).toBeNull();
  });

  it('never throws when storage itself is unavailable', () => {
    const boom = () => { throw new Error('SecurityError: storage disabled'); };
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);

    expect(() => writeOrgMirror('org-1', bundle)).not.toThrow();
    expect(readOrgMirror('org-1')).toBeNull();
  });
});
