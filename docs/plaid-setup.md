# Plaid setup

## Plans

The free **Trial plan** covers this project: Transactions is included, and the cap is **10
Production Items** rather than a limit on API calls. Polling volume is not a constraint.

Two things to know:

1. **The 10-Item cap is a lifetime create limit, not a concurrent one.** Plaid's docs are explicit
   that removing an Item does not free capacity. Every re-link during development permanently
   consumes quota.
2. **Trial eligibility is date-gated** to US/Canada teams created on or after 2026-04-15.

## Development

**All development runs against Sandbox**, which is free and unlimited. Production Items are created
only deliberately, and logged below.

```
PLAID_CLIENT_ID=...      # from dashboard.plaid.com
PLAID_SECRET=...         # the SANDBOX secret for development
PLAID_ENV=sandbox
```

Credentials are entered in the app's setup screen, not committed. They are stored
`safeStorage`-encrypted (ADR 0002).

## Production Item log

Track every Production Item created, since the quota never resets.

| # | Date | Institution | Notes |
|---|------|-------------|-------|
| 1 |      |             |       |

Remaining of 10: **10**
