import React, { useState } from 'react';

import { ContentPanel } from '../Components';

import { managerSchedule2 } from '../../public/data';

import "./Dashboard.scss";

export const Dashboard = () => {
  const [userName, setUserName] = useState("Jennifer");

  return (
    <div className="dashboard">
      <ContentPanel>
        <p>Hello, {userName}</p>
      </ContentPanel>
    </div>
  );
};