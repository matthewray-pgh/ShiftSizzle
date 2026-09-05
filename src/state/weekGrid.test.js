import { describe, expect, it } from 'vitest';

import { computeWeekGrid, coverageStatus } from './AppState';

const settings = {
  shiftTypes: ['Open', 'Close'],
  operatingHours: {
    Monday: { isOpen: true, openTime: '09:00', closeTime: '17:00' },
    Tuesday: { isOpen: true, openTime: '09:00', closeTime: '17:00' },
  },
};

const employees = [
  { id: 'e1', name: 'Ana', roles: ['Server'], status: 'active' },
  { id: 'e2', name: 'Ben', roles: ['Server'], status: 'active' },
  { id: 'e3', name: 'Cid', roles: ['Cook'], status: 'archived' },
];

describe('coverageStatus', () => {
  it('separates zero coverage from a partial shortfall', () => {
    expect(coverageStatus(0, 2)).toBe('none');
    expect(coverageStatus(1, 2)).toBe('partial');
    expect(coverageStatus(2, 2)).toBe('full');
    expect(coverageStatus(3, 2)).toBe('full');
  });

  it('reports no demand as empty', () => {
    expect(coverageStatus(0, 0)).toBe('empty');
    expect(coverageStatus(0, -1)).toBe('empty');
  });
});

describe('computeWeekGrid', () => {
  const schedule = {
    roleRequirements: {
      Server: {
        Monday: { Open: 2, Close: 1 },
        Tuesday: { Open: 1, Close: 0 },
      },
      Cook: {
        Monday: { Open: 1, Close: 0 },
        Tuesday: { Open: 0, Close: 0 },
      },
    },
    assignments: {
      Server: {
        e1: { Monday: ['Open'], Tuesday: ['Open'] },
        e2: { Monday: ['Open', 'Close'] },
      },
      Cook: {},
    },
  };

  it('rows-per-role mode aggregates every shift type into one cell per day', () => {
    const grid = computeWeekGrid({ schedule, employees, settings, teamRoles: ['Server', 'Cook'] });

    expect(grid.mode).toBe('roles');
    expect(grid.days).toEqual(['Monday', 'Tuesday']);

    const server = grid.rows.find((row) => row.role === 'Server');
    // Monday: needed 2+1=3, filled Open(e1,e2)=2 + Close(e2)=1 => 3 -> full
    expect(server.cells[0]).toMatchObject({ day: 'Monday', filled: 3, needed: 3, status: 'full' });
    // Tuesday: needed 1, filled Open(e1)=1 => full
    expect(server.cells[1]).toMatchObject({ day: 'Tuesday', filled: 1, needed: 1, status: 'full' });

    const cook = grid.rows.find((row) => row.role === 'Cook');
    // Monday: needed 1, nobody assigned (e3 is archived anyway) => none
    expect(cook.cells[0]).toMatchObject({ filled: 0, needed: 1, status: 'none' });
    // Tuesday: no demand => empty
    expect(cook.cells[1]).toMatchObject({ filled: 0, needed: 0, status: 'empty' });
  });

  it('single-role mode makes one row per shift type', () => {
    const grid = computeWeekGrid({ schedule, employees, settings, teamRoles: ['Server', 'Cook'], role: 'Server' });

    expect(grid.mode).toBe('shifts');
    expect(grid.rows.map((row) => row.key)).toEqual(['Open', 'Close']);

    const close = grid.rows.find((row) => row.shift === 'Close');
    // Monday Close: needed 1, filled by e2 => full
    expect(close.cells[0]).toMatchObject({ filled: 1, needed: 1, status: 'full' });
    // Tuesday Close: no demand => empty
    expect(close.cells[1]).toMatchObject({ filled: 0, needed: 0, status: 'empty' });

    const open = grid.rows.find((row) => row.shift === 'Open');
    // Monday Open: needed 2, filled e1+e2 => full; Tuesday Open needed 1 filled e1 => full
    expect(open.cells.map((cell) => cell.status)).toEqual(['full', 'full']);
  });

  it('labels a shift row with its configured time range', () => {
    const timed = { ...settings, shiftTimes: { Open: { startTime: '09:00', endTime: '13:00' } } };
    const grid = computeWeekGrid({ schedule, employees, settings: timed, teamRoles: ['Server'], role: 'Server' });

    expect(grid.rows.find((row) => row.shift === 'Open').label).toBe('Open · 9a–1p');
    expect(grid.rows.find((row) => row.shift === 'Close').label).toBe('Close');
  });

  it('excludes archived employees and only counts each role bucket for its own row', () => {
    const grid = computeWeekGrid({ schedule, employees, settings, teamRoles: ['Cook'], role: 'Cook' });
    const openRow = grid.rows.find((row) => row.shift === 'Open');

    expect(openRow.cells[0]).toMatchObject({ filled: 0, needed: 1, status: 'none' });
  });
});
