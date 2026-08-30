---
description: "Task list for Automated Spend Tracking & Awareness"
---

# Tasks: Automated Spend Tracking & Awareness

**Input**: Design documents from `/specs/001-automated-spend-tracking/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md, `.specify/memory/constitution.md` (v1.1.0)

**Revision**: Phase 2 rescoped after `/speckit-analyze` — Plaid cost is no longer a gate (research.md R3 corrected). Nine coverage tasks added for SC-002, SC-005, SC-016, FR-017, FR-022, FR-049, FR-050.

**Tests**: **MANDATORY, not optional.** Constitution Principle V (Test-Driven Development) is NON-NEGOTIABLE and supersedes the tasks template's "tests are optional" default. Every implementation task is preceded by a failing test. Coverage gate is 80% on statements, branches, functions, and lines; no new production file ships untested.

**Organization**: Tasks are grouped by user story so each can be implemented, tested, and delivered independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US6)
- Exact file paths are included in every task

## Path Conventions

Single Electron application. Source under `src/` (`main/`, `preload/`, `renderer/`, `shared/`), tests under `tests/` (`unit/`, `integration/`, `e2e/`), decision records under `docs/adr/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization. Nothing here touches financial data.

- [X] T001 Initialize npm project and create the directory structure from plan.md in `src/main/`, `src/preload/`, `src/renderer/`, `src/shared/`, `tests/unit/`, `tests/integration/`, `tests/e2e/`, `docs/adr/`
- [X] T002 Install and pin exact dependency versions from plan.md in `package.json`: electron 44.0.0, react 19.2.8, electron-vite 5.0.0, vite 8.2.2, tailwindcss 4.3.3, recharts 3.10.1, better-sqlite3-multiple-ciphers 13.0.3, drizzle-orm 0.45.2, plaid 46.0.0, @anthropic-ai/sdk 0.122.0, zod 4.5.4, cron 4.4.0, date-fns 4.4.0, lucide-react, electron-builder 26.15.3
- [X] T003 [P] Configure `electron.vite.config.ts` with the main/preload/renderer three-context split and `contextIsolation: true`, `nodeIntegration: false`
- [X] T004 [P] Configure TypeScript strict mode in `tsconfig.json` and path aliases for `src/shared`
- [X] T005 [P] Configure ESLint and Prettier in `eslint.config.js`; add `npm run lint` script that must exit 0 (Constitution XII)
- [X] T006 [P] Configure Vitest in `vitest.config.ts` with **80% thresholds on statements, branches, functions, and lines** as hard failures (Constitution V)
- [X] T007 [P] Configure Playwright in `playwright.config.ts` to drive the packaged Electron app
- [X] T008 [P] Configure `electron-builder.yml` for macOS and Windows targets
- [X] T009 [P] Add `.gitignore` covering `node_modules/`, `out/`, `dist/`, `coverage/`, and any local database or diagnostic export artifacts

---

## Phase 2: Validation Gates (BLOCKING — external risk first)

**Purpose**: Prove the two assumptions the project rests on. Plaid cost is **no longer a gate** — the free Trial plan covers this scale (research.md R3, corrected). What remains is institution support and the encryption guarantee.

**⚠️ If T012 shows the user's institutions are unsupported, stop and reassess.**

- [X] T010 Plaid account access confirmed by the user; free **Trial plan** covers this scale (10 Production Items, Transactions included — research.md R3)
- [X] T011 Configure Sandbox credentials for all development and document setup in `docs/plaid-setup.md`. **All development runs against Sandbox** — the 10-Item Trial cap is a lifetime create limit and re-linking permanently burns quota
- [ ] T012 Verify every institution the user banks with appears in Plaid's supported institution list; record results in `docs/adr/0003-plaid-viability.md`
- [ ] T013 Confirm Trial plan eligibility (US/Canada teams created on or after 2026-04-15); record in `docs/adr/0003-plaid-viability.md`
- [X] T014 Add a Production Item creation log to `docs/plaid-setup.md` so the lifetime 10-Item quota is tracked deliberately
- [X] T015 Write failing test asserting `safeStorage.isEncryptionAvailable()` is checked after `app.ready` and that startup aborts when unavailable, in `tests/unit/secrets/availability.test.ts`
- [X] T016 Implement the encryption availability gate in `src/main/secrets/availability.ts` — **fail loudly with an explanation; never fall back to an unencrypted database** (FR-054, Constitution VII)
- [X] T017 Write failing test for database-key generation and `safeStorage` async round-trip in `tests/unit/secrets/keyring.test.ts`
- [X] T018 Implement `src/main/secrets/keyring.ts` using `encryptStringAsync`/`decryptStringAsync` (the sync API may be deprecated; research.md R5)
- [X] T019 Write integration test asserting the database file on disk is **not** readable by an unencrypted SQLite client, in `tests/integration/encryption.test.ts` (quickstart V0)

