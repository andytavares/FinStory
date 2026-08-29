# Phase 0 Research: Automated Spend Tracking & Awareness

**Date**: 2026-08-29 | **Branch**: `001-automated-spend-tracking`

All findings verified against official documentation (Plaid API docs and Electron docs via Context7, Plaid pricing page, npm registry, bundled Anthropic API reference) on 2026-08-29. Version numbers are the latest published releases as of that date.

---

## R1. How does a desktop app connect bank accounts without a public server?

**Decision**: Use **Plaid Hosted Link**, retrieving the result via `/link/token/get` rather than a frontend callback.

**Rationale**: The standard Plaid Link flow returns a `public_token` to a web frontend callback, which assumes a hosted web app. Plaid's docs state `/link/token/get` "is useful for Link flows that do not provide a public token via frontend callbacks, such as the Hosted Link flow." That is exactly this situation. The flow becomes:

1. Main process calls `/link/token/create` with `products: ["transactions"]`, `country_codes: ["US"]`.
2. App opens the Plaid-hosted Link URL in the system browser.
3. User authenticates with their institution on Plaid's page.
4. App polls `/link/token/get` for the session result and extracts the `public_token`.
5. Exchange for a permanent `access_token`; store encrypted.

This requires no `redirect_uri`, no local HTTP listener, and no publicly reachable address — satisfying **FR-055**.

**Alternatives considered**:
- *Embed Link in a BrowserWindow with a custom-scheme `redirect_uri`*: Plaid docs require Production `redirect_uri` values to be `https` and pre-registered in the dashboard. A custom scheme does not qualify. Rejected.
- *Run a localhost HTTP server to catch the redirect*: works in Development, but `http://localhost` fails the Production https requirement, and it adds a listening socket to a security-sensitive app for no gain. Rejected.

---

## R2. How are transactions kept current without webhooks?

**Decision**: Poll **`/transactions/sync`** per Item on a cursor.

**Rationale**: This endpoint is purpose-built for exactly this and it maps 1:1 onto requirements the spec already states. The response returns four things:

| Response field | Requirement it satisfies |
|---|---|
| `added` | FR-002 automatic capture |
| `modified` | FR-006 pending → posted reconciliation, in place |
| `removed` | FR-008 reversals netting out |
| `next_cursor` / `has_more` | FR-005 exactly-once ingestion, resumable pagination |

The cursor is the deduplication and catch-up mechanism at once: persist it, and the next call returns only what changed since — whether that was five minutes ago or three weeks ago. **FR-056** (catch up after the app was closed) needs no special code path; it is the same call with an older cursor. Initial connection uses a null cursor and pages through full history, satisfying **FR-004** backfill.

**Consequence for FR-055 / SC-006**: alert latency is bounded by poll interval *and* by Plaid's own refresh cadence upstream. Polling faster than the institution's data refreshes gains nothing and costs API calls. Poll interval is a tuning knob, not a correctness property, and must be user-configurable.

**Alternatives considered**:
- *`/transactions/get` with a date range*: requires client-side diffing to detect modifications and removals, and re-fetches unchanged data every poll. `/transactions/sync` exists to replace this pattern. Rejected.
- *`/transactions/refresh` to force an upstream pull before each sync*: an on-demand, separately-billed request. Useful as a manual "sync now" button; wasteful on a timer. Deferred to a user-triggered action only.

---

## R3. What does Plaid actually cost, and what is required for production access?

**Decision**: **Unresolved by research — must be confirmed with Plaid directly before implementation.** Validate against the free tier first.

**Findings**: Plaid's pricing page describes three plans (Pay as You Go month-to-month, Growth on a 12-month commitment, Custom) and three billing models (one-time fee, subscription, per-request), but **does not publish the per-item price for Transactions**. It directs readers to sales for specifics. The article's claimed "$0–29/month" could not be verified and should not be relied on.

One figure is published and useful: **Limited Production allows up to 200 API calls per product against live data.** That is enough to connect a real account and prove the whole ingestion path end to end, but it is not enough to run on — hourly polling alone would exhaust it in nine days.

**Action**: This is the single largest project risk and it is external. Task T001 is a spike: register, connect one real account under Limited Production, confirm the sync path works against the user's actual institutions, and get written pricing from Plaid. Do this **before** building anything downstream of ingestion. If the institutions the user cares about are unsupported, or pricing is unacceptable, the project premise fails and it should fail in week one, not month two.

---

## R4. Local model or hosted API for categorization? (spec's open decision #1)

**Decision**: **Two-stage — a local deterministic classifier first, the hosted Claude API only for what it cannot resolve.** Default model `claude-opus-5`, user-selectable.

