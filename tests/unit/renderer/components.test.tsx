// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// Auto-cleanup requires globals:true, which is off here; unmount explicitly so
// renders do not accumulate across tests.
afterEach(cleanup);
import { Money } from '@renderer/components/Money';
import { Qualification } from '@renderer/components/Qualification';
import { EmptyState } from '@renderer/components/EmptyState';
import { Runway } from '@renderer/components/Runway';

describe('Money renders tabular figures', () => {
  it('formats minor units as currency', () => {
    render(<Money minor={4312} />);
    expect(screen.getByText('$43.12')).toBeDefined();
  });

  it('renders negatives with their sign by default', () => {
    render(<Money minor={-1247} />);
    expect(screen.getByText('-$12.47')).toBeDefined();
  });

  it('renders magnitude when asked, so spending columns read cleanly', () => {
    render(<Money minor={-1247} magnitude />);
    expect(screen.getByText('$12.47')).toBeDefined();
  });

  it('applies the tabular-figures class so columns align', () => {
    const { container } = render(<Money minor={100} />);
    expect(container.querySelector('.numeric')).not.toBeNull();
  });
});

describe('Qualification enforces SC-014 in the UI', () => {
  it('renders nothing when data is complete', () => {
    const { container } = render(<Qualification dataComplete staleInstitutions={[]} />);
    expect(container.textContent).toBe('');
  });

  it('names the stale institutions when data is incomplete', () => {
    render(<Qualification dataComplete={false} staleInstitutions={['Chase', 'Amex']} />);
    expect(screen.getByText(/Chase, Amex/)).toBeDefined();
  });

  it('says totals are lower bounds rather than implying completeness', () => {
    render(<Qualification dataComplete={false} staleInstitutions={['Chase']} />);
    expect(screen.getByText(/lower bounds/)).toBeDefined();
  });

  it('falls back to generic wording when no names are known', () => {
    render(<Qualification dataComplete={false} staleInstitutions={[]} />);
    expect(screen.getByText(/one or more accounts/)).toBeDefined();
  });
});

describe('EmptyState invites action', () => {
  it('shows title and detail', () => {
    render(<EmptyState title="Nothing here" detail="It will fill in automatically." />);
    expect(screen.getByText('Nothing here')).toBeDefined();
    expect(screen.getByText('It will fill in automatically.')).toBeDefined();
  });

  it('renders an action when given one', () => {
    render(<EmptyState title="t" detail="d" action={<button type="button">Connect</button>} />);
    expect(screen.getByRole('button', { name: 'Connect' })).toBeDefined();
  });
});

describe('Runway withholds rather than guessing (Constitution IX)', () => {
  const base = {
    currentBalanceMinor: 84700,
    floorMinor: 100000,
    nextIncomeDate: '2026-09-04T00:00:00Z',
  };

  it('states the reason instead of drawing a projection when unavailable', () => {
    render(
      <Runway
        {...base}
        available={false}
        projectedMinor={null}
        reason="No recurring income detected yet"
      />,
    );
    expect(screen.getByText(/No recurring income detected yet/)).toBeDefined();
    expect(screen.queryByText(/projected at payday/)).toBeNull();
  });

  it('renders the projection when income is known', () => {
    render(
      <Runway {...base} available projectedMinor={62000} reason="Assumes current spending" />,
    );
    expect(screen.getByText('$620.00')).toBeDefined();
    expect(screen.getByText(/projected at payday/)).toBeDefined();
  });

  it('always states the assumption behind the projection (FR-041)', () => {
    render(
      <Runway {...base} available projectedMinor={62000} reason="Assumes current spending" />,
    );
    expect(screen.getByText(/Assumes current spending/)).toBeDefined();
  });

  it('shows the floor marker and current balance for context', () => {
    render(<Runway {...base} available projectedMinor={62000} reason="x" />);
    expect(screen.getByText('$847.00')).toBeDefined();
    expect(screen.getByText('$1,000.00')).toBeDefined();
  });
});