---

## Phase 3: Foundational (Blocking Prerequisites)

**Purpose**: Retrofit-hostile infrastructure. The clock, money module, and redacted logger must exist before any code that uses them, or the test suite gets rewritten later.

**⚠️ No user story may begin until this phase is complete.**

- [X] T020 [P] Write failing tests for integer minor-unit arithmetic, parsing, and formatting — including rounding and negative amounts — in `tests/unit/shared/money.test.ts`
- [X] T021 Implement `src/shared/money.ts` with integer minor-unit arithmetic. **Floating-point money arithmetic is forbidden** (Constitution II)
- [X] T022 [P] Write failing tests for the injectable clock abstraction in `tests/unit/shared/clock.test.ts`
- [X] T023 Implement `src/shared/clock.ts` with a real and a controllable test implementation. **Every time-dependent module takes this as a dependency** (Constitution V)
- [X] T024 [P] Write failing tests for period-boundary math in the user's local timezone in `tests/unit/shared/periods.test.ts`
- [X] T025 Implement `src/shared/periods.ts` for week/month boundary computation using date-fns
- [X] T026 Write failing tests asserting the diagnostic logger **cannot** accept merchant names, amounts, balances, or credentials, in `tests/unit/diagnostics/redaction.test.ts` (FR-091)
- [X] T027 Implement `src/main/diagnostics/logger.ts` accepting only enumerated event types and opaque identifiers — **redaction enforced at write time, not export time** (research.md R15)
- [X] T028 Implement log rotation bounded by size and age in `src/main/diagnostics/rotation.ts` (FR-093)
- [X] T029 Implement failure isolation in `src/main/diagnostics/logger.ts` so a logging failure is swallowed and counted, never propagated (FR-094)
- [X] T030 [P] Define the complete Drizzle schema for all 15 tables from data-model.md in `src/main/db/schema.ts`
- [X] T031 Implement the SQLCipher database client in `src/main/db/client.ts` using better-sqlite3-multiple-ciphers keyed from `src/main/secrets/keyring.ts`
- [X] T032 Generate and commit the initial migration in `src/main/db/migrations/`; implement the migration runner in `src/main/db/migrate.ts`
- [X] T033 [P] Define shared cross-boundary types in `src/shared/types.ts` per contracts/ipc-api.md
- [X] T034 [P] Define Zod schemas for every IPC channel payload in `src/shared/schemas.ts`
- [X] T035 Implement the IPC registration skeleton in `src/main/ipc/index.ts` with **main-side Zod validation on every channel** and the `{code, message, recoverable, action}` error contract
- [X] T036 Implement the `contextBridge` surface in `src/preload/index.ts` exposing only the documented channels
- [X] T037 Write failing test asserting no secret value is reachable from the renderer and that `settings:get` returns presence booleans only, in `tests/unit/ipc/secret-isolation.test.ts` (FR-047, quickstart V15)
- [X] T038 Implement Electron app lifecycle in `src/main/index.ts`: single-instance lock, tray residency, `app.setLoginItemSettings` for launch-at-login (FR-056, research.md R6)
- [X] T039 [P] Set up Tailwind and the base renderer shell in `src/renderer/main.tsx` and `src/renderer/App.tsx`
- [X] T040 [P] Write ADR `docs/adr/0001-sqlcipher-driver-exception.md` recording the single-publisher adoption, health evidence, and migration trigger (Constitution III, XI; research.md R9)
- [X] T041 [P] Write ADR `docs/adr/0002-plaid-client-secret-on-device.md` recording the accepted deviation, blast radius, and what it forecloses (research.md R10)
- [X] T042 [P] Write ADR `docs/adr/0004-polling-over-webhooks.md` recording the trade and its consequences for alert latency (research.md R2, R6)

---

## Phase 4: User Story 1 — Zero-input capture and categorization (Priority: P1) 🎯 MVP

