// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import { Usage } from '@renderer/views/Usage';
import { installMoneyBridge, emitToRenderer } from './setup';

afterEach(cleanup);

const summary = {
  totalEvents: 12,
  previousTotal: 4,
  featuresUsed: 2,
  featuresTotal: 5,
  neverUsed: [{ id: 'view:health', label: 'Health', group: 'Screens' }],
  activeDays: 3,
  byFeature: [
    { id: 'view:dashboard', label: 'Dashboard', count: 9 },
    { id: 'view:health', label: 'Health', count: 0 },
  ],
  daily: [{ date: '2026-08-29', count: 12 }],
};

describe('the usage view', () => {
  it('shows the summary and appends a live event', async () => {
    installMoneyBridge({ 'usage:summary': summary, 'usage:recent': [] });
    render(<Usage />);
    await waitFor(() => expect(screen.getByText('2 of 5')).toBeDefined());
    expect(screen.getByText('12')).toBeDefined();
    expect(screen.getAllByText('Health').length).toBeGreaterThan(0);

    act(() =>
      emitToRenderer('usage:event', {
        id: 99,
        occurredAt: '2026-08-29T12:00:00.000Z',
        feature: 'view:alerts',
        label: 'Alerts',
        kind: 'view',
        outcome: 'success',
        durationMs: null,
      }),
    );
    await waitFor(() => expect(screen.getByTestId('usage-stream').textContent).toContain('Alerts'));
  });
});