**Rationale**: The cost argument for a local model turns out to be nearly empty. At the observed volume (2,847 transactions over 8 months ≈ 356/month), with ~600 input and ~80 output tokens per transaction:

| Model | Input $/1M | Output $/1M | Est. monthly cost |
|---|---|---|---|
| Claude Haiku 4.5 | $1.00 | $5.00 | ~$0.35 |
| Claude Sonnet 5 | $2.00 | $10.00 | ~$0.71 |
| Claude Opus 5 | $5.00 | $25.00 | ~$1.78 |

Prompt caching on the fixed taxonomy and Batch API (50%) push these lower still. Even the most expensive option is under $2/month — an order of magnitude below the article's $15/month estimate, and irrelevant next to the aggregation cost. **Cost should not drive this decision. Accuracy and privacy should.**

Accuracy matters a great deal: **SC-002** sets 94% hands-off correctness, and categorization quality determines whether every downstream insight is trustworthy. A small local model would be traded against the product's central quality bar to save roughly a dollar a month.

That leaves privacy as the only real argument, and the two-stage design largely answers it. Most transactions are repeat visits to merchants the user has already been categorized at. Those are resolved locally from stored history with **no API call at all** — cheaper, faster, and nothing leaves the machine. Only genuinely novel or ambiguous merchants reach the model.

**What leaves the machine, when a call is made**: merchant descriptor, amount, date/time, and the user's own prior category distribution *for that merchant*. Not credentials, not account numbers, not balances, not other accounts' data, not aggregate totals. **FR-061** requires this be disclosed in-app and switchable.

**Escape hatch**: an offline-only mode where the local stage is the whole system — lower accuracy, larger review queue, nothing transmitted. This is a settings toggle, not a fork in the architecture, because the two stages are already separate.

**Alternatives considered**:
- *Hosted model for every transaction*: simpler, but transmits data unnecessarily for cases already answerable from local history, and is slower. Rejected.
- *Local model only (Ollama or similar)*: keeps everything local but requires shipping or requiring a multi-GB model, costs real CPU/RAM on the user's machine, and puts SC-002 at risk. Available as the offline mode, not the default. Rejected as default.
- *Pure rules engine*: the spec explicitly rejects this in the Product Thesis ("Starbucks = Coffee" fails on mixed-use merchants). Rejected.

**API shape**: `client.messages.create` with `output_config: {format: {...}}` (structured outputs) returning `{category, confidence, reasoning}`. Adaptive thinking (`thinking: {type: "adaptive"}`) with `output_config.effort` tuned down for this narrow classification task. Note: `budget_tokens` is rejected with a 400 on Opus 5 — do not use it. Batch API is a strong fit for backfill of a long transaction history.

---

## R5. How is data encrypted at rest? (FR-054)

**Decision**: **SQLCipher-encrypted SQLite** via `better-sqlite3-multiple-ciphers`, with the database key held in the **OS keychain through Electron `safeStorage`**.

**Rationale**: Two layers with distinct jobs. `safeStorage` uses OS-provided cryptography (macOS Keychain, Windows DPAPI, libsecret on Linux) and is the right place for one small secret — but it is a string encryptor, not a database. So: generate a random database key once, encrypt it with `safeStorage`, store the ciphertext beside the database; SQLCipher encrypts every page of the database with it. Plaid `access_token`s and the Anthropic API key are likewise `safeStorage`-encrypted.

**Documented details that affect implementation**:
- Electron docs recommend the **async API** (`encryptStringAsync` / `decryptStringAsync`) over the sync one: non-blocking, supports key rotation, degrades gracefully when the backend is briefly unavailable. The **sync API may be deprecated in a future Electron version.** Use async.
- `isEncryptionAvailable()` must be checked after `app.ready`. On Linux it depends on a secret-service key being present; it can legitimately return false. The app must fail loudly with an explanation rather than silently writing an unencrypted database.

**Alternatives considered**:
- *`safeStorage` alone for the whole database*: it encrypts strings, not databases. Would mean loading and rewriting the entire dataset in memory. Rejected.
- *Plain `better-sqlite3` + OS full-disk encryption*: relies on a setting outside the app's control and violates FR-054 as written. `better-sqlite3-multiple-ciphers` is a maintained drop-in with the same API (both at 13.0.3, published within two days of each other). Rejected.
- *Built-in `node:sqlite`*: no SQLCipher support, and tied to the Node version Electron bundles. Rejected.

---

## R6. How does the app do anything while it is not open? (FR-056, FR-058, SC-006a)

