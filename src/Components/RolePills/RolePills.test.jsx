import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RolePills } from './RolePills';

const roles = ['Manager', 'Server', 'Cook'];

describe('RolePills', () => {
  it('renders one tab per role and marks the active one', () => {
    render(<RolePills roles={roles} active="Server" onSelect={vi.fn()} />);

    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('tab', { name: 'Server' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Manager' })).toHaveAttribute('aria-selected', 'false');
  });

  it('shows a weekly total when totalFor is given', () => {
    render(<RolePills roles={roles} active="Manager" onSelect={vi.fn()} totalFor={(role) => (role === 'Server' ? 14 : 3)} />);

    const serverTab = screen.getByRole('tab', { name: /Server/ });
    expect(serverTab).toHaveTextContent('14/wk');
  });

  it('fires onSelect with the clicked role', () => {
    const onSelect = vi.fn();
    render(<RolePills roles={roles} active="Manager" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Cook' }));
    expect(onSelect).toHaveBeenCalledWith('Cook');
  });

  it('adds a reviewed state from the reviewed set', () => {
    render(<RolePills roles={roles} active="Manager" onSelect={vi.fn()} reviewed={new Set(['Manager', 'Cook'])} />);

    expect(screen.getByRole('tab', { name: 'Manager' }).className).toContain('is-reviewed');
    expect(screen.getByRole('tab', { name: 'Server' }).className).not.toContain('is-reviewed');
  });
});
