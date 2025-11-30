import React from "react";
import { Link } from "react-router-dom";

// import "./Layout.scss";

export const Layout = ({ children }) => {
  return (
    <div className="layout">
      <header>
        <h1>ShiftSizzle</h1>
        <nav>
          <Link to="/">Home</Link> | <Link to="/dashboard">Dashboard</Link>
        </nav>
      </header>
      <main>{children}</main>
      <footer>
        <p>&copy; 2024 ShiftSizzle. All rights reserved.</p>
      </footer>
    </div>
  );
};