import { useEffect, useRef, useState } from 'react';

import { Button, ContentPanel, InputField } from '../../Components';
import { BASE_TEAM_ROLES, DAYS, getShiftTypes, getTeamRoles, useAppState } from '../../state/AppState';
import {
  buildRosterImportPreview,
  createBlankRosterTemplateCsv,
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
  DETAILS: 'details',
  AVAILABILITY: 'availability',
});

const MOBILE_VIEW_BREAKPOINT = 900;
const COMPACT_DESKTOP_BREAKPOINT = 1180;
const ROSTER_IMPORT_MODES = [
  { value: 'add', label: 'Add new only' },
  { value: 'upsert', label: 'Add and update matches' },
];

const createDefaultAvailability = (shiftTypes) => Object.fromEntries(DAYS.map((day) => [day, [...shiftTypes]]));

const normalizeAvailability = (availability = {}, shiftTypes) => Object.fromEntries(
  DAYS.map((day) => [day, [...(availability[day] ?? shiftTypes)]])
);

const createEmptyForm = (teamRoles, shiftTypes) => ({
  id: null,
  name: '',
  title: '',
  role: teamRoles[0] ?? BASE_TEAM_ROLES.MANAGER,
  contact: '',
  email: '',
  shiftsPerWeek: 5,
  availability: createDefaultAvailability(shiftTypes),
});

const createEmptyTouched = () => ({
  name: false,
  role: false,
  email: false,
});

