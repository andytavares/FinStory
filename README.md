# Money

A local-first personal finance desktop application that tracks every transaction, categorizes it
without you, and turns the result into recurring-charge audits, alerts, and reports — with **zero
ongoing manual input**.

The premise: every budgeting tool that requires effort gets abandoned. This one is built so that a
user who does nothing after setup still gets accurate, complete spending intelligence. Behaviour
changes through visibility, not discipline.

## What it does

- **Captures** every transaction from connected banks, cards, and payment apps automatically.
- **Categorizes** each one using your own merchant history first, and a language model only for
  merchants that history cannot resolve.
- **Finds recurring charges** — including the subscriptions you forgot you had.
- **Alerts** on large purchases, daily-spend breaches, duplicate charges, new subscriptions, and a
  balance projected below your floor.
- **Reports** weekly and monthly, delivered whether or not you open the app.

It never moves money. It reads and reports.

## Design constraints

These are enforced, not aspirational — each has tests behind it.

| Constraint | How it holds |
|---|---|
| Your data stays on your machine | SQLCipher-encrypted database; app refuses to start if OS encryption is unavailable rather than writing plaintext |
| No secret reaches the UI | All credentials live in the main process; the built renderer bundle is scanned for secrets in CI |
| Totals always reconcile | One canonical spending predicate; category totals asserted equal to transaction totals to the cent |
| Money is never a float | Integer minor units end to end |
| Nothing incomplete looks complete | Every total carries its own completeness; stale feeds qualify every figure that depends on them |
| No claim without evidence | Deviations and projections are withheld until enough history exists |
| No data entry, ever | Automated sweep asserts no entry, reconciliation, or allocation workflow exists |

## Stack

Electron 44 · React 19 · TypeScript · SQLite via SQLCipher · Drizzle ORM · Plaid · Claude ·
Vitest · Playwright

## Running it

```bash
npm install
npm run dev            # development
npm test               # unit + integration
npm run test:coverage  # enforces the 80% gate
npm run test:e2e       # Playwright against the packaged app
npm run lint           # must be 0 errors
npm run build          # production build
npm run package        # installers
```

Setup needs a Plaid account (the free Trial plan covers this — see `docs/plaid-setup.md`) and
optionally an Anthropic API key. Without the key the app runs in local-only categorization mode:
nothing leaves your machine, at the cost of a larger review queue.

## Documentation

- `specs/001-automated-spend-tracking/` — specification, plan, research, data model, contracts
- `docs/adr/` — architectural decisions, including the two accepted deviations and their migration
  triggers
- `docs/plaid-setup.md` — Plaid plans, the 10-Item lifetime cap, and the Item log
- `.specify/memory/constitution.md` — the project's governing principles

## Known limitations

- **Alert latency is bounded by the polling interval**, and nothing is detected while the app is
  closed. Correctness is defined as complete catch-up on launch, not uptime. See ADR 0004.
- **Cannot be distributed to other users as-is** — the Plaid secret lives on device, which only
  works for a single owner. See ADR 0002.
- US institutions and USD accounts only. Foreign-currency *purchases* on a USD account are
  supported; multi-currency accounts are not.
