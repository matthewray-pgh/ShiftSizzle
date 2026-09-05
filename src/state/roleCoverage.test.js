import { describe, expect, it } from 'vitest';

import { normalizeRoleCoverage } from './AppState';

describe('normalizeRoleCoverage (coverage template)', () => {
  it('fills every role/day/shift, clamping to non-negative integers', () => {
    const result = normalizeRoleCoverage(
      { Server: { Monday: { Open: 3, Close: -2 }, Friday: { Open: '4' } } },
      ['Server', 'Cook'],
      ['Open', 'Close'],
    );

    expect(result.Server.Monday).toEqual({ Open: 3, Close: 0 });
    expect(result.Server.Friday).toEqual({ Open: 4, Close: 0 });
    expect(result.Server.Sunday).toEqual({ Open: 0, Close: 0 });
    expect(result.Cook.Monday).toEqual({ Open: 0, Close: 0 });
  });

  it('drops roles and shift labels that are no longer configured', () => {
    const result = normalizeRoleCoverage(
      { Server: { Monday: { Open: 2, Brunch: 5 } }, Dishwasher: { Monday: { Open: 1 } } },
      ['Server'],
      ['Open'],
    );

    expect(Object.keys(result)).toEqual(['Server']);
    expect(result.Server.Monday).toEqual({ Open: 2 });
  });

  it('does NOT zero closed days — the template keeps intent across hours changes', () => {
    // No operatingHours argument at all: every day keeps its value.
    const result = normalizeRoleCoverage({ Server: { Sunday: { Open: 2 } } }, ['Server'], ['Open']);

    expect(result.Server.Sunday).toEqual({ Open: 2 });
  });
});
