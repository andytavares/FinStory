/** Types crossing the renderer↔main boundary. All amounts are integer minor units. */

export interface InstitutionSummary {
  readonly id: string;
  readonly institutionName: string;
  readonly status: 'healthy' | 'reauth_required' | 'error';
  readonly lastSyncedAt: string | null;
  readonly accountCount: number;
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
  readonly description: string;
  readonly postedDate: string;
  readonly categoryId: string;
  readonly confidence: number;
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
  readonly confidence: number;
  readonly reasoning: string | null;
}

export interface RecurringChargeView {
  readonly id: string;
  readonly merchantKey: string;
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

export interface HealthView {
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
  readonly ollamaModel: string;
  readonly ollamaBaseUrl: string;
  readonly timeZone: string;
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
  | 'INCOME_UNDETECTED'
  | 'INTERNAL';

export interface IpcError {
  readonly code: IpcErrorCode;
  readonly message: string;
  readonly recoverable: boolean;
  readonly action?: string;
}
