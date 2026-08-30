# ADR 0002: Plaid client secret stored on the user's device

**Status**: Accepted · **Date**: 2026-08-29

## Context

Plaid API calls require `client_id` and `secret`. Plaid's guidance for consumer applications is
that the secret stays server-side and never ships to a client, because in a normal product one
secret serves many users and its compromise exposes all of them.

FR-051 fixes this as a single-user desktop application with no hosted backend. There is nowhere
else for the secret to live.

## Decision

Store the Plaid secret on the user's machine, `safeStorage`-encrypted.

## Why this is acceptable here, narrowly

There is exactly one user, and they own the Plaid account the secret belongs to. Compromise
exposes their own credential to themselves. The blast radius is one person, and that person is
the owner.

This reasoning does **not** generalize. It holds only because of the single-user constraint.

## Requirements that follow regardless

- Entered by the user; never bundled into the application.
- Stored `safeStorage`-encrypted, never in plaintext.
- Never written to a log (enforced structurally — the diagnostic logger cannot accept it).
- Never sent to the renderer (enforced by the IPC contract and asserted by test).

## What this forecloses

**This application cannot be distributed to other users as-is.** Doing so would require a backend
to hold the secret — which is precisely the multi-tenant architecture ruled out in FR-051.
Recorded here so the constraint is not rediscovered later as a surprise.

## Migration trigger

If the product ever needs to serve more than one user, this decision must be revisited *first*,
before any other multi-tenancy work, because it determines whether a backend exists at all.
