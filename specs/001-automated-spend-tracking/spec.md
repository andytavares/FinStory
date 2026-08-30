# Feature Specification: Automated Spend Tracking & Awareness

**Feature Branch**: `001-automated-spend-tracking`

**Created**: 2026-08-29

**Status**: Draft

**Input**: User description: "Build a personal finance and money management app based on an article describing an automated budgeting system: bank/card/payment-app aggregation, AI categorization with confidence scoring, weekly pattern detection, real-time alerts, and automated monthly reporting. Core thesis: 'I don't have a budgeting problem, I have an awareness problem' — the system must require zero manual expense logging and change behavior through visibility, not discipline." Scope resolved with the user: single-user desktop application running locally on the owner's own machine, with both an interactive interface and unprompted push delivery of alerts and reports.

## Product Thesis

Existing budgeting tools fail because they require ongoing user effort: manual categorization, pre-allocation of every dollar, or daily spreadsheet upkeep. This product assumes the user has **no discipline and no time**. Its defining constraint is that a user who does nothing after initial setup still receives accurate, complete, and useful spending intelligence. Every requirement below is subordinate to that constraint.

## Experience Principles

The interface benchmark is a full-featured personal finance application in the mold of Quicken or Monarch Money — a real financial cockpit, not a notifications feed with a settings page. The product should feel like a modern, considered application that a user opens because it is pleasant and informative, not because a chore is due.

Where it must differ from those products:

- **Automation-first, not entry-first.** Conventional finance applications organize their interface around the user doing work: entering, matching, splitting, reconciling, allocating. Here the interface is organized around *reading* — every screen answers a question rather than requesting input. Data-entry affordances that exist in the reference products are deliberately absent.
- **Modern, not dense-by-default.** The reference products expose everything at once. This one leads with the answer and lets the user drill toward detail, rather than opening onto a spreadsheet.
- **Opinionated about what matters.** The system surfaces what changed and what is unusual on its own, instead of leaving the user to discover it by browsing reports.
- **Optional to open.** The interface is the depth; the push notifications and scheduled reports are the floor. A user who never opens the application still gets the product's core value, which is not true of the reference products.

## Clarifications

### Session 2026-08-29

- Q: How should the system know when your next paycheck is due, so it can warn you about running low before then? → A: Auto-detect from recurring deposits, with user confirmation and override available in settings.
- Q: When you correct a transaction's category, should the system also fix past transactions from that same merchant, or only apply going forward? → A: Forward by default, with an explicit opt-in prompt to apply retroactively, showing the count of affected transactions. Previously user-corrected transactions are never overwritten.
- Q: Who decides what the spending categories are — a fixed list, or user-defined? → A: Curated default taxonomy, with the user able to add, rename, merge, and hide categories. Nesting is capped at one level of subcategories.
- Q: What happens with a foreign-currency purchase on a US card? → A: The settled USD amount is the value used in all calculations; original currency and amount are retained as display-only metadata.
- Q: How should background failures (sync, categorization, report generation) be surfaced and diagnosed? → A: Local rotating diagnostic log plus an in-app system-health view, with local metrics and timings, exportable for debugging. All diagnostic output redacts financial detail.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Every dollar is captured and categorized without me doing anything (Priority: P1)

The user connects their financial accounts once during setup. From then on, every transaction across every connected account is captured automatically, assigned a spending category, and made viewable as a category breakdown for any time period. The user never types in a transaction and never categorizes one to keep the system accurate.

**Why this priority**: This is the foundation and the entire product thesis. Without complete, automatic, correctly-categorized transaction data, no insight, alert, or report can exist. On its own it already replaces the failed spreadsheet: the user can answer "where did my money go this month?" with zero ongoing effort.

**Independent Test**: Connect a set of accounts, let transactions accrue over a period with no user interaction whatsoever, then verify the category breakdown matches an independently reconciled ground truth of those transactions. Delivers standalone value: accurate spending visibility with zero effort.

**Acceptance Scenarios**:

1. **Given** the user has completed setup with one or more connected accounts, **When** a purchase posts to any connected account, **Then** the transaction appears in the system with a merchant, amount, date, source account, and an assigned category, without any user action.
2. **Given** a transaction at a merchant where the user has a mixed purchase history (e.g. a general retailer used for groceries, home goods, and clothing), **When** the transaction is categorized, **Then** the assigned category accounts for that merchant history plus transaction context (amount, day of week, time of day), and a confidence score is recorded alongside the category.
3. **Given** a categorization whose confidence falls below the review threshold, **When** categorization completes, **Then** the transaction is placed in a review queue and is still included in all totals under its best-guess category, flagged as unconfirmed.
4. **Given** the same transaction is delivered more than once by an upstream data source, **When** it is ingested, **Then** it is stored and counted exactly once.
5. **Given** a pending transaction that later posts with a different final amount, **When** the final amount arrives, **Then** the record is updated in place rather than duplicated, and any affected totals are corrected.
6. **Given** the user views a spending breakdown for a date range, **When** the breakdown is displayed, **Then** the sum of all categories equals the sum of all transactions in that range across all connected accounts, with no unaccounted amount.

