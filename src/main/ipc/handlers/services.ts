import type { Completeness } from '@main/plaid/health';

/**
 * The surface the IPC layer depends on.
 *
 * Declared as an interface so channel registration is testable without a
 * database, a Plaid client, or a running Electron process — and so the wiring
 * is separable from the implementations it wires.
 */
export interface AppServices {
  isOnline(): boolean;
  completeness(): Promise<Completeness>;

  setupStatus(): Promise<unknown>;
  saveCredentials(input: unknown): Promise<unknown>;
  startLink(): Promise<unknown>;
  completeLink(linkToken: string): Promise<unknown>;
  listInstitutions(): Promise<unknown>;
  disconnectInstitution(id: string): Promise<unknown>;
  setAccountEveryday(input: unknown): Promise<unknown>;
  reauthInstitution(id: string): Promise<unknown>;

  dashboard(range: unknown): Promise<unknown>;
  dashboardFromCache(): Promise<unknown>;
  breakdownByCategory(range: unknown): Promise<unknown>;
  breakdownByMerchant(range: unknown): Promise<unknown>;
  queryTransactions(query: unknown): Promise<unknown>;
  trends(range: unknown): Promise<unknown>;

  listIncome(): Promise<unknown>;
  confirmIncome(id: string): Promise<unknown>;
  overrideIncome(input: unknown): Promise<unknown>;
  clearIncomeOverride(id: string): Promise<unknown>;

  reviewQueue(page: unknown): Promise<unknown>;
  recategorize(input: unknown): Promise<unknown>;
  applyRetroactive(input: unknown): Promise<unknown>;
  updateTransaction(input: unknown): Promise<unknown>;
  dismissFlags(ids: string[]): Promise<unknown>;

  listCategories(): Promise<unknown>;
  createCategory(input: unknown): Promise<unknown>;
  renameCategory(input: unknown): Promise<unknown>;
  mergeCategories(input: unknown): Promise<unknown>;
  setCategoryHidden(input: unknown): Promise<unknown>;
  deleteCategory(input: unknown): Promise<unknown>;

  renameMerchant(input: unknown): Promise<unknown>;
  listRecurring(): Promise<unknown>;
  acknowledgeRecurring(id: string): Promise<unknown>;
  markNotRecurring(id: string): Promise<unknown>;

  listAlerts(): Promise<unknown>;
  dismissAlert(id: string): Promise<unknown>;
  listAlertRules(): Promise<unknown>;
  updateAlertRule(input: unknown): Promise<unknown>;
  createAlertRule(input: unknown): Promise<unknown>;
  deleteAlertRule(id: string): Promise<unknown>;
  listReports(): Promise<unknown>;
  getReport(id: string): Promise<unknown>;
  generateReport(input: unknown): Promise<unknown>;
  deleteReport(id: string): Promise<unknown>;

  health(): Promise<unknown>;
  exportDiagnostics(destPath: string): Promise<unknown>;
  getSettings(): Promise<unknown>;
  updateSettings(input: unknown): Promise<unknown>;
  exportData(destPath: string): Promise<unknown>;
  importData(srcPath: string): Promise<unknown>;
  deleteAllData(): Promise<unknown>;
  listOllamaModels(): Promise<unknown>;
  refreshAnalysis(): Promise<unknown>;
  syncNow(): Promise<unknown>;
  listOverrides(): Promise<unknown>;
  clearOverride(input: unknown): Promise<unknown>;
  modelStatus(): Promise<unknown>;
  testModel(): Promise<unknown>;
  recategorizePending(): Promise<unknown>;
}
