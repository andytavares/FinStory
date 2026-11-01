import { z } from 'zod';
import { IpcRegistry, IpcFailure } from '../registry';
import {
  dashboardSchema,
  dateRangeSchema,
  saveCredentialsSchema,
  credentialsUpdateSchema,
  linkCompleteSchema,
  institutionIdSchema,
  accountEverydaySchema,
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
  merchantRenameSchema,
  categoryDeleteSchema,
  settingsUpdateSchema,
  pathSchema,
  exportSchema,
  clearOverrideSchema,
  decideRecurringSchema,
  recategorizeAllSchema,
  incomeAddSchema,
  importSchema,
  deleteAllSchema,
  idSchema,
  alertIdSchema,
  transactionIdsSchema,
  transactionUpdateSchema,
  ruleUpdateSchema,
  ruleDeleteSchema,
  usageViewSchema,
  usageActionSchema,
  usageSummarySchema,
  usageRecentSchema,
  importPreviewSchema,
  importCommitSchema,
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
  registry.handle('credentials:update', credentialsUpdateSchema, (p) =>
    services.updateCredentials(p),
  );
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
  registry.handle('accounts:setEveryday', accountEverydaySchema, (p) =>
    services.setAccountEveryday(p),
  );

  // Reading money — all offline-safe.
  registry.handleOfflineSafe('dashboard:get', dashboardSchema, (p) => services.dashboard(p), () =>
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
  registry.handle('income:add', incomeAddSchema, (p) => services.addIncomeSource(p));
  registry.handle('income:clearOverride', idSchema, (p) => services.clearIncomeOverride(p.id));
  registry.handle('income:history', empty, () => services.incomeHistory());

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
  registry.handle('categories:delete', categoryDeleteSchema, (p) => services.deleteCategory(p));

  // Recurring
  registry.handle('merchants:rename', merchantRenameSchema, (p) => services.renameMerchant(p));
  registry.handle('recurring:list', empty, () => services.listRecurring());
  registry.handle('recurring:acknowledge', idSchema, (p) => services.acknowledgeRecurring(p.id));
  registry.handle('recurring:candidates', empty, () => services.recurringCandidates());
  registry.handle('recurring:decide', decideRecurringSchema, (p) => services.decideRecurring(p));
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
  registry.handle('reports:exportPdf', idSchema, (p) => services.exportReportPdf(p));

  // Diagnostics, settings, data
  registry.handle('health:get', empty, () => services.health());
  registry.handle('diagnostics:export', pathSchema, (p) => services.exportDiagnostics(p.destPath));
  registry.handle('settings:get', empty, () => services.getSettings());
  registry.handle('models:listOllama', empty, () => services.listOllamaModels());
  registry.handle('setup:detectOllama', empty, () => services.detectOllama());
  registry.handle('settings:update', settingsUpdateSchema, (p) => services.updateSettings(p));
  registry.handle('data:export', exportSchema, (p) => services.exportData(p.destPath, p.passphrase));
  registry.handle('data:import', importSchema, (p) =>
    services.importData(p.srcPath, p.passphrase),
  );
  registry.handle('data:deleteAll', deleteAllSchema, () => services.deleteAllData());

  // Usage tracking. These channels are not themselves tracked.
  registry.handle('usage:view', usageViewSchema, (p) => services.recordView(p.route));
  registry.handle('usage:action', usageActionSchema, (p) => services.recordAction(p.feature));
  registry.handle('usage:summary', usageSummarySchema, (p) => services.usageSummary(p.days));
  registry.handle('usage:recent', usageRecentSchema, (p) => services.recentUsage(p.limit));
  registry.handle('usage:export', empty, () => services.exportUsage());

  registry.handle('analysis:refresh', empty, () => services.refreshAnalysis());
  registry.handle('overrides:list', empty, () => services.listOverrides());
  registry.handle('overrides:clear', clearOverrideSchema, (p) => services.clearOverride(p));
  registry.handle('rules:list', empty, () => services.listRules());
  registry.handle('rules:update', ruleUpdateSchema, (p) => services.updateRule(p));
  registry.handle('rules:delete', ruleDeleteSchema, (p) => services.deleteRule(p));
  registry.handle('model:status', empty, () => services.modelStatus());
  registry.handle('model:test', empty, () => services.testModel());
  registry.handle('categorization:rerun', recategorizeAllSchema, (p) =>
    services.recategorizePending(p),
  );
  registry.handle('categorization:cancel', empty, () => services.cancelRecategorize());

  registry.handle('import:preview', importPreviewSchema, (p) => services.previewImport(p));
  registry.handle('import:commit', importCommitSchema, (p) => services.commitImport(p));

  // The only caller of /transactions/refresh, and only on user request (R2).
  registry.handle('sync:now', empty, async () => {
    if (!services.isOnline()) {
      throw new IpcFailure('NETWORK_UNAVAILABLE', 'No network connection', true, 'Try again');
    }
    return services.syncNow();
  });
}
