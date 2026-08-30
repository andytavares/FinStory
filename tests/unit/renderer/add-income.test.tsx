// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AddIncomeSource } from '@renderer/components/AddIncomeSource';
import { installMoneyBridge } from './setup';

afterEach(cleanup);

const INSTITUTIONS = [
  {
    id: 'i1',
    institutionName: 'Chase',
    status: 'healthy',
    lastSyncedAt: null,
    accountCount: 1,
    accounts: [{ id: 'a1', name: 'Checking', mask: '1111', type: 'depository', subtype: 'checking', currentBalanceMinor: 0, isEveryday: true }],
  },
];

async function openForm(): Promise<void> {
  await waitFor(() => screen.getByText('Add income'));
  fireEvent.click(screen.getByText('Add income'));
}

describe('adding an income source the detector cannot see', () => {
  it('submits what the user entered, in minor units', async () => {
    const invoke = vi.fn((channel: string) =>
      channel === 'institutions:list' ? Promise.resolve(INSTITUTIONS) : Promise.resolve({ id: 'x' }),
    );
    Object.defineProperty(globalThis.window, 'money', {
      configurable: true,
      value: { invoke, on: () => () => {} },
    });
    render(<AddIncomeSource onAdded={() => {}} />);
    await openForm();
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'a1' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Retainer' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '2400.00' } });
    fireEvent.change(screen.getByLabelText('How often'), { target: { value: 'monthly' } });
    fireEvent.change(screen.getByLabelText('Next expected'), { target: { value: '2026-09-15' } });
    fireEvent.click(screen.getByText('Add'));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('income:add', {
        accountId: 'a1',
        merchantKey: 'Retainer',
        cadence: 'monthly',
        expectedAmountMinor: 240000,
        nextExpectedDate: '2026-09-15',
      }),
    );
  });

  it('lists every account across institutions', async () => {
    installMoneyBridge({ 'institutions:list': INSTITUTIONS });
    render(<AddIncomeSource onAdded={() => {}} />);
    await openForm();
    await waitFor(() => expect(screen.getByText('Chase · Checking')).toBeDefined());
  });

  it('refuses an empty or zero amount rather than storing nonsense', async () => {
    installMoneyBridge({ 'institutions:list': INSTITUTIONS, 'income:add': { id: 'x' } });
    render(<AddIncomeSource onAdded={() => {}} />);
    await openForm();
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'a1' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Next expected'), { target: { value: '2026-09-15' } });
    fireEvent.click(screen.getByText('Add'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
  });

  it('refuses when no account is chosen', async () => {
    installMoneyBridge({ 'institutions:list': INSTITUTIONS, 'income:add': { id: 'x' } });
    render(<AddIncomeSource onAdded={() => {}} />);
    await openForm();
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Next expected'), { target: { value: '2026-09-15' } });
    fireEvent.click(screen.getByText('Add'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
  });

  it('closes and reports back once added', async () => {
    const onAdded = vi.fn();
    installMoneyBridge({ 'institutions:list': INSTITUTIONS, 'income:add': { id: 'x' } });
    render(<AddIncomeSource onAdded={onAdded} />);
    await openForm();
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'a1' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Next expected'), { target: { value: '2026-09-15' } });
    fireEvent.click(screen.getByText('Add'));
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(screen.getByText('Add income')).toBeDefined();
  });

  it('can be cancelled', async () => {
    installMoneyBridge({ 'institutions:list': INSTITUTIONS });
    render(<AddIncomeSource onAdded={() => {}} />);
    await openForm();
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.getByText('Add income')).toBeDefined());
  });
});
