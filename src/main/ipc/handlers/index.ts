import { z } from 'zod';
import { IpcRegistry, IpcFailure } from '../registry';
import {
  dateRangeSchema,
  saveCredentialsSchema,
  linkCompleteSchema,
  institutionIdSchema,
  transactionQuerySchema,
  recategorizeSchema,
  applyRetroactiveSchema,
  createCategorySchema,
  mergeCategoriesSchema,
  setHiddenSchema,
  incomeOverrideSchema,
  alertRuleUpdateSchema,
  alertRuleCreateSchema,
  reportGenerateSchema,
  settingsUpdateSchema,
  pathSchema,
  importSchema,
  deleteAllSchema,
  idSchema,
  alertIdSchema,
  transactionIdsSchema,
  transactionUpdateSchema,
} from '@shared/schemas';
import type { AppServices } from './services';

const empty = z.object({}).optional().default({});

/**
 * Channel registration.
 *
 * Read channels are registered offline-safe: connectivity may fail a sync, but
 * never a read (FR-059). Write channels fail honestly rather than pretending to
 * succeed.
 */
export function registerHandlers(registry: IpcRegistry, services: AppServices): void {
  const offlineBreakdown = async (): Promise<unknown> => ({
    rows: [],
    totalMinor: 0,
    ...(await services.completeness()),
  });

  // Setup and connection
  registry.handle('setup:status', empty, () => services.setupStatus());
  registry.handle('setup:saveCredentials', saveCredentialsSchema, (p) =>
    services.saveCredentials(p),
  );
  registry.handle('link:start', empty, () => services.startLink());
  registry.handle('link:complete', linkCompleteSchema, (p) => services.completeLink(p.linkToken));
  registry.handle('institutions:list', empty, () => services.listInstitutions());
  registry.handle('institutions:disconnect', institutionIdSchema, (p) =>
    services.disconnectInstitution(p.institutionId),
  );
  registry.handle('institutions:reauth', institutionIdSchema, (p) =>
    services.reauthInstitution(p.institutionId),
  );

  // Reading money — all offline-safe.
  registry.handleOfflineSafe('dashboard:get', dateRangeSchema, (p) => services.dashboard(p), () =>
    services.dashboardFromCache(),
  );
  registry.handleOfflineSafe(
    'breakdown:byCategory',
    dateRangeSchema,
    (p) => services.breakdownByCategory(p),
    offlineBreakdown,
  );
  registry.handleOfflineSafe(
    'breakdown:byMerchant',
    dateRangeSchema,
    (p) => services.breakdownByMerchant(p),
    offlineBreakdown,
  );
  registry.handleOfflineSafe(
    'transactions:query',
    transactionQuerySchema,
    (p) => services.queryTransactions(p),
    async () => ({ rows: [], totalCount: 0, ...(await services.completeness()) }),
  );
  registry.handleOfflineSafe(
    'trends:overTime',
    dateRangeSchema,
    (p) => services.trends(p),
    async () => ({ series: [], comparisonSeries: [] }),
  );

  // Income
  registry.handle('income:list', empty, () => services.listIncome());
  registry.handle('income:confirm', idSchema, (p) => services.confirmIncome(p.id));
  registry.handle('income:override', incomeOverrideSchema, (p) => services.overrideIncome(p));
  registry.handle('income:clearOverride', idSchema, (p) => services.clearIncomeOverride(p.id));

  // Corrections
  registry.handle('review:queue', z.object({ limit: z.number().default(100), offset: z.number().default(0) }), (p) =>
    services.reviewQueue(p),
  );
  registry.handle('review:recategorize', recategorizeSchema, (p) => services.recategorize(p));
  registry.handle('review:applyRetroactive', applyRetroactiveSchema, (p) =>
    services.applyRetroactive(p),
  );
  registry.handle('transactions:update', transactionUpdateSchema, (p) =>
    services.updateTransaction(p),
  );
  registry.handle('review:dismissFlag', transactionIdsSchema, (p) =>
    services.dismissFlags(p.transactionIds),
  );

  // Categories
  registry.handle('categories:list', empty, () => services.listCategories());
  registry.handle('categories:create', createCategorySchema, (p) => services.createCategory(p));
  registry.handle('categories:rename', z.object({ id: z.string(), name: z.string() }), (p) =>
    services.renameCategory(p),
  );
  registry.handle('categories:merge', mergeCategoriesSchema, (p) => services.mergeCategories(p));
  registry.handle('categories:setHidden', setHiddenSchema, (p) => services.setCategoryHidden(p));

  // Recurring
  registry.handle('recurring:list', empty, () => services.listRecurring());
  registry.handle('recurring:acknowledge', idSchema, (p) => services.acknowledgeRecurring(p.id));
  registry.handle('recurring:markNotRecurring', idSchema, (p) => services.markNotRecurring(p.id));

  // Alerts and reports
  registry.handle('alerts:list', empty, () => services.listAlerts());
  registry.handle('alerts:dismiss', alertIdSchema, (p) => services.dismissAlert(p.alertId));
  registry.handle('alertRules:list', empty, () => services.listAlertRules());
  registry.handle('alertRules:update', alertRuleUpdateSchema, (p) => services.updateAlertRule(p));
  registry.handle('alertRules:create', alertRuleCreateSchema, (p) => services.createAlertRule(p));
  registry.handle('alertRules:delete', idSchema, (p) => services.deleteAlertRule(p.id));
  registry.handle('reports:list', empty, () => services.listReports());
  registry.handle('reports:get', z.object({ reportId: z.string() }), (p) =>
    services.getReport(p.reportId),
  );
  registry.handle('reports:generate', reportGenerateSchema, (p) => services.generateReport(p));
  registry.handle('reports:delete', idSchema, (p) => services.deleteReport(p.id));

  // Diagnostics, settings, data
  registry.handle('health:get', empty, () => services.health());
  registry.handle('diagnostics:export', pathSchema, (p) => services.exportDiagnostics(p.destPath));
  registry.handle('settings:get', empty, () => services.getSettings());
  registry.handle('models:listOllama', empty, () => services.listOllamaModels());
  registry.handle('settings:update', settingsUpdateSchema, (p) => services.updateSettings(p));
  registry.handle('data:export', pathSchema, (p) => services.exportData(p.destPath));
  registry.handle('data:import', importSchema, (p) => services.importData(p.srcPath));
  registry.handle('data:deleteAll', deleteAllSchema, () => services.deleteAllData());

  // The only caller of /transactions/refresh, and only on user request (R2).
  registry.handle('sync:now', empty, async () => {
    if (!services.isOnline()) {
      throw new IpcFailure('NETWORK_UNAVAILABLE', 'No network connection', true, 'Try again');
    }
    return services.syncNow();
  });
}
