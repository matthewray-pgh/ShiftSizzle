import { NavLink, useLocation } from "react-router-dom";

import { useAppState } from "../state/AppState";
import logo from "../Assets/ShiftSizzle.Logo.png";
import logoCompact from "../Assets/ShiftSizzle.Logo.Compact.png";

import "./Layout.scss";

export const Layout = ({ children }) => {
  const location = useLocation();
  const {
    state: { settings },
  } = useAppState();

  const pageTitles = {
    "/": "Dashboard",
    "/schedule": "Schedules",
    "/schedule/build": "Builder",
    "/team": "Team",
    "/settings": "Settings",
  };

  const currentPage = pageTitles[location.pathname] ?? "Dashboard";

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
            <span className="layout__header-main-user-label">Manager workspace</span>
            <div className="layout__header-main-user-pill">
              <i className="fas fa-user-circle" aria-hidden="true"></i>
              <span>{settings.currentUserName}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="layout__main">
        <section className="layout__sidebar-nav">
          <Navigation testId="sidebar-nav" />
        </section>

        <section className="layout__main--content">
          {children}
        </section>
      </main>
      <footer className="layout__footer">
        <Navigation testId="footer-mobile-nav" />
      </footer>
    </div>
  );
};

const Navigation = ({ testId }) => {
  const getLinkClass = ({ isActive }) => (isActive ? "layout__nav--link active" : "layout__nav--link");

  return (
    <nav className="layout__nav" data-testid={testId}>
      <NavLink className={getLinkClass} to="/" end>
        <i className="fas fa-gauge" aria-hidden="true"></i>
        <span>Dashboard</span>
      </NavLink>
      <NavLink className={getLinkClass} to="/schedule">
        <i className="fas fa-clock-rotate-left" aria-hidden="true"></i>
        <span>Schedules</span>
      </NavLink>
      <NavLink className={getLinkClass} to="/team">
        <i className="fas fa-users" aria-hidden="true"></i>
        <span>Team</span>
      </NavLink>
      <NavLink className={getLinkClass} to="/settings">
        <i className="fas fa-cog" aria-hidden="true"></i>
        <span>Settings</span>
      </NavLink>
    </nav>
  )
}