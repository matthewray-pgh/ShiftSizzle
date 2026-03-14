import React, { useRef, useEffect, useState, useMemo } from 'react';

import "./Scheduler.scss";
import { ContentPanel } from '../Components';

export const Scheduler = () => {  

  return (
    <div className="scheduler">
      <ContentPanel>
        <p>This is the scheduler view.</p>
      </ContentPanel>
    </div>
  );
};