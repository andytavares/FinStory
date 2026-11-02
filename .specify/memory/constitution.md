<!--
SYNC IMPACT REPORT
==================
Version change: [unversioned template] → 1.0.0 (initial population) → 1.1.0

v1.1.0 (2026-08-29) — MINOR: Principle III materially revised.
  The v1.0.0 rule ("a package maintained by a single individual MUST NOT be
  adopted, regardless of fit") used npm publisher count as its sole signal.
  That proxy proved unsound on first contact: better-sqlite3 has 69 GitHub
  contributors and 10.4M weekly downloads behind a single npm publisher, and
  the rule could not distinguish it from an abandoned hobby package. It also
  put III in direct conflict with Principle VII (encryption at rest,
  NON-NEGOTIABLE), because no multi-publisher encrypted-SQLite driver exists
  that the project's ORM supports.
  III now assesses community health on contributors, usage, release cadence,
  and responsiveness, with npm publisher count as one input among several.
  Evidence must be recorded at adoption time.

Basis: adapted from the Terminator project constitution v1.4.0
(~/repos/terminator/.specify/memory/constitution.md).

Carried over from Terminator (renumbered; Terminator's sequence skipped III):
  - I.    Source Integrity
  - III.  Dependency Stewardship          (was IV)
  - IV.   Code Readability & Minimalism   (was V)
  - V.    Test-Driven Development         (was VI)
  - VI.   SOLID Design & YAGNI            (was VII)
  - X.    Documentation as First-Class    (was VIII)
  - XI.   Architectural Decision Records  (was IX)
  - XII.  Code Cleanliness                (was X)
  - XIII. Functional Purity & Immutability(was XI)
  - XIV.  UI Icons                        (was XII)
  - Development Environment & Workflow
  - Governance

Removed from the Terminator basis:
  - Extension Isolation (Terminator II) — this project has no extension system.
    Reinstate only if one is introduced.

Added for this project's domain (each traceable to spec.md / plan.md):
  - II.   Financial Data Integrity        (FR-018, SC-004, SC-010, data-model.md)
  - VII.  Local-First Data Sovereignty    (FR-047, FR-053, FR-054, FR-061, SC-016)
  - VIII. Zero-Input Doctrine             (FR-044, FR-045, FR-066, SC-001, SC-021)
  - IX.   Honest Reporting                (FR-009, FR-040, FR-041, SC-014)

Templates checked:
  ✅ .specify/templates/plan-template.md — Constitution Check gate present; no change required
  ✅ .specify/templates/spec-template.md — no conflicts
  ✅ .specify/templates/tasks-template.md — no conflicts

Follow-up TODOs:
  - Principle XIV (UI Icons) requires `lucide-react`, which is not yet in the
    dependency list in specs/001-automated-spend-tracking/plan.md. Add it during
    /speckit-tasks. Not added here: this command's scope is the constitution only.
  - Principle V's coverage gate requires vitest.config.ts thresholds to be
    configured as part of the foundation stage.
-->

# Money Constitution

## Core Principles

### I. Source Integrity

All development decisions MUST be grounded in official, vendor-published documentation.
Blogs, Stack Overflow posts, and community tutorials are acceptable for orientation
only — they MUST NOT be the sole basis for implementation choices.

- **MUST** cite official docs when selecting an API, pattern, or behavior.
- **MUST** verify behavior against the official specification, not inferred examples.
- When official docs and community guidance conflict, official docs win.
- A figure that cannot be verified MUST be recorded as unverified. Estimating a number
  and presenting it as fact is a defect, not a shortcut.

### II. Financial Data Integrity (NON-NEGOTIABLE)

This application's only value is that its numbers are correct. A wrong number is worse
than no number, because the user acts on it.

- All monetary values MUST be stored and computed as **integer minor units**.
  Floating-point arithmetic on money is forbidden without exception.
- Category totals MUST reconcile exactly to transaction totals for any period, to the
  cent, with no unaccounted remainder. This invariant MUST have a dedicated test.
- Ingestion MUST be exactly-once. A transaction delivered more than once by an upstream
  source MUST be stored and counted once.
- All derived data (baselines, recurring-charge ledgers, generated reports) MUST be
  fully recomputable from transactions and categorizations. A derived value that cannot
  be reproduced from source data MUST NOT be presented to the user.
- Money that moves between the user's own accounts is not spending and MUST NOT appear
  in spending totals. Refunds and reversals MUST net against their originals.
- Correcting a categorization MUST restate every affected historical figure. Silent
  divergence between a correction and the totals derived from it is a defect.

### III. Dependency Stewardship

Dependencies are a long-term liability. Every addition MUST be justified and evaluated
for community health before adoption.

- A package MUST demonstrate active community health before adoption. Health MUST be
  assessed on the full picture — contributor count, download volume, release cadence,
  issue responsiveness, and the number of publishers — not on any single metric.
  npm publisher count alone MUST NOT be treated as the deciding signal; a widely used
  package with many contributors and regular releases is not disqualified by having one
  publisher of record.
- A package showing genuine bus-factor risk — a lone contributor, stalled releases, or
  unanswered issues — MUST NOT be adopted when a healthier alternative exists.
- The health evidence behind an adoption decision MUST be recorded in the PR at the time
  of adoption, so the judgment can be re-examined later rather than reconstructed.
- Adopting a package that carries known bus-factor risk because no healthier alternative
  satisfies a NON-NEGOTIABLE principle MUST be recorded as an ADR, including the risk
  accepted and the condition that would trigger migration.
- When a well-known, battle-tested alternative exists, it MUST be preferred over a
  niche or newer package.
- All version constraints MUST be pinned — unpinned `latest` is forbidden in production.
- New dependencies MUST include a brief justification in the PR: community health signal
  and a link to official documentation.
- The standard library MUST be used when it fully satisfies the requirement; a third-party
  package MUST NOT be added if stdlib covers the need.
- Deprecated packages or packages carrying active CVEs MUST be replaced promptly;
  they MUST NOT be left in a passing state.

### IV. Code Readability & Minimalism

Code is a liability. The least code that correctly fulfills a requirement is the best code.

- **MUST** prefer readable, obvious code over clever or terse code.
  If a future reader would need to pause to decode it, rewrite it.
- **MUST NOT** add code speculatively. Every line written MUST serve the current requirement.
- Abstraction MUST be earned: only introduce it when two or more concrete cases demonstrably
  benefit, and the abstraction boundary is clear. Premature abstraction is treated as a defect.
- Comments are reserved for non-obvious WHY — not WHAT. Explanatory comments about
  what the code does are a sign the code should be clearer, not commented.

### V. Test-Driven Development (NON-NEGOTIABLE)

TDD is the primary mechanism for validating work. No production code is written before
a failing test exists that demands it.

- **MUST** follow Red → Green → Refactor strictly:
  1. Write a failing test that captures the requirement.
  2. Implement the minimum code to make it pass.
  3. Refactor under a green test suite.
- For bug fixes, the Red → Green → Refactor cycle is mandatory without exception.
  A bug MUST be reproduced by a failing test before any fix is written.
- Passing tests do not constitute completion. Work MUST be verified against the agreed
  spec and validated manually before being marked done.
- Test coverage MUST be scoped to behavior, not implementation internals.
- **Coverage gate: 80% minimum** — statements, branches, functions, and lines MUST
  each be ≥ 80% before any session or PR is considered complete. The gate is enforced
  by `vitest.config.ts` thresholds; a threshold failure is a **hard blocker**, not a
  warning. Run `npx vitest run --coverage` explicitly before reporting done.
- **No new file ships untested.** Every new production source file MUST have
  corresponding tests that bring its individual coverage to ≥ 80% at merge time.
  A file at 0% coverage is a defect, regardless of the project-wide aggregate.
- Anything time-dependent MUST be tested against an **injectable clock**. Tests that
  depend on the real system clock are non-deterministic and MUST NOT be written.

### VI. SOLID Design & YAGNI

Design MUST solve today's problem cleanly. Anticipating future requirements is actively
harmful.

- Follow all five SOLID principles as a baseline design standard.
- **YAGNI is binding**: features, interfaces, and abstractions not required by the current
  spec MUST NOT be introduced.
- The simplest design that correctly implements the spec MUST be chosen over a more
  "extensible" alternative that goes beyond scope.
- Complexity deviations from the plan MUST be recorded in the plan's Complexity Tracking
  table with justification.

### VII. Local-First Data Sovereignty (NON-NEGOTIABLE)

This is a local application holding one person's complete financial history. That data
belongs on their machine.

- User financial data MUST NOT be persisted on any third-party server operated as part
  of this product.
- The database MUST be encrypted at rest. If platform encryption is unavailable, the
  application MUST refuse to start with an explanation. Falling back to an unencrypted
  financial database is forbidden — **fail loudly, never degrade silently.**
- Secrets — API keys, access tokens, database keys — MUST live only in the main process,
  encrypted through the OS-provided facility. A secret MUST NOT reach the renderer, be
  bundled into the application, be written to a log, or be committed.
- Any data transmitted off the machine MUST be the minimum required, MUST be disclosed
  in the interface, and MUST be under user control. Adding a new outbound transmission
  without updating that disclosure is a defect.
- All views of already-captured data MUST remain fully functional with no network
  connection.

### VIII. Zero-Input Doctrine (NON-NEGOTIABLE)

The product exists because every budgeting tool that requires user effort gets abandoned.
A feature that reintroduces that effort defeats the entire product, however good it is.

- No feature MAY require recurring user input for the system to remain accurate or
  complete. All ongoing interaction MUST be optional.
- The application MUST NOT require the user to pre-allocate, budget, or approve spending
  before or at the time of a purchase.
- Reconciliation steps and budget-allocation gates MUST NOT be introduced. Editing exists
  only as a correction to an automated result, never as a prerequisite for one.
- Manual transaction entry MAY exist for money the feed cannot see (such as cash). It MUST
  stay optional: nothing may depend on the user entering anything.
- If the user never opens the application, the system MUST continue to operate, report,
  and deliver correctly.
- **The test**: if a proposed feature stops working correctly when the user ignores it,
  the feature is wrong for this product.

### IX. Honest Reporting (NON-NEGOTIABLE)

The user makes financial decisions from this output. Confident wrongness is the worst
possible failure mode — worse than silence.

- Incomplete data MUST NEVER be presented as complete. When any data source is stale,
  disconnected, or failed, every total covering the affected period MUST carry that
  qualification.
- A claim MUST NOT be made without sufficient data to support it. Baselines, deviations,
  and anomaly detection MUST be suppressed or explicitly qualified until enough history
  exists.
- Every projection MUST state the assumption it rests on. A projection presented as a
  certainty is a defect.
- Comparisons MUST be drawn from the user's own history. External benchmarks, population
  averages, and peer comparisons MUST NOT be used.
- Where a true value is unknowable, it MUST be represented as unknown rather than guessed.
- Financial information MUST be presented factually, without moralizing or judgmental
  framing.

### X. Documentation as First-Class

Documentation is part of the deliverable, not an afterthought. A feature is not complete
until its documentation is accurate.

- Docs MUST ship in the same PR as the implementation. No PR is mergeable without
  updated documentation.
- Documentation MUST be kept accurate as code evolves. Stale docs are treated as bugs.
- A feature MUST NOT be marked complete until documentation has been reviewed and
  confirmed to reflect the current implementation.

### XI. Architectural Decision Records (ADRs)

Every significant architectural decision MUST be captured in an ADR so future maintainers
understand the reasoning and tradeoffs, not just the outcome.

- An ADR MUST document: the decision taken, the motivation behind it, and the alternatives
  considered with their tradeoffs.
- ADRs MUST be written at the time of the decision, not retroactively.
- ADRs are immutable records; if a decision is reversed, a new ADR supersedes the old one
  rather than editing it.
- Accepted deviations from third-party vendor guidance MUST be recorded as ADRs, including
  the blast radius accepted and what the deviation forecloses.

### XII. Code Cleanliness (NON-NEGOTIABLE)

Dead code is a defect. Every change must leave the codebase in a cleaner state than it
found it.

- **MUST NOT** leave unused imports, unused variables, or unreachable functions. Remove
  them the moment the code that depended on them is removed or refactored. The linter
  enforces this — a lint error here means the change is incomplete.
- **MUST NOT** leave placeholder comments (`// TODO`, `// In a real implementation`,
  `// For now`) unless attached to a tracked issue reference. Placeholders rot and mislead
  future readers.
- **MUST NOT** leave dead exports. If a function, constant, or export is no longer
  referenced anywhere, delete it.
- **`npm run lint` MUST pass with 0 errors** before any session or PR is considered
  complete. Run it explicitly — a CI lint failure caused by changes in the session is a
  blocker.

### XIII. Functional Purity & Immutability

Side effects are a code smell. Functions MUST be pure, idempotent, and deterministic
wherever the problem domain allows.

- **MUST** default to immutable data structures and pure functions.
- Side effects (I/O, mutation, global state) MUST be isolated to the boundaries of the
  system and explicitly identified. They MUST NOT bleed into domain logic.
- A function with a hidden side effect MUST be refactored. If a side effect is truly
  unavoidable, it MUST be documented with an explicit justification.
- Analysis logic — categorization, cadence detection, alert evaluation, baselines, report
  generation — MUST be pure functions over data passed in. They MUST NOT reach for the
  database, the network, or the clock directly. This is what makes them testable against
  fixtures, and it is not optional.

### XIV. UI Icons (NON-NEGOTIABLE)

All icons throughout the application MUST use `lucide-react` components exclusively.

- **MUST** use `lucide-react` for every icon in the UI — no emoji, no unicode symbols,
  no other icon libraries.
- Icons MUST be flat and inherit the current text color (`currentColor`). No inline
  `color` style, no color utility classes on icon elements.
- Use `opacity` only for state differentiation (e.g., disabled or muted states). Never use
  color to differentiate icon states.
- SVG size MUST be controlled via CSS (e.g., `width`/`height` on the icon's container or a
  CSS selector targeting `svg`), not via the `size` prop, so that all icons remain
  consistent and layout-controlled.
- A PR that introduces an emoji, unicode character, or non-lucide icon as a visual element
  is **rejected** until corrected.

## Development Environment & Workflow

Isolation and process discipline prevent environment drift and protect the shared codebase.

- Development MUST occur in an isolated environment appropriate to the stack
  (local `node_modules` installs for Node; no global installs).
- Dependencies MUST be installed via the project's standard package manager only.
  Manual or ad-hoc installations outside the managed environment are forbidden.
- All feature work MUST start from an agreed spec. No implementation begins without
  a ratified specification.
- All work MUST happen on a feature branch. Direct commits to `main` are forbidden.
- Complexity deviations from the plan MUST be recorded in the plan's Complexity Tracking
  table, not silently accepted.
- Live financial credentials MUST NOT be used in automated tests. Integration tests run
  against provider sandbox environments only.

## Governance

This constitution supersedes all other practices, conventions, and ad-hoc guidance.
Compliance is not optional.

- All PRs and code reviews MUST verify adherence to these principles before merge approval.
- Amendments to this constitution require: a documented rationale, a version bump following
  semantic versioning (MAJOR for removals/redefinitions, MINOR for additions,
  PATCH for clarifications), and an updated `Last Amended` date.
- Principle violations that cannot be resolved MUST be escalated and recorded — they are
  never silently accepted.
- The constitution version and amendment history are the authoritative record of governance
  decisions affecting this project.

**Version**: 1.1.0 | **Ratified**: 2026-08-29 | **Last Amended**: 2026-08-29
