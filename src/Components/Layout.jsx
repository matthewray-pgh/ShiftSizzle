import React from "react";
import { NavLink } from "react-router-dom";

import "./Layout.scss";

export const Layout = ({ children }) => {
  return (
    <div className="layout">
      <header className="layout__header">
        <div className="layout__header--logo"></div>
        <h1 className="layout__header--title">ShiftSizzle</h1>
        <div className="layout__header--search"></div>
      </header>
      <main className="layout__main">
        <nav className="layout__main--nav">
          <NavLink className="layout__main--nav-link" to="/dashboard">
            <i className="fas fa-tachometer-alt" aria-hidden="true"></i> 
            <span>Dashboard</span>
          </NavLink>
          <NavLink className="layout__main--nav-link" to="/scheduler">
            <i className="fas fa-calendar-alt" aria-hidden="true"></i> 
            <span>Scheduler</span>
          </NavLink>
          <NavLink className="layout__main--nav-link" to="/team">
            <i className="fas fa-users" aria-hidden="true"></i> 
            <span>Team</span>
          </NavLink>
          <NavLink className="layout__main--nav-link" to="/messages">
            <i className="fas fa-envelope" aria-hidden="true"></i> 
            <span>Messages</span>
          </NavLink>
          <NavLink className="layout__main--nav-link" to="/settings">
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
    </div>
  );
};