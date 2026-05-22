const IMPORTABLE_HEADERS = ['name', 'title', 'role', 'contact', 'email', 'status'];
const VALID_STATUSES = new Set(['active', 'archived']);

const normalizeHeader = (header = '') => header.trim().toLowerCase().replace(/[^a-z]/g, '');

const escapeCsvValue = (value) => {
  const stringValue = String(value ?? '');

  if (!/[",\n]/.test(stringValue)) {
    return stringValue;
  }

  return `"${stringValue.replace(/"/g, '""')}"`;
};

const parseCsvText = (text) => {
  const rows = [];
  let currentCell = '';
  let currentRow = [];
  let isInsideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (isInsideQuotes && nextCharacter === '"') {
        currentCell += '"';
        index += 1;
      } else {
        isInsideQuotes = !isInsideQuotes;
      }

      continue;
    }

    if (character === ',' && !isInsideQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if ((character === '\n' || character === '\r') && !isInsideQuotes) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1;
      }

      currentRow.push(currentCell);
      rows.push(currentRow);
      currentCell = '';
      currentRow = [];
      continue;
    }

    currentCell += character;
  }

  if (currentCell.length || currentRow.length) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
};

const createRowMatchKey = ({ name, email }) => {
  if (email) {
    return `email:${email.toLowerCase()}`;
  }

  if (name) {
    return `name:${name.toLowerCase()}`;
  }

  return null;
};

export const serializeRosterCsv = (employees) => {
  const headerRow = IMPORTABLE_HEADERS.join(',');
  const dataRows = employees.map((employee) => (
    [
      employee.name,
      employee.title,
      employee.role,
      employee.contact,
      employee.email,
      employee.status,
    ]
      .map(escapeCsvValue)
      .join(',')
  ));

  return [headerRow, ...dataRows].join('\n');
};

export const createBlankRosterTemplateCsv = () => [
  IMPORTABLE_HEADERS.join(','),
  'Jane Smith,Shift Lead,Server,(555) 010-2000,jane@example.com,active',
].join('\n');

export const parseRosterCsv = (text, validRoles) => {
  const parsedRows = parseCsvText(text.trim());

  if (!parsedRows.length) {
    return {
      fileErrors: ['The CSV file is empty.'],
      rows: [],
    };
  }

  const [headerRow, ...dataRows] = parsedRows;
  const headerIndexes = new Map(headerRow.map((header, index) => [normalizeHeader(header), index]));
  const missingHeaders = ['name', 'role'].filter((header) => !headerIndexes.has(header));

  if (missingHeaders.length) {
    return {
      fileErrors: [`Missing required columns: ${missingHeaders.join(', ')}.`],
      rows: [],
    };
  }

  const roleLookup = new Map(validRoles.map((role) => [role.toLowerCase(), role]));
  const rows = dataRows
    .filter((row) => row.some((value) => value.trim()))
    .map((row, rowIndex) => {
      const getCell = (header) => row[headerIndexes.get(normalizeHeader(header))] ?? '';
      const name = getCell('name').trim();
      const title = getCell('title').trim();
      const roleInput = getCell('role').trim();
      const contact = getCell('contact').trim();
      const email = getCell('email').trim();
      const statusInput = getCell('status').trim().toLowerCase();
      const errors = [];

      if (!name) {
        errors.push('Name is required.');
      }

      if (!roleInput) {
        errors.push('Role is required.');
      }

      const role = roleLookup.get(roleInput.toLowerCase());

      if (roleInput && !role) {
        errors.push('Role must match one of the supported team roles.');
      }

      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push('Email must be valid.');
      }

      const status = statusInput || 'active';

      if (!VALID_STATUSES.has(status)) {
        errors.push('Status must be active or archived.');
      }

      return {
        rowNumber: rowIndex + 2,
        matchKey: createRowMatchKey({ name, email }),
        values: {
          name,
          title,
          role: role ?? roleInput,
          contact,
          email,
          status,
        },
        errors,
      };
    });

  const duplicateCounts = rows.reduce((counts, row) => {
    if (!row.matchKey) {
      return counts;
    }

    counts.set(row.matchKey, (counts.get(row.matchKey) ?? 0) + 1);
    return counts;
  }, new Map());

  rows.forEach((row) => {
    if (row.matchKey && duplicateCounts.get(row.matchKey) > 1) {
      row.errors.push('This file includes duplicate rows for the same employee.');
    }
  });

  if (!rows.length) {
    return {
      fileErrors: ['The CSV file has no employee rows to import.'],
      rows: [],
    };
  }

  return {
    fileErrors: [],
    rows,
  };
};

export const buildRosterImportPreview = (rows, existingEmployees, mode) => {
  const existingByEmail = new Map(
    existingEmployees
      .filter((employee) => employee.email)
      .map((employee) => [employee.email.toLowerCase(), employee]),
  );
  const existingByName = new Map(existingEmployees.map((employee) => [employee.name.toLowerCase(), employee]));

  const previewRows = rows.map((row) => {
    if (row.errors.length) {
      return {
        ...row,
        action: 'invalid',
        description: row.errors.join(' '),
      };
    }

    const matchedEmployee = row.values.email
      ? existingByEmail.get(row.values.email.toLowerCase()) ?? existingByName.get(row.values.name.toLowerCase())
      : existingByName.get(row.values.name.toLowerCase());

    if (matchedEmployee) {
      if (mode === 'add') {
        return {
          ...row,
          action: 'skip',
          description: `Matches existing employee ${matchedEmployee.name}.`,
        };
      }

      return {
        ...row,
        action: 'update',
        description: `Updates ${matchedEmployee.name}.`,
        employee: {
          ...matchedEmployee,
          ...row.values,
          id: matchedEmployee.id,
          availability: matchedEmployee.availability,
        },
      };
    }

    return {
      ...row,
      action: 'create',
      description: 'Adds a new employee.',
      employee: {
        ...row.values,
      },
    };
  });

  const summary = previewRows.reduce((counts, row) => ({
    ...counts,
    [row.action]: counts[row.action] + 1,
  }), {
    create: 0,
    update: 0,
    skip: 0,
    invalid: 0,
  });

  return {
    rows: previewRows,
    summary,
    employees: previewRows
      .filter((row) => row.action === 'create' || row.action === 'update')
      .map((row) => row.employee),
  };
};