**Goal**: Every transaction from every connected account is captured and categorized with no user action, and viewable as a category breakdown.

**Independent test**: Connect accounts, let transactions accrue with zero interaction, verify the breakdown matches independently reconciled ground truth (quickstart V2–V6, V20).

### Tests for User Story 1 (MANDATORY — write first, must fail)

- [X] T043 [P] [US1] Write failing tests for Hosted Link token creation and `/link/token/get` polling in `tests/unit/plaid/link.test.ts`
- [X] T044 [P] [US1] Write failing tests for the `/transactions/sync` cursor loop — pagination, cursor persistence, and crash-mid-sync resumption — in `tests/unit/plaid/sync.test.ts`
- [X] T045 [P] [US1] Write failing tests for `added`/`modified`/`removed` application, asserting exactly-once ingestion and in-place update, in `tests/unit/ingestion/apply.test.ts` (quickstart V3)
- [X] T046 [P] [US1] Write failing tests for internal-transfer and refund/reversal detection in `tests/unit/ingestion/exclusions.test.ts` (FR-007, FR-008)
- [X] T047 [P] [US1] Write failing tests for foreign-currency handling asserting settled amount is authoritative and `original_amount` never enters a sum, in `tests/unit/ingestion/currency.test.ts` (quickstart V20)
- [X] T048 [P] [US1] Write failing tests for the local merchant-history classifier in `tests/unit/categorization/local.test.ts`
- [X] T049 [P] [US1] Write failing tests for the model fallback, asserting structured output parsing and that **ingestion still succeeds when categorization fails**, in `tests/unit/categorization/model.test.ts`
- [X] T050 [P] [US1] Write failing tests for the two-stage pipeline asserting confirmed merchants resolve locally **with no API call**, in `tests/unit/categorization/pipeline.test.ts` (quickstart V6)
- [X] T051 [P] [US1] Write failing test asserting category totals reconcile exactly to transaction totals for any range, in `tests/unit/analysis/reconciliation.test.ts` (FR-018, SC-004, quickstart V4)
- [X] T052 [P] [US1] Write failing tests for the category taxonomy — one-level nesting enforcement, rename by stable id, merge, hide — in `tests/unit/categories/taxonomy.test.ts` (quickstart V19)
- [ ] T053 [P] [US1] Write failing integration test for the full Sandbox sync path in `tests/integration/plaid-sync.test.ts`
- [X] T053a [P] [US1] Build a labeled transaction fixture corpus with known-correct categories in `tests/fixtures/categorization-corpus.ts`, spanning unambiguous merchants, mixed-use merchants, and generic descriptors
- [X] T053b [P] [US1] Write failing test asserting hands-off categorization accuracy **meets 94%** against the labeled corpus, in `tests/unit/categorization/accuracy.test.ts` (SC-002) — this is the product's central quality bar and must be measurable, not assumed
- [X] T053c [P] [US1] Write failing test asserting the system keeps operating and reporting on best-guess categories when the review queue is never opened, in `tests/unit/categorization/unreviewed.test.ts` (FR-017)

### Implementation for User Story 1

