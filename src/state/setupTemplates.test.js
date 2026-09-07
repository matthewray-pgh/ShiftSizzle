import { describe, expect, it } from 'vitest';

import { DAYS } from './AppState';
import {
  SETUP_TEMPLATES,
  buildTemplateOperatingHours,
  buildTemplateRoleCoverage,
  getSetupTemplate,
  settingsFromTemplate,
} from './setupTemplates';

describe('setupTemplates', () => {
  it('exposes a non-empty picker list with roles and shift types', () => {
    expect(SETUP_TEMPLATES.length).toBeGreaterThan(0);

    SETUP_TEMPLATES.forEach((template) => {
      expect(template.id).toBeTruthy();
      expect(template.label).toBeTruthy();
      expect(template.roles.length).toBeGreaterThan(0);
      expect(template.shiftTypes.length).toBeGreaterThan(0);
    });
  });

  it('includes a pizza / delivery template with a driver role', () => {
    const pizza = SETUP_TEMPLATES.find((template) => template.id === 'pizza-delivery');

    expect(pizza).toBeTruthy();
    expect(pizza.roles).toContain('Driver');

    const payload = settingsFromTemplate('pizza-delivery', { currentSettings: {} });
    expect(payload.roleCoverage.Driver.Wednesday.Dinner).toBeGreaterThan(0);
  });

  it('expands weekday/weekend hours and honors closed days', () => {
    const hours = buildTemplateOperatingHours({
      weekday: { openTime: '09:00', closeTime: '17:00' },
      weekend: { openTime: '10:00', closeTime: '15:00' },
      closedDays: ['Monday'],
    });

    expect(Object.keys(hours)).toEqual(DAYS);
    expect(hours.Monday).toEqual({ isOpen: false, openTime: '', closeTime: '' });
    expect(hours.Wednesday).toEqual({ isOpen: true, openTime: '09:00', closeTime: '17:00' });
    expect(hours.Saturday).toEqual({ isOpen: true, openTime: '10:00', closeTime: '15:00' });
  });

  it('zeroes coverage on closed days but keeps the intent on open days', () => {
    const operatingHours = buildTemplateOperatingHours({
      weekday: { openTime: '09:00', closeTime: '17:00' },
      closedDays: ['Sunday'],
    });
    const coverage = buildTemplateRoleCoverage({ Server: { Open: 2, Close: 3 } }, operatingHours);

    expect(coverage.Server.Wednesday).toEqual({ Open: 2, Close: 3 });
    expect(coverage.Server.Sunday).toEqual({ Open: 0, Close: 0 });
  });

  it('builds a full settings payload from a template id', () => {
    const payload = settingsFromTemplate('cafe', { currentSettings: {} });

    expect(payload.shiftTypes).toEqual(getSetupTemplate('cafe').shiftTypes);
    expect(payload.teamRoles).toEqual(getSetupTemplate('cafe').teamRoles);
    expect(payload.weekStartsOn).toBe('Monday');
    expect(Object.keys(payload.operatingHours)).toEqual(DAYS);

    const hasDemand = payload.teamRoles.some((role) =>
      DAYS.some((day) => payload.shiftTypes.some((shift) => payload.roleCoverage[role][day][shift] > 0)));
    expect(hasDemand).toBe(true);
  });

  it('keeps an established week start and honors an explicit override', () => {
    expect(settingsFromTemplate('retail', { currentSettings: { weekStartsOn: 'Sunday' } }).weekStartsOn).toBe('Sunday');
    expect(settingsFromTemplate('retail', { currentSettings: { weekStartsOn: 'Sunday' }, weekStartsOn: 'Wednesday' }).weekStartsOn).toBe('Wednesday');
  });

  it('returns null for an unknown template id', () => {
    expect(settingsFromTemplate('does-not-exist')).toBeNull();
    expect(getSetupTemplate('does-not-exist')).toBeNull();
  });
});
