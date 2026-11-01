/**
 * The closed catalog of trackable features.
 *
 * Usage events carry one of these ids and nothing else, so no free text (a
 * merchant name, an amount) can reach the usage table. A test fails when an IPC
 * channel is registered without an entry here.
 */

export type FeatureKind = 'action' | 'view' | 'background';

export interface Feature {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly kind: FeatureKind;
}

export const VIEW_LABELS = {
  dashboard: 'Dashboard',
  register: 'Transactions',
  recurring: 'Recurring',
  income: 'Income',
  review: 'Review',
  alerts: 'Alerts',
  reports: 'Reports',
  health: 'Health',
  overrides: 'Rules',
  categories: 'Categories',
  accounts: 'Accounts',
  usage: 'Usage',
  import: 'Import',
  settings: 'Settings',
  design: 'Design system',
} as const;

export type ViewId = keyof typeof VIEW_LABELS;
export const VIEW_IDS = Object.keys(VIEW_LABELS) as ViewId[];

/** Renderer-only actions, reported through `usage:action`. */
export const UI_ACTIONS = {
  'ui:search': 'Transactions: search',
  'ui:filter': 'Transactions: money in/out filter',
  'ui:open-editor': 'Transactions: open editor',
  'ui:chart-mode': 'Chart: bars/line toggle',
} as const;

export type UiActionId = keyof typeof UI_ACTIONS;
export const UI_ACTION_IDS = Object.keys(UI_ACTIONS) as [UiActionId, ...UiActionId[]];

const CHANNELS: Record<string, ReadonlyArray<readonly [string, string]>> = {
  Setup: [
    ['setup:status', 'Setup: status'],
    ['setup:saveCredentials', 'Setup: save credentials'],
    ['credentials:update', 'Credentials: update'],
    ['link:start', 'Link: start'],
    ['link:complete', 'Link: complete'],
    ['institutions:list', 'Institutions: list'],
    ['institutions:disconnect', 'Institutions: disconnect'],
    ['institutions:reauth', 'Institutions: reconnect'],
    ['accounts:setEveryday', 'Accounts: set day-to-day'],
  ],
  Money: [
    ['dashboard:get', 'Dashboard: load'],
    ['breakdown:byCategory', 'Breakdown: by category'],
    ['breakdown:byMerchant', 'Breakdown: by merchant'],
    ['transactions:query', 'Transactions: list'],
    ['transactions:update', 'Transactions: edit'],
    ['trends:overTime', 'Trends: over time'],
    ['income:list', 'Income: list'],
    ['income:confirm', 'Income: confirm'],
    ['income:override', 'Income: override'],
    ['income:add', 'Income: add'],
    ['income:clearOverride', 'Income: clear override'],
    ['income:history', 'Income: six-month history'],
  ],
  Corrections: [
    ['review:queue', 'Review: queue'],
    ['review:recategorize', 'Review: recategorize'],
    ['review:applyRetroactive', 'Review: apply to past'],
    ['review:dismissFlag', 'Review: dismiss flag'],
    ['categories:list', 'Categories: list'],
    ['categories:create', 'Categories: create'],
    ['categories:rename', 'Categories: rename'],
    ['categories:merge', 'Categories: merge'],
    ['categories:setHidden', 'Categories: hide'],
    ['categories:delete', 'Categories: delete'],
    ['merchants:rename', 'Merchants: rename'],
    ['overrides:list', 'Rules: list overrides'],
    ['overrides:clear', 'Rules: clear override'],
    ['rules:list', 'Rules: list'],
    ['rules:update', 'Rules: edit'],
    ['rules:delete', 'Rules: delete'],
  ],
  Recurring: [
    ['recurring:list', 'Recurring: list'],
    ['recurring:acknowledge', 'Recurring: acknowledge'],
    ['recurring:markNotRecurring', 'Recurring: mark not recurring'],
    ['recurring:candidates', 'Recurring: candidates'],
    ['recurring:decide', 'Recurring: decide'],
  ],
  'Alerts and reports': [
    ['alerts:list', 'Alerts: list'],
    ['alerts:dismiss', 'Alerts: dismiss'],
    ['alertRules:list', 'Alert rules: list'],
    ['alertRules:update', 'Alert rules: edit'],
    ['alertRules:create', 'Alert rules: create'],
    ['alertRules:delete', 'Alert rules: delete'],
    ['reports:list', 'Reports: list'],
    ['reports:get', 'Reports: open'],
    ['reports:generate', 'Reports: generate'],
    ['reports:delete', 'Reports: delete'],
    ['reports:exportPdf', 'Reports: save as PDF'],
  ],
  'Data and settings': [
    ['health:get', 'Health: load'],
    ['diagnostics:export', 'Diagnostics: export'],
    ['settings:get', 'Settings: load'],
    ['settings:update', 'Settings: save'],
    ['models:listOllama', 'Models: list Ollama'],
    ['setup:detectOllama', 'Setup: detect Ollama'],
    ['data:export', 'Data: back up'],
    ['data:import', 'Data: restore'],
    ['data:deleteAll', 'Data: erase everything'],
    ['analysis:refresh', 'Analysis: refresh'],
    ['sync:now', 'Sync: now'],
    ['model:status', 'Model: status'],
    ['model:test', 'Model: test'],
    ['categorization:rerun', 'Categorization: rerun'],
    ['categorization:cancel', 'Categorization: cancel'],
  ],
};

const BACKGROUND_JOBS: ReadonlyArray<readonly [string, string]> = [
  ['job:sync', 'Background: sync'],
  ['job:catch-up', 'Background: launch catch-up'],
  ['job:alerts', 'Background: alert evaluation'],
  ['job:analysis', 'Background: analysis refresh'],
  ['job:reports', 'Background: scheduled reports'],
  ['job:update-check', 'Background: update check'],
];

export const FEATURES: readonly Feature[] = [
  ...Object.entries(CHANNELS).flatMap(([group, entries]) =>
    entries.map(([id, label]): Feature => ({ id, label, group, kind: 'action' })),
  ),
  ...VIEW_IDS.map((id): Feature => ({ id: `view:${id}`, label: VIEW_LABELS[id], group: 'Screens', kind: 'view' })),
  ...Object.entries(UI_ACTIONS).map(
    ([id, label]): Feature => ({ id, label, group: 'Screen actions', kind: 'action' }),
  ),
  ...BACKGROUND_JOBS.map(([id, label]): Feature => ({ id, label, group: 'Background', kind: 'background' })),
];

const BY_ID = new Map(FEATURES.map((feature) => [feature.id, feature]));

export const isFeature = (id: string): boolean => BY_ID.has(id);

export const featureLabel = (id: string): string => BY_ID.get(id)?.label ?? id;
