import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Button, ContentPanel, InputField, StatusBadge } from '../../Components';
import { DAYS, getShiftTypes, getTeamRoles, useAppState } from '../../state/AppState';
import { useAuth } from '../../state/AuthState';
import { supabase } from '../../lib/supabaseClient';
import {
  buildEmployeeMatchIndex,
  buildRoleLookup,
  buildRosterImportPreview,
  createBlankRosterTemplateCsv,
  findExistingEmployeeMatch,
  matchRoleName,
  parseRosterCsv,
  serializeRosterCsv,
} from './rosterImportExport';

import './Team.scss';

const VIEW_MODES = Object.freeze({
  CARD: 'card',
  LIST: 'list',
});

const STATUS_FILTER_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
];

const WEEKDAY_DAYS = DAYS.slice(1, 6);

const MODAL_TABS = Object.freeze({
  OVERVIEW: 'overview',
  AVAILABILITY: 'availability',
});

const MOBILE_VIEW_BREAKPOINT = 900;
const ROSTER_IMPORT_MODES = [
  { value: 'add', label: 'Add new only' },
  { value: 'upsert', label: 'Add and update matches' },
];

const AVATAR_TINTS = ['#ff6b35', '#3b82f6', '#22c55e', '#e85a24', '#0ea5e9'];

const getInitials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');

const getAvatarTint = (seed = '') => AVATAR_TINTS[
  [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % AVATAR_TINTS.length
];

const createDefaultAvailability = (shiftTypes) => Object.fromEntries(DAYS.map((day) => [day, [...shiftTypes]]));

const normalizeAvailability = (availability = {}, shiftTypes) => Object.fromEntries(
  DAYS.map((day) => [day, [...(availability[day] ?? shiftTypes)]])
);

const createEmptyForm = (teamRoles, shiftTypes) => ({
  id: null,
  name: '',
  title: '',
  roles: [],
  contact: '',
  email: '',
  shiftsPerWeek: 5,
  availability: createDefaultAvailability(shiftTypes),
});

const createEmptyTouched = () => ({
  name: false,
  roles: false,
  email: false,
});

const validateField = (field, value) => {
  switch (field) {
    case 'name':
      return value.trim() ? '' : 'Name is required.';
    case 'roles':
      return Array.isArray(value) && value.length ? '' : 'Select at least one role.';
    case 'email': {
      if (!value.trim()) {
        return '';
      }

      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? '' : 'Enter a valid email address.';
    }
    default:
      return '';
  }
};

const validateForm = (form) => ({
  name: validateField('name', form.name),
  roles: validateField('roles', form.roles),
  email: validateField('email', form.email),
});

const getAvailabilitySummary = (availability = {}) => {
  const availableDays = DAYS.filter((day) => (availability[day] ?? []).length > 0);

  if (!availableDays.length) {
    return 'Unavailable all week';
  }

  const shiftLabelMap = new Map();

  availableDays.forEach((day) => {
    const shifts = availability[day] ?? [];
    const key = shifts.join('|');
    const label = shifts.join(', ');
    const current = shiftLabelMap.get(key);

    if (current) {
      current.days.push(day.slice(0, 3));
      return;
    }

    shiftLabelMap.set(key, {
      label,
      days: [day.slice(0, 3)],
    });
  });

  return Array.from(shiftLabelMap.values())
    .map(({ label, days }) => `${label} (${days.join(', ')})`)
    .join(' · ');
};

const getAvailabilityDayFlags = (availability = {}) => DAYS.map((day) => ({
  day,
  short: day.slice(0, 2),
  shifts: availability[day] ?? [],
}));

  const formatShiftsPerWeek = (shiftsPerWeek = 0) => `${shiftsPerWeek} ${shiftsPerWeek === 1 ? 'shift' : 'shifts'}/week`;

const createEmptyInviteForm = () => ({ email: '', accountRole: 'staff', employeeId: '' });

const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();

  reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
  reader.onerror = () => reject(reader.error ?? new Error('Could not read the selected file.'));
  reader.readAsDataURL(file);
});

// Shared by every popover menu on this page (Roster data, Add employee) —
// closes on a click outside the menu's own DOM node or on Escape.
const useCloseMenuOnOutsideClick = (isOpen, menuRef, close) => {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleOutsideClick = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        close();
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        close();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `close` is
    // always a fresh `() => setShowX(false)` closure over a stable setState;
    // including it would resubscribe every render for no behavioral change.
  }, [isOpen]);
};

