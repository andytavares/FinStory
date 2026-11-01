// @vitest-environment jsdom
import { cloneElement, type ReactElement } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// jsdom has no layout, so a responsive chart gets no size and draws no axes. Give it one.
vi.mock('recharts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('recharts')>()),
  ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
    cloneElement(children, { width: 600, height: 240 }),
}));

const { DesignSystem } = await import('@renderer/views/DesignSystem');

afterEach(cleanup);

describe('Design system screen', () => {
  it('renders every sample chart, axes included', () => {
    render(<DesignSystem />);
    expect(screen.getByText('Runway to payday')).toBeDefined();
    expect(screen.getAllByText('Nov 1').length).toBeGreaterThan(0);
  });
});
