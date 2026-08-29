# Phase 1 Data Model

**Storage**: SQLite (SQLCipher-encrypted), accessed via Drizzle ORM. All money is stored as **integer minor units** (cents) — never floating point. All timestamps are stored as UTC ISO-8601; period boundaries are computed in the user's local timezone.

Entity names below map to the Key Entities section of `spec.md`.

---

## `institutions`

A connected financial institution (one Plaid Item).

| Field | Type | Notes |
|---|---|---|
| `id` | text PK | Local UUID |
| `plaid_item_id` | text unique | Plaid's Item identifier |
| `access_token_encrypted` | blob | `safeStorage`-encrypted; never leaves main process |
| `institution_name` | text | Display name |
| `sync_cursor` | text nullable | `/transactions/sync` cursor. Null = never synced; drives backfill (FR-004) |
| `status` | text | `healthy` \| `reauth_required` \| `error` (FR-009) |
| `last_synced_at` | text nullable | Drives staleness qualification on every total (FR-009, SC-014) |
| `created_at` | text | |

**Rule**: `sync_cursor` is the single source of exactly-once ingestion (FR-005) and of catch-up after downtime (FR-056). It is updated only after a page of results is durably committed, in the same transaction — a crash mid-sync must re-fetch, never skip.

---

## `accounts`

An individual account within an institution.

| Field | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `institution_id` | text FK → institutions | |
| `plaid_account_id` | text unique | |
| `name` / `mask` | text | Display |
| `type` / `subtype` | text | `depository`/`credit`/etc. Drives transfer detection |
| `current_balance` | integer nullable | Minor units |
| `balance_as_of` | text nullable | Never present a balance without its age |
| `is_monitored` | boolean | Whether balance-floor alerts apply (FR-029) |

---

## `transactions`

One money movement. The central table.

| Field | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `account_id` | text FK → accounts | |
| `plaid_transaction_id` | text unique | Enforces FR-005 at the schema level |
| `amount` | integer | Minor units. Sign normalized: negative = money out |
| `merchant_name` | text nullable | Plaid-enriched name when available |
| `description` | text | Raw descriptor; the fallback when merchant is generic (edge case) |
| `posted_date` | text | |
| `datetime` | text nullable | Time-of-day; feeds categorization context (FR-011) and weekday/weekend analysis |
| `pending` | boolean | |
| `settlement_state` | text | `pending` \| `posted` \| `removed` |
| `is_internal_transfer` | boolean | Excluded from spending totals (FR-007) |
| `reverses_transaction_id` | text nullable FK → transactions | Refund/reversal linkage (FR-008) |
| `first_seen_at` / `updated_at` | text | |

**Rules**:
- A `modified` result from Plaid updates the existing row **in place** (FR-006). Never insert a second row.
- A `removed` result sets `settlement_state = 'removed'`; the row is retained for audit but excluded from every total.
- **Spending totals** = transactions where `settlement_state != 'removed'` AND `is_internal_transfer = false`, with reversals netted. This single predicate is what makes FR-018 and SC-004 hold; it must live in one place in code, not be re-derived per query.

---

## `categories`

| Field | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `name` | text unique | |
| `parent_id` | text nullable FK → categories | One level of nesting only |
| `is_system` | boolean | Seeded taxonomy vs. user-created |

Includes a reserved `Uncategorizable` category for cash withdrawals, where the true category is genuinely unknowable (edge case) — represented honestly rather than guessed.

---

## `categorizations`

The assignment of a category to a transaction, kept separate from `transactions` so that correction history survives.

| Field | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `transaction_id` | text FK → transactions | |
| `category_id` | text FK → categories | |
| `confidence` | real | 0.0–1.0 (FR-012) |
| `source` | text | `local_history` \| `model` \| `user` |
| `is_confirmed` | boolean | True only when `source = 'user'` |
| `needs_review` | boolean | `confidence < threshold AND NOT is_confirmed` (FR-013) |
| `reasoning` | text nullable | Shown in the review queue so the guess is inspectable (FR-062, US6 AS1) |
| `superseded_by` | text nullable FK → categorizations | Correction chain |
| `created_at` | text | |

