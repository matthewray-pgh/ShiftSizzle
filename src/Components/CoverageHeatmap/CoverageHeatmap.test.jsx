import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CoverageHeatmap } from './CoverageHeatmap';

const settings = {
  shiftTypes: ['Open', 'Close'],
  shiftTimes: { Open: { startTime: '06:00', endTime: '11:00' } },
};

const operatingHours = Object.fromEntries(
  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => [day, { isOpen: day !== 'Sunday' }]),
);

const coverage = {
  Barista: { Monday: { Open: 2, Close: 1 }, Saturday: { Open: 3, Close: 0 } },
  'Shift Lead': { Monday: { Open: 1, Close: 1 } },
};

const renderHeatmap = (props = {}) => {
  const handlers = { onSelect: vi.fn(), onChange: vi.fn(), onApplyDayToAll: vi.fn() };

  render(
    <CoverageHeatmap
      settings={settings}
      shiftTypes={settings.shiftTypes}
      roles={['Barista', 'Shift Lead']}
      operatingHours={operatingHours}
      coverage={coverage}
      selected={{ day: 'Monday', shift: 'Open' }}
      {...handlers}
      {...props}
    />,
  );

  return handlers;
};

describe('CoverageHeatmap', () => {
  it('shows each shift\'s total headcount across roles', () => {
    renderHeatmap();

    expect(screen.getByRole('button', { name: 'Monday Open: 3 needed' })).toHaveTextContent('3');
    expect(screen.getByRole('button', { name: 'Monday Close: 2 needed' })).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: 'Saturday Close: 0 needed' })).toHaveTextContent('0');
    expect(screen.getByText('6a–11a')).toBeInTheDocument();
  });

  it('shades tiles relative to the busiest shift and leaves empty ones unshaded', () => {
    renderHeatmap();

    const strength = (name) => Number(screen.getByRole('button', { name }).style.getPropertyValue('--strength'));

    expect(strength('Monday Open: 3 needed')).toBeCloseTo(0.78);
    expect(strength('Monday Close: 2 needed')).toBeCloseTo(0.58);
    expect(strength('Tuesday Open: 0 needed')).toBe(0);
  });

  it('marks closed days and does not make them selectable', () => {
    renderHeatmap();

    expect(screen.getAllByLabelText('Sunday closed')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /^Sunday/ })).not.toBeInTheDocument();
  });

  it('selects a tile', () => {
    const { onSelect } = renderHeatmap();

    fireEvent.click(screen.getByRole('button', { name: 'Saturday Open: 3 needed' }));
    expect(onSelect).toHaveBeenCalledWith({ day: 'Saturday', shift: 'Open' });
    expect(screen.getByRole('button', { name: 'Monday Open: 3 needed' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('edits the selected shift\'s roles, never below zero', () => {
    const { onChange } = renderHeatmap({ selected: { day: 'Saturday', shift: 'Close' } });
    const detail = screen.getByLabelText('Saturday Close coverage');

    expect(within(detail).getByLabelText('Barista needed')).toHaveTextContent('0');
    expect(within(detail).getByRole('button', { name: 'Remove one Barista' })).toBeDisabled();

    fireEvent.click(within(detail).getByRole('button', { name: 'Add one Shift Lead' }));
    expect(onChange).toHaveBeenLastCalledWith('Shift Lead', 'Saturday', 'Close', 1);
  });

  it('applies the selected day to the whole week', () => {
    const { onApplyDayToAll } = renderHeatmap();

    fireEvent.click(screen.getByRole('button', { name: 'Apply Monday coverage to all days' }));
    expect(onApplyDayToAll).toHaveBeenCalledWith('Monday');
  });

  it('prompts for a shift when nothing is selected', () => {
    renderHeatmap({ selected: null });

    expect(screen.getByText(/Pick a shift above/)).toBeInTheDocument();
  });
});
