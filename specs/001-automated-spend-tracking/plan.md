# Implementation Plan: Automated Spend Tracking & Awareness

**Branch**: `001-automated-spend-tracking` | **Date**: 2026-08-29 | **Spec**: [spec.md](./spec.md)

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

**Primary Dependencies**: Electron 44.0.0 · React 19.2.8 · electron-vite 5.0.0 / Vite 8.2.2 · Tailwind CSS 4.3.3 · Recharts 3.10.1 · better-sqlite3-multiple-ciphers 13.0.3 · Drizzle ORM 0.45.2 · plaid 46.0.0 · @anthropic-ai/sdk 0.122.0 · Zod 4.5.4 · node-cron 4.6.0 · date-fns 4.4.0 · electron-builder 26.15.3

**Storage**: SQLite with SQLCipher page-level encryption, in the Electron `userData` directory. Database key generated once, `safeStorage`-encrypted (OS keychain / DPAPI / libsecret). Money stored as integer minor units throughout. No remote storage of any kind.

**Testing**: Vitest (unit, the bulk of coverage) · Playwright (E2E against the packaged app) · Plaid Sandbox for integration. Injectable clock required from the first commit.

**Target Platform**: macOS and Windows desktop. Linux is best-effort and requires a working secret service.

**Project Type**: Single-user desktop application (Electron main + preload + renderer)

**Performance Goals**: Navigation, filtering, and drill-down across a full 24-month history feel immediate with no perceptible wait (SC-020). Dashboard usable within 30 seconds of open (SC-019). Drill from any figure to underlying transactions in ≤2 interactions (SC-018).

**Constraints**: Offline-capable for all reads of stored data (FR-059). No publicly reachable endpoint (FR-055). No user financial data on any third-party server operated as part of this product (FR-053, SC-016). No secret ever reaches the renderer (FR-047). Correctness defined as complete catch-up after downtime, not uptime (FR-056).

**Scale/Scope**: One user. ~350 transactions/month, ~10 connected accounts, 24+ months retained (roughly 10k transactions at steady state). 68 functional requirements across 6 user stories.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Status: NOT ENFORCEABLE — no ratified constitution exists.**

`.specify/memory/constitution.md` is the unmodified Spec Kit placeholder: every principle is still `[PRINCIPLE_N_NAME]` / `[PRINCIPLE_N_DESCRIPTION]`, and governance is `[GOVERNANCE_RULES]`. There are no gates to evaluate against, so this check cannot pass or fail on its own terms.

Recording this explicitly rather than marking the gate green: **an empty constitution is not a passed constitution.** No design decision in this plan has been checked against ratified project principles, because none exist.

**Recommendation**: run `/speckit-constitution` before `/speckit-implement`. Based on the standing conventions this work is being done under, the principles most worth ratifying are TDD with a unit-first testing pyramid; surgical, traceable changes; latest-stable actively-maintained dependencies only; root-cause fixes over workarounds; and documentation-verified implementation. Each of those has already shaped this plan and would be enforceable on the next one.

**Complexity self-assessment against those same conventions** (in the absence of ratified gates):

| Convention | Assessment |
|---|---|
| Simplicity — minimum code, nothing speculative | Single application, no service split, no abstraction layers beyond the process boundary Electron imposes. The one deliberate indirection — separating `categorizations` from `transactions` — buys correction history and restatement, both explicit requirements |
| Latest stable, actively maintained dependencies | All 15 dependencies verified against the npm registry on 2026-08-29; every one is current and actively published |
| Documentation-verified, no guessing | Plaid and Electron behavior taken from official docs via Context7; model pricing and API constraints from the bundled Anthropic reference; versions from the registry. The one thing that could **not** be verified — Plaid's Transactions pricing — is recorded as unresolved rather than estimated |
| Root cause over workaround | The downtime limitation is handled by making catch-up correct, not by pretending to continuous coverage |

## Project Structure

### Documentation (this feature)

```text
specs/001-automated-spend-tracking/
├── spec.md                       # Feature specification
├── plan.md                       # This file
├── research.md                   # Phase 0 — 8 decisions, 1 open external risk
├── data-model.md                 # Phase 1 — schema and invariants
├── quickstart.md                 # Phase 1 — run + 17 validation scenarios
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
│   │   ├── recurring.ts          # Cadence detection
│   │   ├── baselines.ts          # Personal baselines + sufficiency gate
│   │   ├── alerts.ts             # Rule evaluation, dedupe, backlog collapse
│   │   └── reports.ts            # Weekly digest, monthly report
│   ├── scheduler/                # Cron cadence + on-launch catch-up reconciliation
│   ├── notifications/            # Native notifications, retained-undelivered queue
│   └── ipc/                      # Zod-validated channel handlers
├── preload/
│   └── index.ts                  # contextBridge surface — the only renderer↔main path
├── renderer/                     # No Node integration. contextIsolation on.
│   ├── views/                    # Dashboard, Register, Recurring, Review, Reports, Settings
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
| **Foundation** | Electron shell, schema + migrations, IPC skeleton, injectable clock, minor-unit money module | Clock and money module are retrofit-hostile — build them first |
| **US1 (P1)** | Sync loop, ingestion, two-stage categorization, category breakdown | MVP. V2–V6 pass |
| **US2 (P2)** | Recurring detection and ledger | V7 passes |
| **US3 (P3)** | Alert rules, dedupe, delivery, backlog collapse | V8, V9 pass |
| **US4 (P4)** | Baselines, sufficiency gate, weekly digest | V12 passes |
| **US5 (P5)** | Monthly report | V13 passes |
| **US6 (P6)** | Review queue, bulk recategorization, restatement | V6 fully passes |
| **Cross-cutting** | Offline behavior, staleness qualification, backup/restore, interface depth | V10, V11, V14, V15, V16 |

Interface work (FR-062–FR-068) is not a final stage — each user story ships with its own view. The dashboard grows as the stories land.

## Complexity Tracking

No constitution gates exist to violate (see Constitution Check). One deliberate deviation from external vendor guidance is recorded instead:

| Deviation | Why needed | Simpler alternative rejected because |
|---|---|---|
| Plaid `client_secret` stored on the client (R8) | Plaid API calls require it, and a local-only app has nowhere else to put it | A backend to hold the secret is precisely the multi-tenant architecture the user ruled out in FR-051. Blast radius is one user who owns the credential. Forecloses redistribution — recorded so it is not rediscovered as a surprise |