---

### User Story 2 - Show me every recurring charge I am paying for (Priority: P2)

The system identifies every recurring charge across all connected accounts — subscriptions, memberships, converted free trials, and services signed up for years ago — and presents them as a single ledger with amount, cadence, merchant, first-seen date, and total paid to date. New recurring charges are surfaced as they are detected.

**Why this priority**: In the source scenario this single capability found 23 recurring charges where the user believed they had 8–10, and produced the largest, fastest, most permanent savings ($187/month, $2,244/year) for the least behavior change. It is the highest value-per-effort insight in the product and depends only on P1.

**Independent Test**: With a transaction history containing known recurring charges of varying cadences (monthly, annual, quarterly) plus decoy non-recurring repeat purchases, verify the ledger identifies the recurring set and excludes the decoys. Delivers standalone value: a cancel-list the user can act on immediately.

**Acceptance Scenarios**:

1. **Given** a merchant has charged the account at a consistent cadence with a consistent amount, **When** the recurring-charge ledger is generated, **Then** that charge appears with its detected cadence, amount, first-seen date, and cumulative total paid.
2. **Given** a merchant the user pays repeatedly but irregularly in amount and timing (e.g. a grocery store), **When** the ledger is generated, **Then** that merchant is not listed as a recurring charge.
3. **Given** a recurring charge is detected that has not been seen before, **When** detection completes, **Then** the user is notified of the new recurring charge, including its amount and cadence.
4. **Given** a previously-detected recurring charge stops appearing for longer than its cadence allows, **When** the ledger is regenerated, **Then** that charge is marked inactive rather than silently dropped.
5. **Given** a low-cost trial converts to a materially higher recurring amount, **When** the higher charge posts, **Then** the user is notified that an existing recurring charge changed price, including the old and new amounts.

---

### User Story 3 - Warn me the moment something looks wrong (Priority: P3)

The system continuously watches incoming transactions and account balances and notifies the user immediately when a defined trigger fires: an unusually large single purchase, an unusually high single-day spend total, an apparent duplicate charge, a newly detected recurring charge, or a projected balance shortfall before the next expected income.

**Why this priority**: This is the only near-real-time protective capability in the product and it catches recoverable money (double charges, unwanted trial conversions) inside dispute windows. It ranks below the recurring ledger because it prevents smaller, occasional losses rather than exposing large standing ones.

**Independent Test**: Feed a transaction stream containing one instance of each trigger condition plus near-miss cases just under each threshold, and verify exactly the expected alerts fire. Delivers standalone value: catching charge errors while they are still disputable.

**Acceptance Scenarios**:

1. **Given** the user has a single-purchase alert threshold configured, **When** a transaction posts above that threshold, **Then** the user is alerted with the merchant, amount, and account.
2. **Given** the user has a daily-spend alert threshold configured, **When** the day's cumulative spend crosses it, **Then** the user is alerted once for that day with the running total, and is not alerted again the same day for the same trigger.
3. **Given** two transactions share the same merchant and amount within a short window, **When** the second posts, **Then** the user is alerted to a possible duplicate charge showing both transactions.
4. **Given** projected spending through the next expected income date would take a monitored balance below the user's configured floor, **When** the projection is evaluated, **Then** the user is alerted with the projected balance and the date it is expected to be reached.
5. **Given** the same trigger condition persists across multiple transactions, **When** alerts are evaluated, **Then** the user does not receive repeated alerts for the same underlying event.

---

### User Story 4 - Tell me every week what changed (Priority: P4)

On a recurring weekly schedule the system analyzes the prior week and delivers a digest: categories that exceeded their normal range, unusual patterns stated in plain language with the comparison that makes them meaningful, recurring charges the user may have forgotten, and a projected end-of-month position based on the current trajectory.

**Why this priority**: Repetition is the behavior-change mechanism — the source case changed habits only after seeing the same number weekly for months. It is valuable but strictly derivative of P1 and cannot itself recover money.

**Independent Test**: Against a fixed multi-week transaction history, generate the digest for a target week and verify each stated deviation and projection is reproducible from the underlying data. Delivers standalone value: a weekly awareness nudge with no user effort.

**Acceptance Scenarios**:

