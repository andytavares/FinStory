// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  Button,
  Card,
  Chip,
  Field,
  ListRow,
  ListRows,
  Menu,
  MenuItem,
  MerchantMark,
  NavList,
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

describe('Menu', () => {
  const open = (onClose: () => void = () => {}): void => {
    render(
      <div>
        <button>outside</button>
        <Menu trigger="Account: All" onClose={onClose}>
          {(close) => <MenuItem onClick={close}>Gold Card</MenuItem>}
        </Menu>
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Account: All/ }));
  };

  it('opens a menu of items from its trigger', () => {
    open();
    const trigger = screen.getByRole('button', { name: /Account: All/ });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('menu')).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'Gold Card' })).toBeDefined();
  });

  it('closes on Escape and tells the caller', () => {
    const onClose = vi.fn();
    open(onClose);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a click outside, but not on a click inside', () => {
    open();
    fireEvent.mouseDown(screen.getByRole('menu'));
    expect(screen.getByRole('menu')).toBeDefined();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('lets an item close the menu', () => {
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Gold Card' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('takes its accessible name from label when the trigger is an icon', () => {
    render(<Menu kind="button" label="Actions for Food" trigger="⋯">{() => null}</Menu>);
    expect(screen.getByRole('button', { name: 'Actions for Food' })).toBeDefined();
  });
});

describe('NavList', () => {
  it('marks the active item and reports a selection', () => {
    const onSelect = vi.fn();
    render(
      <NavList
        label="Settings sections"
        items={[{ id: 'general', label: 'General' }, { id: 'updates', label: 'Updates' }]}
        active="updates"
        onSelect={onSelect}
      />,
    );
    expect(screen.getByRole('group', { name: 'Settings sections' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Updates' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'General' }).getAttribute('aria-current')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'General' }));
    expect(onSelect).toHaveBeenCalledWith('general');
  });
});

describe('Chip as a button, small chip', () => {
  it('renders a button only when it has onClick, and keeps role and aria props', () => {
    const onClick = vi.fn();
    render(
      <>
        <Chip role="switch" aria-checked={true} onClick={onClick}>Needs review</Chip>
        <Chip>Plain</Chip>
      </>,
    );
    const chip = screen.getByRole('switch', { name: 'Needs review' });
    expect(chip.tagName).toBe('BUTTON');
    expect(chip.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalled();
    expect(screen.getByText('Plain').tagName).toBe('SPAN');
  });

  it('is 18px high at size sm', () => {
    render(<Chip size="sm">Recurring</Chip>);
    expect(screen.getByText('Recurring').className).toContain('ds-chip-sm');
  });
});

describe('Card tone and selected', () => {
  it('draws the danger border and the selected ring as classes', () => {
    render(
      <>
        <Card tone="danger">Reset</Card>
        <Card selected>Chosen</Card>
        <Card>Plain</Card>
      </>,
    );
    expect(screen.getByText('Reset').className).toContain('ds-card-danger');
    expect(screen.getByText('Chosen').className).toContain('ds-card-selected');
    expect(screen.getByText('Plain').className).not.toContain('ds-card-');
  });
});

describe('ListRows', () => {
  it('renders its rows inside the divided list', () => {
    render(<ListRows><ListRow>One</ListRow><ListRow>Two</ListRow></ListRows>);
    const list = screen.getByText('One').parentElement as HTMLElement;
    expect(list.className).toBe('ds-list');
    expect(list.children).toHaveLength(2);
    expect(screen.getByText('Two').className).toBe('ds-list-row');
  });
});

describe('MerchantMark colour', () => {
  it('uses the given colour instead of the stable one', () => {
    render(<MerchantMark name="Quicken" color="var(--color-cat-7)" />);
    expect(screen.getByText('Q').getAttribute('style')).toContain('--color-cat-7');
  });
});
