// @vitest-environment node
//
// Runs every migration in supabase/migrations against an in-memory Postgres (PGlite)
// with a stand-in `auth` schema, then acts as different users to check the
// row-level security policies and security-definer functions: each tenant
// boundary holds, each role can do what the app needs, and nothing more.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

// Just enough of Supabase's auth schema and roles for the migrations and
// policies: auth.uid() reads a session setting the tests control.
const AUTH_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.email() returns text language sql stable security definer as $$ select email from auth.users where id = auth.uid() $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

let db;
const ids = {};

const one = async (sql, params) => (await db.query(sql, params)).rows[0];

// Runs `sql` as a signed-in user (or anonymously when `uid` is null) and
// returns `{ ok, rows }` or `{ ok: false, error }`.
const as = async (uid, sql, params = []) => {
  await db.exec(uid ? `set role authenticated; set test.uid = '${uid}';` : `set role anon; set test.uid = '';`);

  try {
    return { ok: true, rows: (await db.query(sql, params)).rows };
  } catch (error) {
    return { ok: false, error: error.message };
  } finally {
    await db.exec(`reset role; set test.uid = '';`);
  }
};

const addUser = async (email, meta = {}) =>
  (await one('insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id', [email, meta])).id;

const addMember = async (orgId, userId, role, status, email, employeeId = null) =>
  (await one(
    'insert into memberships (org_id, user_id, account_role, status, invited_email, employee_id, accepted_at) values ($1, $2, $3, $4, $5, $6, now()) returning id',
    [orgId, userId, role, status, email, employeeId],
  )).id;

const addEmployee = async (orgId, locationId, name) =>
  (await one('insert into employees (org_id, location_id, name, roles) values ($1, $2, $3, $4) returning id', [orgId, locationId, name, ['Barista']])).id;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(AUTH_STUB);

  for (const file of readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort()) {
    // PGlite has no pgcrypto; gen_random_uuid() is built into Postgres 13+.
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8').replace(/create extension[^;]*;/gi, ''));
  }

  // Two businesses. A has two locations, an owner, a manager scoped to the
  // first location, a staff member linked to a roster row, and a removed
  // manager. B has an owner and a manager. Plus a user with no workspace.
  ids.ownerA = await addUser('owner-a@example.com');
  ids.managerA = await addUser('manager-a@example.com');
  ids.staffA = await addUser('staff-a@example.com');
  ids.exManagerA = await addUser('ex-a@example.com');
  ids.ownerB = await addUser('owner-b@example.com');
  ids.managerB = await addUser('manager-b@example.com');
  ids.stranger = await addUser('stranger@example.com');

  ids.orgA = (await as(ids.ownerA, "select create_organization('Cafe A') as id")).rows[0].id;
  ids.orgB = (await as(ids.ownerB, "select create_organization('Bar B') as id")).rows[0].id;
  ids.la1 = (await one('select id from locations where org_id = $1', [ids.orgA])).id;
  ids.la2 = (await one("insert into locations (org_id, name) values ($1, 'Second') returning id", [ids.orgA])).id;
  ids.lb = (await one('select id from locations where org_id = $1', [ids.orgB])).id;

  ids.empA = await addEmployee(ids.orgA, ids.la1, 'Ada');
  ids.empStaff = await addEmployee(ids.orgA, ids.la1, 'Sam');
  ids.empA2 = await addEmployee(ids.orgA, ids.la2, 'Lee');
  ids.empB = await addEmployee(ids.orgB, ids.lb, 'Bea');

  ids.mManagerA = await addMember(ids.orgA, ids.managerA, 'manager', 'active', 'manager-a@example.com');
  await addMember(ids.orgA, ids.staffA, 'staff', 'active', 'staff-a@example.com', ids.empStaff);
  await addMember(ids.orgA, ids.exManagerA, 'manager', 'disabled', 'ex-a@example.com');
  ids.mManagerB = await addMember(ids.orgB, ids.managerB, 'manager', 'active', 'manager-b@example.com');
  await one('insert into membership_locations (membership_id, location_id) values ($1, $2) returning id', [ids.mManagerA, ids.la1]);
  ids.mOwnerA = (await one("select id from memberships where org_id = $1 and account_role = 'owner'", [ids.orgA])).id;
}, 60_000);

describe('reading and saving the roster', () => {
  it('lets every role read employees without a policy error', async () => {
    for (const uid of [ids.ownerA, ids.managerA, ids.staffA]) {
      const result = await as(uid, 'select id from employees');
      expect(result.ok, result.error).toBe(true);
    }
  });

  it('scopes a manager to their own locations', async () => {
    const { rows } = await as(ids.managerA, 'select id from employees');
    const visible = rows.map((row) => row.id);

    expect(visible).toEqual(expect.arrayContaining([ids.empA, ids.empStaff]));
    expect(visible).not.toContain(ids.empA2);
  });

  it('accepts the upsert and update the app sends for an employee', async () => {
    const upsert = await as(
      ids.ownerA,
      'insert into employees (id, org_id, location_id, name) values ($1, $2, $3, $4) on conflict (id) do update set name = excluded.name',
      [ids.empA, ids.orgA, ids.la1, 'Ada Lovelace'],
    );
    expect(upsert.ok, upsert.error).toBe(true);

    const update = await as(ids.managerA, "update employees set title = 'Lead' where id = $1", [ids.empA]);
    expect(update.ok, update.error).toBe(true);
    expect((await one('select name, title from employees where id = $1', [ids.empA]))).toEqual({ name: 'Ada Lovelace', title: 'Lead' });
  });

  it('never shows one business another business\'s employees', async () => {
    const { rows } = await as(ids.ownerA, 'select id from employees where org_id = $1', [ids.orgB]);
    expect(rows).toEqual([]);
  });

  it('lets staff change only their own contact details', async () => {
    await as(ids.staffA, "update employees set roles = '{Manager}', shifts_per_week = 7, contact = '555-0100' where id = $1", [ids.empStaff]);

    expect(await one('select roles, shifts_per_week, contact from employees where id = $1', [ids.empStaff]))
      .toEqual({ roles: ['Barista'], shifts_per_week: 5, contact: '555-0100' });
  });
});

