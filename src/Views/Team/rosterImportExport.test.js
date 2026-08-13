import { describe, expect, it } from 'vitest';

import {
  buildRosterImportPreview,
  createBlankRosterTemplateCsv,
  parseRosterCsv,
  serializeRosterCsv,
} from './rosterImportExport';

describe('roster import/export helpers', () => {
  it('serializes roster csv without availability columns', () => {
    const csv = serializeRosterCsv([
      {
        name: 'Jen Ray',
        title: 'General Manager',
        roles: ['Manager'],
        contact: '(555) 010-1001',
        email: 'jen@shiftsizzle.app',
        status: 'active',
      },
    ]);

    expect(csv).toContain('name,title,roles,contact,email,status');
    expect(csv).not.toContain('availability');
  });

  it('serializes multiple roles into one semicolon-delimited cell', () => {
    const csv = serializeRosterCsv([
      {
        name: 'Kayla Brooks',
        title: 'Bar Manager',
        roles: ['Bartender', 'Server'],
        contact: '',
        email: 'kayla@shiftsizzle.app',
        status: 'active',
      },
    ]);

    expect(csv).toContain('Kayla Brooks,Bar Manager,Bartender;Server,,kayla@shiftsizzle.app,active');
  });

  it('creates a blank roster template with example data', () => {
    const csv = createBlankRosterTemplateCsv();

    expect(csv).toContain('name,title,roles,contact,email,status');
    expect(csv).toContain('Jane Smith,Shift Lead,Server;Bartender,(555) 010-2000,jane@example.com,active');
    expect(csv).not.toContain('availability');
  });

  it('parses csv rows and flags duplicates or invalid values', () => {
    const parsed = parseRosterCsv(
      [
        'name,title,role,contact,email,status',
        'Jen Ray,General Manager,Manager,,jen@shiftsizzle.app,active',
        'Jen Ray,Director,Manager,,jen@shiftsizzle.app,active',
      ].join('\n'),
      ['Manager', 'Server'],
    );

    expect(parsed.fileErrors).toEqual([]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].errors).toContain('This file includes duplicate rows for the same employee.');
    expect(parsed.rows[1].errors).toContain('This file includes duplicate rows for the same employee.');
  });

  it('still accepts the legacy singular "role" header for backward compatibility', () => {
    const parsed = parseRosterCsv(
      [
        'name,title,role,contact,email,status',
        'Jen Ray,General Manager,Manager,,jen@shiftsizzle.app,active',
      ].join('\n'),
      ['Manager', 'Server'],
    );

    expect(parsed.fileErrors).toEqual([]);
    expect(parsed.rows[0].errors).toEqual([]);
    expect(parsed.rows[0].values.roles).toEqual(['Manager']);
  });

  it('parses a semicolon-separated roles cell into multiple roles', () => {
    const parsed = parseRosterCsv(
      [
        'name,title,roles,contact,email,status',
        'Kayla Brooks,Bar Manager,Bartender;Server,,kayla@shiftsizzle.app,active',
      ].join('\n'),
      ['Manager', 'Server', 'Bartender'],
    );

    expect(parsed.fileErrors).toEqual([]);
    expect(parsed.rows[0].errors).toEqual([]);
    expect(parsed.rows[0].values.roles).toEqual(['Bartender', 'Server']);
  });

  it('errors when any role in a multi-role cell does not match a supported team role', () => {
    const parsed = parseRosterCsv(
      [
        'name,title,roles,contact,email,status',
        'Kayla Brooks,Bar Manager,Bartender;Astronaut,,kayla@shiftsizzle.app,active',
      ].join('\n'),
      ['Manager', 'Server', 'Bartender'],
    );

    expect(parsed.rows[0].errors).toContain('Every role must match one of the supported team roles.');
  });

  it('round-trips a multi-role employee through serialize and parse', () => {
    const csv = serializeRosterCsv([
      { name: 'Kayla Brooks', title: 'Bar Manager', roles: ['Bartender', 'Server'], contact: '', email: 'kayla@shiftsizzle.app', status: 'active' },
    ]);
    const parsed = parseRosterCsv(csv, ['Manager', 'Server', 'Bartender']);

    expect(parsed.rows[0].errors).toEqual([]);
    expect(parsed.rows[0].values.roles).toEqual(['Bartender', 'Server']);
  });

  it('builds create and update preview rows based on import mode', () => {
    const existingEmployees = [
      {
        id: 1,
        name: 'Jen Ray',
        title: 'General Manager',
        roles: ['Manager'],
        contact: '',
        email: 'jen@shiftsizzle.app',
        status: 'active',
        availability: {},
      },
    ];
    const parsed = parseRosterCsv(
      [
        'name,title,role,contact,email,status',
        'Jen Ray,Director,Manager,,jen@shiftsizzle.app,active',
        'Taylor Lee,Host,Server,,taylor@shiftsizzle.app,active',
      ].join('\n'),
      ['Manager', 'Server'],
    );

    const addOnlyPreview = buildRosterImportPreview(parsed.rows, existingEmployees, 'add');
    const upsertPreview = buildRosterImportPreview(parsed.rows, existingEmployees, 'upsert');

    expect(addOnlyPreview.summary.skip).toBe(1);
    expect(addOnlyPreview.summary.create).toBe(1);
    expect(upsertPreview.summary.update).toBe(1);
    expect(upsertPreview.summary.create).toBe(1);
    expect(upsertPreview.employees[0].id).toBe(1);
  });
});