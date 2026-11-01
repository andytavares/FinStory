import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import * as t from '@main/db/schema';
import type { DatabaseHandle } from '@main/db/client';
import { normalizeMerchantKey } from '@main/categorization/local';
import type { CategorizationPipeline, CategorizationResult } from '@main/categorization/pipeline';
import type { Clock } from '@shared/clock';
import type { ImportResult } from '@shared/types';
import type { ImportCommitInput } from '@shared/schemas';
import { planRows, type PlannedRow } from './duplicates';
import { IMPORT_INSTITUTION_NAME } from './institutions';
import { loadImportContext, parseOrExplain } from './preview';

export interface CommitDeps {
  readonly handle: DatabaseHandle;
  readonly clock: Clock;
  readonly buildPipeline: () => Promise<CategorizationPipeline>;
  /** Called after each new row is categorized; categorizing is the slow part. */
  readonly onProgress?: (processed: number, total: number) => void;
}

interface TargetAccount {
  readonly id: string;
  readonly isNew: boolean;
  readonly name: string;
}

type Decision = Omit<CategorizationResult, 'transactionId'>;
const MAPPED_CATEGORY_CONFIDENCE = 0.9;
const newId = (prefix: string): string => `${prefix}_${randomUUID().slice(0, 12)}`;

function resolveTargets(accountMap: ImportCommitInput['accountMap']): Map<string, TargetAccount> {
  return new Map(
    accountMap.map(({ label, accountId, newName }) => [
      label,
      accountId === 'new'
        ? { id: newId('acct'), isNew: true, name: newName?.trim() || label }
        : { id: accountId, isNew: false, name: label },
    ]),
  );
}

function ruleDecision(categoryId: string): Decision {
  return { categoryId, confidence: 1, source: 'rule', needsReview: false, reasoning: 'Your rule for this merchant' };
}

function mappedDecision(categoryId: string, quickenCategory: string): Decision {
  return {
    categoryId,
    confidence: MAPPED_CATEGORY_CONFIDENCE,
    source: 'local_history',
    needsReview: false,
    reasoning: `From your Quicken category "${quickenCategory}"`,
  };
}

/** The user's own choices come first: a merchant rule, then a mapped Quicken category, then the pipeline. */
async function decide(
  planned: PlannedRow,
  transactionId: string,
  sources: {
    rules: ReadonlyMap<string, string>;
    mapped: ReadonlyMap<string, string>;
    pipeline: CategorizationPipeline;
  },
): Promise<Decision> {
  const { transaction } = planned;
  const rule = sources.rules.get(normalizeMerchantKey(transaction.payee));
  if (rule) return ruleDecision(rule);
  const mapped = transaction.category ? sources.mapped.get(transaction.category) : undefined;
  if (mapped) return mappedDecision(mapped, transaction.category ?? '');
  return sources.pipeline.categorize({
    transactionId,
    descriptor: transaction.payee,
    amountMinor: transaction.amountMinor,
    occurredAt: new Date(`${transaction.date}T12:00:00Z`),
  });
}

async function importInstitutionId(db: DatabaseHandle['db']): Promise<{ id: string; isNew: boolean }> {
  const rows = await db.select().from(t.institutions).where(eq(t.institutions.source, 'import'));
  return rows[0] ? { id: rows[0].id, isNew: false } : { id: newId('inst'), isNew: true };
}

interface WritePlan {
  institution: { id: string; isNew: boolean };
  accounts: { id: string; name: string; mask: string | null }[];
  rows: { planned: PlannedRow; transactionId: string; accountId: string; decision: Decision }[];
}

