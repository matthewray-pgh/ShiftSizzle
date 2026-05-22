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
        role: 'Manager',
        contact: '(555) 010-1001',
        email: 'jen@shiftsizzle.app',
        status: 'active',
      },
    ]);

    expect(csv).toContain('name,title,role,contact,email,status');
    expect(csv).not.toContain('availability');
  });

  it('creates a blank roster template with example data', () => {
    const csv = createBlankRosterTemplateCsv();

    expect(csv).toContain('name,title,role,contact,email,status');
    expect(csv).toContain('Jane Smith,Shift Lead,Server,(555) 010-2000,jane@example.com,active');
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

  it('builds create and update preview rows based on import mode', () => {
    const existingEmployees = [
      {
        id: 1,
        name: 'Jen Ray',
        title: 'General Manager',
        role: 'Manager',
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