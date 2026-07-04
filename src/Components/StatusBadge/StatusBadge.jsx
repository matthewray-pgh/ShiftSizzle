import React from "react";

import "./StatusBadge.scss";

const TONE_BY_STATUS = {
  active: "success",
  published: "success",
  draft: "warning",
  archived: "neutral",
};

export const StatusBadge = ({ status, tone, label, className = "" }) => {
  const resolvedTone = tone ?? TONE_BY_STATUS[status] ?? "neutral";

  return (
    <span className={`status-badge status-badge--${resolvedTone} ${className}`.trim()}>
      {label ?? status}
    </span>
  );
};
