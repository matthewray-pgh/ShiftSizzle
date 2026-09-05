import { NavLink, useLocation } from "react-router-dom";

import { getUnresolvedScheduleItems, useAppState } from "../state/AppState";
import { useAuth } from "../state/AuthState";
import logo from "../Assets/ShiftSizzle.Logo.OnDark.png";

import "./Layout.scss";

// `owner` is the internal account-role value; it's surfaced to people as
// "Administrator" since the seat holder is often a GM/admin, not the owner.
const ROLE_LABELS = {
  owner: "Administrator workspace",
  manager: "Manager workspace",
  staff: "Staff workspace",
};

export const Layout = ({ children }) => {
  const location = useLocation();
  const { user, membership } = useAuth();
  const { state } = useAppState();
  const workspaceLabel = ROLE_LABELS[membership?.accountRole] ?? "Workspace";
  const canManage = membership?.accountRole !== "staff";
  // Calm, static count of outstanding schedule work — no escalation (§5).
  const scheduleBadge = canManage ? getUnresolvedScheduleItems(state).length : 0;

  const pageTitles = {
    "/": "Dashboard",
    "/schedule": "Schedule",
    "/schedule/build": "Builder",
    "/team": "Team",
    "/settings": "Settings",
    "/account": "Account",
  };

  const currentPage = pageTitles[location.pathname] ?? "Dashboard";
  // A linked employee's roster name is the source of truth (see Account.jsx)
  // — prefer it over the auth profile's first/last name, which unlinked
  // users still edit directly.
  const linkedEmployee = state.employees.find((employee) => employee.id === membership?.employeeId);
  const accountName = linkedEmployee?.name
    || [user?.user_metadata?.first_name, user?.user_metadata?.last_name].filter(Boolean).join(" ");

  return (
    <div className="layout">
      <header className="layout__header">
        <div className="layout__brand">
          <NavLink className="layout__brand-link" to="/" aria-label="ShiftSizzle home">
            <img className="layout__brand-logo" src={logo} alt="ShiftSizzle" />
          </NavLink>
        </div>
        <div className="layout__header-main">
          <div className="layout__header-main-current-page">
            {currentPage}
          </div>
          <div className="layout__header-main-user">
            <span className="layout__header-main-user-label">{workspaceLabel}</span>
            <NavLink className="layout__header-main-user-pill" to="/account" aria-label="My account">
              <i className="fas fa-user-circle" aria-hidden="true"></i>
              <span>{accountName || user?.email}</span>
            </NavLink>
          </div>
          <div className="layout__header-mobile-actions">
            <button type="button" className="layout__header-icon-button" aria-label="Notifications">
              <i className="fas fa-bell" aria-hidden="true"></i>
            </button>
            <NavLink to="/account" className="layout__header-icon-button" aria-label="My account">
              <i className="fas fa-user-circle" aria-hidden="true"></i>
            </NavLink>
          </div>
        </div>
      </header>

      <main className="layout__main">
        <section className="layout__sidebar-nav">
          <Navigation testId="sidebar-nav" canManage={canManage} scheduleBadge={scheduleBadge} />
        </section>

        <section className="layout__main--content">
          {children}
        </section>
      </main>
      <footer className="layout__footer">
        {/* The header's account pill is hidden below the 700px breakpoint
            (layout__header-main), so the mobile header's avatar button
            (layout__header-mobile-actions) is the way to reach the Account
            page on a phone instead. Sign Out itself lives on the Account
            page, not in either nav. */}
        <Navigation testId="footer-mobile-nav" canManage={membership?.accountRole !== "staff"} />
      </footer>
    </div>
  );
};

const Navigation = ({ testId, canManage, scheduleBadge = 0 }) => {
  const getLinkClass = ({ isActive }) => (isActive ? "layout__nav--link active" : "layout__nav--link");

  return (
    <nav className="layout__nav" data-testid={testId}>
      <NavLink className={getLinkClass} to="/" end>
        <i className="fas fa-gauge" aria-hidden="true"></i>
        <span>Dashboard</span>
      </NavLink>
      <NavLink className={getLinkClass} to="/schedule">
        <i className="fas fa-clock-rotate-left" aria-hidden="true"></i>
        <span>Schedule</span>
        {scheduleBadge > 0 && (
          <span className="layout__nav-badge" aria-label={`${scheduleBadge} schedule ${scheduleBadge === 1 ? "item needs" : "items need"} attention`}>
            {scheduleBadge}
          </span>
        )}
      </NavLink>
      <NavLink className={getLinkClass} to="/team">
        <i className="fas fa-users" aria-hidden="true"></i>
        <span>Team</span>
      </NavLink>
      {canManage && (
        <NavLink className={getLinkClass} to="/settings">
          <i className="fas fa-cog" aria-hidden="true"></i>
          <span>Settings</span>
        </NavLink>
      )}
    </nav>
  )
}