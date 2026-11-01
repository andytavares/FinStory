/** Types crossing the renderer↔main boundary. All amounts are integer minor units. */

export interface AccountRow {
  readonly id: string;
  readonly name: string;
  readonly mask: string | null;
  readonly type: string;
  readonly subtype: string | null;
  readonly currentBalanceMinor: number | null;
  readonly balanceAsOf: string | null;
  /** Counts toward day-to-day spending and the runway. */
  readonly isEveryday: boolean;
}

export interface InstitutionSummary {
  readonly id: string;
  readonly institutionName: string;
  readonly status: 'healthy' | 'reauth_required' | 'error';
  readonly lastSyncedAt: string | null;
  readonly accountCount: number;
  readonly accounts: AccountRow[];
}

export interface AccountSummary {
  readonly id: string;
  readonly name: string;
  readonly mask: string | null;
  readonly type: string;
  readonly currentBalanceMinor: number | null;
  /** A balance is never rendered without its age. */
  readonly balanceAsOf: string | null;
}

export interface TransactionView {
  readonly id: string;
  readonly amountMinor: number;
  readonly merchantName: string | null;
  /** The stable grouping key. An identifier, never shown to the user. */
  readonly merchantKey: string | null;
  /** Part of a recurring charge — by the user's answer, or by the ledger. */
  readonly isRecurring: boolean;
  readonly description: string;
  readonly postedDate: string;
  readonly categoryId: string;
  readonly confidence: number;
  /** Who set the category. Null when it has none. */
  readonly categorySource?: 'user' | 'rule' | 'model' | 'local_history' | null;
  readonly needsReview: boolean;
  readonly isInternalTransfer: boolean;
  /** Display-only; never summed or compared by the renderer (FR-085). */
  readonly originalCurrency: string | null;
  readonly originalAmountMinor: number | null;
  readonly userMerchantName: string | null;
  readonly userNote: string | null;
  readonly userExcluded: boolean;
  readonly userRecurringOverride: 'recurring' | 'not_recurring' | null;
}

/** Every total-bearing response carries its own completeness. */
export interface Qualified {
  readonly dataComplete: boolean;
  readonly staleInstitutions: string[];
}

export interface BreakdownResponse extends Qualified {
  readonly rows: Array<{
    categoryId: string;
    name: string;
    parentId: string | null;
    parentName: string | null;
    totalMinor: number;
    txCount: number;
  }>;
  readonly totalMinor: number;
}

export interface DashboardResponse extends Qualified {
  readonly balances: AccountSummary[];
  readonly cashFlowMinor: { incomeMinor: number; spendingMinor: number; netMinor: number };
  readonly categoryBreakdown: BreakdownResponse;
  readonly whatChanged: string[];
}

export interface ReviewItem {
  readonly transaction: TransactionView;
  readonly guessCategoryId: string;
  /** What to show. The id is an identifier and is never displayed. */
  readonly guessCategoryName: string;
  readonly confidence: number;
  readonly reasoning: string | null;
}

export interface RecurringChargeView {
  readonly id: string;
  readonly merchantKey: string;
  readonly merchantName: string;
  readonly currentAmountMinor: number;
  readonly cadence: string;
  readonly firstSeenDate: string;
  readonly cumulativePaidMinor: number;
  readonly status: 'active' | 'inactive';
  readonly amountChanges: Array<{ oldAmountMinor: number; newAmountMinor: number; changedAt: string }>;
}

export interface IncomeSourceView {
  readonly id: string;
  readonly merchantKey: string;
  readonly merchantName: string;
  readonly expectedAmountMinor: number;
  readonly cadence: string;
  readonly nextExpectedDate: string;
  readonly detectionConfidence: number;
  readonly isUserConfirmed: boolean;
}

export interface AlertView {
  readonly id: string;
  readonly type: string;
  /** True event time and detection time are both surfaced (FR-057). */
  readonly eventOccurredAt: string;
  readonly detectedAt: string;
  readonly dismissed: boolean;
}

/**
 * Every decision the user has made that overrides what the app worked out.
 *
 * Collected in one place so a mistake is findable: a rename made months ago is
 * otherwise invisible until it turns up in a report.
 */
export type OverrideKind =
  | 'merchant_name'
  | 'transaction_name'
  | 'merchant_category'
  | 'transaction_category'
  | 'excluded'
  | 'recurring'
  | 'recurring_rule'
  | 'note';

export interface OverrideRecord {
  readonly id: string;
  readonly kind: OverrideKind;
  /** Merchant key or transaction id, depending on the kind. */
  readonly target: string;
  /** What the override applies to, in the user's own words where they set one. */
  readonly label: string;
  /** What the app would say without the override. Null when there is no prior. */
  readonly original: string | null;
  /** What the override says instead. */
  readonly current: string;
  /** How many transactions this override reaches. */
  readonly affectedCount: number;
  readonly occurredAt: string | null;
}

