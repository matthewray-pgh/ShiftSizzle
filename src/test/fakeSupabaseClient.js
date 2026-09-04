// Hand-rolled in-memory fake for @supabase/supabase-js, implementing just
// the query-builder/auth/realtime/functions surface AppState.jsx,
// AuthState.jsx, supabaseSync.js, and Team.jsx's invite UI actually call.
// Mirrors this project's existing "hand-rolled fixture" test style rather
// than pulling in a full mocking library.

const clone = (value) => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

class FakeQueryBuilder {
  constructor(tables, tableName) {
    this.tables = tables;
    this.tableName = tableName;
    this.filters = [];
    this.mode = 'select';
    this.singleMode = null;
    this.payload = null;
    this.conflictColumns = ['id'];
  }

  eq(column, value) {
    this.filters.push([column, value]);
    return this;
  }

  select() {
    return this;
  }

  single() {
    this.singleMode = 'single';
    return this;
  }

  maybeSingle() {
    this.singleMode = 'maybeSingle';
    return this;
  }

  upsert(row, options = {}) {
    this.mode = 'upsert';
    this.payload = row;
    this.conflictColumns = (options.onConflict ?? 'id').split(',');
    return this;
  }

  update(row) {
    this.mode = 'update';
    this.payload = row;
    return this;
  }

  matches(row) {
    return this.filters.every(([column, value]) => row[column] === value);
  }

  run() {
    const rows = this.tables[this.tableName];

    if (this.mode === 'update') {
      rows.forEach((row, index) => {
        if (this.matches(row)) {
          rows[index] = { ...row, ...clone(this.payload), updated_at: new Date().toISOString() };
        }
      });

      return { data: null, error: null };
    }

    if (this.mode === 'upsert') {
      const existingIndex = rows.findIndex((row) =>
        this.conflictColumns.every((column) => row[column] === this.payload[column])
      );
      const now = new Date().toISOString();

      if (existingIndex === -1) {
        const newRow = { id: crypto.randomUUID(), created_at: now, updated_at: now, ...clone(this.payload) };
        rows.push(newRow);
        return { data: newRow, error: null };
      }

      rows[existingIndex] = { ...rows[existingIndex], ...clone(this.payload), updated_at: now };
      return { data: rows[existingIndex], error: null };
    }

    const filtered = rows.filter((row) => this.matches(row)).map(clone);

    if (this.singleMode === 'single') {
      return filtered[0]
        ? { data: filtered[0], error: null }
        : { data: null, error: { message: `No row found in ${this.tableName}` } };
    }

    if (this.singleMode === 'maybeSingle') {
      return { data: filtered[0] ?? null, error: null };
    }

    return { data: filtered, error: null };
  }

  then(resolve, reject) {
    try {
      resolve(this.run());
    } catch (error) {
      reject?.(error);
    }
  }
}

