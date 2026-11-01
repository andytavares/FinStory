import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import * as t from '@main/db/schema';
import type { DatabaseHandle } from '@main/db/client';
import type { MerchantRuleView } from '@shared/types';

type Db = DatabaseHandle['db'];

interface NameRule {
  readonly merchantKey: string;
  readonly displayName: string | null;
}

interface CategoryRule {
  readonly merchantKey: string;
  readonly categoryId: string | null;
}

/** Merchant rules: the name and category a merchant always gets, below one-off edits. */

export async function setMerchantName(
  db: Db,
  rule: NameRule,
  at: string,
): Promise<void> {
  const { merchantKey, displayName } = rule;
  if (displayName === null || displayName.trim() === '') {
    await db.delete(t.merchantAliases).where(eq(t.merchantAliases.merchantKey, merchantKey));
    return;
  }
  await db
    .insert(t.merchantAliases)
    .values({ merchantKey, displayName, createdAt: at })
    .onConflictDoUpdate({ target: t.merchantAliases.merchantKey, set: { displayName } });
}

export async function setRuleCategory(
  db: Db,
  rule: CategoryRule,
  at: string,
): Promise<void> {
  const { merchantKey, categoryId } = rule;
  await db
    .insert(t.merchantProfiles)
    .values({
      merchantKey,
      categoryDistribution: '{}',
      userConfirmedCategoryId: categoryId,
      transactionCount: 0,
      lastUpdatedAt: at,
    })
    .onConflictDoUpdate({
      target: t.merchantProfiles.merchantKey,
      set: { userConfirmedCategoryId: categoryId },
    });
}

export async function deleteRule(db: Db, merchantKey: string): Promise<void> {
  await db.delete(t.merchantAliases).where(eq(t.merchantAliases.merchantKey, merchantKey));
  await db
    .update(t.merchantProfiles)
    .set({ userConfirmedCategoryId: null })
    .where(eq(t.merchantProfiles.merchantKey, merchantKey));
}

async function liveCategorization(db: Db, transactionId: string) {
  const [current] = await db
    .select()
    .from(t.categorizations)
    .where(and(eq(t.categorizations.transactionId, transactionId), isNull(t.categorizations.supersededBy)));
  return current;
}

/** Append a categorization to the chain, superseding the live one. */
export async function supersedeCategorization(
  db: Db,
  change: { transactionId: string; categoryId: string; source: 'user' | 'rule' },
  at: string,
): Promise<void> {
  const current = await liveCategorization(db, change.transactionId);
  const id = `cat_${randomUUID().slice(0, 12)}`;
  await db.insert(t.categorizations).values({
    id,
    transactionId: change.transactionId,
    categoryId: change.categoryId,
    confidence: 1,
    source: change.source,
    isConfirmed: change.source === 'user',
    needsReview: false,
    reasoning: null,
    supersededBy: null,
    createdAt: at,
  });
  if (current) {
    await db
      .update(t.categorizations)
      .set({ supersededBy: id })
      .where(eq(t.categorizations.id, current.id));
  }
}

/** Give every charge of the merchant the rule's category, except one-offs (live source `user`). */
export async function applyRuleCategory(
  db: Db,
  rule: CategoryRule & { readonly categoryId: string },
  at: string,
): Promise<{ updated: number; skippedOneOffs: number }> {
  const { merchantKey, categoryId } = rule;
  const rows = await db
    .select({ id: t.transactions.id })
    .from(t.transactions)
    .where(eq(t.transactions.merchantKey, merchantKey));
  const live = await liveSources(db);
  let updated = 0;
  let skippedOneOffs = 0;
  for (const { id } of rows) {
    const current = live.get(id);
    if (current?.source === 'user') skippedOneOffs += 1;
    else if (current?.categoryId !== categoryId || current.source !== 'rule') {
      await supersedeCategorization(db, { transactionId: id, categoryId, source: 'rule' }, at);
      updated += 1;
    }
  }
  return { updated, skippedOneOffs };
}

async function liveSources(db: Db): Promise<Map<string, { categoryId: string; source: string }>> {
  const rows = await db
    .select()
    .from(t.categorizations)
    .where(isNull(t.categorizations.supersededBy));
  return new Map(rows.map((r) => [r.transactionId, r]));
}

interface RuleLookups {
  readonly displayNames: ReadonlyMap<string, string>;
  readonly ruleCategories: ReadonlyMap<string, string | null>;
  readonly categoryNames: ReadonlyMap<string, string>;
  readonly transactions: readonly (typeof t.transactions.$inferSelect)[];
  readonly live: ReadonlyMap<string, { source: string }>;
}

function ruleView(merchantKey: string, lookups: RuleLookups): MerchantRuleView {
  const { displayNames, ruleCategories, categoryNames, transactions, live } = lookups;
  const charges = transactions.filter((r) => r.merchantKey === merchantKey);
  const categoryId = ruleCategories.get(merchantKey) ?? null;
  const isOneOff = (r: (typeof charges)[number]): boolean =>
    r.userMerchantName !== null || live.get(r.id)?.source === 'user';
  return {
    merchantKey,
    merchantName: charges[0]?.merchantName ?? merchantKey,
    displayName: displayNames.get(merchantKey) ?? null,
    categoryId,
    categoryName: categoryId ? (categoryNames.get(categoryId) ?? categoryId) : null,
    transactionCount: charges.length,
    oneOffCount: charges.filter(isOneOff).length,
  };
}

export async function listRules(db: Db): Promise<MerchantRuleView[]> {
  const [aliases, profiles, transactions, categories, live] = await Promise.all([
    db.select().from(t.merchantAliases),
    db.select().from(t.merchantProfiles),
    db.select().from(t.transactions),
    db.select().from(t.categories),
    liveSources(db),
  ]);
  const displayNames = new Map(aliases.map((a) => [a.merchantKey, a.displayName]));
  const ruleCategories = new Map(
    profiles.filter((p) => p.userConfirmedCategoryId).map((p) => [p.merchantKey, p.userConfirmedCategoryId]),
  );
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
  const keys = new Set([...displayNames.keys(), ...ruleCategories.keys()]);
  const lookups = { displayNames, ruleCategories, categoryNames, transactions, live };
  return [...keys].sort().map((merchantKey) => ruleView(merchantKey, lookups));
}