- [X] T054 [US1] Implement the Plaid client wrapper and credential loading in `src/main/plaid/client.ts`
- [X] T055 [US1] Implement Hosted Link flow — `/link/token/create` without `redirect_uri`, then `/link/token/get` polling — in `src/main/plaid/link.ts` (research.md R1)
- [X] T056 [US1] Implement `/item/public_token/exchange` and encrypted `access_token` persistence in `src/main/plaid/link.ts`
- [X] T057 [US1] Implement the `/transactions/sync` cursor loop in `src/main/plaid/sync.ts`, persisting the cursor **in the same database transaction as the data it describes**
- [X] T058 [US1] Implement `added`/`modified`/`removed` application in `src/main/ingestion/apply.ts` — insert keyed on `plaid_transaction_id`, update in place, mark removed without deleting
- [X] T059 [US1] Implement internal-transfer detection in `src/main/ingestion/transfers.ts` (FR-007)
- [X] T060 [US1] Implement refund and reversal linkage in `src/main/ingestion/reversals.ts` (FR-008)
- [X] T061 [US1] Implement foreign-currency metadata capture in `src/main/ingestion/currency.ts` — settled amount authoritative, original display-only (FR-084–FR-086)
- [X] T062 [US1] Implement historical backfill on first connection in `src/main/plaid/backfill.ts` (FR-004)
- [X] T063 [US1] Seed the curated default category taxonomy in `src/main/db/seed-categories.ts` (FR-078)
- [X] T064 [US1] Implement category management — create with nesting check, rename, merge with restatement, hide — in `src/main/categories/manage.ts` (FR-079–FR-083)
- [X] T065 [US1] Implement the merchant-profile store and local classifier in `src/main/categorization/local.ts` (data-model.md `merchant_profiles`)
- [X] T066 [US1] Implement the Claude fallback in `src/main/categorization/model.ts` using `output_config.format` structured outputs, adaptive thinking, and prompt caching on the taxonomy prefix. **Never send `budget_tokens`** (contracts/external-services.md)
- [X] T067 [US1] Implement the two-stage pipeline with confidence threshold and review flagging in `src/main/categorization/pipeline.ts` (FR-010–FR-013)
- [X] T068 [US1] Implement `local_only` categorization mode as a settings-driven skip of the model stage in `src/main/categorization/pipeline.ts` (FR-061)
- [X] T069 [US1] Implement the single canonical spending predicate (excludes removed, excludes transfers, nets reversals) in `src/main/analysis/spending.ts` — **this must live in exactly one place** (Constitution II)
- [X] T070 [US1] Implement category and merchant breakdown queries in `src/main/analysis/breakdown.ts` (FR-043)
- [X] T071 [US1] Implement IPC handlers for `setup:*`, `link:*`, `institutions:*`, `dashboard:get`, `breakdown:*`, `transactions:query`, `categories:*`, `sync:now` in `src/main/ipc/handlers/`
- [X] T072 [P] [US1] Build the first-run setup view in `src/renderer/views/Setup.tsx` — credentials, environment, Hosted Link launch
- [X] T073 [P] [US1] Build the dashboard view in `src/renderer/views/Dashboard.tsx` — balances, cash flow, category breakdown, what changed (FR-062, SC-019)
- [X] T074 [P] [US1] Build the transaction register with search and filters in `src/renderer/views/Register.tsx` (FR-064)
- [X] T075 [P] [US1] Build category management UI in `src/renderer/views/Categories.tsx` (FR-079–FR-082)
- [X] T076 [US1] Implement drill-down from any figure to underlying transactions in `src/renderer/components/DrillDown.tsx` — **≤2 interactions** (FR-063, SC-018)

**Checkpoint**: MVP complete. Quickstart V2–V6 and V19–V20 pass.

---

## Phase 5: User Story 2 — Recurring charge ledger (Priority: P2)

**Goal**: Every recurring charge is identified and presented with cadence, amount, first-seen date, and cumulative total.

**Independent test**: Fixture with monthly/quarterly/annual charges plus decoy irregular repeats — all recurring detected, no decoy listed (quickstart V7).

### Tests for User Story 2 (MANDATORY — write first, must fail)

- [X] T077 [P] [US2] Write failing tests for the shared cadence detector across monthly, quarterly, annual, and weekly patterns in `tests/unit/analysis/cadence.test.ts`
- [X] T078 [P] [US2] Write failing tests asserting irregular repeat purchases are **not** classified as recurring in `tests/unit/analysis/recurring-negative.test.ts` (FR-025)
- [X] T079 [P] [US2] Write failing tests for amount-change detection and inactive marking in `tests/unit/analysis/recurring-lifecycle.test.ts` (FR-023, FR-024)

### Implementation for User Story 2

- [X] T080 [US2] Implement the shared cadence detector in `src/main/analysis/cadence.ts` as a **pure function over passed-in transactions** (Constitution XIII)
- [X] T081 [US2] Implement recurring-charge detection and ledger construction in `src/main/analysis/recurring.ts` (FR-019–FR-021)
- [X] T082 [US2] Implement amount-change tracking and inactive marking in `src/main/analysis/recurring.ts` (FR-023, FR-024)
- [X] T082a [US2] Write failing test asserting a newly detected recurring charge notifies the user exactly once and respects `user_acknowledged`, in `tests/unit/analysis/recurring-notify.test.ts` (FR-022)
- [X] T082b [US2] Implement new-recurring-charge notification in `src/main/analysis/recurring.ts`, delivered via `src/main/notifications/deliver.ts` (FR-022)
- [X] T083 [US2] Implement IPC handlers for `recurring:list`, `recurring:acknowledge`, `recurring:markNotRecurring` in `src/main/ipc/handlers/recurring.ts`
- [X] T084 [US2] Build the recurring-charge ledger view in `src/renderer/views/Recurring.tsx` with cumulative totals and amount history