export const createFakeSupabaseClient = () => {
  const tables = {
    organizations: [],
    employees: [],
    employee_availability: [],
    schedule_records: [],
    memberships: [],
  };

  let session = null;
  const authListeners = new Set();

  const setSession = (nextSession) => {
    session = nextSession;
    authListeners.forEach((listener) => listener('SIGNED_IN', session));
  };

  const client = {
    __tables: tables,
    __setSession: setSession,

    from: (tableName) => new FakeQueryBuilder(tables, tableName),

    rpc: async (fnName, args) => {
      if (fnName === 'create_organization') {
        const orgId = crypto.randomUUID();
        const now = new Date().toISOString();

        tables.organizations.push({
          id: orgId,
          name: args.org_name,
          location_name: '',
          scheduler_name: '',
          publish_notifications: true,
          shift_types: ['Open', 'Mid', 'Close'],
          team_roles: ['Manager', 'Server', 'Host', 'Bartender', 'Cook'],
          additional_team_roles: [],
          week_starts_on: '',
          operating_hours: {},
          created_at: now,
          updated_at: now,
        });

        tables.memberships.push({
          id: crypto.randomUUID(),
          org_id: orgId,
          user_id: session?.user?.id ?? null,
          employee_id: null,
          account_role: 'owner',
          status: 'active',
          invited_email: session?.user?.email ?? '',
          accepted_at: now,
          created_at: now,
        });

        return { data: orgId, error: null };
      }

      return { data: null, error: { message: `Unknown rpc ${fnName}` } };
    },

    functions: {
      invoke: async () => ({ data: { ok: true }, error: null }),
    },

    channel: () => ({
      on: () => channelSelf,
      subscribe: () => channelSelf,
    }),

    removeChannel: () => {},

    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: (callback) => {
        authListeners.add(callback);
        return { data: { subscription: { unsubscribe: () => authListeners.delete(callback) } } };
      },
      signInWithPassword: async () => ({ data: { session }, error: null }),
      signUp: async () => ({ data: { session, user: session?.user ?? null }, error: null }),
      signOut: async () => {
        setSession(null);
        return { error: null };
      },
      updateUser: async () => ({ data: { user: session?.user ?? null }, error: null }),
    },
  };

  // `channel()` needs to return the same chainable object from `.on()` so
  // `.on().on().on().subscribe()` (three tables) all resolve to one channel.
  const channelSelf = client.channel();

  return client;
};

// Seeds a fully-hydrated org (matching AppState.jsx's HYDRATE_FROM_SERVER
// shape) plus a signed-in session/membership, so a component wrapped in
// AuthProvider > AppStateProvider renders already-loaded data.
export const seedFakeSupabase = (client, { userId = 'test-user', orgId = 'test-org', settings = {}, employees = [], schedules = [], accountRole = 'owner', employeeId = null } = {}) => {
  const now = new Date().toISOString();

  client.__tables.organizations.push({
    id: orgId,
    name: settings.businessName ?? 'ShiftSizzle',
    location_name: settings.locationName ?? '',
    scheduler_name: settings.schedulerName ?? '',
    publish_notifications: settings.publishNotifications ?? true,
    shift_types: settings.shiftTypes ?? ['Open', 'Mid', 'Close'],
    team_roles: settings.teamRoles ?? ['Manager', 'Server', 'Host', 'Bartender', 'Cook'],
    additional_team_roles: settings.additionalTeamRoles ?? [],
    week_starts_on: settings.weekStartsOn ?? '',
    operating_hours: settings.operatingHours ?? {},
    created_at: now,
    updated_at: now,
  });

  employees.forEach((employee) => {
    client.__tables.employees.push({
      id: employee.id,
      org_id: orgId,
      name: employee.name,
      title: employee.title ?? '',
      roles: employee.roles ?? [],
      contact: employee.contact ?? '',
      email: employee.email ?? '',
      shifts_per_week: employee.shiftsPerWeek ?? 5,
      status: employee.status ?? 'active',
      created_at: now,
      updated_at: now,
    });

    client.__tables.employee_availability.push({
      employee_id: employee.id,
      org_id: orgId,
      availability: employee.availability ?? {},
      updated_at: now,
    });
  });

  schedules.forEach((record) => {
    client.__tables.schedule_records.push({
      id: crypto.randomUUID(),
      org_id: orgId,
      week_label: record.weekLabel ?? '',
      start_date: record.startDate,
      end_date: record.endDate ?? '',
      role: record.role,
      status: record.status ?? 'draft',
      requirements: record.requirements ?? {},
      assignments: record.assignments ?? {},
      notes: record.notes ?? '',
      saved_at: record.savedAt ?? null,
      published_at: record.publishedAt ?? null,
      version: 1,
      created_at: now,
      updated_at: now,
    });
  });

  client.__tables.memberships.push({
    id: crypto.randomUUID(),
    org_id: orgId,
    user_id: userId,
    employee_id: employeeId,
    account_role: accountRole,
    status: 'active',
    invited_email: `${userId}@example.com`,
    accepted_at: now,
    created_at: now,
  });

  client.__setSession({
    user: { id: userId, email: `${userId}@example.com` },
    access_token: 'fake-access-token',
  });
};
