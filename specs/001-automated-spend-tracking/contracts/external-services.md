# Contract: External Service Boundaries

Two external services. Both are called **only from the main process**.

---

## Plaid

**Client**: `plaid` 46.0.0. **Auth**: `client_id` + `secret`, user-supplied, `safeStorage`-encrypted (see R8 for the accepted deviation).

| Endpoint | When | Contract notes |
|---|---|---|
| `/link/token/create` | Connect or re-auth | `products: ["transactions"]`, `country_codes: ["US"]`. **No `redirect_uri`** — Hosted Link (R1) |
| `/link/token/get` | Poll after Hosted Link | Retrieves the session's `public_token` without a frontend callback |
| `/item/public_token/exchange` | Once per connection | Yields the durable `access_token` |
| `/transactions/sync` | Every poll, and on every launch | Cursor-paged until `has_more = false`. **The cursor is persisted in the same transaction as the data it describes** — a crash must re-fetch, never skip |
| `/accounts/balance/get` | Before balance-floor evaluation | Balances are never rendered without `balance_as_of` |
| `/item/remove` | Disconnect | Called before local deletion (FR-048) |
| `/transactions/refresh` | **User-initiated "Sync now" only** | Separately billed; never on a timer |

**Mapping guarantees**
- `added` → insert, keyed on `plaid_transaction_id` (unique index enforces FR-005)
- `modified` → **update in place** (FR-006)
- `removed` → `settlement_state = 'removed'`, row retained (FR-008)

**Failure handling**: `ITEM_LOGIN_REQUIRED` → institution `status = reauth_required`, user notified, all affected totals qualified (FR-009). Rate limits → exponential backoff; the cursor makes retry free of duplicates.

---

## Anthropic

**Client**: `@anthropic-ai/sdk` 0.122.0. **Model**: `claude-opus-5` (default; user-selectable — Haiku 4.5 and Sonnet 5 are both viable, see R4 cost table). **Reached only when the local classifier cannot resolve a transaction.**

**Request shape**
- `client.messages.create` with `output_config: { format: {...} }` (structured outputs) — **not** the deprecated `output_format` parameter.
- `thinking: { type: "adaptive" }`. **`budget_tokens` returns a 400 on Opus 5 — never send it.**
- `output_config.effort` tuned low; this is narrow classification, not reasoning-heavy work.
- Prompt caching on the stable prefix (system prompt + category taxonomy). Volatile per-transaction content goes **after** the last cache breakpoint.
- Backfill of a long history uses the **Batch API** (50% cost, latency irrelevant for historical data).

**What is transmitted** (FR-061 — this list is the disclosure shown in-app):
merchant descriptor · amount · date and time · the user's own prior category distribution *for that merchant only*.

**What is never transmitted**: credentials, account numbers, institution identifiers, balances, other accounts' data, aggregate totals, any cross-merchant history.

**Response schema**
```
{ categoryId: string, confidence: number (0..1), reasoning: string }
```

**Failure handling**: any API failure → categorize locally at best effort, mark `needs_review = true`, and continue. **Categorization failure must never block ingestion** — transactions are captured regardless, because a missing transaction is a correctness bug while a poorly categorized one is a review-queue item.

**`local_only` mode**: this entire boundary is skipped. The local classifier's output stands, with a larger review queue as the accepted trade.