export const Team = () => {
  const { state, dispatch } = useAppState();
  const { employees, settings } = state;
  const { membership } = useAuth();
  const canManageTeam = membership?.accountRole === 'owner' || membership?.accountRole === 'manager';
  const shiftTypes = getShiftTypes(settings);
  const teamRoles = getTeamRoles(settings, employees);
  const roleFilterOptions = ['All roles', ...teamRoles];
  const hasEmployees = employees.length > 0;

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState(createEmptyInviteForm());
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  const openInviteModal = () => {
    setInviteForm(createEmptyInviteForm());
    setInviteError('');
    setInviteSuccess('');
    setShowInviteModal(true);
  };

  const closeInviteModal = () => setShowInviteModal(false);

  const handleInviteSubmit = async (event) => {
    event.preventDefault();

    if (!inviteForm.email.trim()) {
      setInviteError('Enter an email address.');
      return;
    }

    setInviteError('');
    setInviteSubmitting(true);

    const { data, error } = await supabase.functions.invoke('invite-member', {
      body: {
        email: inviteForm.email.trim(),
        accountRole: inviteForm.accountRole,
        employeeId: inviteForm.employeeId || null,
      },
    });

    setInviteSubmitting(false);

    if (error || data?.error) {
      setInviteError(data?.error ?? error.message);
      return;
    }

    setInviteSuccess(`Invite sent to ${inviteForm.email.trim()}.`);
    setInviteForm(createEmptyInviteForm());
  };

  const [showScanModal, setShowScanModal] = useState(false);
  const [scanSubmitting, setScanSubmitting] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanDuplicateWarning, setScanDuplicateWarning] = useState('');
  const scanCameraInputRef = useRef(null);
  const scanUploadInputRef = useRef(null);

  const openScanModal = () => {
    setScanError('');
    setScanSubmitting(false);
    setShowScanModal(true);
  };

  const closeScanModal = () => {
    setShowScanModal(false);
    setScanError('');
    setScanSubmitting(false);

    if (scanCameraInputRef.current) {
      scanCameraInputRef.current.value = '';
    }

    if (scanUploadInputRef.current) {
      scanUploadInputRef.current.value = '';
    }
  };

  const handleScanFileSelected = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setScanError('');
    setScanSubmitting(true);

    try {
      const image = await readFileAsBase64(file);
      const { data, error } = await supabase.functions.invoke('scan-employee', {
        body: { image, mediaType: file.type },
      });

      if (error || data?.error) {
        setScanError(data?.error ?? error.message);
        setScanSubmitting(false);
        return;
      }

      const extracted = data.extracted ?? {};
      const roleLookup = buildRoleLookup(teamRoles);
      const matchedRole = matchRoleName(roleLookup, extracted.role_guess);
      const matchIndex = buildEmployeeMatchIndex(employees);
      const existingMatch = findExistingEmployeeMatch(matchIndex, extracted);

      resetFormState({
        id: null,
        name: extracted.name ?? '',
        title: extracted.title ?? '',
        roles: matchedRole ? [matchedRole] : [],
        contact: extracted.contact ?? '',
        email: extracted.email ?? '',
        shiftsPerWeek: 5,
        availability: createDefaultAvailability(shiftTypes),
      });
      setActiveModalTab(MODAL_TABS.OVERVIEW);
      setScanDuplicateWarning(existingMatch ? `This looks like an existing employee: ${existingMatch.name}.` : '');
      setShowModal(true);
      closeScanModal();
    } catch (scanCatchError) {
      setScanError(scanCatchError.message ?? 'Scan failed.');
      setScanSubmitting(false);
    }
  };

  const [form, setForm] = useState(createEmptyForm(teamRoles, shiftTypes));
  const [formErrors, setFormErrors] = useState(validateForm(createEmptyForm(teamRoles, shiftTypes)));
  const [touched, setTouched] = useState(createEmptyTouched());
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showRosterActionsMenu, setShowRosterActionsMenu] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedMemberIds, setExpandedMemberIds] = useState(() => new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('All roles');
  const [statusFilter, setStatusFilter] = useState('active');
  const [viewMode, setViewMode] = useState(VIEW_MODES.LIST);
  const [slideDir, setSlideDir] = useState('from-right');
  const [activeModalTab, setActiveModalTab] = useState(MODAL_TABS.OVERVIEW);
  const [isMobileView, setIsMobileView] = useState(() => window.innerWidth <= MOBILE_VIEW_BREAKPOINT);
  const [importMode, setImportMode] = useState('add');
  const [importRows, setImportRows] = useState([]);
  const [importFileName, setImportFileName] = useState('');
  const [importFileError, setImportFileError] = useState('');
  const importFileInputRef = useRef(null);
  const rosterActionsMenuRef = useRef(null);
  const importModeButtonRefs = useRef({});
  const [importModeHighlightStyle, setImportModeHighlightStyle] = useState(null);
  const activeViewMode = isMobileView ? VIEW_MODES.CARD : viewMode;
  const importPreview = buildRosterImportPreview(importRows, employees, importMode);
  const editingEmployee = form.id ? employees.find((employee) => employee.id === form.id) ?? null : null;

  useLayoutEffect(() => {
    const activeButton = importModeButtonRefs.current[importMode];
    if (!activeButton) {
      return;
    }
    setImportModeHighlightStyle({ left: activeButton.offsetLeft, width: activeButton.offsetWidth });
  }, [importMode, showImportModal]);

  const switchView = (mode) => {
    if (mode === viewMode) {
      return;
    }

    setSlideDir(mode === VIEW_MODES.LIST ? 'from-right' : 'from-left');
    setViewMode(mode);
  };

  const toggleMemberDetails = (employeeId) => {
    setExpandedMemberIds((current) => {
      const next = new Set(current);

      if (next.has(employeeId)) {
        next.delete(employeeId);
      } else {
        next.add(employeeId);
      }

      return next;
    });
  };

  useEffect(() => {
    const updateViewportState = () => {
      setIsMobileView(window.innerWidth <= MOBILE_VIEW_BREAKPOINT);
    };

    updateViewportState();
    window.addEventListener('resize', updateViewportState);

    return () => {
      window.removeEventListener('resize', updateViewportState);
    };
  }, []);

  useCloseMenuOnOutsideClick(showRosterActionsMenu, rosterActionsMenuRef, () => setShowRosterActionsMenu(false));

  const updateFormField = (field, value) => {
    setForm((currentForm) => {
      const nextForm = { ...currentForm, [field]: value };

      setFormErrors((currentErrors) => ({
        ...currentErrors,
        [field]: touched[field] ? validateField(field, value) : currentErrors[field],
      }));

      return nextForm;
    });
  };

  const toggleFormRole = (role) => {
    setTouched((currentTouched) => ({ ...currentTouched, roles: true }));
    setForm((currentForm) => {
      const hasRole = currentForm.roles.includes(role);
      const nextRoles = hasRole
        ? currentForm.roles.filter((currentRole) => currentRole !== role)
        : [...currentForm.roles, role];

      setFormErrors((currentErrors) => ({ ...currentErrors, roles: validateField('roles', nextRoles) }));

      return { ...currentForm, roles: nextRoles };
    });
  };

  const handleFieldBlur = (field) => {
    setTouched((currentTouched) => ({ ...currentTouched, [field]: true }));
    setFormErrors((currentErrors) => ({
      ...currentErrors,
      [field]: validateField(field, form[field]),
    }));
  };

  const resetFormState = (nextForm = createEmptyForm(teamRoles, shiftTypes)) => {
    setForm(nextForm);
    setFormErrors(validateForm(nextForm));
    setTouched(createEmptyTouched());
  };

  const handleAddEmployee = (e) => {
    e.preventDefault();

    const nextErrors = validateForm(form);
    setFormErrors(nextErrors);
    setTouched({
      name: true,
      roles: true,
      email: true,
    });

    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }

    dispatch({
      type: 'UPSERT_EMPLOYEE',
      payload: {
        id: form.id ?? crypto.randomUUID(),
        name: form.name.trim(),
        title: form.title.trim(),
        roles: form.roles,
        contact: form.contact.trim(),
        email: form.email.trim(),
        shiftsPerWeek: Math.max(0, Number(form.shiftsPerWeek) || 0),
        status: 'active',
        availability: normalizeAvailability(form.availability, shiftTypes),
      },
    });

    resetFormState();
    setShowModal(false);
  };

  const visibleEmployees = employees.filter((employee) => {
    const normalizedSearchTerm = searchTerm.toLowerCase();
    const matchesSearch = [employee.name, employee.title, employee.email]
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearchTerm);
    const matchesRole = roleFilter === 'All roles' || employee.roles.includes(roleFilter);
    const matchesStatus = statusFilter === 'all' || employee.status === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });
  const activeEmployeeCount = employees.filter((employee) => employee.status === 'active').length;
  const archivedEmployeeCount = employees.filter((employee) => employee.status === 'archived').length;
  const statusCounts = {
    active: activeEmployeeCount,
    archived: archivedEmployeeCount,
    all: employees.length,
  };
  const selectedAvailabilityCount = DAYS.reduce(
    (total, day) => total + (form.availability[day]?.length ?? 0),
    0,
  );
  const showRosterEmptyState = !hasEmployees;
  const showFilteredEmptyState = hasEmployees && !visibleEmployees.length;

  const openCreateModal = () => {
    resetFormState();
    setActiveModalTab(MODAL_TABS.OVERVIEW);
    setScanDuplicateWarning('');
    setShowModal(true);
  };

  const openEditModal = (employee) => {
    const nextForm = {
      id: employee.id,
      name: employee.name,
      title: employee.title,
      roles: employee.roles,
      contact: employee.contact,
      email: employee.email,
      shiftsPerWeek: employee.shiftsPerWeek ?? 5,
      availability: normalizeAvailability(employee.availability, shiftTypes),
    };
    resetFormState(nextForm);
    setActiveModalTab(MODAL_TABS.OVERVIEW);
    setScanDuplicateWarning('');
    setShowModal(true);
  };

  const toggleAvailabilityShift = (day, shift) => {
    setForm((currentForm) => {
      const dayAvailability = currentForm.availability[day] ?? [];
      const hasShift = dayAvailability.includes(shift);
      const nextDayAvailability = hasShift
        ? dayAvailability.filter((currentShift) => currentShift !== shift)
        : [...dayAvailability, shift];

      return {
        ...currentForm,
        availability: {
          ...currentForm.availability,
          [day]: nextDayAvailability,
        },
      };
    });
  };

  const applyAvailabilityToDays = (daysToUpdate, getDayAvailability) => {
    setForm((currentForm) => ({
      ...currentForm,
      availability: Object.fromEntries(
        DAYS.map((day) => [
          day,
          daysToUpdate.includes(day)
            ? [...getDayAvailability(day, currentForm.availability[day] ?? [])]
            : [...(currentForm.availability[day] ?? [])],
        ]),
      ),
    }));
  };

  const clearWeekAvailability = () => {
    applyAvailabilityToDays(DAYS, () => []);
  };

  const selectFullWeekAvailability = () => {
    applyAvailabilityToDays(DAYS, () => shiftTypes);
  };

  const setWeekdaysOnlyAvailability = () => {
    applyAvailabilityToDays(DAYS, (day) => (WEEKDAY_DAYS.includes(day) ? shiftTypes : []));
  };

  const closeModal = () => {
    setShowModal(false);
    setActiveModalTab(MODAL_TABS.OVERVIEW);
    setScanDuplicateWarning('');
    resetFormState();
  };

  const openImportModal = () => {
    setShowRosterActionsMenu(false);
    setImportMode('add');
    setImportRows([]);
    setImportFileName('');
    setImportFileError('');
    setShowImportModal(true);
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportMode('add');
    setImportRows([]);
    setImportFileName('');
    setImportFileError('');

    if (importFileInputRef.current) {
      importFileInputRef.current.value = '';
    }
  };

  const downloadCsvFile = (fileName, csv) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const downloadUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = downloadUrl;
    anchor.download = fileName;
    anchor.click();
    window.URL.revokeObjectURL(downloadUrl);
  };

  const exportRoster = () => {
    setShowRosterActionsMenu(false);
    const csv = serializeRosterCsv(employees);
    downloadCsvFile('shiftsizzle-roster.csv', csv);
  };

  const downloadBlankRosterTemplate = () => {
    setShowRosterActionsMenu(false);
    const csv = createBlankRosterTemplateCsv();
    downloadCsvFile('shiftsizzle-roster-template.csv', csv);
  };

  const handleImportFileChange = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const csvText = await file.text();
    const parsedImport = parseRosterCsv(csvText, teamRoles);

    setImportFileName(file.name);
    setImportRows(parsedImport.rows);
    setImportFileError(parsedImport.fileErrors.join(' '));
  };

  const handleImportRoster = () => {
    if (!importPreview.employees.length) {
      return;
    }

    dispatch({
      type: 'IMPORT_EMPLOYEES',
      payload: importPreview.employees,
    });

    closeImportModal();
  };

  const renderEmployeeActions = (employee) => {
    if (employee.status !== 'archived') {
      return (
        <button
          type="button"
          className="team__archive-btn"
          onClick={() => {
            const shouldArchive = window.confirm(`Archive ${employee.name}? You can reactivate them later.`);

            if (!shouldArchive) {
              return;
            }

            dispatch({ type: 'ARCHIVE_EMPLOYEE', payload: employee.id });
          }}
        >
          Archive
        </button>
      );
    }

    return (
      <button
        type="button"
        className="team__reactivate-btn"
        onClick={() => dispatch({ type: 'REACTIVATE_EMPLOYEE', payload: employee.id })}
      >
        Reactivate
      </button>
    );
  };

  const renderStatusBadge = (status) => <StatusBadge status={status} />;

  const renderAvatar = (employee, className = 'team__avatar-initials') => (
    <span className={className} style={{ background: getAvatarTint(employee.id) }} aria-hidden="true">
      {getInitials(employee.name) || '?'}
    </span>
  );

  const renderAvailabilityStrip = (availability, idPrefix) => {
    const days = getAvailabilityDayFlags(availability);
    const availableDays = days.filter((d) => d.shifts.length > 0);
    const summaryLabel = availableDays.length
      ? `Available ${availableDays.map((d) => d.day).join(', ')}`
      : 'Unavailable all week';

    return (
      <div className="team__availability-strip" role="img" aria-label={summaryLabel}>
        {days.map(({ day, short, shifts }) => (
          <span
            key={`${idPrefix}-${day}`}
            className={`team__availability-strip-day ${shifts.length ? 'is-available' : ''}`.trim()}
            title={`${day}: ${shifts.length ? shifts.join(', ') : 'Unavailable'}`}
            aria-hidden="true"
          >
            {short}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="team">
      <div className="team__control-panel">
        <div className="team__control-header">
          <div className="team__control-copy">
            <h2>Team roster</h2>
            <p>Search, filter, and manage your team below.</p>
          </div>
          {hasEmployees && (
            <div className="team__control-actions">
              <div className="team__downloads-menu" ref={rosterActionsMenuRef}>
                <Button
                  type="button"
                  className="team__toolbar-action team__toolbar-action--secondary"
                  onClick={() => setShowRosterActionsMenu((current) => !current)}
                  aria-haspopup="menu"
                  aria-expanded={showRosterActionsMenu}
                >
                  <span className="team__action-icon" aria-hidden="true">
                    <i className="fas fa-database" />
                  </span>
                  Roster data
                </Button>
                {showRosterActionsMenu && (
                  <div className="team__downloads-menu-popover" role="menu" aria-label="Roster data menu">
                    <button
                      type="button"
                      className="team__downloads-menu-item"
                      onClick={exportRoster}
                      role="menuitem"
                    >
                      <span className="team__action-icon" aria-hidden="true">
                        <i className="fas fa-download" />
                      </span>
                      Export roster
                    </button>
                    {canManageTeam && (
                      <button
                        type="button"
                        className="team__downloads-menu-item"
                        onClick={openImportModal}
                        role="menuitem"
                      >
                        <span className="team__action-icon" aria-hidden="true">
                          <i className="fas fa-file-import" />
                        </span>
                        Import roster
                      </button>
                    )}
                  </div>
                )}
              </div>
              {canManageTeam && (
                <Button
                  onClick={openCreateModal}
                  className="team__primary-action"
                >
                  <span className="team__action-icon" aria-hidden="true">
                    <i className="fas fa-plus" />
                  </span>
                  Add Employee
                </Button>
              )}
              {canManageTeam && (
                <Button
                  type="button"
                  onClick={openScanModal}
                  className="team__toolbar-action team__toolbar-action--secondary"
                >
                  <span className="team__action-icon" aria-hidden="true">
                    <i className="fas fa-camera" />
                  </span>
                  Add via Scan
                </Button>
              )}
            </div>
          )}
          {canManageTeam && hasEmployees && (
            <div className="team__control-actions">
              <Button
                type="button"
                onClick={openInviteModal}
                className="team__toolbar-action team__toolbar-action--secondary"
              >
                <span className="team__action-icon" aria-hidden="true">
                  <i className="fas fa-user-plus" />
                </span>
                Invite team member
              </Button>
            </div>
          )}
        </div>

        {hasEmployees && (
          <button
            type="button"
            className="team__filters-toggle"
            onClick={() => setShowFilters((current) => !current)}
            aria-expanded={showFilters}
            aria-controls="team-filters-panel"
          >
            <span>
              <i className="fas fa-sliders" aria-hidden="true" />
              Filters
            </span>
            <i className={`fas fa-chevron-${showFilters ? 'up' : 'down'}`} aria-hidden="true" />
          </button>
        )}

        {hasEmployees && (
          <div
            id="team-filters-panel"
            className={`team__filters-panel ${showFilters ? 'is-expanded' : ''}`.trim()}
          >
           <div className="team__filters-panel-inner">
            <div className="team__filter-group team__filter-group--search">
              <label className="team__filter-label" htmlFor="team-search-input">Search</label>
              <div className="team__search-shell">
                <span className="team__search-icon" aria-hidden="true">
                  <i className="fas fa-search" />
                </span>
                <input
                  id="team-search-input"
                  className="team__search"
                  type="search"
                  placeholder="Search employees"
                  aria-label="Search employees"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="team__filter-group">
              <label className="team__filter-label" htmlFor="team-role-filter">Role</label>
              <select
                id="team-role-filter"
                className="team__filter-select"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                {roleFilterOptions.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>

            <div className="team__filter-group">
              <span className="team__filter-label">Status</span>
              <div className="team__status-toggle" role="group" aria-label="Filter by status">
                <span
                  className={`team__status-toggle-indicator team__status-toggle-indicator--${statusFilter}`}
                  aria-hidden="true"
                />
                {STATUS_FILTER_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    className={`team__status-toggle-button ${statusFilter === value ? 'is-active' : ''}`.trim()}
                    onClick={() => setStatusFilter(value)}
                    aria-pressed={statusFilter === value}
                    aria-label={`${label} ${statusCounts[value]}`}
                  >
                    <span className="team__status-toggle-text">{label}</span>
                    <span className="team__status-toggle-count">{statusCounts[value]}</span>
                  </button>
                ))}
              </div>
            </div>

            {!isMobileView && (
              <div className="team__filter-group">
                <span className="team__filter-label">View</span>
                <div className="team__view-toggle" role="group" aria-label="Team view mode">
                  <span
                    className={`team__view-toggle-indicator team__view-toggle-indicator--${viewMode}`}
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    className={`team__view-toggle-button ${viewMode === VIEW_MODES.CARD ? 'is-active' : ''}`.trim()}
                    onClick={() => switchView(VIEW_MODES.CARD)}
                    title="Card view"
                    aria-label="Card view"
                  >
                    <i className="fas fa-th-large" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={`team__view-toggle-button ${viewMode === VIEW_MODES.LIST ? 'is-active' : ''}`.trim()}
                    onClick={() => switchView(VIEW_MODES.LIST)}
                    title="List view"
                    aria-label="List view"
                  >
                    <i className="fas fa-list" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
           </div>
          </div>
        )}
      </div>

      <section
        key={activeViewMode}
        className={`team__list-panel team__list-panel--slide-${slideDir} ${activeViewMode === VIEW_MODES.LIST ? 'team__list-panel--list' : 'team__list-panel--cards'}`}
      >
        {showRosterEmptyState && (
          <ContentPanel className="team__empty-state team__empty-state--onboarding">
            <span className="team__availability-summary-label">Start your roster</span>
            {canManageTeam && (
              <div className="team__empty-state-actions">
                <Button type="button" className="team__primary-action" onClick={openCreateModal}>
                  <span className="team__action-icon" aria-hidden="true">
                    <i className="fas fa-plus" />
                  </span>
                  Add Employee
                </Button>
                <Button type="button" className="team__toolbar-action team__toolbar-action--secondary" onClick={openScanModal}>
                  <span className="team__action-icon" aria-hidden="true">
                    <i className="fas fa-camera" />
                  </span>
                  Scan a document
                </Button>
                <Button type="button" className="team__toolbar-action team__toolbar-action--secondary" onClick={openImportModal}>
                  <span className="team__action-icon" aria-hidden="true">
                    <i className="fas fa-file-import" />
                  </span>
                  Import a CSV
                </Button>
              </div>
            )}
          </ContentPanel>
        )}
        {showFilteredEmptyState && (
          <ContentPanel className="team__empty-state">
            <h3>No team members match these filters.</h3>
            <p>Adjust the search or status filters, or add a new employee.</p>
          </ContentPanel>
        )}
        {activeViewMode === VIEW_MODES.CARD && visibleEmployees.map((emp) => (
          <ContentPanel key={emp.id} className="team__member-panel">
            <div className="team__member-info">
              <div className="team__member-avatar">
                {renderAvatar(emp)}
              </div>
              <div className="team__member-details">
                <div className="team__member-header">
                  <div className="team__member-name"><strong>{emp.name}</strong></div>
                  {renderStatusBadge(emp.status)}
                  {canManageTeam && (
                    <button
                      type="button"
                      className="team__edit-link team__edit-link--card"
                      title="Edit"
                      aria-label={`Edit ${emp.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(emp);
                      }}
                    >
                      <i className="fas fa-pen" aria-hidden="true" />
                      Edit
                    </button>
                  )}
                </div>
                <div className="team__member-role-row">
                  {emp.title && <span className="team__member-title">{emp.title}</span>}
                  {emp.title && emp.roles.length > 0 && <span className="team__member-role-sep" aria-hidden="true">&middot;</span>}
                  <span className="team__member-role">{emp.roles.join(', ')}</span>
                </div>
                <div className="team__member-meta-row">
                  <div className="team__member-shifts">{formatShiftsPerWeek(emp.shiftsPerWeek)}</div>
                </div>
                <div className="team__member-availability-row">
                  {renderAvailabilityStrip(emp.availability, `card-${emp.id}`)}
                </div>
                <div className={`team__member-more ${expandedMemberIds.has(emp.id) ? 'is-expanded' : ''}`.trim()}>
                  <button
                    type="button"
                    className="team__member-more-toggle"
                    onClick={() => toggleMemberDetails(emp.id)}
                    aria-expanded={expandedMemberIds.has(emp.id)}
                    aria-controls={`team-member-more-${emp.id}`}
                  >
                    More details
                  </button>
                  <div className="team__member-more-content" id={`team-member-more-${emp.id}`}>
                    <div className="team__member-more-inner">
                      <div className="team__member-contact">
                        <i className="fas fa-phone" aria-hidden="true" />
                        {emp.contact || 'N/A'}
                      </div>
                      <div className="team__member-email">
                        <i className="fas fa-envelope" aria-hidden="true" />
                        {emp.email || 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>
                {renderEmployeeActions(emp)}
              </div>
            </div>
          </ContentPanel>
        ))}
        {activeViewMode === VIEW_MODES.LIST && visibleEmployees.length > 0 && (
          <ContentPanel className="team__table-card">
            <table className="team__table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role(s)</th>
                  <th>Status</th>
                  <th>Contact</th>
                  <th>Shifts / Week</th>
                  <th>Availability</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleEmployees.map((employee) => (
                  <tr key={employee.id}>
                    <td>
                      <div className="team__table-name">
                        {renderAvatar(employee, 'team__avatar-initials team__avatar-initials--sm')}
                        <div>
                          <strong>{employee.name}</strong>
                          <div className="team__table-subtitle">{employee.title}</div>
                        </div>
                      </div>
                    </td>
                    <td>{employee.roles.join(', ')}</td>
                    <td className="team__table-status">{renderStatusBadge(employee.status)}</td>
                    <td>
                      <div className="team__table-contact">
                        <i className="fas fa-phone" aria-hidden="true" />
                        {employee.contact || 'N/A'}
                      </div>
                      <div className="team__table-subtitle">
                        <i className="fas fa-envelope" aria-hidden="true" />
                        {employee.email || 'N/A'}
                      </div>
                    </td>
                    <td className="team__table-shifts">{formatShiftsPerWeek(employee.shiftsPerWeek)}</td>
                    <td className="team__table-availability">
                      {renderAvailabilityStrip(employee.availability, `table-${employee.id}`)}
                    </td>
                    <td>
                      {canManageTeam && (
                        <div className="team__table-actions">
                          <button
                            type="button"
                            className="team__edit-link"
                            onClick={() => openEditModal(employee)}
                          >
                            <i className="fas fa-pen" aria-hidden="true" />
                            Edit
                          </button>
                          {renderEmployeeActions(employee)}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ContentPanel>
        )}
      </section>

      {showModal && (
        <div className="team__modal-overlay">
          <div className="team__modal">
            <div className={`team__modal-header ${editingEmployee ? 'team__modal-header--identity' : ''}`.trim()}>
              {editingEmployee ? (
                <div className="team__modal-identity">
                  {renderAvatar(editingEmployee, 'team__avatar-initials team__avatar-initials--lg')}
                  <div className="team__modal-identity-copy">
                    <h2>{editingEmployee.name}</h2>
                    {editingEmployee.title && <p className="team__modal-identity-title">{editingEmployee.title}</p>}
                    {renderStatusBadge(editingEmployee.status)}
                  </div>
                </div>
              ) : (
                <div>
                  <h2>Add New Employee</h2>
                  <p className="team__modal-subtitle">Update team details and weekly availability without leaving the roster.</p>
                </div>
              )}
              <div className="team__modal-tabs" role="tablist" aria-label="Employee editor sections">
                <button
                  id="team-modal-tab-details"
                  type="button"
                  role="tab"
                  aria-selected={activeModalTab === MODAL_TABS.OVERVIEW}
                  aria-controls="team-modal-panel-details"
                  className={`team__modal-tab ${activeModalTab === MODAL_TABS.OVERVIEW ? 'is-active' : ''}`.trim()}
                  onClick={() => setActiveModalTab(MODAL_TABS.OVERVIEW)}
                >
                  Overview
                </button>
                <button
                  id="team-modal-tab-availability"
                  type="button"
                  role="tab"
                  aria-selected={activeModalTab === MODAL_TABS.AVAILABILITY}
                  aria-controls="team-modal-panel-availability"
                  className={`team__modal-tab ${activeModalTab === MODAL_TABS.AVAILABILITY ? 'is-active' : ''}`.trim()}
                  onClick={() => setActiveModalTab(MODAL_TABS.AVAILABILITY)}
                >
                  Availability
                  <span className="team__modal-tab-count">{selectedAvailabilityCount}</span>
                </button>
              </div>
            </div>
            <form onSubmit={handleAddEmployee} className="team__modal-form">
              <div className="team__modal-body">
                {activeModalTab === MODAL_TABS.OVERVIEW && (
                  <div
                    id="team-modal-panel-details"
                    role="tabpanel"
                    aria-labelledby="team-modal-tab-details"
                    className="team__modal-panel"
                  >
                    {scanDuplicateWarning && (
                      <p className="team__field-error team__field-error--spaced" role="alert">{scanDuplicateWarning}</p>
                    )}
                    <InputField
                      label="Name"
                      name="name"
                      value={form.name}
                      onChange={(value) => updateFormField('name', value)}
                      onBlur={() => handleFieldBlur('name')}
                      aria-invalid={Boolean(touched.name && formErrors.name)}
                    />
                    {touched.name && formErrors.name && <p className="team__field-error">{formErrors.name}</p>}
                    <InputField
                      label="Title"
                      name="title"
                      value={form.title}
                      onChange={(value) => updateFormField('title', value)}
                    />
                    <div className="input-field">
                      <label>Roles</label>
                      <div className="team__role-chips" role="group" aria-label="Roles">
                        {teamRoles.map((role) => (
                          <button
                            key={role}
                            type="button"
                            className={`team__shift-chip ${form.roles.includes(role) ? 'is-active' : ''}`.trim()}
                            onClick={() => toggleFormRole(role)}
                            aria-pressed={form.roles.includes(role)}
                          >
                            {role}
                          </button>
                        ))}
                      </div>
                    </div>
                    {touched.roles && formErrors.roles && <p className="team__field-error">{formErrors.roles}</p>}
                    <div className="team__field-icon-row">
                      <i className="fas fa-phone team__field-icon" aria-hidden="true" />
                      <InputField
                        label="Contact"
                        name="contact"
                        value={form.contact}
                        onChange={(value) => updateFormField('contact', value)}
                      />
                    </div>
                    <div className="team__field-icon-row">
                      <i className="fas fa-envelope team__field-icon" aria-hidden="true" />
                      <InputField
                        label="Email"
                        name="email"
                        value={form.email}
                        onChange={(value) => updateFormField('email', value)}
                        onBlur={() => handleFieldBlur('email')}
                        aria-invalid={Boolean(touched.email && formErrors.email)}
                      />
                    </div>
                    {touched.email && formErrors.email && <p className="team__field-error">{formErrors.email}</p>}
                    <InputField
                      label="Shifts Per Week"
                      name="shiftsPerWeek"
                      type="number"
                      min={0}
                      step={1}
                      value={form.shiftsPerWeek}
                      onChange={(value) => updateFormField('shiftsPerWeek', value)}
                    />
                    <section className="team__availability-summary-card" aria-label="Availability summary">
                      <div className="team__availability-summary-header">
                        <div>
                          <span className="team__availability-summary-label">Availability snapshot</span>
                          <strong>{selectedAvailabilityCount} shifts selected</strong>
                        </div>
                        <button
                          type="button"
                          className="team__availability-summary-link"
                          onClick={() => setActiveModalTab(MODAL_TABS.AVAILABILITY)}
                        >
                          Edit availability
                        </button>
                      </div>
                      <p>{getAvailabilitySummary(form.availability)}</p>
                    </section>
                  </div>
                )}
                {activeModalTab === MODAL_TABS.AVAILABILITY && (
                  <div
                    id="team-modal-panel-availability"
                    role="tabpanel"
                    aria-labelledby="team-modal-tab-availability"
                    className="team__modal-panel"
                  >
                    <div className="team__availability-editor">
                      <div className="team__availability-header">
                        <span>Availability by day</span>
                        <p>Pick only the shifts this employee can work for each day of the week.</p>
                      </div>
                      <div className="team__availability-actions">
                        <button
                          type="button"
                          className="team__availability-action"
                          onClick={selectFullWeekAvailability}
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          className="team__availability-action"
                          onClick={setWeekdaysOnlyAvailability}
                        >
                          Weekdays only
                        </button>
                        <button
                          type="button"
                          className="team__availability-action team__availability-action--danger"
                          onClick={clearWeekAvailability}
                        >
                          Clear week
                        </button>
                      </div>
                      <div className="team__availability-grid">
                        {DAYS.map((day) => {
                          const dayAvailability = form.availability[day] ?? [];

                          return (
                            <div key={day} className="team__availability-day">
                              <div className="team__availability-day-header">
                                <strong>{day}</strong>
                                <span>{dayAvailability.length ? `${dayAvailability.length} selected` : 'Unavailable'}</span>
                              </div>
                              <div className="team__availability-day-chips">
                                {shiftTypes.map((shift) => (
                                  <button
                                    key={`${day}-${shift}`}
                                    type="button"
                                    className={`team__shift-chip ${dayAvailability.includes(shift) ? 'is-active' : ''}`.trim()}
                                    onClick={() => toggleAvailabilityShift(day, shift)}
                                    aria-pressed={dayAvailability.includes(shift)}
                                    aria-label={`${day} ${shift}`}
                                  >
                                    {shift}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="team__modal-actions">
                <Button type="submit" className="team__modal-primary-action">
                  <span className="team__action-icon" aria-hidden="true">
                    <i className={`fas ${form.id ? 'fa-save' : 'fa-plus'}`} />
                  </span>
                  {form.id ? 'Update Employee' : 'Add Employee'}
                </Button>
                <Button type="button" className="team__modal-secondary-action" onClick={closeModal}>
                  <span className="team__action-icon" aria-hidden="true">
                    <i className="fas fa-xmark" />
                  </span>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
          <div className="team__modal-backdrop" onClick={closeModal}></div>
        </div>
      )}

      {showScanModal && (
        <div className="team__modal-overlay">
          <div className="team__modal">
            <div className="team__modal-header">
              <div>
                <h2>Add via Scan</h2>
                <p className="team__modal-subtitle">Take a photo or upload an image of a paper application, and we&apos;ll pre-fill the Add Employee form for you to review.</p>
              </div>
            </div>
            <div className="team__modal-body">
              {scanError && <p className="team__field-error" role="alert">{scanError}</p>}
              {scanSubmitting ? (
                <p className="settings__field-hint">Reading document…</p>
              ) : (
                <div className="team__scan-options">
                  <Button type="button" className="team__toolbar-action" onClick={() => scanCameraInputRef.current?.click()}>
                    <span className="team__action-icon" aria-hidden="true">
                      <i className="fas fa-camera" />
                    </span>
                    Take Photo
                  </Button>
                  <Button
                    type="button"
                    className="team__toolbar-action team__toolbar-action--secondary"
                    onClick={() => scanUploadInputRef.current?.click()}
                  >
                    <span className="team__action-icon" aria-hidden="true">
                      <i className="fas fa-upload" />
                    </span>
                    Upload Image
                  </Button>
                  <input
                    ref={scanCameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleScanFileSelected}
                    hidden
                  />
                  <input
                    ref={scanUploadInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleScanFileSelected}
                    hidden
                  />
                </div>
              )}
            </div>
            <div className="team__modal-actions">
              <Button type="button" className="team__modal-secondary-action" onClick={closeScanModal}>
                <span className="team__action-icon" aria-hidden="true">
                  <i className="fas fa-xmark" />
                </span>
                Cancel
              </Button>
            </div>
          </div>
          <div className="team__modal-backdrop" onClick={closeScanModal}></div>
        </div>
      )}

      {showImportModal && (
        <div className="team__modal-overlay">
          <div className="team__modal team__modal--wide">
            <div className="team__modal-header">
              <div>
                <h2>Import roster</h2>
                <p className="team__modal-subtitle">Upload a CSV to add new employees or update existing profiles in bulk.</p>
              </div>
              <button
                type="button"
                className="team__modal-link-action"
                onClick={downloadBlankRosterTemplate}
              >
                <i className="fas fa-file-arrow-down" aria-hidden="true" />
                Download template
              </button>
            </div>
            <div className="team__modal-body">
              <section className="team__import-shell">
                <div className="team__import-grid">
                  <div className="team__import-field">
                    <label htmlFor="team-roster-file">Roster CSV file</label>
                    <input
                      id="team-roster-file"
                      ref={importFileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleImportFileChange}
                    />
                    {importFileName && <p className="team__import-file-name">Loaded {importFileName}</p>}
                  </div>

                  <div className="team__import-field">
                    <span className="team__filter-label">Import mode</span>
                    <div className="team__import-mode" role="tablist" aria-label="Import mode">
                      {importModeHighlightStyle && (
                        <span
                          className="team__import-mode-highlight"
                          style={importModeHighlightStyle}
                          aria-hidden="true"
                        />
                      )}
                      {ROSTER_IMPORT_MODES.map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          role="tab"
                          aria-selected={importMode === value}
                          ref={(node) => { importModeButtonRefs.current[value] = node; }}
                          className={`team__import-mode-button ${importMode === value ? 'is-active' : ''}`.trim()}
                          onClick={() => setImportMode(value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {importFileError && <p className="team__field-error team__field-error--spaced">{importFileError}</p>}

                {importPreview.rows.length > 0 && (
                  <div className="team__import-summary" aria-label="Import summary">
                    {importPreview.summary.create > 0 && (
                      <span className="team__import-badge team__import-badge--create">{importPreview.summary.create} new</span>
                    )}
                    {importPreview.summary.update > 0 && (
                      <span className="team__import-badge team__import-badge--update">{importPreview.summary.update} updates</span>
                    )}
                    {importPreview.summary.skip > 0 && (
                      <span className="team__import-badge team__import-badge--skip">{importPreview.summary.skip} skipped</span>
                    )}
                    {importPreview.summary.invalid > 0 && (
                      <span className="team__import-badge team__import-badge--invalid">{importPreview.summary.invalid} invalid</span>
                    )}
                  </div>
                )}

                {importPreview.rows.length > 0 ? (
                  <div className="team__import-preview">
                    <table className="team__import-table">
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>Name</th>
                          <th>Role(s)</th>
                          <th>Action</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.rows.map((row) => (
                          <tr key={row.rowNumber}>
                            <td>{row.rowNumber}</td>
                            <td>
                              <strong>{row.values.name || 'Missing name'}</strong>
                              {row.values.email && <div className="team__table-subtitle">{row.values.email}</div>}
                            </td>
                            <td>{row.values.roles?.length ? row.values.roles.join(', ') : 'Missing role'}</td>
                            <td>
                              <span className={`team__import-pill team__import-pill--${row.action}`.trim()}>{row.action}</span>
                            </td>
                            <td>{row.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="team__import-empty-state">
                    <h3>Choose a file to preview.</h3>
                  </div>
                )}
              </section>
            </div>
            <div className="team__modal-actions">
              <Button
                type="button"
                className="team__modal-primary-action"
                onClick={handleImportRoster}
                disabled={!importPreview.employees.length}
              >
                <span className="team__action-icon" aria-hidden="true">
                  <i className="fas fa-file-import" />
                </span>
                Import {importPreview.employees.length} roster {importPreview.employees.length === 1 ? 'row' : 'rows'}
              </Button>
              <Button type="button" className="team__modal-secondary-action" onClick={closeImportModal}>
                <span className="team__action-icon" aria-hidden="true">
                  <i className="fas fa-xmark" />
                </span>
                Cancel
              </Button>
            </div>
          </div>
          <div className="team__modal-backdrop" onClick={closeImportModal}></div>
        </div>
      )}

      {showInviteModal && (
        <div className="team__modal-overlay">
          <div className="team__modal">
            <div className="team__modal-header">
              <div>
                <h2>Invite team member</h2>
                <p className="team__modal-subtitle">Send a sign-in invite by email. Staff can see the published schedule and set their own availability; managers can edit the roster and schedule.</p>
              </div>
            </div>
            <form onSubmit={handleInviteSubmit} className="team__modal-form">
              <div className="team__modal-body">
                {inviteError && <p className="settings__field-hint" role="alert">{inviteError}</p>}
                {inviteSuccess && <p className="settings__field-hint">{inviteSuccess}</p>}
                <InputField
                  label="Email"
                  name="inviteEmail"
                  type="email"
                  value={inviteForm.email}
                  onChange={(value) => setInviteForm((current) => ({ ...current, email: value }))}
                  required
                />
                <InputField
                  label="Account Role"
                  name="inviteAccountRole"
                  type="select"
                  value={inviteForm.accountRole}
                  onChange={(value) => setInviteForm((current) => ({ ...current, accountRole: value }))}
                  options={['staff', 'manager']}
                />
                <label className="settings__field-label" htmlFor="invite-employee-id">Link to Roster Employee (optional)</label>
                <select
                  id="invite-employee-id"
                  className="settings__select"
                  value={inviteForm.employeeId}
                  onChange={(event) => setInviteForm((current) => ({ ...current, employeeId: event.target.value }))}
                >
                  <option value="">Not linked</option>
                  {employees.filter((employee) => employee.status === 'active').map((employee) => (
                    <option key={employee.id} value={employee.id}>{employee.name}</option>
                  ))}
                </select>
              </div>
              <div className="team__modal-actions">
                <Button type="submit" className="team__modal-primary-action" disabled={inviteSubmitting}>
                  <span className="team__action-icon" aria-hidden="true">
                    <i className="fas fa-paper-plane" />
                  </span>
                  {inviteSubmitting ? 'Sending…' : 'Send invite'}
                </Button>
                <Button type="button" className="team__modal-secondary-action" onClick={closeInviteModal}>
                  <span className="team__action-icon" aria-hidden="true">
                    <i className="fas fa-xmark" />
                  </span>
                  Close
                </Button>
              </div>
            </form>
          </div>
          <div className="team__modal-backdrop" onClick={closeInviteModal}></div>
        </div>
      )}
    </div>
  );
};