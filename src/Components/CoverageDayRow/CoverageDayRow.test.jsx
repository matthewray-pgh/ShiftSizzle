import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CoverageDayRow } from './CoverageDayRow';

const baseProps = {
  day: 'Monday',
  isClosed: false,
  settings: { shiftTypes: ['Open', 'Close'], shiftTimes: {} },
  shiftTypes: ['Open', 'Close'],
};

describe('CoverageDayRow', () => {
  it('shows a blank field for a zero target and the number otherwise', () => {
    render(<CoverageDayRow {...baseProps} values={{ Open: 0, Close: 2 }} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Open')).toHaveValue('');
    expect(screen.getByLabelText('Close')).toHaveValue('2');
  });

  it('selects the field contents on focus so typing replaces the value', () => {
    render(<CoverageDayRow {...baseProps} values={{ Open: 3, Close: 0 }} onChange={vi.fn()} />);

    const open = screen.getByLabelText('Open');
    open.focus();
    fireEvent.focus(open);

    expect(open.selectionStart).toBe(0);
    expect(open.selectionEnd).toBe(String(open.value).length);
  });

  it('reports raw input up to the parent, which coerces it', () => {
    const onChange = vi.fn();
    render(<CoverageDayRow {...baseProps} values={{ Open: 0, Close: 0 }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Close'), { target: { value: '4' } });
    expect(onChange).toHaveBeenCalledWith('Close', '4');
  });

  it('hides the "apply to all days" shortcut when no handler is given', () => {
    const { rerender } = render(<CoverageDayRow {...baseProps} values={{ Open: 1, Close: 1 }} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Apply Monday coverage/ })).not.toBeInTheDocument();

    rerender(
      <CoverageDayRow {...baseProps} values={{ Open: 1, Close: 1 }} onChange={vi.fn()} onApplyToAll={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Apply Monday coverage to all days' })).toBeInTheDocument();
  });
});
