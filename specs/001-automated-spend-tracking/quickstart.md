# Quickstart & Validation Guide

How to run the app and prove it works. Scenarios map to the user stories and success criteria in `spec.md`. 23 scenarios cover 94 functional requirements and 25 success criteria.

## Prerequisites

- Node.js 22 LTS or later, npm
- A Plaid account (`dashboard.plaid.com`) with `client_id` and a Sandbox secret
- An Anthropic API key — optional; the app runs in `local_only` categorization mode without one
- macOS or Windows. On Linux, a working secret service (`libsecret`) is required or the app will refuse to start (see V0)

## Run

```bash
npm install
npm run dev          # electron-vite dev server, main + preload + renderer
npm run test         # unit tests (Vitest)
npm run test:e2e     # Playwright against the packaged Electron app
npm run build        # electron-builder production package
```

First launch opens setup: enter Plaid credentials, choose environment (Sandbox to start), optionally add the Anthropic key, then connect an account through Hosted Link.

---

## Gate 0 — before writing downstream code

### V0. Encryption is genuinely available
`safeStorage.isEncryptionAvailable()` returns true after `app.ready`; the database key round-trips through encrypt/decrypt; the database file on disk is **not** readable by plain `sqlite3`.

**Fail loudly.** If encryption is unavailable the app must refuse to start with an explanation — never silently write an unencrypted financial database. *(FR-054)*

### V1. Plaid viability spike — do this first
**This gates the entire project (R3).** Under Limited Production (200 live API calls):

1. Connect one real account the user actually banks with.
2. Confirm `/transactions/sync` returns real transactions with usable merchant names.
3. Confirm every institution the user cares about is supported.
4. Get written per-item Transactions pricing from Plaid.

**If institutions are unsupported or pricing is unacceptable, stop here.** Everything downstream assumes this works. Budget the 200 calls deliberately — hourly polling would exhaust them in nine days.

---

## Core validation scenarios

### V2. Zero-input capture *(US1, FR-002, SC-001, SC-003)*
Connect a Sandbox account, let it backfill, touch nothing else. Every transaction appears with merchant, amount, date, account, and a category. Compare the transaction count and sum against the Plaid API response directly — they must match exactly.

### V3. Exactly-once and in-place reconciliation *(FR-005, FR-006)*
Run sync twice with no new activity: the second run adds zero rows and the cursor advances. Force a pending transaction to post with a different amount: the existing row updates and the row count is unchanged. Kill the process mid-sync: on restart the cursor re-fetches the interrupted page and still produces no duplicates.

### V4. Totals reconcile exactly *(FR-018, SC-004)*
For any date range, `sum(breakdown:byCategory rows) === breakdown total === sum of qualifying transactions`. Assert to the cent. Include internal transfers and a refund in the fixture — transfers must be excluded and the refund netted *(FR-007, FR-008)*.

### V5. Confidence and review queue *(FR-013, FR-017, SC-002)*
Feed transactions with an ambiguous mixed-use merchant. Below-threshold results land in the review queue but still appear in totals under their best guess, marked unconfirmed. Never open the queue: all reports still generate. Against a labeled fixture set, hands-off accuracy meets 94%.

### V6. Corrections stick and restate *(US6, FR-015, FR-016)*
Recategorize a flagged transaction. Prior period totals restate. Feed a comparable transaction from the same merchant: it categorizes per the correction, locally, **with no API call** — assert the Anthropic client was not invoked *(R4)*.

### V7. Recurring detection *(US2, FR-019, FR-025)*
Fixture with monthly, quarterly, and annual recurring charges plus decoy irregular repeat purchases at one merchant. All recurring charges detected with correct cadence and cumulative total; **no decoy** is listed. Raise a charge's amount: an amount-change notification fires with old and new *(FR-023)*. Stop one: it goes `inactive`, not deleted *(FR-024)*.

### V8. Alerts fire once, and only when they should *(US3, FR-031)*
Fixture with one instance of each trigger plus near-misses just under every threshold. Exactly the expected alerts fire. One event satisfying several triggers yields one notification. Re-run ingestion on the same data: no duplicate alerts — the `dedupe_key` unique index holds.

### V9. Downtime catch-up *(FR-056, FR-057, FR-058, SC-006a)*
Close the app. Advance the fixture clock past a week boundary and add transactions, including alert-triggering ones. Relaunch. All transactions ingest, every alert that would have fired is delivered labeled with its **true event time**, and the missed weekly digest generates. Nothing is lost to downtime. With a large backlog, alerts collapse into one "while you were away" summary.

