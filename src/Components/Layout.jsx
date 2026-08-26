import { NavLink, useLocation } from "react-router-dom";

import { useAuth } from "../state/AuthState";
import logo from "../Assets/ShiftSizzle.Logo.png";
import logoCompact from "../Assets/ShiftSizzle.Logo.Compact.png";

import "./Layout.scss";

const ROLE_LABELS = {
  owner: "Owner workspace",
  manager: "Manager workspace",
  staff: "Staff workspace",
};

export const Layout = ({ children }) => {
  const location = useLocation();
  const { user, membership } = useAuth();
  const workspaceLabel = ROLE_LABELS[membership?.accountRole] ?? "Workspace";

  const pageTitles = {
    "/": "Dashboard",
    "/schedule": "Schedule",
    "/schedule/build": "Builder",
    "/team": "Team",
    "/settings": "Settings",
    "/account": "My Account",
  };

  const currentPage = pageTitles[location.pathname] ?? "Dashboard";
  const accountName = [user?.user_metadata?.first_name, user?.user_metadata?.last_name]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="layout">
      <header className="layout__header">
        <div className="layout__brand">
          <NavLink className="layout__brand-link" to="/" aria-label="ShiftSizzle home">
            <picture>
              <source media="(max-width: 700px)" srcSet={logoCompact} />
              <img className="layout__brand-logo" src={logo} alt="ShiftSizzle" />
            </picture>
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
        </div>
      </header>

      <main className="layout__main">
        <section className="layout__sidebar-nav">
          <Navigation testId="sidebar-nav" canManage={membership?.accountRole !== "staff"} />
        </section>

        <section className="layout__main--content">
          {children}
        </section>
      </main>
      <footer className="layout__footer">
        {/* The header's account pill is hidden below the 700px breakpoint
            (layout__header-main), so the mobile footer nav is the only way
            to reach the Account page on a phone — add it here, unlike the
            desktop sidebar where the header already covers it. Sign Out
            itself lives on the Account page, not in either nav. */}
        <Navigation
          testId="footer-mobile-nav"
          canManage={membership?.accountRole !== "staff"}
          showAccountLink
        />
      </footer>
    </div>
  );
};

const Navigation = ({ testId, canManage, showAccountLink = false }) => {
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
      {showAccountLink && (
        <NavLink className={getLinkClass} to="/account">
          <i className="fas fa-user-circle" aria-hidden="true"></i>
          <span>Account</span>
        </NavLink>
      )}
    </nav>
  )
}