**Checkpoint**: Quickstart V7 passes. The highest value-per-effort insight is now live.

---

## Phase 6: User Story 3 — Alerts and income detection (Priority: P3)

**Goal**: Threshold, duplicate, and balance-shortfall alerts fire promptly, exactly once, and survive downtime.

**Independent test**: Trigger fixture with near-misses under every threshold — exactly the expected alerts fire, once (quickstart V8, V9, V17).

### Tests for User Story 3 (MANDATORY — write first, must fail)

- [X] T085 [P] [US3] Write failing tests for income detection against credit-direction transactions, including decoy irregular credits, in `tests/unit/analysis/income.test.ts`
- [X] T086 [P] [US3] Write failing test asserting the balance projection is **withheld** when no income is detected or confidence is low, in `tests/unit/analysis/projection.test.ts` (FR-073)
- [X] T087 [P] [US3] Write failing tests for each alert rule with near-miss boundary cases in `tests/unit/analysis/alerts.test.ts`
- [X] T088 [P] [US3] Write failing test asserting `dedupe_key` prevents duplicate alerts on re-ingestion and when one event satisfies multiple triggers, in `tests/unit/analysis/alert-dedupe.test.ts` (FR-031)
- [X] T089 [P] [US3] Write failing tests for downtime catch-up — backlog alerts carry true event time and collapse above threshold — in `tests/unit/scheduler/catchup.test.ts` (quickstart V9)

### Implementation for User Story 3

- [X] T090 [US3] Implement income detection reusing `src/main/analysis/cadence.ts` against credit-direction transactions in `src/main/analysis/income.ts` (FR-069, FR-070)
- [X] T091 [US3] Implement income confirmation and override with re-derivation suppression in `src/main/analysis/income.ts` (FR-071, FR-072)
- [X] T092 [US3] Implement balance-forward projection with confidence-gated withholding in `src/main/analysis/projection.ts` (FR-029, FR-073)
- [X] T093 [US3] Implement alert rule evaluation for all five types in `src/main/analysis/alerts.ts` as pure functions (FR-026–FR-029)
- [X] T094 [US3] Implement the `dedupe_key` unique-index enforcement in `src/main/analysis/alerts.ts` — **suppression is a database constraint, not application logic a catch-up path can bypass** (FR-031)
- [X] T095 [US3] Implement false-positive dismissal that does not disable the rule in `src/main/analysis/alerts.ts` (FR-032)
- [X] T096 [US3] Implement native notification delivery with a retained-undelivered queue in `src/main/notifications/deliver.ts` (FR-030, FR-034)
- [X] T097 [US3] Implement the scheduler with cron cadence plus **on-launch catch-up reconciliation** in `src/main/scheduler/index.ts` (FR-056, FR-058, research.md R6)
- [X] T098 [US3] Implement backlog-burst collapse into a single "while you were away" summary in `src/main/scheduler/catchup.ts` (FR-031, FR-057)
- [X] T099 [US3] Implement IPC handlers for `income:*`, `alerts:*`, `alertRules:*` in `src/main/ipc/handlers/`
- [X] T100 [P] [US3] Build the income view with confirm and override in `src/renderer/views/Income.tsx`
- [X] T101 [P] [US3] Build alert history and rule configuration in `src/renderer/views/Alerts.tsx` (FR-033)

**Checkpoint**: Quickstart V8, V9, V17 pass. Downtime no longer loses alerts.

---

## Phase 7: User Story 4 — Weekly digest (Priority: P4)

**Goal**: An unprompted weekly digest naming categories that deviated from the user's own baseline, with an end-of-month projection.

**Independent test**: Against fixed history, every stated deviation and projection is reproducible from source data (quickstart V12).

### Tests for User Story 4 (MANDATORY — write first, must fail)

- [X] T102 [P] [US4] Write failing tests for baseline computation and the `is_sufficient` gate in `tests/unit/analysis/baselines.test.ts`
- [X] T103 [P] [US4] Write failing test asserting **no deviation claim is made** when history is insufficient, in `tests/unit/analysis/baselines-insufficient.test.ts` (FR-040, Constitution IX)
- [X] T104 [P] [US4] Write failing tests for digest generation including the empty-week case in `tests/unit/analysis/digest.test.ts`

