import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Schema per data-model.md.
 *
 * Money is stored as integer minor units everywhere (Constitution II).
 * Timestamps are UTC ISO-8601 strings; period boundaries are computed in the
 * user's local timezone by src/shared/periods.ts.
 */

export const institutions = sqliteTable('institutions', {
  id: text('id').primaryKey(),
  // Null for imported institutions; SQLite UNIQUE ignores nulls.
  plaidItemId: text('plaid_item_id').unique(),
  accessTokenEncrypted: text('access_token_encrypted', { mode: 'text' }).notNull(),
  institutionName: text('institution_name').notNull(),
  // Null means never synced — drives initial backfill (FR-004).
  syncCursor: text('sync_cursor'),
  status: text('status', { enum: ['healthy', 'reauth_required', 'error'] })
    .notNull()
    .default('healthy'),
  lastSyncedAt: text('last_synced_at'),
  lastAttemptedSyncAt: text('last_attempted_sync_at'),
  createdAt: text('created_at').notNull(),
  source: text('source', { enum: ['plaid', 'import'] }).notNull().default('plaid'),
});

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  institutionId: text('institution_id')
    .notNull()
    .references(() => institutions.id, { onDelete: 'cascade' }),
  plaidAccountId: text('plaid_account_id').notNull().unique(),
  name: text('name').notNull(),
  mask: text('mask'),
  type: text('type').notNull(),
  subtype: text('subtype'),
  currentBalanceMinor: integer('current_balance_minor'),
  // A balance is never rendered without its age.
  balanceAsOf: text('balance_as_of'),
  /**
   * Whether this account is part of day-to-day money.
   *
   * Governs both directions at once: its transactions count toward spending
   * totals, and its balance counts toward the runway. Savings and investment
   * accounts are excluded by default — money sitting in savings is not
   * spending money, and counting it would make the runway lie.
   */
  isEveryday: integer('is_everyday', { mode: 'boolean' }).notNull().default(true),
});

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    // Unique index enforces exactly-once ingestion at the schema level (FR-005).
    plaidTransactionId: text('plaid_transaction_id').notNull().unique(),
    // Settled amount in the account currency. Authoritative for every
    // calculation (FR-084). Negative = money out.
    amountMinor: integer('amount_minor').notNull(),
    merchantName: text('merchant_name'),
    merchantKey: text('merchant_key'),
    description: text('description').notNull(),
    postedDate: text('posted_date').notNull(),
    datetime: text('datetime'),
    pending: integer('pending', { mode: 'boolean' }).notNull().default(false),
    settlementState: text('settlement_state', { enum: ['pending', 'posted', 'removed'] })
      .notNull()
      .default('posted'),
    isInternalTransfer: integer('is_internal_transfer', { mode: 'boolean' })
      .notNull()
      .default(false),
    reversesTransactionId: text('reverses_transaction_id'),
    // Display-only. MUST NOT enter any calculation (FR-085, FR-086).
    originalCurrency: text('original_currency'),
    originalAmountMinor: integer('original_amount_minor'),
    // User overrides. The imported values above are never mutated, so a
    // re-sync cannot clobber the user's edits and the original stays auditable.
    userMerchantName: text('user_merchant_name'),
    userNote: text('user_note'),
    /** Excludes the transaction from spending totals (e.g. a reimbursed expense). */
    userExcluded: integer('user_excluded', { mode: 'boolean' }).notNull().default(false),
    /** Overrides recurring detection either way; null means "let detection decide". */
    userRecurringOverride: text('user_recurring_override', {
      enum: ['recurring', 'not_recurring'],
    }),
    firstSeenAt: text('first_seen_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('tx_posted_date_idx').on(t.postedDate),
    index('tx_merchant_idx').on(t.merchantKey),
    index('tx_account_idx').on(t.accountId),
  ],
);

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  // One level only — a category with a parent must not itself be a parent (FR-080).
  parentId: text('parent_id'),
  isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
  isHidden: integer('is_hidden', { mode: 'boolean' }).notNull().default(false),
  mergedIntoId: text('merged_into_id'),
});

