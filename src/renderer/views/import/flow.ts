import { useEffect, useState } from 'react';
import { call } from '../../lib/ipc';
import type { ImportPreview, ImportProgress, ImportResult } from '@shared/types';

export interface CsvColumnChoice {
  readonly date: number;
  readonly payee: number;
  readonly amount?: number;
  readonly debit?: number;
  readonly credit?: number;
}

interface LoadedFile {
  readonly name: string;
  readonly text: string;
}

const readText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsText(file);
  });

const NEW_ACCOUNT = 'new';

function filePayload(file: LoadedFile, mapping: CsvColumnChoice | undefined) {
  return { fileName: file.name, text: file.text, ...(mapping ? { mapping } : {}) };
}

function accountMap(preview: ImportPreview, choice: Record<string, string>, withNames: boolean) {
  return preview.accounts.map((a) => {
    const accountId = choice[a.label] ?? NEW_ACCOUNT;
    return accountId === NEW_ACCOUNT && withNames
      ? { label: a.label, accountId, newName: a.label }
      : { label: a.label, accountId };
  });
}

/** The four-step import: choose file, match accounts, check, import. */
export function useImportFlow() {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [mapping, setMapping] = useState<CsvColumnChoice | undefined>();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [accounts, setAccounts] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [step, setStep] = useState(1);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);

  // The import runs in the main process, so it outlives this view. Pick it up on open.
  useEffect(() => {
    const adopt = (next: ImportProgress | null | undefined): void => {
      if (!next) return;
      setProgress(next);
      if (next.result) {
        setResult(next.result);
        setStep(5);
      }
      if (next.error) setError(next.error);
    };
    void call<ImportProgress | null>('import:status').then(adopt);
    return window.money.on('import:progress', (payload) => adopt(payload as ImportProgress));
  }, []);

  const guard = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const load = (next: LoadedFile, columns: CsvColumnChoice | undefined): Promise<void> =>
    guard(async () => {
      const found = await call<ImportPreview>('import:preview', filePayload(next, columns));
      setFile(next);
      setMapping(columns);
      setPreview(found);
      setAccounts(Object.fromEntries(found.accounts.map((a) => [a.label, a.suggestedAccountId ?? NEW_ACCOUNT])));
      setCategories(Object.fromEntries(found.categoryMappings.map((m) => [m.quickenCategory, m.suggestedCategoryId ?? ''])));
      setStep(found.needsMapping ? 1 : 2);
    });

  const chooseAccount = (label: string, accountId: string): Promise<void> => {
    const next = { ...accounts, [label]: accountId };
    setAccounts(next);
    if (!file || !preview) return Promise.resolve();
    return guard(async () => {
      const found = await call<ImportPreview>('import:preview', {
        ...filePayload(file, mapping),
        accountMap: accountMap(preview, next, false),
      });
      setPreview(found);
    });
  };

  const commit = (): Promise<void> =>
    guard(async () => {
      if (!file || !preview) return;
      const categoryMap = preview.categoryMappings.map((m) => ({
        quickenCategory: m.quickenCategory,
        categoryId: categories[m.quickenCategory] || null,
      }));
      setResult(
        await call<ImportResult>('import:commit', {
          ...filePayload(file, mapping),
          accountMap: accountMap(preview, accounts, true),
          categoryMap,
        }),
      );
      setStep(5);
    });

  return {
    file, preview, accounts, categories, step, result, error, busy,
    running: progress?.running ? progress : null,
    openFile: async (picked: File) => load({ name: picked.name, text: await readText(picked) }, undefined),
    readWithMapping: (columns: CsvColumnChoice) => (file ? load(file, columns) : Promise.resolve()),
    chooseAccount,
    // Functional update: "Create all unmatched" chooses several in one tick.
    chooseCategory: (quickenCategory: string, categoryId: string) =>
      setCategories((current) => ({ ...current, [quickenCategory]: categoryId })),
    goTo: setStep,
    startOver: () => {
      setFile(null);
      setPreview(null);
      setResult(null);
      setMapping(undefined);
      setStep(1);
    },
    commit,
  };
}
