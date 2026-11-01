import * as t from '@main/db/schema';
import type { DatabaseHandle } from '@main/db/client';
import { IpcFailure } from '@main/ipc/registry';
import type { ImportPreview } from '@shared/types';
import type { ImportPreviewInput } from '@shared/schemas';
import { guessCsvHeaders, hasCsvHeader } from './csv';
import { planRows, type ExistingTransaction } from './duplicates';
import { parseImportFile } from './index';
import type { CsvColumnMapping, ParseResult } from './types';

type Db = DatabaseHandle['db'];
type AccountRecord = typeof t.accounts.$inferSelect;
type CategoryRecord = typeof t.categories.$inferSelect;

export interface ImportContext {
  readonly accounts: AccountRecord[];
  readonly categories: CategoryRecord[];
  readonly existing: ExistingTransaction[];
}

export async function loadImportContext(db: Db): Promise<ImportContext> {
  const [accounts, categories, existing] = await Promise.all([
    db.select().from(t.accounts),
    db.select().from(t.categories),
    db.select().from(t.transactions),
  ]);
  return { accounts, categories, existing };
}

export async function parseOrExplain(input: ImportPreviewInput): Promise<ParseResult> {
  try {
    return await parseImportFile(input.fileName, input.text, input.mapping as CsvColumnMapping | undefined);
  } catch (error) {
    throw new IpcFailure('VALIDATION_FAILED', (error as Error).message, false);
  }
}

/** The mask in "Checking ••1234" wins; a name that matches an existing account is the fallback. */
export function suggestAccountId(label: string, accounts: readonly AccountRecord[]): string | null {
  const mask = /••(\d{4})/.exec(label)?.[1];
  const byMask = mask ? accounts.find((a) => a.mask === mask) : undefined;
  const byName = accounts.find((a) => a.name.toLowerCase() === label.trim().toLowerCase());
  return (byMask ?? byName)?.id ?? null;
}

/** Quicken writes "Food:Groceries"; the leaf, then the whole path, is compared with category names. */
export function suggestCategoryId(quickenCategory: string, categories: readonly CategoryRecord[]): string | null {
  const live = categories.filter((c) => c.mergedIntoId === null);
  const leaf = quickenCategory.slice(quickenCategory.lastIndexOf(':') + 1);
  for (const candidate of [leaf, quickenCategory]) {
    const hit = live.find((c) => c.name.toLowerCase() === candidate.trim().toLowerCase());
    if (hit) return hit.id;
  }
  return null;
}

function categoryMappings(result: ParseResult, categories: readonly CategoryRecord[]): ImportPreview['categoryMappings'] {
  const counts = new Map<string, number>();
  for (const { category } of result.transactions) {
    if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts].map(([quickenCategory, count]) => ({
    quickenCategory,
    count,
    suggestedCategoryId: suggestCategoryId(quickenCategory, categories),
  }));
}

export async function previewImport(db: Db, input: ImportPreviewInput): Promise<ImportPreview> {
  const result = await parseOrExplain(input);
  const { accounts, categories, existing } = await loadImportContext(db);
  const chosen = new Map(input.accountMap?.map((c) => [c.label, c.accountId]));
  const suggestions = result.accounts.map((a) => ({
    ...a,
    suggestedAccountId: suggestAccountId(a.label, accounts),
  }));
  const targetFor = (label: string): string | null => {
    const id = chosen.get(label) ?? suggestions.find((s) => s.label === label)?.suggestedAccountId ?? null;
    return id === 'new' ? null : id;
  };
  const planned = planRows(result.transactions, targetFor, existing);
  const duplicates = planned.filter((p) => p.duplicate);
  const duplicateCount = duplicates.length;
  const withDuplicates = suggestions.map((a) => ({
    ...a,
    duplicateCount: duplicates.filter((p) => p.transaction.accountLabel === a.label).length,
  }));
  const needsMapping = result.format === 'csv' && !input.mapping && !hasCsvHeader(input.text);
  return {
    format: result.format,
    accounts: withDuplicates,
    newCount: planned.length - duplicateCount,
    duplicateCount,
    categoryMappings: categoryMappings(result, categories),
    warnings: needsMapping ? [] : result.warnings,
    needsMapping,
    ...(needsMapping ? { headers: guessCsvHeaders(input.text) } : {}),
  };
}
