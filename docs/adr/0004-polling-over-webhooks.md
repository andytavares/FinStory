# ADR 0004: Polling `/transactions/sync` instead of webhooks

**Status**: Accepted · **Date**: 2026-08-29

## Context

The source design this product is modeled on used a server that Plaid pushed transaction webhooks
to. FR-051 makes this a desktop application, and FR-055 forbids requiring the user to operate a
publicly reachable endpoint. A desktop app has no public address, so it cannot receive webhooks.

## Decision

Retrieve transactions by polling `/transactions/sync` on a user-configurable interval.

## Why this endpoint

Its semantics map one-to-one onto requirements the specification already states:

| Response field | Requirement |
|---|---|
| `added` | FR-002 automatic capture |
| `modified` | FR-006 pending → posted reconciliation, in place |
| `removed` | FR-008 reversals netting out |
| `next_cursor` / `has_more` | FR-005 exactly-once ingestion, resumable pagination |

The cursor is simultaneously the deduplication mechanism, the resumption point after a crash, and
the catch-up mechanism after downtime. A gap of five minutes and a gap of three weeks are the same
call, which is why FR-056 needs no special code path.

## Consequences accepted

1. **Alert latency is bounded by the polling interval**, not by transaction time. SC-006 was
   written against this reality rather than promising near-real-time delivery.
2. **Nothing is detected while the application is not running.** The machine sleeps; no design
   fixes that without a server. Correctness is therefore defined as *complete catch-up on launch*
   rather than uptime, and SC-006a asserts that no alert is lost to downtime.
3. Polling faster than the institution refreshes upstream gains nothing and costs API calls, so
   the interval is a tuning knob rather than a correctness property.

## Alternatives rejected

- **Run a local HTTP listener for webhooks**: `localhost` cannot satisfy Plaid's Production https
  requirement for registered URLs, and it adds a listening socket to a security-sensitive
  application for no gain.
- **A relay server that forwards webhooks to the desktop app**: reintroduces the hosted backend
  that FR-051 rules out and that ADR 0002 depends on not existing.
- **`/transactions/get` with a date range**: requires client-side diffing to detect modifications
  and removals, and re-fetches unchanged data on every poll. `/transactions/sync` exists to
  replace this pattern.

## Migration trigger

If this ever becomes a hosted product, webhooks become available and this decision should be
revisited — but note it is downstream of ADR 0002, not independent of it.
