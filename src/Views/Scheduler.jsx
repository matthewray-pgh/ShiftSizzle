import React, { useRef, useEffect, useState, useMemo } from 'react';

import "./Scheduler.scss";

const availableColor = "#4caf50";
const openHoursColor = "#e0e0e0";

const initialEmployees = [
  { id: "0", name: "Wonderland, Alice", start: 8, end: 16, color: availableColor },
  { id: "1", name: "O'Malley, Bob", start: 10, end: 18, color: availableColor },
  { id: "2", name: "Cox, Charlie", start: 12, end: 20, color: availableColor },
];

const initialShifts = [
  { id: 0, name: "Sunday", start: 6, end: 20, color: openHoursColor },
  { id: 1, name: "Monday", start: 6, end: 20, color: openHoursColor },
  { id: 2, name: "Tuesday", start: 6, end: 20, color: openHoursColor },
  { id: 3, name: "Wednesday", start: 6, end: 20, color: openHoursColor },
  { id: 4, name: "Thursday", start: 6, end: 22, color: openHoursColor },
  { id: 5, name: "Friday", start: 6, end: 22, color: openHoursColor },
  { id: 6, name: "Saturday", start: 6, end: 22, color: openHoursColor },
]

const chartPaddingLeft = 100;
const chartPaddingRight = 40;
const hours = 24;
const chartHeight = 60 + initialEmployees.length * 40;

function getHourX(hour, width) {
  const usableWidth = width - chartPaddingLeft - chartPaddingRight;
  return chartPaddingLeft + (hour / hours) * usableWidth;
}

export const Scheduler = () => {  
  const [view, setView] = useState('day');
  const [selected, setSelected] = useState('');

  const [employees, setEmployees] = useState(initialEmployees);

  const employeesRef = useRef(employees);

  // Options for select based on view
  const dayOptions = [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
  ];
  const employeeOptions = initialEmployees.map(e => e.name);

  useEffect(() => { employeesRef.current = employees; }, [employees]);
  useEffect(() => {
    // Reset select when view changes
    setSelected('');
  }, [view]);

  const handleViewChange = (e) => {
    setView(e.target.value);
    setSelected('');
  }

  const renderChart = useMemo(() => {
    view !== '' && selected !== '';
  }, [view, selected]);

  return (
    <div className="scheduler">
      <header className="scheduler__header">
        <h2>Scheduler</h2>
        <button className="scheduler__header--filters-button">
          <i className="fas fa-filter" aria-hidden="true"></i>
          Filters
        </button>
      </header>
      <div className="scheduler__content">
        <div className="scheduler__controls">

          <div className="scheduler__view-options">
            <select
              value={view}
              onChange={handleViewChange}
              className="scheduler__view-select"
            >
              <option value="day">View by Day</option>
              <option value="team">View by Employee</option>
            </select>
          </div>

          <div className="scheduler__option-buttons">
            {(view === 'day' ? dayOptions : employeeOptions).map(opt => (
              <button
                key={opt}
                type="button"
                className={`scheduler__option-buttonn${selected === opt ? ' active' : ''}`}
                onClick={() => setSelected(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div className="scheduler__chart-area">
          <div>{selected}</div>

          <ScheduleViewer
            isLoading={false}
            isError={false}
            data={null}
            employees={employeesRef.current}
            chartHeight={chartHeight}
          />
        </div>
      </div>
      
    </div>
  );
};

const ScheduleViewer = ({
  isLoading,
  isError,
  data,
  employees,
  chartHeight
}) => {

  if(isLoading) {
    return <div className="scheduler__chart-area-message">Loading...</div>;
  }

  if(isError) {
    return <div className="scheduler__chart-area-message scheduler__chart-area-message--error">Error loading schedule data.</div>;
  }

  if(!data || data.length === 0) {
    return <div className="scheduler__chart-area-message">No data available.</div>;
  }

  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(1000);

  useEffect(() => {
    function updateWidth() {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    }
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', overflowX: 'auto', marginTop: 32 }}>
      <svg
        width="100%"
        height={chartHeight}
        viewBox={`0 0 ${containerWidth} ${chartHeight}`}
        preserveAspectRatio="none"
      >
        {/* X-axis */}
        <line x1={getHourX(0, containerWidth)} y1={40 + employees.length * 40} x2={getHourX(24, containerWidth)} y2={40 + employees.length * 40} stroke="#888" strokeWidth="2" />
        {/* Hour ticks and labels */}
        {Array.from({ length: 25 }).map((_, i) => (
          <g key={i}>
            <line x1={getHourX(i, containerWidth)} y1={40 + employees.length * 40 - 5} x2={getHourX(i, containerWidth)} y2={40 + employees.length * 40 + 5} stroke="#aaa" strokeWidth="1" />
            {i % 2 === 0 && (
              <text x={getHourX(i, containerWidth)} y={40 + employees.length * 40 + 15} fontSize="10" textAnchor="middle" fill="#555">{i}</text>
            )}
          </g>
        ))}
        {/* Employee y-axis labels and availability bars */}
        {employees.map((emp, idx) => (
          <g key={emp.name}>
            {/* Y-axis label */}
            <text
              x={chartPaddingLeft - 10}
              y={35 + idx * 40}
              fontSize="12"
              textAnchor="end"
              fill="#333"
              alignmentBaseline="middle"
            >
              {emp.name}
            </text>

            {/* availableRange */}
            <rect
              x={getHourX(initialShifts[0].start, containerWidth)}
              y={20 + idx * 40}
              width={getHourX(initialShifts[0].end, containerWidth) - getHourX(initialShifts[0].start, containerWidth)}
              height="30"
              fill={initialShifts[0].color}
            />

            {/* Availability bar */}
            <rect
              x={getHourX(emp.start, containerWidth)}
              y={20 + idx * 40}
              width={getHourX(emp.end, containerWidth) - getHourX(emp.start, containerWidth)}
              height="30"
              fill={emp.color}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}