const validateField = (field, value) => {
  switch (field) {
    case 'name':
      return value.trim() ? '' : 'Name is required.';
    case 'role':
      return value ? '' : 'Role is required.';
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
  role: validateField('role', form.role),
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

  const formatShiftsPerWeek = (shiftsPerWeek = 0) => `${shiftsPerWeek} ${shiftsPerWeek === 1 ? 'shift' : 'shifts'}/week`;

export const Team = () => {
  const { state, dispatch } = useAppState();
  const { employees, settings } = state;
  const shiftTypes = getShiftTypes(settings);
  const teamRoles = getTeamRoles(settings, employees);
  const roleFilterOptions = ['All roles', ...teamRoles];
  const hasEmployees = employees.length > 0;

  const [form, setForm] = useState(createEmptyForm(teamRoles, shiftTypes));
  const [formErrors, setFormErrors] = useState(validateForm(createEmptyForm(teamRoles, shiftTypes)));
  const [touched, setTouched] = useState(createEmptyTouched());
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showRosterActionsMenu, setShowRosterActionsMenu] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('All roles');
  const [statusFilter, setStatusFilter] = useState('active');
  const [viewMode, setViewMode] = useState(VIEW_MODES.CARD);
  const [slideDir, setSlideDir] = useState('from-right');
  const [activeModalTab, setActiveModalTab] = useState(MODAL_TABS.DETAILS);
  const [roleChipOverflow, setRoleChipOverflow] = useState({ showLeft: false, showRight: false });
  const [isMobileView, setIsMobileView] = useState(() => window.innerWidth <= MOBILE_VIEW_BREAKPOINT);
  const [isCompactDesktop, setIsCompactDesktop] = useState(
    () => window.innerWidth <= COMPACT_DESKTOP_BREAKPOINT && window.innerWidth > MOBILE_VIEW_BREAKPOINT,
  );
  const [importMode, setImportMode] = useState('add');
  const [importRows, setImportRows] = useState([]);
  const [importFileName, setImportFileName] = useState('');
  const [importFileError, setImportFileError] = useState('');
  const roleChipsRef = useRef(null);
  const importFileInputRef = useRef(null);
  const rosterActionsMenuRef = useRef(null);
  const activeViewMode = isMobileView ? VIEW_MODES.CARD : viewMode;
  const showFullDesktopRosterTools = !isMobileView && !isCompactDesktop;
  const showCollapsedRosterTools = !showFullDesktopRosterTools;
  const importPreview = buildRosterImportPreview(importRows, employees, importMode);

  const switchView = (mode) => {
    if (mode === viewMode) {
      return;
    }

    setSlideDir(mode === VIEW_MODES.LIST ? 'from-right' : 'from-left');
    setViewMode(mode);
  };

  const submitSearch = (event) => {
    event.preventDefault();
    setSearchTerm(searchInput.trim());
  };

  const scrollRoleChips = (direction) => {
    const chipContainer = roleChipsRef.current;

    if (!chipContainer) {
      return;
    }

    const targetLeft = direction === 'left' ? 0 : chipContainer.scrollWidth;

    if (typeof chipContainer.scrollTo === 'function') {
      chipContainer.scrollTo({ left: targetLeft, behavior: 'smooth' });
      return;
    }

    chipContainer.scrollLeft = targetLeft;
  };

  useEffect(() => {
    const chipContainer = roleChipsRef.current;

    if (!chipContainer) {
      return undefined;
    }

    const updateOverflowState = () => {
      const hasOverflow = chipContainer.scrollWidth - chipContainer.clientWidth > 4;

      setRoleChipOverflow({
        showLeft: hasOverflow && chipContainer.scrollLeft > 4,
        showRight: hasOverflow && chipContainer.scrollLeft + chipContainer.clientWidth < chipContainer.scrollWidth - 4,
      });
    };

    updateOverflowState();
    chipContainer.addEventListener('scroll', updateOverflowState, { passive: true });
    window.addEventListener('resize', updateOverflowState);

    return () => {
      chipContainer.removeEventListener('scroll', updateOverflowState);
      window.removeEventListener('resize', updateOverflowState);
    };
  }, []);

  useEffect(() => {
    const updateViewportState = () => {
      const nextIsMobileView = window.innerWidth <= MOBILE_VIEW_BREAKPOINT;

      setIsMobileView(nextIsMobileView);
      setIsCompactDesktop(
        window.innerWidth <= COMPACT_DESKTOP_BREAKPOINT && !nextIsMobileView,
      );
    };

    updateViewportState();
    window.addEventListener('resize', updateViewportState);

    return () => {
      window.removeEventListener('resize', updateViewportState);
    };
  }, []);

  useEffect(() => {
    if (!showRosterActionsMenu) {
      return undefined;
    }

    const handleOutsideClick = (event) => {
      if (!rosterActionsMenuRef.current?.contains(event.target)) {
        setShowRosterActionsMenu(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setShowRosterActionsMenu(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showRosterActionsMenu]);

  useEffect(() => {
    if (showFullDesktopRosterTools) {
      setShowRosterActionsMenu(false);
    }
  }, [showFullDesktopRosterTools]);

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
      role: true,
      email: true,
    });

    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }

    dispatch({
      type: 'UPSERT_EMPLOYEE',
      payload: {
        id: form.id ?? Date.now(),
        name: form.name.trim(),
        title: form.title.trim(),
        role: form.role,
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
    const matchesRole = roleFilter === 'All roles' || employee.role === roleFilter;
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
    setActiveModalTab(MODAL_TABS.DETAILS);
    setShowModal(true);
  };

  const openEditModal = (employee) => {
    const nextForm = {
      id: employee.id,
      name: employee.name,
      title: employee.title,
      role: employee.role,
      contact: employee.contact,
      email: employee.email,
      shiftsPerWeek: employee.shiftsPerWeek ?? 5,
      availability: normalizeAvailability(employee.availability, shiftTypes),
    };
    resetFormState(nextForm);
    setActiveModalTab(MODAL_TABS.DETAILS);
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
    setActiveModalTab(MODAL_TABS.DETAILS);
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

  const renderStatusBadge = (status) => (
    <span className={`team__status-badge team__status-badge--${status}`.trim()}>
      {status}
    </span>
  );

  return (
    <div className="team">
      <ContentPanel className="team__control-panel">
        <div className="team__control-header">
          <div className="team__control-copy">
            <span className="team__control-eyebrow">Team workspace</span>
            <h2>Manage roster and staffing filters</h2>
            <p>Search, filter, and switch views from one control bar.</p>
          </div>
          {hasEmployees && (
            <div className="team__control-actions">
              {!isMobileView && (
                <div className="team__control-view-group">
                  <span className="team__control-label">View</span>
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
              {showFullDesktopRosterTools && (
                <div className="team__control-actions-secondary" aria-label="Roster download actions">
                  <Button type="button" className="team__toolbar-action team__toolbar-action--secondary" onClick={downloadBlankRosterTemplate}>
                    <span className="team__action-icon" aria-hidden="true">
                      <i className="fas fa-file-arrow-down" />
                    </span>
                    Blank template
                  </Button>
                  <Button type="button" className="team__toolbar-action team__toolbar-action--secondary" onClick={exportRoster}>
                    <span className="team__action-icon" aria-hidden="true">
                      <i className="fas fa-download" />
                    </span>
                    Export roster
                  </Button>
                </div>
              )}
              <div className="team__control-actions-primary">
                {showCollapsedRosterTools && (
                  <div className="team__downloads-menu" ref={rosterActionsMenuRef}>
                    <Button
                      type="button"
                      className="team__toolbar-action team__toolbar-action--secondary"
                      onClick={() => setShowRosterActionsMenu((current) => !current)}
                      aria-haspopup="menu"
                      aria-expanded={showRosterActionsMenu}
                    >
                      <span className="team__action-icon" aria-hidden="true">
                        <i className="fas fa-ellipsis-h" />
                      </span>
                      Roster actions
                    </Button>
                    {showRosterActionsMenu && (
                      <div className="team__downloads-menu-popover" role="menu" aria-label="Roster actions menu">
                        <button
                          type="button"
                          className="team__downloads-menu-item"
                          onClick={downloadBlankRosterTemplate}
                          role="menuitem"
                        >
                          <span className="team__action-icon" aria-hidden="true">
                            <i className="fas fa-file-arrow-down" />
                          </span>
                          Blank template
                        </button>
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
                      </div>
                    )}
                  </div>
                )}
                {showFullDesktopRosterTools && (
                  <Button type="button" className="team__toolbar-action" onClick={openImportModal}>
                    <span className="team__action-icon" aria-hidden="true">
                      <i className="fas fa-file-import" />
                    </span>
                    Import roster
                  </Button>
                )}
                <Button
                  onClick={openCreateModal}
                  className="team__primary-action"
                >
                  <span className="team__action-icon" aria-hidden="true">
                    <i className="fas fa-plus" />
                  </span>
                  Add Employee
                </Button>
              </div>
            </div>
          )}
        </div>

        {hasEmployees && (
          <div className="team__filters-panel">
            <form className="team__search-form" onSubmit={submitSearch}>
              <label className="team__filter-label" htmlFor="team-search-input">Search roster</label>
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
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
                <button type="submit" className="team__search-submit" aria-label="Run employee search">
                  <i className="fas fa-arrow-right" aria-hidden="true" />
                </button>
              </div>
            </form>
            <div className="team__filter-rail">
              <div className="team__filter-group">
                <span className="team__filter-label">Role</span>
                <div
                  className={`team__filter-chips-shell ${roleChipOverflow.showLeft ? 'has-left-overflow' : ''} ${roleChipOverflow.showRight ? 'has-right-overflow' : ''}`.trim()}
                >
                  {roleChipOverflow.showLeft && (
                    <button
                      type="button"
                      className="team__filter-chips-hint team__filter-chips-hint--left"
                      aria-label="Scroll roles to beginning"
                      onClick={() => scrollRoleChips('left')}
                    >
                      <i className="fas fa-chevron-left" />
                    </button>
                  )}
                  <div ref={roleChipsRef} className="team__filter-chips" role="group" aria-label="Filter by role">
                    {roleFilterOptions.map((role) => (
                      <button
                        key={role}
                        type="button"
                        className={`team__filter-chip ${roleFilter === role ? 'is-active' : ''}`.trim()}
                        onClick={() => setRoleFilter(role)}
                        aria-pressed={roleFilter === role}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                  {roleChipOverflow.showRight && (
                    <button
                      type="button"
                      className="team__filter-chips-hint team__filter-chips-hint--right"
                      aria-label="Scroll roles to end"
                      onClick={() => scrollRoleChips('right')}
                    >
                      <i className="fas fa-chevron-right" />
                    </button>
                  )}
                </div>
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
            </div>
          </div>
        )}
      </ContentPanel>

      <section
        key={activeViewMode}
        className={`team__list-panel team__list-panel--slide-${slideDir} ${activeViewMode === VIEW_MODES.LIST ? 'team__list-panel--list' : 'team__list-panel--cards'}`}
      >
        {showRosterEmptyState && (
          <ContentPanel className="team__empty-state team__empty-state--onboarding">
            <div className="team__empty-state-visual" aria-hidden="true">
              <i className="fas fa-users" />
            </div>
            <span className="team__availability-summary-label">Start your roster</span>
            <h3>Add your first employee to build the team roster.</h3>
            <p>Create one employee manually, import a CSV roster, or download the template and fill it out offline before uploading.</p>
            <div className="team__empty-state-actions">
              <Button type="button" className="team__primary-action" onClick={openCreateModal}>
                <span className="team__action-icon" aria-hidden="true">
                  <i className="fas fa-plus" />
                </span>
                Add first employee
              </Button>
              <Button type="button" className="team__toolbar-action" onClick={openImportModal}>
                <span className="team__action-icon" aria-hidden="true">
                  <i className="fas fa-file-import" />
                </span>
                Import roster
              </Button>
              <button
                type="button"
                className="team__empty-state-link"
                onClick={downloadBlankRosterTemplate}
              >
                Download blank template
              </button>
            </div>
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
                <span className="team__avatar-icon" aria-label="avatar">
                  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="20" cy="20" r="20" fill="#e0e0e0" />
                    <circle cx="20" cy="15" r="7" fill="#bdbdbd" />
                    <ellipse cx="20" cy="29" rx="10" ry="7" fill="#bdbdbd" />
                  </svg>
                </span>
              </div>
              <div className="team__member-details">
                <div className="team__member-header">
                  <div className="team__member-name"><strong>{emp.name}</strong></div>
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
                </div>
                <div className="team__member-title">{emp.title}</div>
                <div className="team__member-role">{emp.role}</div>
                <div className="team__member-shifts">{formatShiftsPerWeek(emp.shiftsPerWeek)}</div>
                <div className="team__member-contact">📞 {emp.contact || 'N/A'}</div>
                <div className="team__member-email">✉️ {emp.email || 'N/A'}</div>
                <div className="team__member-status">Status: {renderStatusBadge(emp.status)}</div>
                <div className="team__member-availability">Availability: {getAvailabilitySummary(emp.availability)}</div>
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
                  <th>Role</th>
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
                      <strong>{employee.name}</strong>
                      <div className="team__table-subtitle">{employee.title}</div>
                    </td>
                    <td>{employee.role}</td>
                    <td className="team__table-status">{renderStatusBadge(employee.status)}</td>
                    <td>
                      <div>{employee.contact || 'N/A'}</div>
                      <div className="team__table-subtitle">{employee.email || 'N/A'}</div>
                    </td>
                    <td className="team__table-shifts">{formatShiftsPerWeek(employee.shiftsPerWeek)}</td>
                    <td className="team__table-availability">{getAvailabilitySummary(employee.availability)}</td>
                    <td>
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
            <div className="team__modal-header">
              <div>
                <h2>{form.id ? 'Edit Employee' : 'Add New Employee'}</h2>
                <p className="team__modal-subtitle">Update team details and weekly availability without leaving the roster.</p>
              </div>
              <div className="team__modal-tabs" role="tablist" aria-label="Employee editor sections">
                <button
                  id="team-modal-tab-details"
                  type="button"
                  role="tab"
                  aria-selected={activeModalTab === MODAL_TABS.DETAILS}
                  aria-controls="team-modal-panel-details"
                  className={`team__modal-tab ${activeModalTab === MODAL_TABS.DETAILS ? 'is-active' : ''}`.trim()}
                  onClick={() => setActiveModalTab(MODAL_TABS.DETAILS)}
                >
                  Details
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
                {activeModalTab === MODAL_TABS.DETAILS && (
                  <div
                    id="team-modal-panel-details"
                    role="tabpanel"
                    aria-labelledby="team-modal-tab-details"
                    className="team__modal-panel"
                  >
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
                    <InputField
                      label="Role"
                      name="role"
                      value={form.role}
                      onChange={(value) => updateFormField('role', value)}
                      type="select"
                      options={teamRoles}
                      onBlur={() => handleFieldBlur('role')}
                      aria-invalid={Boolean(touched.role && formErrors.role)}
                    />
                    {touched.role && formErrors.role && <p className="team__field-error">{formErrors.role}</p>}
                    <InputField
                      label="Contact"
                      name="contact"
                      value={form.contact}
                      onChange={(value) => updateFormField('contact', value)}
                    />
                    <InputField
                      label="Email"
                      name="email"
                      value={form.email}
                      onChange={(value) => updateFormField('email', value)}
                      onBlur={() => handleFieldBlur('email')}
                      aria-invalid={Boolean(touched.email && formErrors.email)}
                    />
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
                <div className="team__import-note" aria-label="Roster import note">
                  <span className="team__availability-summary-label">Roster CSV workflow</span>
                  <p>Availability is intentionally excluded for now while shifts are being moved toward business-configurable settings.</p>
                </div>

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
                    <p className="team__import-helper">Supported columns: Name, Title, Role, Contact, Email, Preferred Hours, Status.</p>
                    {importFileName && <p className="team__import-file-name">Loaded {importFileName}</p>}
                  </div>

                  <div className="team__import-field">
                    <span className="team__filter-label">Import mode</span>
                    <div className="team__import-mode" role="group" aria-label="Import mode">
                      {ROSTER_IMPORT_MODES.map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          className={`team__import-mode-button ${importMode === value ? 'is-active' : ''}`.trim()}
                          onClick={() => setImportMode(value)}
                          aria-pressed={importMode === value}
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
                    <span className="team__import-badge team__import-badge--create">{importPreview.summary.create} new</span>
                    <span className="team__import-badge team__import-badge--update">{importPreview.summary.update} updates</span>
                    <span className="team__import-badge team__import-badge--skip">{importPreview.summary.skip} skipped</span>
                    <span className="team__import-badge team__import-badge--invalid">{importPreview.summary.invalid} invalid</span>
                  </div>
                )}

                {importPreview.rows.length > 0 ? (
                  <div className="team__import-preview">
                    <table className="team__import-table">
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>Name</th>
                          <th>Role</th>
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
                            <td>{row.values.role || 'Missing role'}</td>
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
                    <h3>Choose a roster file to preview changes.</h3>
                    <p>Download the blank template or export the current roster if you want a ready-made CSV to edit and upload.</p>
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
    </div>
  );
};