**Rules**:
- The current categorization is the one with `superseded_by IS NULL`. Corrections insert a new row and point the old one at it — history is never destroyed (FR-015 restatement is then a pure recomputation).
- A user correction sets `confidence = 1.0`, `is_confirmed = true`, `needs_review = false`.
- Every transaction has exactly one live categorization at all times, including unreviewed ones — this is what makes FR-017 and FR-018 hold.

---

## `merchant_profiles`

Per-merchant learned history. This is the local-first classifier's memory and the reason most transactions never reach the model (R4).

| Field | Type | Notes |
|---|---|---|
| `merchant_key` | text PK | Normalized descriptor |
| `category_distribution` | text (JSON) | `{categoryId: count}` — the "Groceries 60% / Home 25% / Clothing 15%" context from the source article |
| `user_confirmed_category_id` | text nullable | Set by a correction; makes FR-016 deterministic rather than probabilistic |
| `transaction_count` | integer | |
| `last_updated_at` | text | |

**Rule**: when `user_confirmed_category_id` is set and the transaction is unremarkable for that merchant, categorization resolves locally at high confidence with **no API call**. This is both the privacy and the cost mechanism.

---

## `recurring_charges`

| Field | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `merchant_key` | text | |
| `current_amount` | integer | Minor units |
| `cadence` | text | `monthly` \| `quarterly` \| `annual` \| `weekly` (FR-020) |
| `first_seen_date` / `last_seen_date` | text | |
| `cumulative_paid` | integer | Drives the "total paid to date" figure (FR-021) |
| `status` | text | `active` \| `inactive` (FR-024 — never deleted) |
| `detected_at` | text | Distinguishes "new to the system" from "new to the user" (FR-022) |
| `user_acknowledged` | boolean | Suppresses repeat "new subscription" notifications |

## `recurring_charge_occurrences` / `recurring_charge_amount_changes`

Link table to `transactions`, and an append-only log of amount changes (`old_amount`, `new_amount`, `changed_at`) powering the trial-conversion alert (FR-023, US2 AS5).

---

## `alert_rules` / `alerts`

`alert_rules`: `id`, `type` (`large_purchase` | `daily_total` | `duplicate_charge` | `new_recurring` | `balance_floor`), `threshold_minor`, `window_minutes`, `enabled` (FR-033).

`alerts`: `id`, `rule_id`, `triggered_by_transaction_id`, `event_occurred_at` (**true event time**, not detection time — FR-057), `detected_at`, `delivered_at` nullable (FR-034), `dismissed_as_false_positive` boolean (FR-032), `dedupe_key`.

**Rule**: `dedupe_key` is a deterministic function of rule type + the underlying event (e.g. `daily_total:2026-08-29`). A unique index on it is what enforces FR-031 — one event yields one alert, whether detected live or replayed from a backlog. Suppression must be a database constraint, not application logic that a catch-up path can bypass.

---

## `baselines`

| Field | Type | Notes |
|---|---|---|
| `category_id` | text FK | |
| `period_type` | text | `weekly` \| `monthly` |
| `mean_minor` / `stddev_minor` | integer | |
| `sample_periods` | integer | |
| `is_sufficient` | boolean | False until enough history exists |
| `computed_at` | text | |

**Rule**: `is_sufficient = false` means every consumer must report a plain total and **suppress any deviation claim** (FR-040, US4 AS2). This flag is the mechanism that stops the system inventing anomalies in week one.

---

## `period_reports`

`id`, `type` (`weekly_digest` | `monthly_report`), `period_start`, `period_end`, `content` (JSON), `generated_at`, `delivered_at` nullable, `was_late` boolean, `data_complete` boolean.

**Rule**: `data_complete = false` when any institution was stale or disconnected during the period. Every rendering of the report must carry that qualification (FR-009, SC-014). Late-arriving transactions regenerate affected reports (FR-042).

---

## `settings`

Key/value, `safeStorage`-encrypted for secret values. Holds Plaid credentials, Anthropic API key, confidence threshold, poll interval, categorization mode (`hybrid` | `local_only`, FR-061), notification preferences, and schedule cadences.

---

## Derived-value rule

`baselines`, `recurring_charges`, and `period_reports` are all **derived** from `transactions` + `categorizations`. They are caches, and every one of them must be recomputable from scratch. This is what makes FR-015 (restatement after correction), FR-042 (late-arriving data), and SC-010 (every figure independently reproducible) achievable rather than aspirational — and it makes them directly testable: recompute and compare.
