import { z } from 'zod';

/**
 * IPC payload schemas.
 *
 * Validated on the MAIN side. The renderer is untrusted UI; its TypeScript
 * types are a convenience, not a trust boundary.
 */

const isoDate = z.string().min(1);
const minorUnits = z.number().int();

export const dateRangeSchema = z.object({
  periodStart: isoDate,
  periodEnd: isoDate,
});

export const saveCredentialsSchema = z.object({
  plaidClientId: z.string().min(1),
  plaidSecret: z.string().min(1),
  plaidEnv: z.enum(['sandbox', 'production']),
  anthropicApiKey: z.string().min(1).optional(),
});

/**
 * Changing a credential after setup.
 *
 * Every field is optional so one can be replaced without re-entering the rest,
 * and an empty string removes that credential rather than being rejected — a
 * key you must never be able to delete is a trap.
 */
export const credentialsUpdateSchema = z.object({
  plaidClientId: z.string().optional(),
  plaidSecret: z.string().optional(),
  plaidEnv: z.enum(['sandbox', 'production']).optional(),
  anthropicApiKey: z.string().optional(),
});

export const accountEverydaySchema = z.object({
  accountId: z.string().min(1),
  isEveryday: z.boolean(),
});

export const linkCompleteSchema = z.object({ linkToken: z.string().min(1) });
export const institutionIdSchema = z.object({ institutionId: z.string().min(1) });

export const transactionQuerySchema = z.object({
  /**
   * Restrict to the transactions a spending total is built from: day-to-day
   * accounts only, and only what counts as spending. Drilling into a figure
   * must show the transactions behind it, not a different set that happens to
   * share a category (Constitution II).
   */
  spendingOnly: z.boolean().default(false),
  periodStart: isoDate.optional(),
  periodEnd: isoDate.optional(),
  categoryIds: z.array(z.string()).optional(),
  merchantKey: z.string().optional(),
  direction: z.enum(['all', 'in', 'out']).default('all'),
  minAmountMinor: minorUnits.optional(),
  maxAmountMinor: minorUnits.optional(),
  accountIds: z.array(z.string()).optional(),
  confirmationStatus: z.enum(['all', 'confirmed', 'unconfirmed']).default('all'),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
});

export const recategorizeSchema = z.object({
  transactionIds: z.array(z.string().min(1)).min(1),
  categoryId: z.string().min(1),
});

export const applyRetroactiveSchema = z.object({
  merchantKey: z.string().min(1),
  categoryId: z.string().min(1),
});

export const createCategorySchema = z.object({
  name: z.string().min(1).max(60),
  parentId: z.string().nullable().default(null),
});

export const mergeCategoriesSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
});

export const setHiddenSchema = z.object({ id: z.string().min(1), hidden: z.boolean() });

export const incomeOverrideSchema = z.object({
  id: z.string().min(1),
  cadence: z.enum(['weekly', 'biweekly', 'semimonthly', 'monthly']).optional(),
  expectedAmountMinor: minorUnits.optional(),
  nextExpectedDate: isoDate.optional(),
  accountId: z.string().optional(),
});

const alertRuleType = z.enum([
  'large_purchase',
  'daily_total',
  'duplicate_charge',
  'new_recurring',
  'balance_floor',
]);

export const alertRuleUpdateSchema = z.object({
  id: z.string().min(1),
  label: z.string().max(80).nullable().optional(),
  thresholdMinor: z.coerce.number().int().nullable().optional(),
  windowMinutes: z.coerce.number().int().positive().nullable().optional(),
  enabled: z.boolean().optional(),
});

export const alertRuleCreateSchema = z.object({
  type: alertRuleType,
  label: z.string().max(80).optional(),
  thresholdMinor: z.coerce.number().int().nullable().optional(),
  windowMinutes: z.coerce.number().int().positive().nullable().optional(),
});

export const settingsUpdateSchema = z.object({
  confidenceThreshold: z.coerce.number().min(0).max(1).optional(),
  pollIntervalMinutes: z.coerce.number().int().min(15).max(1440).optional(),
  categorizationMode: z.enum(['hybrid', 'local_only']).optional(),
  modelProvider: z.enum(['anthropic', 'ollama', 'local_only']).optional(),
  anthropicModel: z.string().min(1).optional(),
  anthropicWorkspaceId: z.string().optional(),
  ollamaModel: z.string().optional(),
  ollamaBaseUrl: z.string().optional(),
  timeZone: z.string().optional(),
});

export const transactionUpdateSchema = z.object({
  transactionId: z.string().min(1),
  categoryId: z.string().min(1).optional(),
  userMerchantName: z.string().max(120).nullable().optional(),
  /** Apply the rename to every transaction from this merchant. Default true. */
  applyNameToMerchant: z.boolean().default(true),
  userNote: z.string().max(2000).nullable().optional(),
  userExcluded: z.boolean().optional(),
  userRecurringOverride: z.enum(['recurring', 'not_recurring']).nullable().optional(),
});

export const reportGenerateSchema = z
  .object({
    type: z.enum(['weekly_digest', 'monthly_report', 'custom']),
    asOf: z.string().optional(),
    periodStart: z.string().optional(),
    periodEnd: z.string().optional(),
    label: z.string().max(80).optional(),
  })
  .refine((v) => v.type !== 'custom' || (v.periodStart && v.periodEnd), {
    message: 'A custom report needs a start and end date',
  });

export const categoryDeleteSchema = z.object({
  id: z.string().min(1),
  reassignToId: z.string().min(1).optional(),
});

export const merchantRenameSchema = z.object({
  merchantKey: z.string().min(1),
  displayName: z.string().max(120).nullable(),
});

// An empty path is the normal case, not a malformed one: it means "ask me where
// to put it" and the service answers with a native save dialog. Requiring a
// non-empty string made every Export button in the UI fail validation.
export const pathSchema = z.object({ destPath: z.string().default('') });
export const importSchema = z.object({ srcPath: z.string().default('') });
export const deleteAllSchema = z.object({ confirmation: z.literal('DELETE ALL MY DATA') });
export const incomeAddSchema = z.object({
  accountId: z.string().min(1),
  merchantKey: z.string().optional(),
  cadence: z.enum(['weekly', 'biweekly', 'semimonthly', 'monthly']),
  expectedAmountMinor: z.number().int().positive(),
  nextExpectedDate: z.string().min(1),
});

export const recategorizeAllSchema = z.object({
  scope: z.enum(['unresolved', 'all']).default('unresolved'),
});

/** Answering "is this a recurring charge?" for one payee at one amount. */
export const decideRecurringSchema = z.object({
  merchantKey: z.string().min(1),
  amountMinor: z.number().int(),
  decision: z.enum(['recurring', 'not_recurring']),
  cadence: z.string().optional(),
});

export const clearOverrideSchema = z.object({
  kind: z.enum([
    'merchant_name',
    'transaction_name',
    'merchant_category',
    'transaction_category',
    'excluded',
    'recurring',
    'note',
  ]),
  target: z.string().min(1),
});

export const idSchema = z.object({ id: z.string().min(1) });
export const alertIdSchema = z.object({ alertId: z.string().min(1) });
export const transactionIdsSchema = z.object({
  transactionIds: z.array(z.string().min(1)).min(1),
});
