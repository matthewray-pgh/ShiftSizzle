import { NavLink, useLocation } from "react-router-dom";

import { useAppState } from "../state/AppState";

import "./Layout.scss";

export const Layout = ({ children }) => {
  const location = useLocation();
  const {
    state: { settings },
  } = useAppState();

  const pageTitles = {
    "/": "Home",
    "/scheduler": "Schedules",
    "/shifts": "Shifts",
    "/team": "Team",
    "/messages": "Messages",
    "/settings": "Settings",
  };

  const currentPage = pageTitles[location.pathname] ?? "Home";

  return (
    <div className="layout">
      <header className="layout__header">
        <div className="layout__header--title">
          <i className="fas fa-fire" aria-hidden="true"></i>
          <NavLink to="/">ShiftSizzle</NavLink>
        </div>
        <div className="layout__header--main">
          <div className="layout__header--main--current-page">
            {currentPage}
          </div>
          <div className="layout__header--main--user">
            <i className="fas fa-user-circle" aria-hidden="true"></i>
            <span>{settings.currentUserName}</span>
          </div>
        </div>
      </header>

      <main className="layout__main">
        <section className="layout__sidebar-nav">
          <Navigation currentPage={currentPage} testId="sidebar-nav" />
        </section>
        
        <section className="layout__main--content">
          {children}
        </section>
      </main>
      <footer className="layout__footer">
        <Navigation currentPage={currentPage} testId="footer-mobile-nav" />
      </footer>
    </div>
  );
};

const Navigation = ({ currentPage, testId }) => {
  //use current page to set active link
  const getLinkClass = (page) => {
    return currentPage === page ? "layout__nav--link active" : "layout__nav--link";
  };

  return (
    <nav className="layout__nav" data-testid={testId}>
      <NavLink className={getLinkClass("Team")} to="/team">
        <i className="fas fa-users" aria-hidden="true"></i>
        <span>Team</span>
      </NavLink>
      <NavLink className={getLinkClass("Schedules")} to="/scheduler">
        <i className="fas fa-calendar-alt" aria-hidden="true"></i>
        <span>Schedules</span>
      </NavLink>
      <NavLink className={getLinkClass("Shifts")} to="/shifts">
        <i className="fas fa-layer-group" aria-hidden="true"></i>
        <span>Shifts</span>
      </NavLink>
      <NavLink className={getLinkClass("Home")} to="/">
        <i className="fas fa-home" aria-hidden="true"></i>
        <span>Home</span>
      </NavLink>
      <NavLink className={getLinkClass("Messages")} to="/messages">
        <i className="fas fa-envelope" aria-hidden="true"></i>
        <span>Messages</span>
      </NavLink>
      <NavLink className={getLinkClass("Settings")} to="/settings">
        <i className="fas fa-cog" aria-hidden="true"></i>
        <span>Settings</span>
      </NavLink>
    </nav>
  )
}