1. **Given** a category's weekly spend deviates significantly from the user's own established baseline for that category, **When** the digest is generated, **Then** the digest names the category, the amount, and the multiple or difference versus baseline.
2. **Given** the user has insufficient history to establish a baseline for a category, **When** the digest is generated, **Then** that category is reported as a plain total without a misleading deviation claim.
3. **Given** the digest schedule elapses, **When** the digest is delivered, **Then** it arrives without any user request, on the user's configured cadence and delivery destination.
4. **Given** a week with no transactions, **When** the digest is generated, **Then** it reports the absence of activity rather than failing or being skipped silently.

---

### User Story 5 - Give me one report a month I actually read (Priority: P5)

Once per month the system produces a comprehensive report covering total income versus total spending, category breakdown with month-over-month comparison, spending trend direction, largest purchases with context, a full recurring-charge audit, savings rate, and projected annual spending if current patterns continue. The report is designed to be consumed in roughly ten minutes and constitutes the user's entire budgeting time investment.

**Why this priority**: This is the periodic decision-making surface, but its content is a superset of insights already delivered weekly. It is the last piece needed for the product to fully replace conventional budgeting.

**Independent Test**: Generate a month's report from a fixed history and verify every figure — totals, comparisons, savings rate, projections — is independently reproducible from the transaction data. Delivers standalone value: a complete monthly financial position review.

**Acceptance Scenarios**:

1. **Given** a completed month, **When** the report is generated, **Then** it includes income total, spending total, savings amount, and savings rate as a percentage of income.
2. **Given** a prior month of data exists, **When** the report is generated, **Then** each category shows its month-over-month change in both amount and direction.
3. **Given** the report includes forward projections, **When** it is presented, **Then** each projection states the assumption it rests on (that current patterns continue) rather than presenting it as a certainty.
4. **Given** the reporting period closes, **When** the report is generated, **Then** it is delivered without the user requesting it.

---

### User Story 6 - Correct the system once and it stays corrected (Priority: P6)

The user can review flagged low-confidence transactions and recategorize any transaction. A correction updates all affected historical totals and informs future categorization for similar transactions, so the same mistake does not recur.

**Why this priority**: This is the trust and accuracy backstop, targeted at roughly 30 minutes of user time per month. It is last because the product must be useful before any correction is made — but without it, categorization errors accumulate and the user disengages.

**Independent Test**: Recategorize a flagged transaction, then feed a subsequent similar transaction and verify it is categorized per the correction, and that prior totals were restated. Delivers standalone value: a system that gets more accurate over time instead of drifting.

**Acceptance Scenarios**:

1. **Given** transactions are in the review queue, **When** the user opens the queue, **Then** they see each transaction with its best-guess category, confidence, and the context behind the guess.
2. **Given** the user changes a transaction's category, **When** the change is saved, **Then** all breakdowns, digests, and reports covering that transaction reflect the corrected category.
3. **Given** the user has corrected a merchant's categorization, **When** a subsequent comparable transaction from that merchant is ingested, **Then** it is categorized consistently with the correction.
4. **Given** the user corrects a categorization for a merchant with existing history, **When** the correction is saved, **Then** the user is offered a retroactive fix stating how many past transactions it would change, and nothing historical changes unless they accept.
5. **Given** the user accepts a retroactive correction, **When** it is applied, **Then** transactions they had previously corrected by hand keep their existing categories, and all affected totals and reports are restated.
6. **Given** the user never opens the review queue, **When** time passes, **Then** the system continues to operate and report using best-guess categories, clearly marking unconfirmed amounts.

---

### Edge Cases

