# ADR 0001: Adopt better-sqlite3-multiple-ciphers despite single-publisher risk

**Status**: Accepted · **Date**: 2026-08-29

## Context

Constitution Principle VII requires encryption at rest and is NON-NEGOTIABLE. Every
encrypted-SQLite driver available for Node has a single npm publisher, which the original
Principle III forbade outright.

## Decision

Adopt `better-sqlite3-multiple-ciphers` 13.0.3. Amend Principle III (constitution v1.1.0)
to assess community health on contributors, usage, and release cadence rather than npm
publisher count alone.

## Evidence

| Package | npm publishers | GitHub contributors | Downloads/week |
|---|---|---|---|
| better-sqlite3 (upstream) | 1 | 69 | 10,357,275 |
| better-sqlite3-multiple-ciphers | 1 | 35 | 74,626 |
| @journeyapps/sqlcipher | 2 | 88 | 9,394 |

The original rule would have rejected a package with 69 contributors and 10.4M weekly
downloads while accepting one with 4% of the usage, on a metric describing who holds the
publish token rather than who maintains the code.

## Alternatives considered

- **`@journeyapps/sqlcipher`** — passes the original rule, genuinely maintained. Rejected:
  Drizzle ships no driver for it, forcing a hand-rolled query layer and migration runner.
  More code we own, cutting against Principles IV and V. Async API also diverges from the
  synchronous model the ingestion path is built around.
- **`@libsql/client`** — same single-publisher property, larger footprint. Rejected.
- **Drop SQLCipher, rely on OS full-disk encryption** — violates Principle VII and FR-054.
  Not viable.

## Risk accepted

Bus-factor risk on a fork with one publisher of record.

## Migration trigger

**If the fork falls materially behind upstream better-sqlite3, or stops receiving releases,
migrate to `@journeyapps/sqlcipher` and absorb the query-layer cost.** The migration is
bounded to the storage layer because the schema is Drizzle-defined and all analysis logic is
pure over passed-in data (Principle XIII).
