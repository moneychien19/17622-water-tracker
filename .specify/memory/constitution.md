<!--
Sync Impact Report
- Version change: (unversioned template) → 1.0.0
- Modified principles (template placeholders → named principles):
  - [PRINCIPLE_1_NAME] → I. TypeScript Everywhere (Strict Mode)
  - [PRINCIPLE_2_NAME] → II. Test-First for Domain Logic
  - [PRINCIPLE_3_NAME] → III. Real-Time Consistency
  - [PRINCIPLE_4_NAME] → IV. Secure Access by Default
  - [PRINCIPLE_5_NAME] → V. Simplicity & Incremental Delivery
- Added sections: Technology Constraints; Development Workflow & Quality Gates; Governance
- Removed sections: none
- Templates requiring updates: none modified by this command (templates read the
  constitution at runtime). ⚠ Review .specify/templates/plan-template.md
  "Constitution Check" when running /speckit-plan to ensure the five gates are applied.
- Follow-up TODOs: none
-->

# Water Tracker Constitution

## Core Principles

### I. TypeScript Everywhere (Strict Mode)

- All application code — client, server, and shared modules — MUST be written in TypeScript.
  Plain JavaScript source files are not permitted except for tool configuration files that
  cannot be typed.
- `tsconfig` MUST enable `"strict": true`. Disabling strict checks globally is prohibited.
- The `any` type MUST NOT be used in committed code; use `unknown` plus narrowing instead.
  Each unavoidable escape hatch (`as` cast, `@ts-expect-error`) MUST carry an inline comment
  justifying it.
- Domain types (Plant, WateringEvent, Schedule, User, Share/Permission) MUST be defined once
  in a shared module and reused by client and server; duplicated type definitions are a defect.
- Data crossing a trust boundary (HTTP request bodies, real-time messages, persisted records)
  MUST be validated at runtime against a schema from which the TypeScript type is derived.

**Rationale**: The user selected TypeScript. One language with shared, strictly checked types
across the stack removes a whole class of client/server contract bugs, which matters for a
collaborative app where many users mutate the same schedules.

### II. Test-First for Domain Logic

- Scheduling and "needs attention" logic (next-watering calculation, overdue detection,
  indoor/outdoor status) MUST be implemented as pure functions and covered by unit tests
  written before the implementation (Red → Green → Refactor).
- Every API endpoint and real-time event MUST have at least one contract/integration test
  covering the success path and the unauthorized path.
- A change MUST NOT be merged while any test or the type check (`tsc --noEmit`) fails.

**Rationale**: Incorrect watering schedules are the core failure mode of this product;
pure, tested domain logic is the cheapest way to keep it correct as features grow.

### III. Real-Time Consistency

- When a user records a watering or changes a plant's state, every other authorized viewer
  of that plant MUST see the update without a manual refresh.
- The server is the single source of truth: clients MAY apply optimistic updates but MUST
  reconcile to the server-confirmed state.
- Concurrent edits to the same plant MUST resolve deterministically (e.g., last-write-wins by
  server timestamp, or an explicitly specified rule), and the chosen rule MUST be documented
  in the feature's plan.
- Timestamps MUST be stored in UTC and converted to the viewer's time zone only for display.

**Rationale**: Shared care only works if everyone sees the same state; stale data leads to
double-watering or missed watering.

### IV. Secure Access by Default

- Every endpoint and real-time channel MUST require authentication unless it is explicitly
  documented as public (e.g., login, health check).
- Authorization MUST be enforced server-side on every read and write: a user can only view
  or modify plants and schedules they own or that have been explicitly shared with them.
  Client-side hiding is never sufficient.
- Real-time subscriptions MUST be scoped so a user never receives events for plants they
  are not permitted to view.
- Passwords MUST NOT be stored in plain text; use a vetted library or identity provider.
  Secrets MUST come from environment configuration and MUST NOT be committed.

**Rationale**: The initial requirements call out that only permitted people may view a
shared schedule; access control is a correctness requirement, not an add-on.

### V. Simplicity & Incremental Delivery

- Features MUST be delivered as independently usable user-story slices, prioritized so the
  first slice (dashboard of plants needing attention) is usable on its own.
- New dependencies, services, or architectural layers MUST be justified in the plan's
  Complexity Tracking section; the default is the simplest option that meets the spec.
- Deferred capabilities (e.g., push notifications) MUST NOT be partially built ahead of
  their spec (YAGNI).

**Rationale**: This is a course-scoped project; small, demonstrable increments reduce risk
and keep the codebase understandable.

## Technology Constraints

- **Language**: TypeScript (strict) on both client and server; Node.js LTS runtime for
  server-side code.
- **Package management**: A single package manager and a committed lockfile for the repo.
- **Linting/formatting**: ESLint with TypeScript rules and a formatter (e.g., Prettier) MUST
  be configured and pass in CI/pre-merge checks.
- **Testing**: A TypeScript-native test runner (e.g., Vitest or Jest with ts support) MUST
  be used for unit and integration tests.
- Specific frameworks (UI library, server framework, database, real-time transport, auth
  provider) are chosen per feature in `/speckit-plan` and MUST comply with Principles I–V.

## Development Workflow & Quality Gates

- Work follows the Spec Kit flow: specify → clarify → plan → tasks → implement.
- Every plan MUST include a Constitution Check confirming each principle (I–V) is satisfied
  or listing a justified, time-boxed exception.
- Pre-merge gates (all MUST pass): type check, lint, unit tests, integration/contract tests.
- Code review MUST verify authorization checks on any new data access path and the absence
  of `any` / unjustified type escapes.

## Governance

- This constitution supersedes conflicting practices, templates, or ad-hoc conventions in
  this repository.
- Amendments are made via `/speckit-constitution`, MUST include a Sync Impact Report, and
  MUST state the version bump rationale.
- Versioning follows semantic versioning: MAJOR for removing or redefining a principle,
  MINOR for adding a principle/section or materially expanding guidance, PATCH for
  clarifications and wording fixes.
- Compliance is reviewed at each `/speckit-plan` (Constitution Check) and `/speckit-analyze`
  run, and during code review. Violations MUST be fixed or recorded as justified exceptions
  in the plan's Complexity Tracking table.

**Version**: 1.0.0 | **Ratified**: 2026-11-12 | **Last Amended**: 2026-11-12