- A connected account's authorization expires or the institution requires re-authentication: the system must notify the user that data is incomplete and must not present partial data as complete totals.
- An upstream data source is unavailable for an extended period: on recovery, backfilled transactions must be ingested, categorized, and retroactively folded into any already-delivered periods.
- A transaction is reversed, refunded, or disputed: totals and category breakdowns must net it out rather than double-count the original and the reversal as separate spending.
- Transfers between the user's own connected accounts, and credit card payments from a connected checking account: these move money without being spending and must not inflate spending totals or category breakdowns.
- Income arrives irregularly, from multiple sources, or changes (raise, job change, gap in pay): detection must re-learn rather than hold a stale pattern, and balance-shortfall projections must be withheld or qualified while confidence is low rather than asserting a confident wrong prediction.
- Cash withdrawals: spending is visible as an ATM withdrawal but its true category is unknowable, and must be represented honestly rather than guessed.
- A merchant's descriptor is unreadable or generic (payment processor strings, aggregator descriptors): categorization must fall back to low confidence and the review queue rather than assigning a confident wrong category.
- The first weeks after setup, when there is little or no history: baselines, deviations, and projections must be withheld or explicitly qualified rather than computed from meaningless samples.
- The user connects an account with a long transaction history: historical data must be backfilled and categorized so insights are available without waiting months.
- A foreign-currency purchase settles at a different USD amount than the authorization, or the same merchant abroad posts at varying dollar amounts: reconciliation and duplicate detection must operate on settled amounts and must not treat normal exchange-rate variation as a duplicate or a distinct merchant.
- A category is renamed or merged after reports referencing it were already generated: prior reports must remain coherent rather than showing a category that no longer exists or silently comparing mismatched buckets.
- Duplicate-charge detection versus legitimate repeat purchases (two identical coffees in one day): the user must be able to dismiss a false positive without suppressing genuine future duplicate alerts.
- The user's delivery destination for alerts or reports becomes unavailable: undelivered notifications must be retained and surfaced, not lost.
- A single alert-worthy event that satisfies multiple triggers at once must not generate a burst of redundant notifications.
- A background failure repeats silently — an expired token, a persistent categorization error, a job that never completes: the user must be told rather than left to discover it from a wrong number weeks later.
- Diagnostic export is requested: the export must be verifiably free of merchant names, amounts, balances, and credentials before it leaves the machine.
- The application is closed for days or weeks: on next launch it must backfill, categorize, evaluate every alert rule against the backlog, and generate any missed scheduled reports — while making clear these are late, not live.
- A long absence produces a large alert backlog: the user must receive a coherent digest of what happened rather than dozens of stale individual notifications.
- The machine is offline or the aggregation provider is unreachable: all existing data stays viewable and is explicitly labeled as of the last successful sync.
- The user's machine is lost, replaced, or the disk fails: without a backup there is no recovery, since no server-side copy exists — the system must make backup an obvious, prompted action rather than a buried option.
- Account-access tokens expire while the application has been closed for an extended period, requiring re-authentication before any catch-up can occur.

## Requirements *(mandatory)*

### Functional Requirements

#### Account Connection & Data Capture

- **FR-001**: System MUST allow the user to connect multiple financial accounts of differing types — checking accounts, credit cards, and payment applications — during a one-time setup.
- **FR-002**: System MUST capture transactions from every connected account automatically, with no manual import, file upload, or manual entry required at any point after setup.
- **FR-003**: System MUST record, for each transaction, at minimum: amount, merchant or description, date and time, source account, and direction (money in or money out).
- **FR-004**: System MUST backfill available historical transactions when an account is first connected.
- **FR-005**: System MUST deduplicate transactions such that a transaction delivered multiple times is stored and counted exactly once.
- **FR-006**: System MUST reconcile pending transactions with their final posted form by updating the existing record rather than creating a second one.
- **FR-007**: System MUST identify transfers between the user's own connected accounts and payments toward connected credit accounts, and MUST exclude them from spending totals and category breakdowns.
- **FR-008**: System MUST net refunds, reversals, and chargebacks against the original transaction so that spending totals reflect actual net spend.
- **FR-084**: For a transaction originating in a currency other than the account's currency, System MUST use the settled amount in the account's currency as the authoritative value for all totals, categorization, alerts, baselines, and reports.
- **FR-085**: System MUST retain the original currency code and original amount as display-only metadata, and MUST show them when presenting that transaction's detail.
- **FR-086**: System MUST NOT perform currency conversion of its own, and MUST NOT include an original foreign amount in any calculation.
- **FR-009**: System MUST detect when a connected account's data feed is stale, disconnected, or requires re-authentication, notify the user, and mark affected periods as incomplete wherever totals are presented.

#### Categorization

- **FR-010**: System MUST assign a spending category to every captured transaction without user involvement.
- **FR-078**: System MUST ship a curated default category taxonomy that is usable immediately, with no setup or configuration required from the user.
- **FR-079**: Users MUST be able to add, rename, merge, and hide categories.
- **FR-080**: System MUST support at most one level of subcategories beneath a top-level category. Deeper nesting MUST NOT be permitted.
- **FR-081**: Merging two categories MUST reassign all affected transactions and restate all derived figures, consistent with FR-015.
- **FR-082**: Hiding a category MUST NOT delete or orphan its historical transactions; hidden categories remain in historical reporting and are excluded only from new-assignment choices.
- **FR-083**: System MUST keep month-over-month and period-over-period comparisons coherent across category changes, presenting the comparison under the current taxonomy rather than silently mismatching renamed or merged categories.
- **FR-011**: System MUST use transaction context beyond the merchant name — including amount, day of week, time of day, and the user's own prior purchase history at that merchant — when determining a category.
- **FR-012**: System MUST record a confidence value with every categorization.
- **FR-013**: System MUST flag for user review any categorization whose confidence falls below a configurable threshold, while still including the transaction in totals under its best-guess category, marked as unconfirmed.
- **FR-014**: System MUST allow the user to change any transaction's category, whether flagged or not.
- **FR-015**: System MUST restate all affected historical totals, breakdowns, and previously generated period figures when a category is corrected.
- **FR-016**: System MUST apply a user's correction to future comparable transactions from the same merchant.
- **FR-074**: When a user corrects a categorization, System MUST offer to apply that correction retroactively to existing transactions from the same merchant, and MUST state how many transactions would be affected before the user decides.
- **FR-075**: System MUST NOT apply a retroactive correction without explicit user confirmation; forward-only is the default behavior.
- **FR-076**: A retroactive correction MUST NOT overwrite any categorization the user previously confirmed by hand. Prior user corrections always win.
- **FR-077**: System MUST restate all affected historical totals, reports, and baselines after a retroactive correction is applied, consistent with FR-015.
- **FR-017**: System MUST continue operating and reporting on best-guess categories indefinitely if the user never reviews the flagged queue.
- **FR-018**: System MUST categorize every transaction such that category totals for any period sum to that period's transaction total with no unaccounted remainder.