### V10. Offline *(FR-059, SC-015)*
Disconnect the network. Dashboard, breakdowns, register, recurring ledger, review queue, and past reports all open and remain usable, marked as of last successful sync. Reconnect: sync resumes from the cursor.

### V11. Stale feed is never presented as complete *(FR-009, SC-014)*
Force an institution into `reauth_required`. Every total covering the affected period carries `dataComplete: false`. Re-auth: history is preserved, the gap backfills, affected reports regenerate *(FR-042)*.

### V12. Insufficient history stays honest *(FR-040, US4 AS2)*
Fresh install with two weeks of data. The digest reports plain totals and makes **no deviation or anomaly claims**. Add sufficient history: baselines activate and deviations appear.

### V13. Everything is reproducible *(SC-010, derived-value rule)*
Delete all baselines, recurring charges, and reports; recompute from `transactions` + `categorizations`. Results are byte-identical. This is the test that keeps every derived figure honest.

### V14. Backup round-trip *(FR-060, SC-017)*
Export, wipe, restore onto a clean install. Transactions, corrections, baselines, and reports all return.

### V15. Secrets never reach the renderer *(FR-047)*
Grep the renderer bundle for the API key and Plaid secret: zero hits. `settings:get` returns presence booleans only. Attempt an IPC call with a malformed payload: rejected by Zod with `VALIDATION_FAILED`.

### V16. Interface depth *(FR-062–FR-068, SC-018, SC-020)*
From the dashboard, reach the transactions behind any headline figure in ≤2 interactions. Filter and drill through a full 24-month history with no perceptible wait. Clear a month of flags in one bulk action. Confirm there is **no** manual transaction entry, reconciliation step, or budget-allocation gate anywhere in the app *(SC-021)*.

### V17. Income detection and projection honesty *(US3, FR-069–FR-073)*
Fixture with biweekly deposits plus irregular non-income credits. The income source is detected with correct cadence and next date; the irregular credits are not. Confirm it, then change the fixture's pay pattern — a confirmed source holds until the override is cleared, an unconfirmed one re-derives. Remove all income: the balance-shortfall projection is **withheld**, not computed against a guess.

### V18. Retroactive corrections *(FR-074–FR-077)*
Merchant with 47 past transactions, 3 of which the user previously corrected by hand. Recategorize one: the response reports 44 retroactive candidates and **changes nothing** until confirmed. Apply it: 44 update, the 3 manual corrections are untouched and reported as skipped, and all affected periods restate.

### V19. Category editing keeps comparisons coherent *(FR-078–FR-083)*
Rename a category: prior reports and month-over-month comparisons are unaffected (ids are stable). Merge two categories: transactions reassign, derived figures recompute, and no report references a category that no longer exists. Hide a category: it disappears from assignment choices but its history still appears in past periods and totals still reconcile. Attempt a two-level-deep subcategory: rejected with `CATEGORY_NESTING_EXCEEDED`.

### V20. Foreign-currency purchases *(FR-084–FR-086)*
A €40 charge settling at $43.12 contributes exactly $43.12 to every total, category breakdown, baseline, and alert evaluation. The original currency and amount appear in transaction detail and **nowhere in any sum**. Two trips to the same foreign merchant at different exchange rates are not flagged as duplicates and resolve to one merchant.

### V21. Diagnostics are redacted by construction *(FR-087–FR-094, SC-023)*
Generate an export after a full ingestion run. Automated scan asserts zero merchant names, amounts, balances, account numbers, or credentials — assert against the **known fixture values**, not a regex guess. Force a logging failure: ingestion, categorization, alerting, and reporting all continue. Exceed the rotation bound: the log is capped, oldest entries drop, and the app keeps running.

### V22. Persistent failure surfaces itself *(FR-092, SC-022)*
Force an institution into repeated sync failure. Within the threshold, the user is notified — without having opened the health view. The health view shows the failure, its cause, and last successful sync; every failure shown there has a corresponding log entry sufficient to diagnose it *(SC-024)*.

---

## Testing approach

TDD, unit-first per the project's testing convention. The bulk of this is unit-testable against fixtures with no network: categorization logic, recurring detection, alert evaluation and deduplication, baseline sufficiency, period math, and the totals-reconcile invariant.

Integration tests cover the Plaid sync loop against **Sandbox**, not live data. E2E (Playwright) covers first-run setup, the review-queue flow, and dashboard drill-down.

**Fixture-driven, deterministic clock.** Every scenario above that involves time — catch-up, cadence detection, period boundaries, baselines — requires an injectable clock. Build that in from the first commit; retrofitting it later means rewriting the test suite.
