# Implementation Plan: Automated Spend Tracking & Awareness

**Branch**: `001-automated-spend-tracking` | **Date**: 2026-08-29 (revised) | **Spec**: [spec.md](./spec.md)

**Constitution**: v1.1.0 | **Spec revision**: 94 functional requirements, 25 success criteria, 5 clarifications resolved

**Input**: Feature specification from `/specs/001-automated-spend-tracking/spec.md`

## Summary

A single-user Electron desktop application that captures every transaction from the user's connected financial accounts, categorizes it without their involvement, and turns the result into recurring-charge audits, threshold alerts, weekly digests, and monthly reports — with zero ongoing manual input.

The technical approach rests on four decisions established in [research.md](./research.md):

1. **Plaid Hosted Link** for account connection, because a desktop app cannot receive the frontend callback the standard Link flow assumes, and cannot register the `https` `redirect_uri` that Production requires.
2. **Cursor-based `/transactions/sync` polling** for ingestion. Its `added`/`modified`/`removed` semantics map directly onto the spec's exactly-once, pending-reconciliation, and reversal-netting requirements, and its cursor makes downtime catch-up the same operation as a normal sync.
3. **Local-first categorization with a hosted-model fallback.** Transactions at merchants the user has already confirmed resolve locally with no network call; only novel or ambiguous ones reach Claude. This is simultaneously the privacy answer, the cost answer, and the latency answer.
4. **SQLCipher-encrypted SQLite with the key in the OS keychain** via Electron `safeStorage`.

The governing design constraint is that all derived data — baselines, recurring charges, reports — is recomputable from transactions and categorizations. That is what makes correction-restatement, late-arriving-data handling, and "every figure is reproducible" testable properties rather than aspirations.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS (Electron 44 bundled runtime)

**Primary Dependencies**: Electron 44.0.0 · React 19.2.8 · electron-vite 5.0.0 / Vite 8.2.2 · Tailwind CSS 4.3.3 · Recharts 3.10.1 · better-sqlite3-multiple-ciphers 13.0.3 · Drizzle ORM 0.45.2 · plaid 46.0.0 · @anthropic-ai/sdk 0.122.0 · Zod 4.5.4 · date-fns 4.4.0 · electron-builder 26.15.3 · cron 4.4.0 · lucide-react

**Storage**: SQLite with SQLCipher page-level encryption, in the Electron `userData` directory. Database key generated once, `safeStorage`-encrypted (OS keychain / DPAPI / libsecret). Money stored as integer minor units throughout. No remote storage of any kind.

**Testing**: Vitest (unit, the bulk of coverage) · Playwright (E2E against the packaged app) · Plaid Sandbox for integration. Injectable clock required from the first commit.

**Target Platform**: macOS and Windows desktop. Linux is best-effort and requires a working secret service.

**Project Type**: Single-user desktop application (Electron main + preload + renderer)

**Performance Goals**: Navigation, filtering, and drill-down across a full 24-month history feel immediate with no perceptible wait (SC-020). Dashboard usable within 30 seconds of open (SC-019). Drill from any figure to underlying transactions in ≤2 interactions (SC-018).

**Constraints**: Offline-capable for all reads of stored data (FR-059). No publicly reachable endpoint (FR-055). No user financial data on any third-party server operated as part of this product (FR-053, SC-016). No secret ever reaches the renderer (FR-047). Correctness defined as complete catch-up after downtime, not uptime (FR-056).

**Scale/Scope**: One user. ~350 transactions/month, ~10 connected accounts, 24+ months retained (roughly 10k transactions at steady state). 94 functional requirements across 6 user stories.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Status: PASS**, with one recorded exception and one amendment. Evaluated against constitution **v1.1.0**.

