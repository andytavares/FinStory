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

## R3. What does Plaid cost, and what is required for production access?

**Decision**: The **Trial plan** (free) covers this use case. Confirmed the user already holds Plaid access.

**Findings** (Plaid billing docs, verified 2026-08-29): the free tier is the **Trial plan**, which includes Transactions and is capped at **10 Production Items** — not at API call volume. An Item is one login at one institution. The scenario this product is built for (two checking accounts, three credit cards, and several payment apps) sits comfortably under that ceiling.

**This corrects an earlier error in this document.** A prior revision claimed "Limited Production allows up to 200 API calls per product" and framed the entire project gate around exhausting that budget through polling. That figure came from the pricing page and does not describe the current free tier. Polling volume is **not** a constraint on the Trial plan. Recorded rather than quietly deleted, because it drove the original phase ordering.

**Two constraints that do apply**:

1. **The 10-Item cap is a lifetime create limit, not a concurrent one.** Plaid's docs are explicit: "Removing Items created on a Trial plan will *not* allow you to create more Items." Every re-link during development permanently consumes quota. **All development therefore runs against Sandbox**, which is free and unlimited; Production Item creation is a deliberate, logged action.
2. **Trial eligibility is date-gated** to US/Canada teams created on or after 2026-04-15. An account predating that may not qualify.

**Remaining open item**: whether the specific institutions the user banks with are supported by Plaid. No plan tier answers this — it must be checked against the live institution list. This is the only surviving element of the original Gate A.