#### Recurring Charge Detection

- **FR-019**: System MUST identify recurring charges across all connected accounts by detecting consistent merchant, amount, and cadence patterns.
- **FR-020**: System MUST support detection of recurring charges at differing cadences, including at minimum monthly, quarterly, and annual.
- **FR-021**: System MUST present a ledger of all detected recurring charges including merchant, amount, cadence, first-seen date, cumulative amount paid, and active or inactive status.
- **FR-022**: System MUST notify the user when a previously unseen recurring charge is detected.
- **FR-023**: System MUST notify the user when a detected recurring charge changes amount.
- **FR-024**: System MUST mark a recurring charge inactive when it stops occurring beyond its expected cadence, rather than removing it from history.
- **FR-025**: System MUST NOT classify irregular repeat purchases at the same merchant as recurring charges.

#### Income Detection

- **FR-069**: System MUST detect recurring income by identifying repeating deposits across connected accounts, using the same cadence-detection approach applied to recurring charges.
- **FR-070**: System MUST derive the next expected income date and expected amount from the detected pattern, and MUST re-derive them when the pattern changes.
- **FR-071**: Users MUST be able to confirm, correct, or override a detected income pattern — including its cadence, amount, and source account — and MUST be able to add an income source the system did not detect.
- **FR-072**: System MUST NOT require the user to configure income for the system to function; detection is the default and confirmation is optional.
- **FR-073**: System MUST qualify or withhold any balance-shortfall projection when no income pattern has been detected or confirmed, rather than projecting against an assumed date.

#### Alerts

- **FR-026**: System MUST alert the user when a single transaction exceeds a user-configurable amount threshold.
- **FR-027**: System MUST alert the user when cumulative spending within a single day exceeds a user-configurable amount threshold.
- **FR-028**: System MUST alert the user to suspected duplicate charges, defined as transactions sharing merchant and amount within a configurable time window.
- **FR-029**: System MUST project account balance forward to the next expected income date and alert the user when the projection falls below a user-configurable floor.
- **FR-030**: System MUST deliver alerts promptly after the triggering transaction is captured, without waiting for a scheduled reporting cycle.
- **FR-031**: System MUST suppress repeated alerts for the same underlying event, and MUST NOT emit multiple notifications when one event satisfies several triggers simultaneously.
- **FR-032**: Users MUST be able to dismiss an individual alert as a false positive without disabling that alert type.
- **FR-033**: Users MUST be able to configure every alert threshold and enable or disable each alert type individually.
- **FR-034**: System MUST retain and re-surface notifications that could not be delivered rather than discarding them.

#### Scheduled Insights & Reporting

- **FR-035**: System MUST generate and deliver a weekly digest on a user-configurable schedule, without user request.
- **FR-036**: The weekly digest MUST identify categories whose spending deviates significantly from the user's own established baseline, stating the amount and the comparison to baseline.
- **FR-037**: The weekly digest MUST include a projected end-of-month position based on the current trajectory.
- **FR-038**: System MUST generate and deliver a monthly report, without user request, containing: total income, total spending, category breakdown with month-over-month comparison, spending trend direction, largest purchases with context, a full recurring-charge audit, savings rate, and projected annual spending at current patterns.
- **FR-039**: System MUST base all baselines, deviations, and anomaly claims on the individual user's own history, not on external or population averages.
- **FR-040**: System MUST withhold or explicitly qualify any baseline comparison, deviation claim, or projection when available history is insufficient to support it.
- **FR-041**: System MUST state the assumptions underlying every projection wherever a projection is presented.
- **FR-042**: System MUST fold backfilled or late-arriving transactions into subsequent insights and corrected period figures.
- **FR-043**: System MUST allow the user to view a spending breakdown by category, by merchant, and by time period on demand, independently of the scheduled digest and report.

#### Diagnostics & System Health