/** A charge that looks recurring and is waiting on the user's answer. */
export interface RecurringCandidateView {
  readonly key: string;
  readonly merchantKey: string;
  readonly merchantName: string;
  readonly amountMinor: number;
  readonly cadence: string;
  readonly occurrences: number;
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly nextExpected: string;
  readonly confidence: number;
  readonly totalPaidMinor: number;
  readonly transactionIds: string[];
}

export interface HealthContents {
  readonly institutions: number;
  readonly accounts: number;
  readonly everydayAccounts: number;
  readonly transactions: number;
  readonly transactionsInEverydayAccounts: number;
  readonly transactionsThisMonth: number;
  readonly categorized: number;
  readonly uncategorizable: number;
}

export interface HealthView {
  readonly contents: HealthContents;
  readonly perAccount: Array<{
    institutionId: string;
    institutionName: string;
    status: string;
    lastSuccessfulSync: string | null;
    lastAttemptedSync: string | null;
    recentFailures: number;
  }>;
  readonly metrics: {
    syncDurationMsP50: number | null;
    transactionsProcessed: number;
    localResolutionRate: number | null;
    droppedDiagnosticEvents: number;
  };
}

/** Presence only — never the values themselves (FR-047). */
export interface SetupStatus {
  readonly plaidConfigured: boolean;
  readonly plaidClientIdConfigured: boolean;
  readonly plaidSecretConfigured: boolean;
  /** Which Plaid environment requests go to. Production keys fail against sandbox. */
  readonly plaidEnv: 'sandbox' | 'production';
  readonly categorizationConfigured: boolean;
  readonly accountCount: number;
  readonly encryptionAvailable: boolean;
}

export type ModelProvider = 'anthropic' | 'ollama' | 'local_only';

export interface AppSettings {
  readonly confidenceThreshold: number;
  readonly pollIntervalMinutes: number;
  readonly categorizationMode: 'hybrid' | 'local_only';
  readonly modelProvider: ModelProvider;
  readonly anthropicModel: string;
  /** Required by identity-linked API keys; empty for a plain workspace key. */
  readonly anthropicWorkspaceId: string;
  readonly ollamaModel: string;
  readonly ollamaBaseUrl: string;
  readonly timeZone: string;
  /** How long usage history is kept: one year, or until the user erases it. */
  readonly usageRetention: '365' | 'forever';
  /** When the last backup finished. Null until the first one. */
  readonly lastBackupAt: string | null;
}

export type IpcErrorCode =
  | 'ENCRYPTION_UNAVAILABLE'
  | 'PLAID_REAUTH_REQUIRED'
  | 'PLAID_RATE_LIMITED'
  | 'PLAID_UNCONFIGURED'
  | 'CATEGORIZATION_UNAVAILABLE'
  | 'NETWORK_UNAVAILABLE'
  | 'DB_LOCKED'
  | 'VALIDATION_FAILED'
  | 'CATEGORY_NESTING_EXCEEDED'
  | 'SYNC_FAILED'
  | 'INCOME_UNDETECTED'
  | 'INTERNAL';

export interface IpcError {
  readonly code: IpcErrorCode;
  readonly message: string;
  readonly recoverable: boolean;
  readonly action?: string;
}

/** A standing rule for one merchant: the name and category it always gets. */
export interface MerchantRuleView {
  readonly merchantKey: string;
  /** The name the bank sent, for telling rules apart. */
  readonly merchantName: string;
  readonly displayName: string | null;
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  readonly transactionCount: number;
  /** Charges of this merchant the rule does not control. */
  readonly oneOffCount: number;
}

/** Dashboard additions. Money out is positive in every series. */
export interface DashboardKpis {
  readonly spent: { thisMonthMinor: number; seriesMinor: number[] };
  readonly income: {
    thisMonthMinor: number;
    seriesMinor: number[];
    nextDeposit: { date: string; amountMinor: number; merchantName: string } | null;
  };
  readonly recurring: { monthlyMinor: number; count: number; candidateCount: number };
  readonly safeToSpendPerDayMinor: number | null;
}

export interface DashboardExtras {
  readonly kpis: DashboardKpis;
  readonly upcomingRecurring: Array<{ merchantName: string; date: string; amountMinor: number }>;
  readonly runwaySeries: { points: Array<{ date: string; balanceMinor: number }>; floorMinor: number } | null;
  readonly whereItWent: Array<{ groupId: string; name: string; spentMinor: number }>;
}

export interface ReviewSuggestion {
  readonly categoryId: string;
  readonly name: string;
}

export interface IncomeMonth {
  readonly month: string;
  readonly incomeMinor: number;
  readonly spendingMinor: number;
}

export interface SyncHistoryEntry {
  readonly at: string;
  readonly ok: boolean;
  readonly durationMs: number | null;
}

export interface OllamaDetection {
  readonly running: boolean;
  readonly version?: string;
  readonly models: string[];
}
