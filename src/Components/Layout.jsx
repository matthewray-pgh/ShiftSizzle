import React from "react";
import { NavLink } from "react-router-dom";
import { useState } from "react";

import "./Layout.scss";

export const Layout = ({ children }) => {
  const [navOpen, setNavOpen] = useState(false);
  return (
    <div className="layout">
      <header className="layout__header">
        <div className="layout__header--logo"></div>
        <h1 className="layout__header--title">ShiftSizzle</h1>
        <div className="layout__header--search"></div>
        <button
          className="layout__header--menu-btn"
          aria-label="Open navigation menu"
          onClick={() => setNavOpen(true)}
        >
          <i className="fas fa-bars" aria-hidden="true"></i>
        </button>
      </header>
      <main className="layout__main">
        <nav className={`layout__main--nav${navOpen ? ' open' : ''}`}>
          <button
            className="layout__main--nav-close"
            aria-label="Close navigation menu"
            onClick={() => setNavOpen(false)}
          >
            <i className="fas fa-times" aria-hidden="true"></i>
          </button>
          <NavLink className="layout__main--nav-link" to="/dashboard" onClick={() => setNavOpen(false)}>
            <i className="fas fa-tachometer-alt" aria-hidden="true"></i> 
            <span>Dashboard</span>
          </NavLink>
          <NavLink className="layout__main--nav-link" to="/scheduler" onClick={() => setNavOpen(false)}>
            <i className="fas fa-calendar-alt" aria-hidden="true"></i> 
            <span>Scheduler</span>
          </NavLink>
          <NavLink className="layout__main--nav-link" to="/shifts" onClick={() => setNavOpen(false)}>
            <i className="fas fa-clock" aria-hidden="true"></i> 
            <span>Shifts</span>
          </NavLink>
          <NavLink className="layout__main--nav-link" to="/team" onClick={() => setNavOpen(false)}>
            <i className="fas fa-users" aria-hidden="true"></i> 
            <span>Team</span>
          </NavLink>
          <NavLink className="layout__main--nav-link" to="/messages" onClick={() => setNavOpen(false)}>
            <i className="fas fa-envelope" aria-hidden="true"></i> 
            <span>Messages</span>
          </NavLink>
          <NavLink className="layout__main--nav-link" to="/settings" onClick={() => setNavOpen(false)}>
            <i className="fas fa-cog" aria-hidden="true"></i> 
            <span>Settings</span>
          </NavLink>
        </nav>
        <section className="layout__main--content">
          {children}
        </section>
      </main>
      <footer className="layout__footer">
        <div>&copy; 2024 ShiftSizzle. All rights reserved.</div>
      </footer>
      {/* Overlay for mobile nav */}
      {navOpen && <div className="layout__nav-overlay" onClick={() => setNavOpen(false)}></div>}
    </div>
  );
};