- **FR-087**: System MUST maintain a local, rotating diagnostic log covering sync attempts, categorization outcomes, alert evaluation, scheduled job execution, and every failure with its cause.
- **FR-088**: System MUST provide an in-app system-health view showing, per connected account: current connection status, last successful sync, last attempted sync, and recent failures.
- **FR-089**: System MUST record local operational metrics and timings — sync duration, transactions processed, categorization latency and local-vs-model resolution rates, job success and failure counts.
- **FR-090**: Users MUST be able to export diagnostics — log and metrics together — as a single file for debugging.
- **FR-091**: Diagnostic output MUST redact all financial detail. Merchant names, transaction amounts, account numbers, balances, access tokens, and API keys MUST NOT appear in any log, metric, or export. Transactions MUST be referenced by opaque identifier only.
- **FR-092**: System MUST notify the user when a background failure persists beyond a threshold, rather than relying on the user to check the health view.
- **FR-093**: Diagnostic logs MUST be bounded in size and age by rotation, and MUST NOT grow without limit.
- **FR-094**: A diagnostic or logging failure MUST NOT block ingestion, categorization, alerting, or reporting.

#### Effort, Trust & Data Handling

- **FR-044**: System MUST require zero recurring user input to remain accurate and complete; all ongoing user interaction MUST be optional.
- **FR-045**: System MUST NOT require the user to pre-allocate, budget, or approve spending before or at the time of a purchase.
- **FR-046**: System MUST present spending information factually and without moralizing or judgmental framing.
- **FR-047**: System MUST protect financial account credentials and transaction data in transit and at rest, and MUST NOT expose account credentials to the application beyond what is required to establish the connection.
- **FR-048**: System MUST allow the user to disconnect any account and to export or delete their transaction data.
- **FR-049**: System MUST NOT initiate, authorize, or modify any movement of the user's money; it is strictly read-and-report.
- **FR-050**: System MUST retain transaction history long enough to support year-over-year comparison, at minimum 24 months.

#### Deployment & Local Operation

- **FR-051**: System MUST be a single-user desktop application installed and run on the owner's own machine. There is no multi-tenancy, no user accounts, no sign-up, and no hosted service component operated for other users.
- **FR-052**: System MUST deliver its value through both surfaces: (a) an interactive application interface providing a dashboard, on-demand category and merchant breakdowns, the recurring-charge ledger, and the flagged-transaction review queue; and (b) unprompted push delivery of alerts and scheduled reports that reach the user without opening the application.
- **FR-053**: System MUST store all transaction history, categorizations, baselines, and generated reports locally on the user's machine. No user financial data may be persisted on any third-party server operated as part of this product.
- **FR-054**: System MUST encrypt locally stored financial data and any stored account-access tokens at rest.
- **FR-055**: System MUST retrieve transactions by polling the aggregation provider on a recurring interval, and MUST NOT require the user to operate a publicly reachable server or endpoint.
- **FR-056**: System MUST catch up on all transactions that occurred while the application was closed or the machine was offline, on next launch, and MUST evaluate alert rules against that backlog rather than silently skipping it.
- **FR-057**: System MUST clearly distinguish, when delivering a backlogged alert, that the triggering event occurred earlier and state when it occurred.
- **FR-058**: System MUST generate any scheduled digest or report whose scheduled time elapsed while the application was not running, on next launch.
- **FR-059**: System MUST function without a network connection for all views of already-captured data — breakdowns, ledger, review queue, and past reports — and MUST indicate that data is not current while offline.
- **FR-060**: System MUST allow the user to export a complete backup of their local data and to restore from one, since no server-side copy exists.
- **FR-061**: System MUST disclose to the user which transaction details, if any, are transmitted to external services for categorization, and MUST make that behavior a user-visible setting rather than an invisible default.

#### Interface

- **FR-062**: System MUST present a primary dashboard giving the user their whole financial position at a glance: current balance across all connected accounts, cash flow for the current period, spending by category, and what has changed or is unusual since last viewed.
- **FR-063**: Users MUST be able to drill from any presented figure — a category total, a trend line, a report line item, a recurring charge — down to the individual transactions composing it.
- **FR-064**: System MUST provide a searchable, filterable transaction register across all connected accounts, filterable by date range, category, merchant, amount range, account, and confirmation status.
- **FR-065**: System MUST present spending over time in visual form, supporting comparison of a period against the user's prior periods.
- **FR-066**: System MUST NOT require or present data-entry workflows as a normal part of use: no manual transaction entry, no reconciliation step, no envelope or budget allocation gate. Every editing affordance is a correction to an automated result, never a prerequisite for one.
- **FR-067**: System MUST make the flagged-transaction review queue resolvable in bulk, so that clearing a month of flags is a short session rather than a per-transaction chore.
- **FR-068**: System MUST remain responsive when navigating, filtering, and drilling through the user's full retained history, not only recent periods.