### Implementation for User Story 4

- [X] T105 [US4] Implement personal baseline computation with the sufficiency gate in `src/main/analysis/baselines.ts` (FR-036, FR-039, FR-040)
- [X] T106 [US4] Implement weekly digest generation in `src/main/analysis/digest.ts`, stating each projection's assumption (FR-035–FR-037, FR-041)
- [X] T107 [US4] Wire digest generation into the scheduler with missed-run generation on launch in `src/main/scheduler/index.ts` (FR-058)
- [X] T108 [US4] Implement `data_complete` qualification on digests when any institution was stale during the period in `src/main/analysis/digest.ts` (FR-009, SC-014)

**Checkpoint**: Quickstart V12 passes.

---

## Phase 8: User Story 5 — Monthly report (Priority: P5)

**Goal**: A comprehensive monthly report delivered without request, readable in ten minutes.

**Independent test**: Every figure independently reproducible from transaction data (quickstart V13).

### Tests for User Story 5 (MANDATORY — write first, must fail)

- [X] T109 [P] [US5] Write failing tests for savings rate, month-over-month comparison, and annual projection in `tests/unit/analysis/report.test.ts`
- [X] T110 [P] [US5] Write failing test asserting all derived data recomputes byte-identically from scratch in `tests/unit/analysis/recompute.test.ts` (SC-010, quickstart V13)

### Implementation for User Story 5

- [X] T111 [US5] Implement monthly report generation in `src/main/analysis/reports.ts` covering income, spending, category comparison, trend, largest purchases, recurring audit, savings rate, annual projection (FR-038)
- [X] T112 [US5] Implement report regeneration when late-arriving transactions affect a closed period in `src/main/analysis/reports.ts` (FR-042)
- [X] T113 [US5] Implement IPC handlers for `reports:list` and `reports:get` in `src/main/ipc/handlers/reports.ts`
- [X] T114 [P] [US5] Build the reports view in `src/renderer/views/Reports.tsx`
- [X] T115 [P] [US5] Build spending-over-time charts in `src/renderer/charts/` using Recharts. **Load the `dataviz` skill before writing chart code** (FR-065)

**Checkpoint**: Quickstart V13 passes. Product is feature-complete against the source article.

---

## Phase 9: User Story 6 — Review queue and corrections (Priority: P6)

**Goal**: Flagged transactions are resolvable in bulk, and a correction stays corrected.

**Independent test**: Correct a flagged transaction; a later comparable transaction categorizes per the correction with no API call, and prior totals restate (quickstart V6, V18).

### Tests for User Story 6 (MANDATORY — write first, must fail)

- [X] T116 [P] [US6] Write failing tests for the correction chain — new categorization supersedes, history preserved — in `tests/unit/categorization/corrections.test.ts`
- [X] T117 [P] [US6] Write failing test asserting a retroactive pass reports its count **before** applying and changes nothing until confirmed, in `tests/unit/categorization/retroactive.test.ts` (FR-074, FR-075)
- [X] T118 [P] [US6] Write failing test asserting a retroactive pass **never overwrites** a prior user-confirmed categorization, in `tests/unit/categorization/retroactive-precedence.test.ts` (FR-076)
- [X] T119 [P] [US6] Write failing test for restatement of all affected periods after correction in `tests/unit/analysis/restatement.test.ts` (FR-015, FR-077)

### Implementation for User Story 6

- [X] T120 [US6] Implement the review queue query in `src/main/categorization/review.ts`, returning guess, confidence, and reasoning (FR-013, US6 AS1)
- [X] T121 [US6] Implement bulk recategorization in `src/main/categorization/corrections.ts` (FR-014, FR-067)
- [X] T122 [US6] Implement retroactive-candidate counting and the separate confirmed apply path in `src/main/categorization/retroactive.ts` (FR-074–FR-076)
- [X] T123 [US6] Implement full restatement of derived data after any correction in `src/main/analysis/restate.ts` (FR-015, FR-077)
- [X] T124 [US6] Implement merchant-profile updating so corrections deterministically drive future categorization in `src/main/categorization/local.ts` (FR-016)
- [X] T125 [US6] Implement IPC handlers for `review:*` in `src/main/ipc/handlers/review.ts`
- [X] T126 [US6] Build the review queue view with bulk selection and the retroactive confirmation prompt in `src/renderer/views/Review.tsx` (FR-067, FR-074)

