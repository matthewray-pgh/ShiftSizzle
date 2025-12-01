import React from "react";
import { Link } from "react-router-dom";

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
          <Link className="layout__main--nav-link" to="/dashboard">Dashboard</Link>
          <Link className="layout__main--nav-link" to="/scheduler">Scheduler</Link>
          <Link className="layout__main--nav-link" to="/team">Team</Link>
          <Link className="layout__main--nav-link" to="/messages">Messages</Link>
          <Link className="layout__main--nav-link" to="/settings">Settings</Link>
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