describe('memberships and invites', () => {
  it('stops a manager from writing memberships directly', async () => {
    const result = await as(
      ids.managerA,
      "insert into memberships (org_id, user_id, account_role, status, invited_email) values ($1, $2, 'owner', 'active', 'me-too@example.com')",
      [ids.orgA, ids.managerA],
    );
    expect(result.ok).toBe(false);
  });

  it('activates a pending invite for the invited email, ignoring case', async () => {
    const pending = (await one("insert into memberships (org_id, account_role, status, invited_email) values ($1, 'staff', 'invited', 'New.Hire@Example.com') returning id", [ids.orgA])).id;
    const newHire = await addUser('new.hire@example.com', { invited_membership_id: pending });

    expect(await one('select user_id, status from memberships where id = $1', [pending])).toEqual({ user_id: newHire, status: 'active' });
  });

  it('does not let a signup claim someone else\'s membership', async () => {
    await addUser('evil@example.com', { invited_membership_id: ids.mOwnerA });
    expect((await one('select user_id from memberships where id = $1', [ids.mOwnerA])).user_id).toBe(ids.ownerA);

    const pending = (await one("insert into memberships (org_id, account_role, status, invited_email) values ($1, 'manager', 'invited', 'someone@example.com') returning id", [ids.orgA])).id;
    await addUser('impostor@example.com', { invited_membership_id: pending });
    expect((await one('select status from memberships where id = $1', [pending])).status).toBe('invited');
  });
});

describe('creating workspaces', () => {
  it('allows one workspace per user, with a sensible name', async () => {
    expect((await as(ids.managerA, "select create_organization('Another')")).ok).toBe(false);
    expect((await as(ids.stranger, 'select create_organization($1)', ['x'.repeat(150)])).ok).toBe(false);
    expect((await as(null, "select create_organization('Anon')")).ok).toBe(false);

    const created = await as(ids.stranger, "select create_organization('  Stranger Things  ') as id");
    expect(created.ok, created.error).toBe(true);
    expect((await one('select name from organizations where id = $1', [created.rows[0].id])).name).toBe('Stranger Things');
  });
});

describe('locations', () => {
  it('lets only the owner create a location in their own business', async () => {
    const owner = await as(ids.ownerA, "select create_location($1, 'Third')", [ids.orgA]);
    expect(owner.ok, owner.error).toBe(true);

    expect((await as(ids.managerA, "select create_location($1, 'Nope')", [ids.orgA])).ok).toBe(false);
    expect((await as(ids.exManagerA, "select create_location($1, 'Nope')", [ids.orgA])).ok).toBe(false);
    expect((await as(ids.ownerB, "select create_location($1, 'Nope')", [ids.orgA])).ok).toBe(false);
    expect((await as(null, "select create_location($1, 'Nope')", [ids.orgA])).ok).toBe(false);
  });

  it('limits who can move an employee to another location', async () => {
    const reassign = (uid, employeeId, locationId) =>
      as(uid, 'select reassign_employee_home_location($1, $2)', [employeeId, locationId]);

    expect((await reassign(ids.staffA, ids.empA, ids.la2)).ok).toBe(false);
    expect((await reassign(ids.managerA, ids.empA, ids.la2)).ok).toBe(false); // no access to la2
    expect((await reassign(ids.ownerA, ids.empA, ids.lb)).ok).toBe(false); // other business

    const owner = await reassign(ids.ownerA, ids.empA, ids.la2);
    expect(owner.ok, owner.error).toBe(true);
    await one('update employees set location_id = $2 where id = $1 returning id', [ids.empA, ids.la1]);
  });

  it('keeps location grants inside the business', async () => {
    const grant = (uid, employeeId, locationId) =>
      as(uid, 'insert into employee_location_access (employee_id, location_id) values ($1, $2)', [employeeId, locationId]);

    expect((await grant(ids.ownerA, ids.empB, ids.lb)).ok).toBe(false);
    expect((await grant(ids.managerA, ids.empStaff, ids.la2)).ok).toBe(false);

    const owner = await grant(ids.ownerA, ids.empA, ids.la2);
    expect(owner.ok, owner.error).toBe(true);
    expect((await as(ids.staffA, 'select employee_id from employee_location_access')).ok).toBe(true);
  });

  it('keeps manager location access inside the business', async () => {
    const grant = (uid, membershipId, locationId) =>
      as(uid, 'insert into membership_locations (membership_id, location_id) values ($1, $2)', [membershipId, locationId]);

    expect((await grant(ids.ownerA, ids.mManagerB, ids.lb)).ok).toBe(false);
    expect((await grant(ids.ownerA, ids.mManagerA, ids.lb)).ok).toBe(false);

    const owner = await grant(ids.ownerA, ids.mManagerA, ids.la2);
    expect(owner.ok, owner.error).toBe(true);
  });
});
