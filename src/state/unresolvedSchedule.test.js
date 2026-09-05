import { describe, expect, it } from 'vitest';

import { getUnresolvedScheduleItems } from './AppState';

const settings = {
  shiftTypes: ['Open'],
  teamRoles: ['Manager', 'Server'],
  operatingHours: {
    Monday: { isOpen: true, openTime: '09:00', closeTime: '17:00' },
    Tuesday: { isOpen: true, openTime: '09:00', closeTime: '17:00' },
  },
};

const employees = [
  { id: 'm1', name: 'Mo', roles: ['Manager'], status: 'active', shiftsPerWeek: 5, availability: { Monday: ['Open'], Tuesday: ['Open'] } },
  { id: 's1', name: 'Sy', roles: ['Server'], status: 'active', shiftsPerWeek: 5, availability: { Monday: ['Open'], Tuesday: ['Open'] } },
];

const record = (over) => ({
  id: `${over.startDate}__${over.role}`,
  startDate: over.startDate,
  endDate: over.endDate ?? over.startDate,
  weekLabel: over.weekLabel ?? over.startDate,
  role: over.role,
  status: over.status ?? 'draft',
  requirements: over.requirements ?? { Monday: { Open: 1 } },
  assignments: over.assignments ?? {},
});

const stateWith = (schedules) => ({ settings, employees, schedules });

describe('getUnresolvedScheduleItems', () => {
  const today = '2026-06-01';

  it('flags a draft-but-full role as unpublished and a short-staffed role as open', () => {
    const items = getUnresolvedScheduleItems(stateWith([
      record({ startDate: '2026-06-08', role: 'Manager', status: 'draft', assignments: { m1: { Monday: ['Open'] } } }),
      record({ startDate: '2026-06-08', role: 'Server', status: 'published', assignments: {} }),
    ]), today);

    expect(items).toHaveLength(2);
    expect(items.find((i) => i.role === 'Manager')).toMatchObject({ unpublished: true, openSlots: 0 });
    expect(items.find((i) => i.role === 'Server')).toMatchObject({ openSlots: 1, firstGapDay: 'Monday' });
  });

  it('says nothing when a role is both published and fully staffed', () => {
    const items = getUnresolvedScheduleItems(stateWith([
      record({ startDate: '2026-06-08', role: 'Manager', status: 'published', assignments: { m1: { Monday: ['Open'] } } }),
    ]), today);

    expect(items).toEqual([]);
  });

  it('ignores weeks that have already fully passed', () => {
    const items = getUnresolvedScheduleItems(stateWith([
      record({ startDate: '2026-05-18', endDate: '2026-05-24', role: 'Manager', status: 'draft', assignments: { m1: { Monday: ['Open'] } } }),
    ]), today);

    expect(items).toEqual([]);
  });

  it('ignores records with no signal at all (no demand, no assignments)', () => {
    const items = getUnresolvedScheduleItems(stateWith([
      record({ startDate: '2026-06-08', role: 'Manager', status: 'draft', requirements: { Monday: { Open: 0 } }, assignments: {} }),
    ]), today);

    expect(items).toEqual([]);
  });

  it('sorts by week then role', () => {
    const items = getUnresolvedScheduleItems(stateWith([
      record({ startDate: '2026-06-15', role: 'Server' }),
      record({ startDate: '2026-06-08', role: 'Server' }),
      record({ startDate: '2026-06-08', role: 'Manager' }),
    ]), today);

    expect(items.map((i) => `${i.startDate}/${i.role}`)).toEqual([
      '2026-06-08/Manager',
      '2026-06-08/Server',
      '2026-06-15/Server',
    ]);
  });
});