| # | Principle | Status | How this design satisfies it |
|---|---|---|---|
| I | Source Integrity | **Pass** | Plaid and Electron behavior from official docs via Context7; model constraints from the bundled Anthropic reference; versions and health metrics from the npm registry and GitHub API. Plaid's Transactions pricing could not be verified and is recorded as unresolved rather than estimated (R3) |
| II | Financial Data Integrity | **Pass** | Integer minor units throughout (`shared/money.ts`); the single spending predicate that makes totals reconcile lives in one place; `plaid_transaction_id` unique index enforces exactly-once; all derived data recomputable; settled amount authoritative for FX (R14) |
| III | Dependency Stewardship | **Pass (amended)** | Health evidence recorded for every dependency (R7). `node-cron` → `cron` (1 → 3 publishers). `better-sqlite3-multiple-ciphers` adopted under a recorded ADR with a migration trigger (R9) |
| IV | Code Readability & Minimalism | **Pass** | Single application, no service split. One cadence detector serves both recurring charges and income (R11) rather than two implementations |
| V | Test-Driven Development | **Pass** | Injectable clock mandated from the first commit; 23 validation scenarios in `quickstart.md`; 80% coverage gate to be wired into `vitest.config.ts` during Foundation |
| VI | SOLID & YAGNI | **Pass** | No speculative extensibility. Multi-currency accounts, investments, and goals remain out of scope despite being adjacent |
| VII | Local-First Data Sovereignty | **Pass** | SQLCipher + `safeStorage`; refuse to start if encryption unavailable; secrets confined to main; diagnostics redacted at the write boundary so no unencrypted shadow copy exists (R15) |
| VIII | Zero-Input Doctrine | **Pass** | Income detection is automatic with optional confirmation (R11); corrections are forward-only by default; no manual entry, reconciliation, or allocation gate anywhere |
| IX | Honest Reporting | **Pass** | `dataComplete` on every total-bearing response; `baselines.is_sufficient` suppresses deviation claims; projections withheld when income confidence is low (FR-073); FX never converted by us |
| X | Documentation as First-Class | **Pass** | Design artifacts ship with the plan; docs required in the same PR as implementation |
| XI | Architectural Decision Records | **Action required** | Three ADRs must be written during Foundation: the SQLCipher driver exception (R9), the Plaid client-secret deviation (R10), and the polling-over-webhooks trade (R2/R6) |
| XII | Code Cleanliness | **Pass** | `npm run lint` at 0 errors as a completion gate |
| XIII | Functional Purity & Immutability | **Pass** | Analysis modules are pure functions over passed-in data — no DB, network, or clock access. This is what makes the fixture-driven scenarios in `quickstart.md` possible |
| XIV | UI Icons | **Pass** | `lucide-react` added to the dependency set; no emoji or alternative icon libraries |

### Amendment made during this plan

Principle III as originally carried over from the Terminator constitution forbade any single-npm-publisher package "regardless of fit," which put it in **direct, unresolvable conflict** with Principle VII (encryption at rest, NON-NEGOTIABLE): every encrypted-SQLite driver for Node has one npm publisher.

The rule was also unsound on its own terms — it would have rejected `better-sqlite3` (69 contributors, 10.4M weekly downloads) while accepting a package with 4% of the usage, on a metric that reflects who holds the publish token rather than who maintains the code.

Constitution amended to **v1.1.0**: Principle III now assesses community health on contributors, usage, release cadence, and responsiveness, with publisher count as one input among several, and requires the evidence to be recorded at adoption time. Full reasoning in R9.

### Post-Phase-1 re-check

Re-evaluated after data model and contracts were written. No new violations. Two design decisions were made *because* of the constitution rather than merely surviving it:

- **Diagnostics redaction moved from export-time to write-time** (R15). Filtering on export would leave merchant names and amounts on disk outside the encrypted database — passing the letter of FR-091 while violating Principle VII. The logging interface now physically cannot accept financial data.
- **Categories referenced by stable id, never by name** (R13). Required so a rename cannot silently corrupt month-over-month comparison, which Principle IX would treat as dishonest reporting.

## Project Structure

### Documentation (this feature)

```text
specs/001-automated-spend-tracking/
├── spec.md                       # Feature specification
├── plan.md                       # This file
├── research.md                   # Phase 0 — 15 decisions, 1 open external risk
├── data-model.md                 # Phase 1 — schema and invariants
├── quickstart.md                 # Phase 1 — run + 23 validation scenarios
├── contracts/
│   ├── ipc-api.md                # Renderer ↔ main IPC surface
│   └── external-services.md      # Plaid and Anthropic boundaries
├── checklists/
│   └── requirements.md           # Spec quality checklist (16/16)
└── tasks.md                      # Phase 2 — created by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── main/                         # Node context. All secrets, network, and DB access live here.
│   ├── index.ts                  # App lifecycle, tray, launch-at-login, single-instance lock
│   ├── db/
│   │   ├── client.ts             # SQLCipher connection; key via safeStorage
│   │   ├── schema.ts             # Drizzle schema
│   │   └── migrations/
│   ├── secrets/                  # safeStorage async wrapper; availability gate
│   ├── plaid/
│   │   ├── link.ts               # Hosted Link + /link/token/get polling
│   │   └── sync.ts               # /transactions/sync cursor loop
│   ├── ingestion/                # added/modified/removed application, transfer + reversal detection
│   ├── categorization/
│   │   ├── local.ts              # Merchant-history classifier — first stage, no network
│   │   ├── model.ts              # Anthropic fallback, structured outputs
│   │   └── pipeline.ts           # Two-stage orchestration, threshold, review flagging
│   ├── analysis/
│   │   ├── cadence.ts            # Shared detector — serves both recurring charges and income
│   │   ├── recurring.ts          # Recurring-charge ledger
│   │   ├── income.ts             # Income detection, confirmation, next-expected-date
│   │   ├── baselines.ts          # Personal baselines + sufficiency gate
│   │   ├── alerts.ts             # Rule evaluation, dedupe, backlog collapse
│   │   └── reports.ts            # Weekly digest, monthly report
│   ├── scheduler/                # Cron cadence + on-launch catch-up reconciliation
│   ├── diagnostics/              # Redacted-by-construction logger, metrics, rotation, export
│   ├── notifications/            # Native notifications, retained-undelivered queue
│   └── ipc/                      # Zod-validated channel handlers
├── preload/
│   └── index.ts                  # contextBridge surface — the only renderer↔main path
├── renderer/                     # No Node integration. contextIsolation on.
│   ├── views/                    # Dashboard, Register, Recurring, Income, Review, Reports, Health, Settings
│   ├── components/
│   └── charts/                   # Recharts — load the `dataviz` skill before writing these
└── shared/
    ├── types.ts                  # Shared across the boundary
    ├── schemas.ts                # Zod — validated on the main side
    └── money.ts                  # Minor-unit arithmetic and formatting

tests/
├── unit/                         # Bulk of coverage — categorization, recurring, alerts, baselines, period math
├── integration/                  # Plaid Sandbox sync loop; DB migrations
└── e2e/                          # Playwright — setup, review flow, dashboard drill-down
```

