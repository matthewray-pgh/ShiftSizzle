import React from "react";

import "./ContentPanel.scss";

export const ContentPanelHeader = ({ title }) => {
  return (
    <div className="content-panel-header">
      <h2 className="content-panel-header__title">{title}</h2>
    </div>
  );
};

export const ContentPanel = ({ children }) => {
  return (
    <div className="content-panel">
      {children}
    </div>
  );
};