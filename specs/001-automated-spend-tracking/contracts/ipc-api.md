# Contract: Renderer ↔ Main IPC Surface

The renderer is untrusted UI. It has **no Node integration**, runs with `contextIsolation: true`, and reaches the main process only through the channels below, exposed via `contextBridge` in the preload script. Every payload is validated with a Zod schema **on the main side** — the renderer's types are a convenience, not a trust boundary.

**Invariants**
- No Plaid `access_token`, Plaid `secret`, or Anthropic API key is ever sent to the renderer. Settings reads return presence booleans (`{ plaidConfigured: true }`), never values.
- All amounts cross the boundary as **integer minor units**. Formatting is a renderer concern.
- Every response that contains a total also carries `dataComplete: boolean` and `staleInstitutions: string[]`, so no view can render a total without knowing whether it is qualified (FR-009, SC-014).

---

## Request/response channels (`ipcRenderer.invoke`)

### Setup & accounts
| Channel | Request | Response | Requirements |
|---|---|---|---|
| `setup:status` | — | `{ plaidConfigured, categorizationConfigured, accountCount, encryptionAvailable }` | Gates first-run UI; `encryptionAvailable` false must block setup, not degrade silently (FR-054) |
| `setup:saveCredentials` | `{ plaidClientId, plaidSecret, plaidEnv, anthropicApiKey? }` | `{ ok }` | Written `safeStorage`-encrypted; never echoed back (FR-047) |
| `link:start` | — | `{ hostedLinkUrl, linkToken }` | Hosted Link (R1); renderer opens URL externally |
| `link:complete` | `{ linkToken }` | `{ institutionId, accountsAdded }` | Polls `/link/token/get`, exchanges, triggers backfill (FR-004) |
| `institutions:list` | — | `Institution[]` with `status`, `lastSyncedAt` | FR-009 |
| `institutions:disconnect` | `{ institutionId }` | `{ ok }` | FR-048 |
| `institutions:reauth` | `{ institutionId }` | `{ hostedLinkUrl }` | Re-auth without losing history |

### Reading money
| Channel | Request | Response | Requirements |
|---|---|---|---|
| `dashboard:get` | `{ periodStart, periodEnd }` | `{ balances, cashFlow, categoryBreakdown, whatChanged, dataComplete, staleInstitutions }` | FR-062, SC-019 — one call populates the first screen |
| `breakdown:byCategory` | `{ periodStart, periodEnd, groupBy }` | `{ rows: [{categoryId, name, totalMinor, txCount}], totalMinor, dataComplete }` | FR-043. **`sum(rows.totalMinor) === totalMinor` is a contract guarantee** (FR-018, SC-004) |
| `breakdown:byMerchant` | same | same shape | FR-043 |
| `transactions:query` | `{ periodStart?, periodEnd?, categoryIds?, merchantKey?, minAmount?, maxAmount?, accountIds?, confirmationStatus?, limit, offset }` | `{ rows, totalCount, dataComplete }` | FR-064; paginated for FR-068/SC-020 |
| `trends:overTime` | `{ periodStart, periodEnd, bucket, categoryIds? }` | `{ series, comparisonSeries }` | FR-065 |

### Corrections
| Channel | Request | Response | Requirements |
|---|---|---|---|
| `review:queue` | `{ limit, offset }` | `{ rows: [{transaction, guess, confidence, reasoning}], totalCount }` | FR-013, US6 AS1 — reasoning included so the guess is inspectable |
| `review:recategorize` | `{ transactionIds[], categoryId }` | `{ updated, restatedPeriods }` | Bulk by contract (FR-067). Returns which periods were restated (FR-015) |
| `review:dismissFlag` | `{ transactionIds[] }` | `{ ok }` | Accept the guess as-is |

### Recurring charges
| Channel | Request | Response | Requirements |
|---|---|---|---|
| `recurring:list` | `{ includeInactive }` | `RecurringCharge[]` with `cumulativePaidMinor`, `amountChanges` | FR-021 |
| `recurring:acknowledge` | `{ id }` | `{ ok }` | Stops repeat new-subscription notices |
| `recurring:markNotRecurring` | `{ id }` | `{ ok }` | False-positive correction (FR-025) |

### Alerts, reports, settings
| Channel | Request | Response | Requirements |
|---|---|---|---|
| `alerts:list` | `{ includeDismissed, limit }` | `Alert[]` with `eventOccurredAt` **and** `detectedAt` | FR-057 — the UI must be able to show both |
| `alerts:dismiss` | `{ alertId }` | `{ ok }` | FR-032 — dismisses the instance, never the rule |
| `alertRules:list` / `alertRules:update` | `AlertRule[]` / `{ id, threshold?, window?, enabled? }` | | FR-033 |
| `reports:list` / `reports:get` | `{ type, limit }` / `{ reportId }` | `PeriodReport[]` / `PeriodReport` | FR-035, FR-038 |
| `settings:get` / `settings:update` | — / `Partial<Settings>` | Non-secret settings only | Includes `categorizationMode`, `confidenceThreshold`, `pollIntervalMinutes` (FR-061) |
| `data:export` / `data:import` | `{ destPath }` / `{ srcPath }` | `{ ok, path }` / `{ ok, restored }` | FR-060, SC-017 |
| `data:deleteAll` | `{ confirmation }` | `{ ok }` | FR-048 |
| `sync:now` | — | `{ started }` | Manual trigger; the only caller of `/transactions/refresh` (R2) |

---

## Push channels (main → renderer, `webContents.send`)

| Channel | Payload | Purpose |
|---|---|---|
| `sync:progress` | `{ institutionId, phase, added, modified, removed }` | Live feedback during backfill and catch-up |
| `sync:complete` | `{ institutionId, dataComplete }` | Triggers view refresh |
| `alert:fired` | `Alert` | Live alert while a window is open |
| `catchup:summary` | `{ alertCount, transactionCount, reportsGenerated, sinceLastRun }` | The "while you were away" digest (FR-031, backlog-burst edge case) |
| `institution:statusChanged` | `{ institutionId, status }` | Surfaces `reauth_required` immediately (FR-009) |

---

## Error contract

Every `invoke` rejects with `{ code, message, recoverable, action? }`.

`code` ∈ `ENCRYPTION_UNAVAILABLE` | `PLAID_REAUTH_REQUIRED` | `PLAID_RATE_LIMITED` | `PLAID_UNCONFIGURED` | `CATEGORIZATION_UNAVAILABLE` | `NETWORK_UNAVAILABLE` | `DB_LOCKED` | `VALIDATION_FAILED` | `INTERNAL`.

**`NETWORK_UNAVAILABLE` and `CATEGORIZATION_UNAVAILABLE` must never fail a read.** All read channels serve stored data offline with `dataComplete: false` (FR-059, SC-015). Only sync and categorization paths may fail on connectivity.
