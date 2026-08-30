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

export const linkCompleteSchema = z.object({ linkToken: z.string().min(1) });
export const institutionIdSchema = z.object({ institutionId: z.string().min(1) });

export const transactionQuerySchema = z.object({
  periodStart: isoDate.optional(),
  periodEnd: isoDate.optional(),
  categoryIds: z.array(z.string()).optional(),
  merchantKey: z.string().optional(),
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

export const pathSchema = z.object({ destPath: z.string().min(1) });
export const importSchema = z.object({ srcPath: z.string().min(1) });
export const deleteAllSchema = z.object({ confirmation: z.literal('DELETE ALL MY DATA') });
export const idSchema = z.object({ id: z.string().min(1) });
export const alertIdSchema = z.object({ alertId: z.string().min(1) });
export const transactionIdsSchema = z.object({
  transactionIds: z.array(z.string().min(1)).min(1),
});
