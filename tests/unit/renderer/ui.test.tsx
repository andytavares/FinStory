// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  Button,
  Card,
  Chip,
  Field,
  MerchantMark,
  ProgressBar,
  Segmented,
  Stat,
  Toggle,
} from '@renderer/components/ui';
import { categoryColor } from '@renderer/lib/categoryColor';

afterEach(cleanup);

describe('Button', () => {
  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' }).getAttribute('type')).toBe('button');
  });

  it('renders each variant and size as its class', () => {
    render(
      <>
        <Button variant="primary">P</Button>
        <Button variant="ghost">G</Button>
        <Button variant="danger" size="sm">D</Button>
      </>,
    );
    expect(screen.getByText('P').className).toContain('btn-primary');
    expect(screen.getByText('G').className).toContain('btn-ghost');
    const danger = screen.getByText('D');
    expect(danger.className).toContain('btn-danger');
    expect(danger.className).toContain('btn-sm');
  });

  it('forwards button props', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick} disabled>Go</Button>);
    expect((screen.getByRole('button', { name: 'Go' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Toggle', () => {
  it('is a switch that flips aria-checked through onChange', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Toggle checked={false} onChange={onChange} label="Hide" />);
    const toggle = screen.getByRole('switch', { name: 'Hide' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(<Toggle checked onChange={onChange} label="Hide" />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });
});

describe('Segmented', () => {
  const options = [
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
  ];

  it('marks the selected option and reports a change', () => {
    const onChange = vi.fn();
    render(<Segmented options={options} value="month" onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Month' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Week' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    expect(onChange).toHaveBeenCalledWith('week');
  });
});

describe('Stat', () => {
  it('shows label, value and a toned delta', () => {
    render(<Stat label="Spent this month" value="$15.00" delta="99% below Oct" tone="pos" series={[3, 2, 1]} />);
    expect(screen.getByText('Spent this month')).toBeDefined();
    expect(screen.getByText('$15.00')).toBeDefined();
    expect(screen.getByText('99% below Oct').className).toContain('ds-pos');
  });
});

describe('MerchantMark and categoryColor', () => {
  it('gives the same colour to the same name and shows its first letter', () => {
    render(
      <>
        <MerchantMark name="Uber Eats" />
        <MerchantMark name="Uber Eats" />
      </>,
    );
    const [a, b] = screen.getAllByText('U');
    expect(a?.getAttribute('style')).toBe(b?.getAttribute('style'));
    expect(a?.getAttribute('style')).toContain('--color-cat-');
  });

  it('wraps an index around the eight category tokens', () => {
    expect(categoryColor(0)).toBe('var(--color-cat-1)');
    expect(categoryColor(8)).toBe('var(--color-cat-1)');
    expect(categoryColor(-1)).toBe('var(--color-cat-8)');
  });

  it('maps an id string to one of the eight', () => {
    expect(categoryColor('groceries')).toMatch(/^var\(--color-cat-[1-8]\)$/);
    expect(categoryColor('groceries')).toBe(categoryColor('groceries'));
  });
});

describe('Card, Chip, Field, ProgressBar', () => {
  it('renders the card header row', () => {
    render(<Card title="Runway" caption="Daily rate" actions={<Button>Go</Button>}>body</Card>);
    expect(screen.getByRole('heading', { name: 'Runway' })).toBeDefined();
    expect(screen.getByText('Daily rate')).toBeDefined();
    expect(screen.getByText('body')).toBeDefined();
  });

  it('applies the chip tone', () => {
    render(<Chip tone="warn">Check</Chip>);
    expect(screen.getByText('Check').className).toContain('ds-chip-warn');
  });

  it('wires a label to its control', () => {
    render(<Field label="Name"><input className="ds-input" /></Field>);
    expect(screen.getByLabelText('Name')).toBeDefined();
  });

  it('exposes progress', () => {
    render(<ProgressBar value={0.4} color="var(--color-cat-2)" label="Food" />);
    expect(screen.getByRole('progressbar', { name: 'Food' }).getAttribute('aria-valuenow')).toBe('40');
  });
});