**Structure Decision**: Single Electron application with the standard three-context split (`main` / `preload` / `renderer`). This is not an architectural choice so much as what Electron's security model requires: `contextIsolation` with no Node integration in the renderer is the only configuration in which FR-047 (no secret reaches the renderer) is enforceable rather than merely intended.

Within `main`, modules are organized by pipeline stage — ingest, categorize, analyze, notify — because that is the order data actually moves and the order the user stories build on each other. `shared/money.ts` exists because mixing minor units and decimals is the most likely source of silent financial errors, and centralizing it makes that a single testable surface.

## Implementation Sequencing

The user stories are prioritized P1–P6 and independently shippable. Two gates precede them.

| Stage | Content | Gate |
|---|---|---|
| **Gate A** | Plaid viability spike (V1) | **Blocks everything.** Real account, real institutions, written pricing. If this fails, the project premise fails — find out in week one |
| **Gate B** | Encryption availability + DB key round-trip (V0) | Blocks all persistence. Must fail loudly, never degrade to plaintext |
| **Foundation** | Electron shell, schema + migrations, IPC skeleton, injectable clock, minor-unit money module, redacted logger, three ADRs | Clock, money module, and logger are retrofit-hostile — build them first |
| **US1 (P1)** | Sync loop, ingestion (incl. FX metadata), two-stage categorization, default taxonomy, category breakdown | MVP. V2–V6, V20 pass |
| **US2 (P2)** | Recurring detection and ledger | V7 passes |
| **US3 (P3)** | Income detection, alert rules, dedupe, delivery, backlog collapse | V8, V9, V17 pass |
| **US4 (P4)** | Baselines, sufficiency gate, weekly digest | V12 passes |
| **US5 (P5)** | Monthly report | V13 passes |
| **US6 (P6)** | Review queue, bulk + retroactive recategorization, restatement, category management | V6, V18, V19 pass |
| **Diagnostics** | Redacted logger, health view, metrics, export, failure notification | V21, V22 pass |
| **Cross-cutting** | Offline behavior, staleness qualification, backup/restore, interface depth | V10, V11, V14, V15, V16 |

Interface work (FR-062–FR-068) is not a final stage — each user story ships with its own view. The dashboard grows as the stories land.

## Complexity Tracking

Two deviations, both recorded and bounded. Each requires an ADR during Foundation (Principle XI).

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `better-sqlite3-multiple-ciphers` — single npm publisher (R9) | Principle VII requires encryption at rest and is NON-NEGOTIABLE. Every encrypted-SQLite driver for Node has one npm publisher, and this one is API-compatible with the driver Drizzle actually ships | `@journeyapps/sqlcipher` passes the original rule but has no Drizzle driver, forcing a hand-rolled query layer and migration runner — more code we own, cutting against Principles IV and V. `@libsql/client` has the same single-publisher property and a larger footprint. Dropping SQLCipher violates VII outright. **Migration trigger**: if the fork falls materially behind upstream or stops releasing, move to `@journeyapps/sqlcipher` and absorb the query-layer cost |
| Plaid `client_secret` stored on the client (R10) | Plaid API calls require it, and a local-only app has nowhere else to put it | A backend to hold the secret is precisely the multi-tenant architecture ruled out in FR-051. Blast radius is one user who owns the credential. Forecloses redistribution — recorded so it is not rediscovered as a surprise |
