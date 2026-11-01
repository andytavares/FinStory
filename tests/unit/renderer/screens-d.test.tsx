// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { Health } from '@renderer/views/Health';
import { Overrides } from '@renderer/views/Overrides';
import { Usage } from '@renderer/views/Usage';
import { installMoneyBridge } from './setup';

afterEach(cleanup);

function bridge(responses: Record<string, unknown>): ReturnType<typeof vi.fn> {
  const invoke = vi.fn((channel: string) => {
    const value = responses[channel];
    return Promise.resolve(typeof value === 'function' ? (value as () => unknown)() : (value ?? { ok: true }));
  });
  installMoneyBridge({});
  const on = (channel: string, listener: (payload: unknown) => void): (() => void) => {
    installed.set(channel, listener);
    return () => installed.delete(channel);
  };
  Object.defineProperty(globalThis.window, 'money', { configurable: true, value: { invoke, on } });
  return invoke;
}
const installed = new Map<string, (payload: unknown) => void>();

const HEALTH = {
  categorization: { provider: 'ollama', model: 'llama3.1:8b', localOnly: true, reason: 'ok' },
  encryption: { databaseEncrypted: true, keysInKeychain: false },
  updates: { version: '1.0.0' },
  syncHistory: Array.from({ length: 14 }, (_, i) => ({ at: '2026-10-31T10:00:00Z', ok: i !== 3, durationMs: 10 })),
  contents: { institutions: 2, accounts: 2, everydayAccounts: 2, transactions: 56, transactionsInEverydayAccounts: 56, transactionsThisMonth: 4, categorized: 50, uncategorizable: 0 },
  perAccount: [
    { institutionId: 'a', institutionName: 'Chase', status: 'healthy', lastSuccessfulSync: null, lastAttemptedSync: null, recentFailures: 0 },
    { institutionId: 'b', institutionName: 'Amex', status: 'reauth_required', lastSuccessfulSync: null, lastAttemptedSync: null, recentFailures: 2 },
  ],
  metrics: { syncDurationMsP50: null, transactionsProcessed: 56, localResolutionRate: 0, droppedDiagnosticEvents: 0 },
};

describe('health tiles', () => {
  it('shows bank, categorization, encryption and updates status', async () => {
    bridge({ 'health:get': HEALTH });
    render(<Health />);
    expect(await screen.findByText('Chase OK · Amex needs sign-in')).toBeDefined();
    expect(screen.getByText('Ollama · llama3.1:8b')).toBeDefined();
    expect(screen.getByText('Database encrypted · key not in Keychain')).toBeDefined();
    expect(screen.getByText('Check')).toBeDefined();
    expect(screen.getByText('Version 1.0.0')).toBeDefined();
  });

  it('draws one bar per sync run, red for the failure', async () => {
    bridge({ 'health:get': HEALTH });
    render(<Health />);
    await screen.findByText('Sync history');
    expect(screen.getAllByRole('img', { name: /Succeeded|Failed/ })).toHaveLength(14);
    expect(screen.getAllByRole('img', { name: 'Failed' })).toHaveLength(1);
  });
});

describe('rules tab counts', () => {
  it('drops the merchant rule count after Remove', async () => {
    const rule = { merchantKey: 'k', merchantName: 'Uber Eats', displayName: null, categoryId: null, categoryName: null, transactionCount: 3, oneOffCount: 0 };
    let rules = [rule];
    bridge({ 'rules:list': () => rules, 'rules:delete': () => { rules = []; return { ok: true }; }, 'overrides:list': [], 'categories:list': [] });
    render(<Overrides />);
    await screen.findByRole('button', { name: 'Merchant rules · 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByRole('button', { name: 'Merchant rules · 0' })).toBeDefined();
  });
});

describe('usage', () => {
  const summary = {
    totalEvents: 5, previousTotal: 0, featuresUsed: 1, featuresTotal: 3, neverUsed: [{ id: 'b', label: 'Income: add', group: 'x' }],
    activeDays: 1,
    byFeature: [{ id: 'a', label: 'Dashboard', count: 5 }, { id: 'b', label: 'Income: add', count: 0 }],
    daily: [{ date: '2026-10-30', count: 2 }, { date: '2026-10-31', count: 3 }],
  };

  it('styles a feature that was never used as a warning', async () => {
    bridge({ 'usage:summary': summary, 'usage:recent': [] });
    render(<Usage />);
    const label = await screen.findByText('Income: add');
    expect(label.className).toContain('ds-faint');
    expect(label.closest('li')?.querySelector('.ds-warn')?.textContent).toBe('0');
    expect(screen.getByText('1 of 3')).toBeDefined();
  });

  it('puts a live event at the top of the stream', async () => {
    bridge({ 'usage:summary': summary, 'usage:recent': [{ id: 1, occurredAt: '2026-10-31T10:00:00Z', feature: 'view:dashboard', label: 'Dashboard', kind: 'view', outcome: 'success', durationMs: null }] });
    render(<Usage />);
    await screen.findByText('view:dashboard');
    act(() => installed.get('usage:event')?.({ id: 2, occurredAt: new Date().toISOString(), feature: 'view:usage', label: 'Usage', kind: 'view', outcome: 'success', durationMs: null }));
    await waitFor(() => expect(screen.getByTestId('usage-stream').querySelector('li')?.textContent).toContain('view:usage'));
  });
});
