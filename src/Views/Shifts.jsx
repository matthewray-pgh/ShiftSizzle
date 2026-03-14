
import { useState, useEffect } from "react";

import { ContentPanel, ShiftCard } from "../Components";

import { managerSchedule1, managerSchedule2 } from "../../public/data";

import "./Shifts.scss";

export const Shifts = () => {

  return (
    <div className="shifts">
      <ContentPanel>
        <p>This is the shifts view.</p>
      </ContentPanel>
    </div>
  );
}