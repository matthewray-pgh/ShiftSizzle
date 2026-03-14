import { NavLink } from "react-router-dom";

import "./Layout.scss";

export const Layout = ({ children }) => {

  return (
    <div className="layout">
      <header className="layout__header">
        <div className="layout__header--logo">
          <NavLink to="/">
            <i className="fas fa-fire" aria-hidden="true"></i>
          </NavLink>
        </div>
        <h1 className="layout__header--title">
          <NavLink to="/">ShiftSizzle</NavLink>
        </h1>
        <div className="layout__header--search"></div>
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
  return (
    <nav className="layout__nav" data-testid={testId}>
      <NavLink className="layout__nav--link" to="/team">
        <i className="fas fa-users" aria-hidden="true"></i>
        <span>Team</span>
      </NavLink>
      <NavLink className="layout__nav--link" to="/scheduler">
        <i className="fas fa-calendar-alt" aria-hidden="true"></i>
        <span>Schedules</span>
      </NavLink>
      <NavLink className="layout__nav--link" to="/dashboard">
        <i className="fas fa-home" aria-hidden="true"></i>
        <span>Home</span>
      </NavLink>
      <NavLink className="layout__nav--link" to="/messages">
        <i className="fas fa-envelope" aria-hidden="true"></i>
        <span>Messages</span>
      </NavLink>
      <NavLink className="layout__nav--link" to="/settings">
        <i className="fas fa-cog" aria-hidden="true"></i>
        <span>Settings</span>
      </NavLink>
    </nav>
  )
}