### Key Entities

- **Connected Account**: A financial account the user has linked — checking, credit card, or payment application. Holds institution, account type, connection health status, last successful sync time, and current balance where available.
- **Transaction**: A single money movement on a connected account. Holds settled amount (authoritative for all calculations), direction, merchant or description, posted and pending timestamps, source account, settlement status, whether it is an internal transfer or a refund of another transaction, and — when the purchase originated in another currency — the original currency code and amount as display-only metadata.
- **Category**: A spending classification applied to transactions. Seeded from a curated default taxonomy and extensible by the user (add, rename, merge, hide), with at most one level of subcategory nesting. Categories are the unit of every breakdown, baseline, deviation, and comparison in the product.
- **Categorization**: The assignment of a category to a transaction. Holds the assigned category, a confidence value, the context that drove the decision, whether it is user-confirmed or system-guessed, and any correction history.
- **Recurring Charge**: A detected repeating obligation. Holds merchant, current amount, cadence, first-seen date, most recent occurrence, cumulative amount paid, amount-change history, and active/inactive status.
- **Income Source**: A detected or user-confirmed recurring deposit. Holds source account, amount, cadence, next expected date, detection confidence, and whether the user has confirmed or overridden it. Supplies the horizon for balance-shortfall projection.
- **Alert Rule**: A user-configurable trigger condition — threshold amount, time window, and enabled state — that governs when the user is notified.
- **Alert**: A fired instance of an alert rule. Holds the triggering transaction or condition, time fired, delivery status, and whether the user dismissed it as a false positive.
- **Diagnostic Event**: A recorded operational occurrence — sync attempt, categorization outcome, job run, or failure. Holds event type, timestamp, outcome, duration, opaque subject identifier, and error cause. Contains no financial detail.
- **Baseline**: The user's own established normal range for a category over a period, derived from their history and used as the reference for every deviation claim.
- **Period Report**: A generated weekly digest or monthly report. Holds the period covered, the figures and insights presented, generation time, and delivery status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user who performs no action after initial setup receives complete and accurate spending totals — the system requires zero manual transaction entry or categorization to stay correct.
- **SC-002**: At least 94% of transactions are categorized correctly without the user ever seeing or touching them, measured against user-confirmed ground truth.
- **SC-003**: 100% of transactions from connected accounts are captured; no transaction that appears on a connected account statement is missing from the system.
- **SC-004**: Category totals reconcile exactly to transaction totals for any period, with zero unaccounted amount.
- **SC-005**: The system identifies at least 95% of the user's genuinely recurring charges, including those the user is unaware of, with a false-positive rate under 10%.
- **SC-006**: While the application is running, alerts for large purchases, daily-spend breaches, and duplicate charges reach the user within one polling interval of the transaction becoming available from the aggregation provider.
- **SC-006a**: When the application has been closed, 100% of alerts that would have fired during the closed period are delivered on next launch, each labeled with when the triggering event actually occurred. No alert is lost to downtime.
- **SC-007**: Ongoing user time investment averages 40 minutes per month or less — approximately 10 minutes reading the monthly report and 30 minutes resolving flagged transactions — with no daily or weekly obligation.
- **SC-008**: The weekly digest and monthly report are delivered on schedule without user request at least 99% of the time.
- **SC-009**: Setup — connecting all accounts and configuring alert thresholds — completes in under 30 minutes.
- **SC-010**: Every figure in every digest and report is independently reproducible from the underlying transaction data.
- **SC-011**: Users can identify their three largest discretionary spending patterns within 10 minutes of first reading a monthly report.
- **SC-012**: Within six months of continuous use, users can quantify a measurable change in monthly savings rate attributable to spending categories the system surfaced.
- **SC-013**: Users remain active after six months at a materially higher rate than their own prior history with manual budgeting tools (which the source case abandoned within four days).
- **SC-014**: No incomplete period is ever presented as complete: whenever an account feed is stale or disconnected, every affected total carries that qualification.
- **SC-015**: All views of already-captured data open and remain fully usable with no network connection, clearly marked as of the last successful sync.
- **SC-016**: All user financial data resides on the user's machine; a full audit of persisted data finds zero user transaction records on any third-party server operated as part of this product.
- **SC-017**: A restore from exported backup onto a clean install reproduces the complete prior state — transactions, corrections, baselines, and reports.
- **SC-018**: From the dashboard, a user can reach the individual transactions behind any headline figure in no more than two interactions.
- **SC-019**: On opening the application, a user can state their current position — balances, period cash flow, and what is unusual — within 30 seconds and without navigating away from the first screen.
- **SC-020**: Navigating, filtering, and drilling through the full retained transaction history feels immediate, with no perceptible wait on the user's own machine.
- **SC-021**: The application contains zero workflows that require the user to enter or reconcile transaction data in order for the system to stay accurate.
- **SC-022**: Any background failure is discoverable by the user within one day of occurring, without the user having gone looking for it.
- **SC-023**: A diagnostic export contains zero merchant names, transaction amounts, balances, account numbers, or credentials — verifiable by automated scan.
- **SC-024**: Every background failure recorded in the health view has a corresponding log entry sufficient to identify its cause.