function writeAll(deps: CommitDeps, plan: WritePlan): void {
  const at = deps.clock.now().toISOString();
  deps.handle.db.transaction((tx) => {
    if (plan.institution.isNew) {
      tx.insert(t.institutions).values({
        id: plan.institution.id, plaidItemId: null, accessTokenEncrypted: '',
        institutionName: IMPORT_INSTITUTION_NAME, status: 'healthy', source: 'import', createdAt: at,
      }).run();
    }
    for (const a of plan.accounts) {
      tx.insert(t.accounts).values({
        id: a.id, institutionId: plan.institution.id, plaidAccountId: `import:${a.id}`,
        name: a.name, mask: a.mask, type: 'depository', isEveryday: false,
      }).run();
    }
    for (const { planned, transactionId, accountId, decision } of plan.rows) {
      const row = planned.transaction;
      tx.insert(t.transactions).values({
        id: transactionId, accountId, plaidTransactionId: planned.id, amountMinor: row.amountMinor,
        merchantName: row.payee || null, merchantKey: normalizeMerchantKey(row.payee),
        description: row.payee || row.memo || 'Imported transaction', postedDate: row.date,
        settlementState: 'posted', userNote: row.memo, firstSeenAt: at, updatedAt: at,
      }).run();
      tx.insert(t.categorizations).values({
        id: newId('cat'), transactionId, categoryId: decision.categoryId, confidence: decision.confidence,
        source: decision.source, isConfirmed: false, needsReview: decision.needsReview,
        reasoning: decision.reasoning, supersededBy: null, createdAt: at,
      }).run();
    }
  });
}

type Sources = Parameters<typeof decide>[2];

async function categorySources(deps: CommitDeps, input: ImportCommitInput, live: ReadonlySet<string>): Promise<Sources> {
  const profiles = await deps.handle.db.select().from(t.merchantProfiles);
  const entries = <K>(pairs: ReadonlyArray<readonly [K, string | null]>) =>
    new Map(pairs.filter((pair): pair is readonly [K, string] => pair[1] !== null && live.has(pair[1])));
  return {
    rules: entries(profiles.map((p) => [p.merchantKey, p.userConfirmedCategoryId] as const)),
    mapped: entries(input.categoryMap.map((m) => [m.quickenCategory, m.categoryId] as const)),
    pipeline: await deps.buildPipeline(),
  };
}

async function decideAll(
  fresh: readonly PlannedRow[],
  targets: ReadonlyMap<string, TargetAccount>,
  context: { sources: Sources; onProgress: CommitDeps['onProgress'] },
): Promise<WritePlan['rows']> {
  const rows: WritePlan['rows'] = [];
  for (const planned of fresh) {
    const transactionId = newId('txn');
    const accountId = targets.get(planned.transaction.accountLabel)?.id ?? '';
    rows.push({ planned, transactionId, accountId, decision: await decide(planned, transactionId, context.sources) });
    context.onProgress?.(rows.length, fresh.length);
  }
  return rows;
}

/** Insert the new rows and their categories in one transaction; any failure rolls all of it back. */
export async function commitImport(deps: CommitDeps, input: ImportCommitInput): Promise<ImportResult> {
  const result = await parseOrExplain(input);
  const targets = resolveTargets(input.accountMap);
  const missing = result.accounts.find((a) => !targets.has(a.label));
  if (missing) throw new Error(`No account chosen for "${missing.label}"`);

  const { categories, existing } = await loadImportContext(deps.handle.db);
  const accountIdFor = (label: string): string | null => {
    const target = targets.get(label);
    return target && !target.isNew ? target.id : null;
  };
  const planned = planRows(result.transactions, accountIdFor, existing);
  const live = new Set(categories.filter((c) => c.mergedIntoId === null).map((c) => c.id));
  const sources = await categorySources(deps, input, live);
  const rows = await decideAll(planned.filter((p) => !p.duplicate), targets, { sources, onProgress: deps.onProgress });

  const used = new Set(rows.map((r) => r.accountId));
  const accounts = [...targets]
    .filter(([, a]) => a.isNew && used.has(a.id))
    .map(([label, a]) => ({ id: a.id, name: a.name, mask: /••(\d{4})/.exec(label)?.[1] ?? null }));
  const institution = accounts.length ? await importInstitutionId(deps.handle.db) : { id: '', isNew: false };
  writeAll(deps, { institution, accounts, rows });
  return { imported: rows.length, skippedDuplicates: planned.length - rows.length, createdAccounts: accounts.length };
}