**Checkpoint**: All six user stories complete. Quickstart V18 passes.

---

## Phase 10: Diagnostics & System Health (Cross-Cutting)

**Purpose**: FR-087–FR-094. Depends on the Foundation logger; independent of all user stories.

- [X] T127 [P] Write failing test asserting a generated export contains **zero** known fixture merchant names, amounts, balances, or credentials, in `tests/unit/diagnostics/export-scan.test.ts` (SC-023, quickstart V21)
- [X] T128 [P] Write failing tests for persistent-failure threshold notification in `tests/unit/diagnostics/health.test.ts` (FR-092, SC-022)
- [X] T129 Implement operational metrics collection — sync duration, categorization latency, local-vs-model resolution rate, job outcomes — in `src/main/diagnostics/metrics.ts` (FR-089)
- [X] T130 Implement the health aggregation query in `src/main/diagnostics/health.ts` (FR-088)
- [X] T131 Implement persistent-failure detection and notification in `src/main/diagnostics/health.ts` (FR-092)
- [X] T132 Implement diagnostic export in `src/main/diagnostics/export.ts` (FR-090)
- [X] T133 Implement IPC handlers for `health:get` and `diagnostics:export` in `src/main/ipc/handlers/diagnostics.ts`
- [X] T134 Build the system health view in `src/renderer/views/Health.tsx` showing per-account status, last successful sync, and recent failures

**Checkpoint**: Quickstart V21, V22 pass.

---

## Phase 11: Polish & Cross-Cutting Concerns

- [X] T135 [P] Write failing tests for offline read behavior across every view in `tests/unit/ipc/offline.test.ts` (FR-059, SC-015)
- [X] T136 Implement offline read guarantees — `NETWORK_UNAVAILABLE` never fails a read; all reads serve stored data with `dataComplete: false` (contracts/ipc-api.md)
- [X] T137 [P] Write failing tests for stale-institution qualification on every total-bearing response in `tests/unit/analysis/staleness.test.ts` (quickstart V11)
- [X] T138 Implement institution status detection, `ITEM_LOGIN_REQUIRED` handling, and re-auth without history loss in `src/main/plaid/health.ts` (FR-009)
- [X] T139 [P] Write failing test for backup export/restore round-trip onto a clean install in `tests/integration/backup.test.ts` (SC-017, quickstart V14)
- [X] T140 Implement data export, import, and delete-all in `src/main/data/backup.ts` (FR-048, FR-060)
- [X] T140a [P] Write failing test asserting transaction history is retained for at least 24 months and that no pruning removes data inside that window, in `tests/unit/data/retention.test.ts` (FR-050)
- [X] T140b Implement the retention policy in `src/main/data/retention.ts` (FR-050)
- [X] T141 Implement settings management including confidence threshold, poll interval, categorization mode, and schedules in `src/main/settings/index.ts`
- [X] T142 [P] Build the settings view in `src/renderer/views/Settings.tsx`, including the FR-061 disclosure of exactly what is transmitted for categorization
- [X] T143 [P] Write E2E test for first-run setup through first successful sync in `tests/e2e/setup.spec.ts`, asserting completion within the 30-minute target (SC-009)
- [X] T144 [P] Write E2E test for dashboard drill-down in ≤2 interactions in `tests/e2e/drilldown.spec.ts` (SC-018)
- [X] T145 [P] Write E2E test for the review queue and retroactive correction flow in `tests/e2e/review.spec.ts`
- [X] T146 Write performance test asserting navigation and filtering across a 24-month, ~10k-transaction fixture stays responsive in `tests/integration/performance.test.ts` (SC-020)
- [X] T146a Write an egress audit asserting the **only** outbound payload fields are those disclosed under FR-061, and that no transaction data reaches any third-party server beyond that, in `tests/integration/egress-audit.test.ts` (SC-016, Constitution VII)
- [X] T146b Write a static assertion that no money-movement Plaid endpoint (transfer, payment_initiation, or any write operation) is referenced anywhere in `src/`, in `tests/unit/plaid/read-only.test.ts` (FR-049)
- [X] T146c Write a test asserting recurring-charge detection meets 95% recall with under 10% false positives against a labeled fixture, in `tests/unit/analysis/recurring-rates.test.ts` (SC-005)
- [X] T147 Audit the renderer bundle for secrets and confirm zero hits in `tests/e2e/secret-audit.spec.ts` (FR-047, quickstart V15)
- [X] T148 Write an assertion sweep over `src/renderer/views/` confirming no manual-entry, reconciliation, or budget-allocation workflow exists, in `tests/e2e/zero-input-doctrine.spec.ts` (SC-021, Constitution VIII)
- [X] T149 Run `npx vitest run --coverage` and confirm all four metrics ≥ 80% with no file at 0% (Constitution V)
- [X] T150 Run `npm run lint` and confirm 0 errors (Constitution XII)
- [X] T151 Confirm every icon in the renderer is `lucide-react` with no emoji or unicode symbols (Constitution XIV)
- [X] T152 Update `README.md` and `docs/` to reflect the shipped implementation (Constitution X)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)** → no dependencies
- **Phase 2 (Gates)** → depends on Phase 1. **Gate A (T010–T014) is a hard project gate** — failure means reassessing the premise, not working around it
- **Phase 3 (Foundational)** → depends on Phase 2. **Blocks every user story**
- **Phase 4 (US1)** → depends on Phase 3
- **Phase 5 (US2)** → depends on US1 (needs ingested, categorized transactions)
- **Phase 6 (US3)** → depends on US1; shares the cadence detector with US2 (T080)
- **Phase 7 (US4)** → depends on US1
- **Phase 8 (US5)** → depends on US1; richer with US2 and US4 complete
- **Phase 9 (US6)** → depends on US1
- **Phase 10 (Diagnostics)** → depends on Phase 3 only; can run any time after Foundation
- **Phase 11 (Polish)** → depends on all user stories

