import { describe, expect, it } from 'vitest';

import {
  formatShiftLabel,
  formatShiftTimeRange,
  getShiftTime,
  normalizeShiftTimes,
} from './AppState';

describe('shift times (optional per-label metadata)', () => {
  it('returns an entry for every current shift type, defaulting to empty strings', () => {
    expect(normalizeShiftTimes({}, ['Open', 'Close'])).toEqual({
      Open: { startTime: '', endTime: '' },
      Close: { startTime: '', endTime: '' },
    });
  });

  it('keeps configured times and drops entries for labels that no longer exist', () => {
    const result = normalizeShiftTimes(
      {
        Open: { startTime: '06:00', endTime: '11:00' },
        Brunch: { startTime: '10:00', endTime: '14:00' },
      },
      ['Open', 'Close'],
    );

    expect(result).toEqual({
      Open: { startTime: '06:00', endTime: '11:00' },
      Close: { startTime: '', endTime: '' },
    });
  });

  it('coerces non-string time values to empty strings', () => {
    expect(normalizeShiftTimes({ Open: { startTime: 600, endTime: null } }, ['Open'])).toEqual({
      Open: { startTime: '', endTime: '' },
    });
  });

  it('formats a full range in compact restaurant style', () => {
    expect(formatShiftTimeRange({ startTime: '11:00', endTime: '16:00' })).toBe('11a–4p');
    expect(formatShiftTimeRange({ startTime: '13:30', endTime: '23:00' })).toBe('1:30p–11p');
  });

  it('formats a one-sided or missing range without inventing the other end', () => {
    expect(formatShiftTimeRange({ startTime: '09:00', endTime: '' })).toBe('9a');
    expect(formatShiftTimeRange({ startTime: '', endTime: '17:00' })).toBe('5p');
    expect(formatShiftTimeRange({})).toBe('');
  });

  it('reads one label off the settings object, tolerating an absent map', () => {
    const settings = { shiftTypes: ['Open', 'Mid'], shiftTimes: { Open: { startTime: '06:00', endTime: '11:00' } } };

    expect(getShiftTime(settings, 'Open')).toEqual({ startTime: '06:00', endTime: '11:00' });
    expect(getShiftTime(settings, 'Mid')).toEqual({ startTime: '', endTime: '' });
    expect(getShiftTime({ shiftTypes: ['Open'] }, 'Open')).toEqual({ startTime: '', endTime: '' });
  });

  it('labels a shift with its range only when one is set', () => {
    const settings = { shiftTypes: ['Open', 'Mid'], shiftTimes: { Open: { startTime: '06:00', endTime: '11:00' } } };

    expect(formatShiftLabel(settings, 'Open')).toBe('Open · 6a–11a');
    expect(formatShiftLabel(settings, 'Mid')).toBe('Mid');
  });

  describe('per-day overrides', () => {
    const withOverride = {
      shiftTypes: ['Close'],
      shiftTimes: {
        Close: {
          startTime: '18:00',
          endTime: '23:00',
          byDay: {
            Friday: { startTime: '20:00', endTime: '02:00' },
            Saturday: { startTime: '', endTime: '02:00' },
            Monday: { startTime: '', endTime: '' },
          },
        },
      },
    };

    it('normalizes only the days that actually differ, dropping empty ones', () => {
      const result = normalizeShiftTimes(withOverride.shiftTimes, ['Close']);

      expect(Object.keys(result.Close.byDay)).toEqual(['Friday', 'Saturday']);
      expect(result.Close.byDay.Friday).toEqual({ startTime: '20:00', endTime: '02:00' });
    });

    it('has no byDay key at all for a label without overrides', () => {
      expect(normalizeShiftTimes({ Close: { startTime: '18:00', endTime: '23:00' } }, ['Close']).Close)
        .toEqual({ startTime: '18:00', endTime: '23:00' });
    });

    it('getShiftTime falls back to the base per field, and only when a day is asked for', () => {
      expect(getShiftTime(withOverride, 'Close')).toEqual({ startTime: '18:00', endTime: '23:00' });
      expect(getShiftTime(withOverride, 'Close', 'Tuesday')).toEqual({ startTime: '18:00', endTime: '23:00' });
      expect(getShiftTime(withOverride, 'Close', 'Friday')).toEqual({ startTime: '20:00', endTime: '02:00' });
      // Saturday overrides only the end; start falls back to the base.
      expect(getShiftTime(withOverride, 'Close', 'Saturday')).toEqual({ startTime: '18:00', endTime: '02:00' });
    });

    it('formatShiftLabel picks up the day override', () => {
      expect(formatShiftLabel(withOverride, 'Close')).toBe('Close · 6p–11p');
      expect(formatShiftLabel(withOverride, 'Close', 'Friday')).toBe('Close · 8p–2a');
    });
  });
});