## Assumptions

- **Deployment**: Single-user desktop application, installed and run on the owner's own machine. All data at rest is local. There is no multi-tenancy, no hosted backend operated for users, and no cloud copy of financial data.
- **"Local" has a hard boundary**: The application cannot be network-isolated. Bank and card aggregation is inherently a call to an external provider, and no desktop application can connect to financial institutions directly. "Local" here means data is *stored* only on the user's machine and no server component is operated on their behalf — not that the application runs without network access.
- **Polling, not webhooks**: Because a desktop application has no publicly reachable address, transactions are retrieved by polling on an interval rather than pushed by the provider. This is the direct cause of two constraints: alert latency is bounded by the polling interval, and nothing is detected while the application is not running. The source article's server-based design does not have this limitation; it was traded away deliberately in exchange for local-only data.
- **Downtime is expected, data loss is not**: The application will routinely be closed. Correctness is therefore defined by complete catch-up on launch, not by continuous uptime.
- **Backup is the user's responsibility, prompted by the system**: With no server-side copy, machine loss means data loss. The system must make export and restore first-class.
- **Read-only by design**: The system observes and reports; it never moves money, cancels subscriptions, or acts on the user's behalf. The user acts on the information themselves. This is assumed, not stated in the source.
- **Aggregation dependency**: Automatic capture depends on a third-party financial data aggregation service that supports the user's institutions. Any account the aggregator cannot reach cannot be tracked automatically; the source article's stated per-account cost tiers imply this dependency is a real and recurring operating cost.
- **Technology is deferred**: The source article names specific vendors and tools for aggregation, workflow automation, AI categorization, storage, messaging, and document hosting. These are treated as implementation candidates, not requirements. Technology selection belongs to `/speckit-plan`.
- **Categorization is probabilistic**: Perfect categorization is impossible. The 94% accuracy target and a confidence threshold near 80% come from the source system's observed behavior; both the threshold and the target are treated as tunable.
- **Categorization privacy is an open decision** *(flagged for `/speckit-plan`)*: Context-aware categorization at the accuracy target described requires a capable language model. A hosted model API means transaction descriptors, amounts, and timestamps leave the machine — which is in tension with the local-only intent, though it sends no account credentials and no account numbers. A locally-run model keeps everything on the machine at some cost to accuracy and machine resources. FR-061 requires that whichever is chosen be disclosed and user-controllable. The choice itself belongs to planning.
- **Aggregation provider access is a real prerequisite**: Live bank connections through a commercial aggregator require an approved production account and carry recurring per-connection cost. This is a gating dependency for the product to function at all, and must be validated during planning rather than discovered during implementation.
- **Baselines are personal**: All "normal" and "unusual" judgments derive from the individual user's own history. No external benchmarks, peer comparisons, or population averages are used.
- **History requirement**: Meaningful baselines, deviation detection, and projections require roughly 4–8 weeks of history. Before that, the system reports facts and withholds comparative claims.
- **Experience benchmark**: Quicken and Monarch Money define the expected depth and polish of the interface — a complete financial application, not a utility. They are a benchmark for surface quality and breadth, not a specification of their feature set; their data-entry, reconciliation, and manual-budgeting workflows are explicitly not being reproduced.
- **Currency and locale**: US financial institutions, US date and dollar conventions. Accounts are USD-denominated; multi-currency *accounts* and international institutions are out of scope for v1. Individual foreign-currency *purchases* on a USD account are supported and handled per FR-084–FR-086: the settled USD amount is authoritative, the original currency and amount are display-only.
- **Income regularity**: Income is detected automatically from recurring deposits, with user confirmation and override available (FR-069–FR-073). Balance-shortfall projection assumes a broadly predictable income cadence; irregular income degrades projection confidence, and the system must qualify or withhold rather than assert in that case.
- **Notification channels exist**: Unprompted delivery uses native desktop notifications at minimum, so alerts reach the user without opening the application. Any additional destination (messaging, email) is optional and secondary.
- **Out of scope for v1**: Investment and retirement account tracking, net worth calculation, debt payoff planning, tax preparation and categorization, bill payment, goal-based savings automation, multi-currency, shared or household budgets, credit score monitoring, mobile applications, and any cross-device sync.