**Decision**: **Tray-resident background process, launch at login, catch-up on every wake.** No claim of continuous coverage.

**Rationale**: This is a constraint to be handled honestly, not engineered away. An Electron app can run without a visible window (tray icon, `app.setLoginItemSettings` for launch at login) so it polls through the day without being "open" in any way the user notices. But when the machine is off or asleep, nothing runs — no design fixes that without a server, which the user has ruled out.

Correctness is therefore defined as **complete catch-up, not continuous uptime**. On every launch and every wake:
1. Sync all Items from their stored cursors — a gap of hours and a gap of weeks are the same call.
2. Categorize the backlog.
3. Evaluate every alert rule against the backlog, emitting each with its true event time (**FR-057**).
4. Generate any digest or report whose scheduled time has passed (**FR-058**).

**Backlog burst control**: a long absence could produce dozens of stale alerts. Above a threshold, alerts collapse into a single "while you were away" summary — required by the spec's own edge case and by FR-031.

**Timers**: use a monotonic scheduler that compares "last run" timestamps against the wall clock rather than a naive interval, because `setInterval` does not fire reliably across sleep. `node-cron` (4.6.0) handles cadence; the on-launch reconciliation is what makes it correct.

---

## R7. Stack selection

All versions verified against the npm registry on 2026-08-29; all are current, actively published, MIT/Apache/ISC licensed, and have large communities.

| Concern | Choice | Version | Why |
|---|---|---|---|
| Shell | Electron | 44.0.0 | Required by the user. Gives `safeStorage`, tray, native notifications, login-item. |
| Build | electron-vite + Vite | 5.0.0 / 8.2.2 | Standard, fast, first-class Electron main/preload/renderer split. |
| Packaging | electron-builder | 26.15.3 | Mature; handles signing and installers on both targets. |
| UI | React | 19.2.8 | Largest ecosystem; matches the depth of UI in FR-062–FR-068. |
| Styling | Tailwind CSS | 4.3.3 | Fast iteration on a design-heavy surface. |
| Charts | Recharts | 3.10.1 | React-native charting for FR-065. Load the `dataviz` skill before writing any chart. |
| Database | better-sqlite3-multiple-ciphers | 13.0.3 | Synchronous, fast, embedded; SQLCipher for FR-054. |
| Schema/migrations | Drizzle ORM | 0.45.2 | Typed schema, real migration files, thin over SQLite. |
| Aggregation | plaid | 46.0.0 | Official client. |
| Categorization | @anthropic-ai/sdk | 0.122.0 | Official client. |
| Validation | Zod | 4.5.4 | IPC boundary and structured-output schemas. |
| Scheduling | node-cron | 4.6.0 | Cadence for digests and polling. |
| Dates | date-fns | 4.4.0 | Period math, timezone-correct boundaries. |

**Process split**: all secrets, network calls, and database access live in the **main** process. The renderer gets no Node integration, `contextIsolation: true`, and reaches main only through a typed, Zod-validated preload IPC surface. No API key or `access_token` ever enters the renderer.

---

## R8. Known deviation: Plaid credentials on the client

**Issue**: Plaid API calls require `client_id` + `secret`. Plaid's guidance for consumer applications is that the secret lives server-side and never ships to a client, because in a normal product one secret serves many users and its compromise exposes all of them.

**Why it is acceptable here, narrowly**: there is exactly one user, and they own the Plaid account the secret belongs to. Compromise exposes their own credentials to themselves. The blast radius is one person, and that person is the owner.

**What is required regardless**: the secret is entered by the user, stored `safeStorage`-encrypted, never bundled into the application, never logged, and never sent to the renderer.

**What this forecloses**: this app cannot be distributed to other users as-is. Doing so would require a backend to hold the secret — which is the multi-tenant product the user explicitly ruled out in FR-051. Recorded here so the constraint is not rediscovered later as a surprise.

---

## Resolved / Outstanding

| # | Question | Status |
|---|---|---|
| R1 | Bank connection without a server | Resolved — Hosted Link + `/link/token/get` |
| R2 | Keeping transactions current | Resolved — `/transactions/sync` cursor polling |
| R3 | Plaid cost and production access | **Open — external. Spike T001 before all other work.** |
| R4 | Categorization privacy (spec open decision) | Resolved — local-first, hosted fallback, offline mode available |
| R5 | Encryption at rest | Resolved — SQLCipher + `safeStorage` async API |
| R6 | Operation while closed | Resolved — tray + launch-at-login + catch-up on wake |
| R7 | Stack | Resolved — versions pinned above |
| R8 | Plaid secret on client | Accepted deviation, scoped and documented |
