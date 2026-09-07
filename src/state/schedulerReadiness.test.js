import { describe, expect, it } from 'vitest';

import { getSchedulerReadiness } from './AppState';

const baseState = (overrides = {}) => ({
  settings: {
    weekStartsOn: '',
    shiftTypes: ['Open'],
    teamRoles: ['Server'],
    roleCoverage: {},
    operatingHours: {},
    ...overrides.settings,
  },
  employees: overrides.employees ?? [],
  schedule: { roleRequirements: {}, ...overrides.schedule },
});

const openMonday = { Monday: { isOpen: true, openTime: '09:00', closeTime: '17:00' } };

describe('getSchedulerReadiness', () => {
  it('reports every step as not done for a brand-new org', () => {
    const readiness = getSchedulerReadiness(baseState());

    expect(readiness.ready).toBe(false);
    expect(readiness.steps.map((step) => step.done)).toEqual([false, false, false, false]);
  });

  it('is ready once week, hours, coverage template and a matching roster are all set', () => {
    const readiness = getSchedulerReadiness(baseState({
      settings: {
        weekStartsOn: 'Monday',
        operatingHours: openMonday,
        roleCoverage: { Server: { Monday: { Open: 2 } } },
      },
      employees: [{ id: '1', roles: ['Server'], status: 'active' }],
    }));

    expect(readiness).toMatchObject({ hasWeek: true, hasHours: true, hasCoverage: true, hasTeam: true, ready: true });
  });

  it('counts coverage as done when the loaded week already carries requirements', () => {
    const readiness = getSchedulerReadiness(baseState({
      settings: { weekStartsOn: 'Monday', operatingHours: openMonday },
      employees: [{ id: '1', roles: ['Server'], status: 'active' }],
      schedule: { roleRequirements: { Server: { Monday: { Open: 1 } } } },
    }));

    expect(readiness.hasCoverage).toBe(true);
    expect(readiness.ready).toBe(true);
  });

  it('does not count an archived-only roster as a team', () => {
    const settings = { weekStartsOn: 'Monday', operatingHours: openMonday, roleCoverage: { Server: { Monday: { Open: 1 } } } };

    expect(getSchedulerReadiness(baseState({
      settings,
      employees: [{ id: '1', roles: ['Server'], status: 'archived' }],
    })).hasTeam).toBe(false);

    expect(getSchedulerReadiness(baseState({
      settings,
      employees: [
        { id: '1', roles: ['Server'], status: 'archived' },
        { id: '2', roles: ['Server'], status: 'active' },
      ],
    })).hasTeam).toBe(true);
  });
});
