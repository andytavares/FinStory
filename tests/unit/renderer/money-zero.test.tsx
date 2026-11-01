// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Money } from '../../../src/renderer/components/Money';

describe('Money with direction', () => {
  afterEach(cleanup);

  it('shows zero with no sign, so a report with no income does not read "−$0.00"', () => {
    const { container } = render(<Money minor={0} direction />);
    expect(container.textContent).toBe('$0.00');
  });

  it('still signs money in and money out', () => {
    expect(render(<Money minor={1500} direction />).container.textContent).toBe('+$15.00 received');
    expect(render(<Money minor={-1500} direction />).container.textContent).toBe('−$15.00 spent');
  });
});