**Alternatives considered**: paid Pay-as-you-go from the start (rejected — unnecessary at this scale); avoiding Plaid via direct bank integrations or file import (rejected — direct integrations are not available to individuals, and file import violates FR-002's no-manual-import requirement).

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

**Timers**: use a monotonic scheduler that compares "last run" timestamps against the wall clock rather than a naive interval, because `setInterval` does not fire reliably across sleep. `cron` (4.4.0) handles cadence; the on-launch reconciliation is what makes it correct.

---

## R7. Stack selection

All versions verified against the npm registry on 2026-08-29; all are current, actively published, MIT/Apache/ISC licensed, and have large communities.

| Concern | Choice | Version | Why |
|---|---|---|---|
| Shell | Electron | 44.0.0 | Required by the user. Gives `safeStorage`, tray, native notifications, login-item. |
| Build | electron-vite + Vite | 5.0.0 / 7.3.6 | First-class Electron main/preload/renderer split. **Vite is pinned to 7.x**: electron-vite 5 peer-requires `^5 \|\| ^6 \|\| ^7`, and electron-vite 6 is beta-only, which Principle III excludes. |
| Packaging | electron-builder | 26.15.3 | Mature; handles signing and installers on both targets. |
| UI | React | 19.2.8 | Largest ecosystem; matches the depth of UI in FR-062–FR-068. |
| Styling | Tailwind CSS | 4.3.3 | Fast iteration on a design-heavy surface. |
| Charts | Recharts | 3.10.1 | React-native charting for FR-065. Load the `dataviz` skill before writing any chart. |
| Database | better-sqlite3-multiple-ciphers | 13.0.3 | Synchronous, fast, embedded; SQLCipher for FR-054. |
| Schema/migrations | Drizzle ORM | 0.45.2 | Typed schema, real migration files, thin over SQLite. |
| Aggregation | plaid | 46.0.0 | Official client. |
| Categorization | @anthropic-ai/sdk | 0.122.0 | Official client. |
| Validation | Zod | 4.5.4 | IPC boundary and structured-output schemas. |
| Icons | lucide-react | 1.37.0 | Required by Constitution Principle XIV. Pinned — Principle III forbids `latest`. |
| Scheduling | cron | 4.4.0 | Cadence for digests and polling. Swapped from `node-cron` under Principle III: 3 publishers vs 1, 6.9M weekly downloads. |
| Dates | date-fns | 4.4.0 | Period math, timezone-correct boundaries. |

**Dependency health evidence** (required at adoption time by Principle III as amended in constitution v1.1.0):

| Package | Publishers | Contributors | Downloads/wk | Verdict |
|---|---|---|---|---|
| better-sqlite3-multiple-ciphers | 1 | 35 | 74,626 | Adopted under ADR — see R9 |
| cron | 3 | — | 6,878,233 | Healthy |
| drizzle-orm | 4 | — | — | Healthy |
| recharts | 3 | — | — | Healthy |
| plaid / @anthropic-ai/sdk | vendor-published | — | — | Official clients |

**Post-plan adoptions** (added during implementation; evidence recorded per Principle III):

| Package | Version | Publishers | Downloads/wk | Why adopted |
|---|---|---|---|---|
| @date-fns/tz | 1.5.0 | 1 | 36,658,672 | **Runtime.** Timezone-correct period boundaries; the date-fns companion package, same author. Single publisher, but adopted under the same reasoning as ADR 0001 — 36.7M weekly downloads is not a bus factor of one. |
| typescript | 6.0.3 | — | — | TS 7 breaks typescript-eslint's `<6.1.0` peer range; 6.0.3 is the newest the lint toolchain supports. |
| drizzle-kit | 0.31.10 | 4 | 16,915,049 | Migration generation for the chosen ORM. |
| jsdom | 30.0.1 | 6 | 98,669,159 | DOM for renderer tests. |
| @testing-library/react | 16.3.3 | 18 | 57,020,755 | Renderer component tests. |
| @vitejs/plugin-react | 6.1.1 | 2 | 84,087,839 | React support in the Vite build. Pinned to 5.x for Vite 7 compatibility. |
| @tailwindcss/vite | 4.3.3 | 3 | 45,951,402 | Tailwind 4 build integration. |
| typescript-eslint | 8.68.0 | 2 | 88,027,497 | TypeScript linting. |
| prettier | 3.9.6 | 11 | 133,020,838 | Formatting. |
| @vitest/coverage-v8 | 4.1.11 | 5 | 37,889,500 | Coverage provider for the Principle V gate. |
| @eslint/js | 10.0.1 | 2 | 143,588,788 | ESLint recommended config. |

All are healthy on the amended Principle III criteria: high usage, active release cadence, and multiple publishers except `@date-fns/tz`, which is noted above.

**Process split**: all secrets, network calls, and database access live in the **main** process. The renderer gets no Node integration, `contextIsolation: true`, and reaches main only through a typed, Zod-validated preload IPC surface. No API key or `access_token` ever enters the renderer.

---

## R9. Encrypted SQLite driver vs. dependency stewardship (ADR-worthy)

**Decision**: Adopt `better-sqlite3-multiple-ciphers` 13.0.3, under a recorded exception. Constitution Principle III amended to 1.1.0 to make the judgment sound.

**The conflict**: Principle III as originally written (carried over from the Terminator constitution) forbade any package with a single npm publisher, "regardless of fit." Principle VII requires encryption at rest and is NON-NEGOTIABLE. Every encrypted-SQLite option for Node has one npm publisher, so the two principles could not both be satisfied.

**Why the original rule was unsound**: npm publisher count turned out to be a poor proxy for bus-factor risk.

| Package | npm publishers | GitHub contributors | Downloads/week |
|---|---|---|---|
| better-sqlite3 (upstream) | 1 | 69 | 10,357,275 |
| better-sqlite3-multiple-ciphers | 1 | 35 | 74,626 |
| @journeyapps/sqlcipher | 2 | 88 | 9,394 |

The rule would have rejected a package with 69 contributors and 10.4M weekly downloads while accepting one with 4% of the usage — on a metric that reflects who holds the publish token, not who maintains the code.

**Alternatives considered**:
- *`@journeyapps/sqlcipher`*: passes the original rule (2 company publishers, 88 contributors) and is genuinely maintained. Rejected because Drizzle ships no driver for it — Drizzle's SQLite drivers are `better-sqlite3`, `bun-sqlite`, `durable-sqlite`, `expo-sqlite`, and `op-sqlite` only. Adopting it means hand-rolling a typed query layer and migration runner, which is more code we own and maintain, cutting against Principle IV (minimalism) and adding surface that Principle V then requires us to cover at 80%. Its async API also diverges from the synchronous model the ingestion path is designed around.
- *`@libsql/client` / `libsql`*: built-in encryption and company-backed, but a single npm publisher — no better on the original rule, and a larger dependency.
- *Drop SQLCipher, rely on OS full-disk encryption*: directly violates Principle VII and FR-054. Not viable.

**Accepted risk and migration trigger**: the fork tracks upstream better-sqlite3 closely (both at 13.0.3, published within two days of each other) and is API-compatible, so Drizzle's `better-sqlite3` driver works unmodified. **If the fork falls materially behind upstream or stops receiving releases, migrate to `@journeyapps/sqlcipher` and absorb the query-layer cost.** Because the schema is Drizzle-defined and all analysis logic is pure over data passed in (Principle XIII), that migration is bounded to the storage layer.

---

## R10. Known deviation: Plaid credentials on the client

**Issue**: Plaid API calls require `client_id` + `secret`. Plaid's guidance for consumer applications is that the secret lives server-side and never ships to a client, because in a normal product one secret serves many users and its compromise exposes all of them.

**Why it is acceptable here, narrowly**: there is exactly one user, and they own the Plaid account the secret belongs to. Compromise exposes their own credentials to themselves. The blast radius is one person, and that person is the owner.

**What is required regardless**: the secret is entered by the user, stored `safeStorage`-encrypted, never bundled into the application, never logged, and never sent to the renderer.

**What this forecloses**: this app cannot be distributed to other users as-is. Doing so would require a backend to hold the secret — which is the multi-tenant product the user explicitly ruled out in FR-051. Recorded here so the constraint is not rediscovered later as a surprise.

---

## R11. Income detection (FR-069–FR-073)

**Decision**: Reuse the recurring-charge cadence detector against **credit-direction** transactions, with user confirmation and override.

**Rationale**: Income is structurally the same problem as a subscription — a repeating amount at a repeating interval from a repeating counterparty — just with the sign flipped. Running one detector over both directions means one algorithm to write, test, and trust, and it satisfies the Zero-Input Doctrine (Principle VIII) because detection is the default and confirmation is optional.

**Design consequences**:
- Detection confidence gates the balance-shortfall alert. Below threshold, or with no detected pattern, the projection is **withheld** rather than computed against a guess (FR-073, Principle IX).
- A changed pattern (raise, job change, missed pay period) must re-derive rather than hold a stale date. The detector re-runs on every ingestion cycle.
- A user override pins the pattern and suppresses re-derivation for that source until they clear it.

**Alternatives considered**: user-configured payday schedule (rejected — recurring input, violates VIII); rolling 30-day window with no payday concept (rejected — the user chose confirmation-capable detection, and a rolling window cannot express "before payday," which is the whole point of FR-029).

---

## R12. Retroactive category corrections (FR-074–FR-077)

**Decision**: Forward-only by default; retroactive application is an explicit, counted, opt-in action that never overwrites a prior user correction.

**Rationale**: The `categorizations` table already models corrections as an append-only chain with `superseded_by`, so a retroactive pass is a bulk insert of new live categorizations, not a destructive update. History survives, and the restatement in FR-077 is the same pure recomputation that FR-015 already required.

**Why the count matters before the action**: a retroactive correction can silently rewrite a year of reports. Stating "this will change 47 transactions" before the user commits makes the blast radius visible, which is the same honesty requirement Principle IX applies to reporting.

**Ordering rule**: `is_confirmed = true` rows are excluded from the retroactive set. A deliberate past correction always outranks a bulk rule inferred from a later one.

---

## R13. Category taxonomy: defaults, editing, and comparison coherence (FR-078–FR-083)

**Decision**: Ship a curated default taxonomy; allow add, rename, merge, and hide; cap nesting at one level.

**Rationale**: A closed, curated set is what makes SC-002 (94% hands-off accuracy) achievable — the categorizer is prompted against a known list rather than an open vocabulary, and prompt caching on that stable taxonomy is what keeps the per-transaction cost near zero (R4). User extension is needed because no shipped list survives contact with a real person's spending. One nesting level is the user's explicit constraint and matches the data model's `parent_id`.

**The hard part is FR-083 — comparison coherence.** Month-over-month comparison breaks if a category is renamed or merged between the two periods. Two rules resolve it:
- Categories are referenced by **stable id**, never by name, so a rename is display-only and comparisons survive it untouched.
- A **merge** rewrites transaction assignments and then forces recomputation of every derived figure that referenced either side. Historical reports regenerate under the current taxonomy rather than being left to reference a category that no longer exists.

**Hide is not delete**: hidden categories stay in historical reporting and are removed only from new-assignment choices (FR-082). This keeps prior periods reconcilable, preserving SC-004.

---

## R14. Foreign-currency purchases (FR-084–FR-086)

**Decision**: The settled account-currency amount is authoritative for every calculation. Original currency and amount are display-only metadata.

**Rationale**: The account is USD-denominated; the card issuer has already performed the conversion, and the settled figure is what actually left the account. Treating it as the truth keeps every total, baseline, and alert correct with two nullable columns and no conversion logic, no rate source, and no rate-staleness problem. Plaid returns both the settled amount and `iso_currency_code`/`unofficial_currency_code`, so the metadata is free.

**Consequence for duplicate detection**: exchange-rate variation means the same foreign merchant posts at slightly different dollar amounts. Duplicate detection matches on settled amount within a window, so normal variation will not trip it — but the merchant-matching key must normalize the descriptor rather than keying on amount.

**Explicitly excluded**: the app performs no currency conversion of its own (FR-086). Introducing one would mean adopting a rate source, and a wrong rate silently corrupts every total — the exact failure mode Principle II exists to prevent.

---

## R15. Diagnostics and redaction (FR-087–FR-094)

**Decision**: Rotating local log + in-app health view + local metrics, exportable as one file, with **financial detail redacted at the logging boundary**, not at export time.

**Rationale**: A local app with no server has no other diagnostic story — when a sync silently fails for three weeks, there is nothing to check. The health view answers "is it working?" without the user going looking; the log answers "why not?"

**Redaction is a write-time invariant, not an export-time filter.** If merchant names and amounts are written to disk and stripped on the way out, the log file is an unencrypted shadow copy of the exact data Principle VII protects — sitting outside the SQLCipher database. So the logger accepts only opaque identifiers and enumerated event types; there is no code path that can write a merchant name or amount. SC-023 is verified by an automated scan over a generated export.

**Failure isolation** (FR-094): diagnostics must never break the pipeline. A logging failure is swallowed and counted, never propagated — the opposite of the fail-loudly rule for encryption, because unlike encryption, missing a log entry does not compromise anything.

**Bounded growth** (FR-093): size- and age-based rotation. An unbounded log on a machine the user never inspects is a slow disk leak.

---

## Resolved / Outstanding

| # | Question | Status |
|---|---|---|
| R1 | Bank connection without a server | Resolved — Hosted Link + `/link/token/get` |
| R2 | Keeping transactions current | Resolved — `/transactions/sync` cursor polling |
| R3 | Plaid cost and production access | Resolved — free Trial plan covers this scale; institution support still to verify |
| R4 | Categorization privacy (spec open decision) | Resolved — local-first, hosted fallback, offline mode available |
| R5 | Encryption at rest | Resolved — SQLCipher + `safeStorage` async API |
| R6 | Operation while closed | Resolved — tray + launch-at-login + catch-up on wake |
| R7 | Stack | Resolved — versions pinned above, health evidence recorded |
| R9 | Encrypted SQLite driver vs. Principle III | Resolved — constitution amended to 1.1.0; adoption recorded as ADR with migration trigger |
| R10 | Plaid secret on client | Accepted deviation, scoped and documented |
| R11 | Income detection | Resolved — shared cadence detector, user-confirmable |
| R12 | Retroactive corrections | Resolved — opt-in, counted, never overwrites manual corrections |
| R13 | Category taxonomy | Resolved — curated defaults, editable, stable ids for comparison coherence |
| R14 | Foreign currency | Resolved — settled amount authoritative, original display-only |
| R15 | Diagnostics | Resolved — redaction at the write boundary, not at export |