### User Story Dependencies

All six stories depend on US1 because it produces the data every other story reads. None depend on each other. After US1, stories 2–6 can proceed in any order or concurrently.

One shared component: **T080 (cadence detector)** serves both US2 and US3. Whichever story is built first implements it; the other consumes it.

### Within Each Story

Tests → models/schema → services → IPC handlers → UI. Test tasks must fail before implementation begins (Constitution V).

### Parallel Opportunities

- **Phase 1**: T003–T009 all parallel
- **Phase 3**: T020/T022/T024 parallel; T030/T033/T034 parallel; ADRs T040–T042 fully parallel with everything
- **Phase 4**: all 11 test tasks T043–T053 parallel; UI tasks T072–T075 parallel
- **Phase 6**: test tasks T085–T089 parallel; UI T100–T101 parallel
- **Phase 10**: runs entirely in parallel with Phases 5–9
- **Phase 11**: E2E tests T143–T145 parallel

---

## Implementation Strategy

### MVP First

**Phases 1–4 only.** That delivers zero-input capture, automatic categorization, and a category breakdown — which already replaces the abandoned spreadsheet and satisfies SC-001 through SC-004. Stop here and use it before building more.

### Incremental Delivery

Each subsequent phase is independently shippable and independently valuable:

1. **US2 next, not US3.** The recurring-charge ledger produced the largest, fastest, most permanent savings in the source case for the least behavior change.
2. US3 adds protective, time-sensitive value (recoverable double charges).
3. US4 and US5 add the repetition that actually changes behavior.
4. US6 makes accuracy improve over time rather than drift.

Diagnostics (Phase 10) can slot in at any point after Foundation; do it early if sync reliability proves fiddly during US1.

### Risk Ordering

The cost risk is closed: the free Trial plan covers this scale. The surviving external risk is **institution support** (T012) — verify before building on the sync path. The operational constraint is the **lifetime 10-Item cap**: all development runs against Sandbox, and each Production Item is created deliberately and logged.

---

## Notes

- **Tests are mandatory**, not optional — Constitution Principle V overrides the template default.
- Every time-dependent module takes the injectable clock from T023. Retrofitting it means rewriting the test suite.
- Analysis modules (`cadence`, `recurring`, `income`, `baselines`, `alerts`, `reports`) are **pure functions over passed-in data** — no database, network, or clock access (Constitution XIII). This is what makes the fixture-driven scenarios testable.
- All money is integer minor units end to end (Constitution II).
- Three ADRs (T040–T042) must be written during Foundation, at decision time — Principle XI forbids writing them retroactively.
