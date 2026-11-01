// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Import } from '@renderer/views/Import';

afterEach(cleanup);

const PREVIEW = {
  format: 'csv',
  accounts: [
    { label: 'Checking ••4321', count: 2, firstDate: '2025-01-14', lastDate: '2025-01-15', suggestedAccountId: 'a1', duplicateCount: 1 },
    { label: 'Savings', count: 1, firstDate: '2025-01-16', lastDate: '2025-01-16', suggestedAccountId: null, duplicateCount: 0 },
  ],
  newCount: 2,
  duplicateCount: 1,
  categoryMappings: [{ quickenCategory: 'Food:Groceries', count: 2, suggestedCategoryId: 'groceries' }],
  warnings: [],
  needsMapping: false,
};
const CSV_TEXT = 'Date,Account,Payee,Amount\n1/14/2025,Checking ••4321,Trader Joes,-45.67';

function installBridge(overrides: Record<string, unknown> = {}) {
  const responses: Record<string, unknown> = {
    'institutions:list': [
      { id: 'i1', institutionName: 'Chase', accounts: [{ id: 'a1', name: 'Everyday Checking' }] },
    ],
    'categories:list': [
      { id: 'groceries', name: 'Groceries', parentId: 'food', isHidden: false, mergedIntoId: null },
    ],
    'import:preview': PREVIEW,
    'import:commit': { imported: 2, skippedDuplicates: 1, createdAccounts: 1 },
    ...overrides,
  };
  const invoke = vi.fn((channel: string) => Promise.resolve(responses[channel]));
  Object.defineProperty(globalThis.window, 'money', { configurable: true, value: { invoke, on: () => () => {} } });
  return invoke;
}

async function chooseFile(): Promise<void> {
  const file = new File([CSV_TEXT], 'register.csv', { type: 'text/csv' });
  fireEvent.change(screen.getByLabelText('Quicken file'), { target: { files: [file] } });
  await screen.findByText('Match accounts');
}

describe('Import view', () => {
  it('sends the chosen file text to import:preview', async () => {
    const invoke = installBridge();
    render(<Import onViewTransactions={() => {}} />);
    await chooseFile();
    expect(invoke).toHaveBeenCalledWith('import:preview', { fileName: 'register.csv', text: CSV_TEXT });
    expect(screen.getByText('2 new')).toBeTruthy();
    expect(screen.getByText('1 duplicates skipped')).toBeTruthy();
  });

  it('builds the account map from the selects and reaches the success state', async () => {
    const invoke = installBridge();
    const onViewTransactions = vi.fn();
    render(<Import onViewTransactions={onViewTransactions} />);
    await chooseFile();

    expect((screen.getByLabelText('Money account for Checking ••4321') as HTMLSelectElement).value).toBe('a1');
    expect((screen.getByLabelText('Money account for Savings') as HTMLSelectElement).value).toBe('new');

    fireEvent.click(screen.getByText('Check 2 transactions'));
    fireEvent.click(await screen.findByText('Import 2 transactions'));

    await screen.findByText('Imported 2 transactions');
    expect(invoke).toHaveBeenCalledWith('import:commit', {
      fileName: 'register.csv',
      text: CSV_TEXT,
      accountMap: [
        { label: 'Checking ••4321', accountId: 'a1' },
        { label: 'Savings', accountId: 'new', newName: 'Savings' },
      ],
      categoryMap: [{ quickenCategory: 'Food:Groceries', categoryId: 'groceries' }],
    });
    fireEvent.click(screen.getByText('View transactions'));
    expect(onViewTransactions).toHaveBeenCalled();
  });

  it('asks which columns hold the date, payee and amount when no header is found', async () => {
    const invoke = installBridge({
      'import:preview': { ...PREVIEW, accounts: [], needsMapping: true, headers: ['When', 'Who', 'How much'] },
    });
    render(<Import onViewTransactions={() => {}} />);
    const file = new File(['x'], 'register.csv');
    fireEvent.change(screen.getByLabelText('Quicken file'), { target: { files: [file] } });
    await screen.findByText('Which column is which?');

    fireEvent.change(screen.getByLabelText('Date column'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Payee column'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Amount column'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('Read file'));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('import:preview', {
        fileName: 'register.csv',
        text: 'x',
        mapping: { date: 0, payee: 1, amount: 2 },
      }),
    );
  });
});