export const categorizations = sqliteTable(
  'categorizations',
  {
    id: text('id').primaryKey(),
    transactionId: text('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id),
    confidence: real('confidence').notNull(),
    source: text('source', { enum: ['local_history', 'model', 'user', 'rule'] }).notNull(),
    isConfirmed: integer('is_confirmed', { mode: 'boolean' }).notNull().default(false),
    needsReview: integer('needs_review', { mode: 'boolean' }).notNull().default(false),
    reasoning: text('reasoning'),
    // Correction chain: the live categorization is the one with no successor.
    supersededBy: text('superseded_by'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('cat_live_idx').on(t.transactionId, t.supersededBy)],
);

export const merchantProfiles = sqliteTable('merchant_profiles', {
  merchantKey: text('merchant_key').primaryKey(),
  categoryDistribution: text('category_distribution').notNull().default('{}'),
  // Set by a correction; makes FR-016 deterministic rather than probabilistic.
  userConfirmedCategoryId: text('user_confirmed_category_id'),
  transactionCount: integer('transaction_count').notNull().default(0),
  lastUpdatedAt: text('last_updated_at').notNull(),
});

export const recurringCharges = sqliteTable('recurring_charges', {
  id: text('id').primaryKey(),
  merchantKey: text('merchant_key').notNull(),
  currentAmountMinor: integer('current_amount_minor').notNull(),
  cadence: text('cadence', { enum: ['weekly', 'monthly', 'quarterly', 'annual'] }).notNull(),
  firstSeenDate: text('first_seen_date').notNull(),
  lastSeenDate: text('last_seen_date').notNull(),
  cumulativePaidMinor: integer('cumulative_paid_minor').notNull().default(0),
  // Inactive, never deleted (FR-024).
  status: text('status', { enum: ['active', 'inactive'] }).notNull().default('active'),
  detectedAt: text('detected_at').notNull(),
  userAcknowledged: integer('user_acknowledged', { mode: 'boolean' }).notNull().default(false),
});

export const recurringChargeOccurrences = sqliteTable('recurring_charge_occurrences', {
  id: text('id').primaryKey(),
  recurringChargeId: text('recurring_charge_id')
    .notNull()
    .references(() => recurringCharges.id, { onDelete: 'cascade' }),
  transactionId: text('transaction_id')
    .notNull()
    .references(() => transactions.id, { onDelete: 'cascade' }),
});

export const recurringChargeAmountChanges = sqliteTable('recurring_charge_amount_changes', {
  id: text('id').primaryKey(),
  recurringChargeId: text('recurring_charge_id')
    .notNull()
    .references(() => recurringCharges.id, { onDelete: 'cascade' }),
  oldAmountMinor: integer('old_amount_minor').notNull(),
  newAmountMinor: integer('new_amount_minor').notNull(),
  changedAt: text('changed_at').notNull(),
});

export const incomeSources = sqliteTable('income_sources', {
  id: text('id').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  merchantKey: text('merchant_key').notNull(),
  expectedAmountMinor: integer('expected_amount_minor').notNull(),
  cadence: text('cadence', { enum: ['weekly', 'biweekly', 'semimonthly', 'monthly'] }).notNull(),
  nextExpectedDate: text('next_expected_date').notNull(),
  detectionConfidence: real('detection_confidence').notNull(),
  // Pins the pattern and suppresses re-derivation (FR-071).
  isUserConfirmed: integer('is_user_confirmed', { mode: 'boolean' }).notNull().default(false),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});

export const alertRules = sqliteTable('alert_rules', {
  id: text('id').primaryKey(),
  // Deliberately NOT unique: a user may want several rules of the same kind at
  // different thresholds (e.g. notify at $200 and again at $1,000).
  type: text('type', {
    enum: ['large_purchase', 'daily_total', 'duplicate_charge', 'new_recurring', 'balance_floor'],
  }).notNull(),
  /** User-supplied name; falls back to a description of the type. */
  label: text('label'),
  thresholdMinor: integer('threshold_minor'),
  windowMinutes: integer('window_minutes'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
});

export const alerts = sqliteTable(
  'alerts',
  {
    id: text('id').primaryKey(),
    // Nullable and set-null on delete: removing a rule stops it firing, but the
    // alerts it already raised are history and must survive.
    ruleId: text('rule_id').references(() => alertRules.id, { onDelete: 'set null' }),
    /** Retained so a deleted rule's alerts still say what they were. */
    ruleType: text('rule_type').notNull().default('unknown'),
    triggeredByTransactionId: text('triggered_by_transaction_id'),
    // True event time, not detection time (FR-057).
    eventOccurredAt: text('event_occurred_at').notNull(),
    detectedAt: text('detected_at').notNull(),
    deliveredAt: text('delivered_at'),
    dismissedAsFalsePositive: integer('dismissed_as_false_positive', { mode: 'boolean' })
      .notNull()
      .default(false),
    // Unique: one underlying event yields one alert, whether detected live or
    // replayed from a backlog. Suppression is a constraint, not app logic (FR-031).
    dedupeKey: text('dedupe_key').notNull(),
  },
  (t) => [uniqueIndex('alert_dedupe_idx').on(t.dedupeKey)],
);

export const baselines = sqliteTable('baselines', {
  id: text('id').primaryKey(),
  categoryId: text('category_id')
    .notNull()
    .references(() => categories.id, { onDelete: 'cascade' }),
  periodType: text('period_type', { enum: ['weekly', 'monthly'] }).notNull(),
  meanMinor: integer('mean_minor').notNull(),
  stddevMinor: integer('stddev_minor').notNull(),
  samplePeriods: integer('sample_periods').notNull(),
  // False suppresses every deviation claim downstream (FR-040).
  isSufficient: integer('is_sufficient', { mode: 'boolean' }).notNull().default(false),
  computedAt: text('computed_at').notNull(),
});

export const periodReports = sqliteTable('period_reports', {
  id: text('id').primaryKey(),
  type: text('type', { enum: ['weekly_digest', 'monthly_report', 'custom'] }).notNull(),
  /** User-supplied name for a custom report over an arbitrary range. */
  label: text('label'),
  periodStart: text('period_start').notNull(),
  periodEnd: text('period_end').notNull(),
  content: text('content').notNull(),
  generatedAt: text('generated_at').notNull(),
  deliveredAt: text('delivered_at'),
  wasLate: integer('was_late', { mode: 'boolean' }).notNull().default(false),
  // False whenever any institution was stale during the period (FR-009, SC-014).
  dataComplete: integer('data_complete', { mode: 'boolean' }).notNull().default(true),
});

export const diagnosticEvents = sqliteTable(
  'diagnostic_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    occurredAt: text('occurred_at').notNull(),
    eventType: text('event_type').notNull(),
    outcome: text('outcome', { enum: ['success', 'failure', 'skipped'] }).notNull(),
    // Opaque identifier only — never a name (FR-091).
    subjectId: text('subject_id'),
    durationMs: integer('duration_ms'),
    errorCode: text('error_code'),
  },
  (t) => [index('diag_occurred_idx').on(t.occurredAt)],
);

export const usageEvents = sqliteTable(
  'usage_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    occurredAt: text('occurred_at').notNull(),
    // An id from the closed catalog in @shared/features — never free text.
    feature: text('feature').notNull(),
    kind: text('kind', { enum: ['action', 'view', 'background'] }).notNull(),
    outcome: text('outcome', { enum: ['success', 'failure'] }).notNull(),
    durationMs: integer('duration_ms'),
  },
  (t) => [index('usage_occurred_idx').on(t.occurredAt), index('usage_feature_idx').on(t.feature)],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  isSecret: integer('is_secret', { mode: 'boolean' }).notNull().default(false),
});

/**
 * Merchant-level display names.
 *
 * Renaming a merchant applies to every transaction from it, past and future —
 * renaming one row at a time would be exactly the manual bookkeeping this
 * product exists to avoid.
 */
export const recurringRules = sqliteTable(
  'recurring_rules',
  {
    id: text('id').primaryKey(),
    merchantKey: text('merchant_key').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    decision: text('decision', { enum: ['recurring', 'not_recurring'] }).notNull(),
    cadence: text('cadence'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('recurring_rule_idx').on(t.merchantKey, t.amountMinor)],
);

export const merchantAliases = sqliteTable('merchant_aliases', {
  merchantKey: text('merchant_key').primaryKey(),
  displayName: text('display_name').notNull(),
  createdAt: text('created_at').notNull(),
});
