# Implementation Plan: Shared Plant Watering Tracker

**Branch**: `001-shared-plant-watering` | **Date**: 2026-11-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-shared-plant-watering/spec.md`

## Summary

Build a web app where signed-in users manage plants in groups, see a dashboard of plants that
need water and plants that are outside, record waterings, share groups with Owner/Caretaker
roles, and see changes from other members live.

Technical approach: a TypeScript monorepo with three workspaces:

- `packages/shared` holds the Zod schemas, the inferred types and the pure scheduling logic.
- `apps/server` is a Fastify REST API plus Socket.IO for live updates. It uses Prisma over
  SQLite and cookie-based sessions.
- `apps/web` is a React (Vite) single-page app.

The server is the single source of truth. Each group is a Socket.IO room, and the server
checks membership before letting a socket join it. Watering events are append-only, so the
next due date is derived from the latest watering that has not been undone. This makes
concurrent waterings safe without locks.

## Technical Context

**Language/Version**: TypeScript 5.x (`strict: true`) on Node.js 24 LTS; ES2022 target

**Primary Dependencies**:

- Server: Fastify 5, Socket.IO 4, Prisma ORM, Zod 4, `@node-rs/argon2`
- Web: React 19, Vite, TanStack Query, `socket.io-client`, React Router
- Shared: Zod, `date-fns` + `@date-fns/tz`

**Storage**: SQLite through Prisma for development and the course demo. The Prisma schema
stays portable to PostgreSQL by changing only the provider.

**Testing**:

- Vitest for unit tests (shared, web) and integration tests (server, using `fastify.inject`
  and `socket.io-client`)
- Playwright for a single two-browser live-update end-to-end test

**Target Platform**: Modern evergreen browsers (desktop and mobile web); Linux or macOS Node
server

**Project Type**: Web application (SPA + API server + shared library)

**Performance Goals**:

- Live update delivered to other members within 5 s for 95% of events and within 30 s
  always (SC-004)
- Dashboard interactive in under 2 s on a typical connection

**Constraints**:

- Authorization is enforced server-side on every REST route and socket event.
- Timestamps are stored in UTC.
- "Due today" is computed in the viewer's time zone.
- Offline use is not supported.

**Scale/Scope**: Up to about 50 plants and about 10 members per group; tens of users in total
for v1. There are about 6 screens: sign-in, register, dashboard, plant detail, group
settings/members and invitations.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Pre-research | Post-design |
|-----------|------|--------------|-------------|
| I. TypeScript Everywhere | All three workspaces are TS with `strict`; no `any` (enforced by ESLint `no-explicit-any`); domain types come from Zod schemas in `packages/shared`; every request body and socket payload is parsed with them | ✅ | ✅ The schemas in [contracts/](./contracts/) are defined once in shared |
| II. Test-First Domain Logic | `computeNextDue`, `classifyPlant` and `canUndo` are pure functions in shared, with unit tests written first; every endpoint and socket event has a success test and an unauthorized test | ✅ | ✅ The test matrix in [quickstart.md](./quickstart.md) covers both paths |
| III. Real-Time Consistency | The server is authoritative; clients update optimistically and then reconcile with the server's echo; the conflict rule is documented; times are stored in UTC | ✅ | ✅ Append-only waterings + last-write-wins for plant fields ([research.md](./research.md) §4) |
| IV. Secure Access by Default | Auth hook on all routes except register, login and health; a membership/role guard on each group resource; a socket joins a room only after a membership check; argon2 password hashes; secrets come from env | ✅ | ✅ Member removal also evicts the member's sockets ([contracts/realtime-events.md](./contracts/realtime-events.md)) |
| V. Simplicity & Incremental | Stories are delivered in the order P1 → P2 → P3; SQLite and a monolithic server; no notifications | ✅ | ✅ The monorepo split is justified below |

**Result**: PASS. There are no unjustified violations.

## Project Structure

### Documentation (this feature)

```text
specs/001-shared-plant-watering/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── rest-api.md      # HTTP endpoints, auth and roles
│   └── realtime-events.md  # Socket.IO events and room rules
├── checklists/
│   └── requirements.md
└── tasks.md             # Created by /speckit-tasks
```

### Source Code (repository root)

```text
package.json                 # npm workspaces root; scripts: typecheck, lint, test, dev
tsconfig.base.json           # strict settings shared by all workspaces
eslint.config.js

packages/shared/
├── src/
│   ├── schemas/             # Zod schemas: user, group, membership, invitation, plant, watering, events
│   ├── domain/              # pure logic: schedule.ts (nextDue, classify), undo.ts, permissions.ts
│   └── index.ts
└── tests/unit/

apps/server/
├── prisma/schema.prisma
├── src/
│   ├── app.ts               # Fastify factory (used by tests)
│   ├── server.ts            # entry point: HTTP + Socket.IO
│   ├── auth/                # sessions, password hashing, auth hook
│   ├── authz/               # requireMember / requireOwner guards
│   ├── routes/              # auth, groups, members, invitations, plants, waterings, dashboard
│   ├── services/            # business logic that calls Prisma and emits events
│   └── realtime/            # socket auth, room join/leave, emit helpers
└── tests/
    ├── contract/            # each route: success + unauthorized
    └── integration/         # multi-user flows, socket broadcast, eviction

apps/web/
├── src/
│   ├── api/                 # typed fetch client using shared schemas
│   ├── realtime/            # socket hook that patches the TanStack Query cache
│   ├── pages/               # Login, Register, Dashboard, PlantDetail, GroupSettings, Invitations
│   └── components/
├── tests/unit/
└── e2e/                     # Playwright: two-member live update
```

**Structure Decision**: Web application as an npm-workspaces monorepo. `packages/shared` is
the one place where domain types and scheduling logic are defined, which satisfies Principle
I. The server and web apps both import from it.

## Complexity Tracking

| Choice | Why Needed | Simpler Alternative Rejected Because |
|--------|------------|-------------------------------------|
| Three workspaces (shared/server/web) | Principle I requires domain types to be defined once and shared by client and server | A single package would mix browser and Node builds; copying types into each app would break Principle I |
| Socket.IO in addition to REST | FR-018 and SC-004 require push updates within 5 s | Polling every few seconds adds load and makes the 5 s target unreliable; raw WebSocket lacks rooms and reconnection, which would have to be written by hand |
| Playwright (one e2e test) | SC-004 needs proof across two real browser sessions | Server-only socket tests do not prove that the UI updates without a refresh |
