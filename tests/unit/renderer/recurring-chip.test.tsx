// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { RecurringChip } from '@renderer/components/RecurringChip';

afterEach(cleanup);

describe('the recurring chip', () => {
  it('says what it means rather than relying on the icon alone', () => {
    render(<RecurringChip />);
    expect(screen.getByText('Recurring')).toBeDefined();
    expect(screen.getByTitle('Part of a recurring charge')).toBeDefined();
  });
});
