# Research: Shared Plant Watering Tracker

All Technical Context items are resolved. No NEEDS CLARIFICATION remain.

## 1. Application stack (TypeScript end to end)

- **Decision**: An npm-workspaces monorepo:
  - Fastify 5 server
  - React 19 + Vite SPA
  - a shared package of Zod schemas and domain logic
- **Rationale**:
  - Constitution Principle I requires one shared source of types.
  - Fastify has first-class TypeScript support and `inject()` for fast HTTP tests without
    a running server.
  - Vite gives a quick React dev loop.
- **Alternatives considered**:
  - Next.js: a full-stack framework, but a long-lived Socket.IO server sits awkwardly
    beside its route handlers and serverless model.
  - Express: weaker typing.
  - NestJS: too much structure for the project scope (Principle V).

## 2. Persistence

- **Decision**: Prisma ORM with SQLite; the schema is kept portable to PostgreSQL.
- **Rationale**:
  - No database server is needed to run or grade the project.
  - Prisma generates TypeScript types and handles migrations.
  - The scale (≤ 50 plants and ≤ 10 members per group) is far below SQLite's limits.
- **Alternatives considered**:
  - PostgreSQL from the start: adds Docker or a hosted DB to setup.
  - Drizzle: also good; Prisma chosen for more mature migration tooling and familiarity.
  - In-memory storage: loses data on restart.

## 3. Authentication & sessions

- **Decision**:
  - Email and password.
  - Passwords hashed with argon2id (`@node-rs/argon2`).
  - Sessions are opaque random tokens stored in a `Session` table and sent as an
    `HttpOnly; SameSite=Lax; Secure` (Secure in production) cookie via `@fastify/cookie`.
  - Socket.IO authenticates with the same cookie during its handshake.
  - Failed logins return a generic `401 Invalid email or password` (FR-003).
  - `@fastify/rate-limit` is applied to the auth routes.
- **Rationale**:
  - Server-side sessions can be revoked immediately.
  - One cookie covers both HTTP and sockets.
  - argon2id is the current OWASP recommendation.
- **Alternatives considered**:
  - JWT: logout and revocation are harder, and storing the token in localStorage risks XSS.
  - A third-party IdP (Auth0 or Clerk): external dependency and account setup; overkill
    for v1.
  - Lucia or better-auth: viable, but a small hand-rolled session table over a vetted
    hashing library is simple and easy to audit.

## 4. Real-time updates & concurrency

- **Decision**:
  - Socket.IO 4 with one room per group (`group:<id>`).
  - After a REST mutation commits, the service emits a typed event to that room. Writes go
    through REST; the socket is used only for push.
  - The client patches its TanStack Query cache from events.
  - On `connect` or reconnect, the client refetches the dashboard snapshot (catch-up,
    Story 3 scenario 3).
- **Concurrency rules**:
  - Waterings are append-only `WateringEvent` rows. `lastWateredAt = max(wateredAt)` over
    events that have not been undone, so simultaneous waterings both persist and every
    view converges (FR-019).
  - Undo sets `undoneAt` rather than deleting the row.
  - Plant fields (name, interval, location, notes) use last-write-wins by server commit
    order. Each event carries the full updated plant plus an incrementing `version`;
    clients ignore events with a version lower than the one they hold.
- **Rationale**:
  - Socket.IO provides rooms, reconnection and fallback transport out of the box.
  - Keeping writes on REST means one authorization path and simple testing.
- **Alternatives considered**:
  - Server-Sent Events: simpler, but requires a manual room/fan-out registry and gives no
    clean eviction on member removal.
  - Polling: cannot reliably meet the 5 s target.
  - CRDTs: unnecessary, since the domain has no collaborative text editing.

## 5. Authorization model

- **Decision**:
  - Fastify `preHandler` guards `requireMember(groupId)` and `requireOwner(groupId)` load
    the membership.
  - Plant, watering and invitation routes resolve `groupId` from the resource itself, never
    from a client-supplied value.
  - A non-member gets `404 Not Found`, not 403, so that no plant details or even the
    plant's existence are revealed (Story 2 scenario 2).
  - Socket rooms are joined server-side only, from the user's memberships at connect time
    and on membership changes.
  - On member removal, the server calls `socketsLeave` for that user's sockets and emits
    `group:access-revoked` to them (FR-017).
- **Role matrix**: see [contracts/rest-api.md](./contracts/rest-api.md#roles).

## 6. Time zones & due calculation

- **Decision**:
  - All instants are stored in UTC.
  - `nextDueAt = lastWateredAt + intervalDays × 24h`.
  - A plant that has never been watered is due at its `createdAt`, so it shows as needing
    water immediately.
  - `classifyPlant(nextDueAt, now, viewerTz)` returns `needs_water` when `nextDueAt` falls
    on or before the end of today in the viewer's IANA time zone; otherwise it returns `ok`.
  - The computation lives in `packages/shared/domain/schedule.ts`, uses
    `date-fns` + `@date-fns/tz`, and the client calls it so each viewer sees its own "today".
    The server also returns `nextDueAt` for sorting.
- **Rationale**: This is a pure, deterministic function that is easy to test first
  (Principle II) and is consistent across members in different time zones.
- **Alternatives considered**:
  - The Temporal API: the cleanest option, but runtime support is still uneven across
    target browsers.
  - Luxon: heavier.

## 7. Invitations

- **Decision**:
  - The owner invites by email, which creates an `Invitation` (pending, 7-day expiry).
  - If the email belongs to a registered user, they see the invitation in-app and can
    accept or decline.
  - If no account exists, the invitation becomes visible when that email registers.
  - No email is sent in v1. Notifications are out of scope (FR-020); the owner shares the
    app link manually.
- **Rationale**: Meets FR-014 and the spec's edge cases without email infrastructure.
- **Alternatives considered**: Magic-link email invitations, deferred together with the
  notifications feature.

## 8. Testing strategy

- **Decision**:
  - Vitest across all workspaces.
  - Unit tests for shared domain logic, written first.
  - Server contract tests through `app.inject()` against a fresh SQLite file per test file.
  - Socket integration tests with `socket.io-client` against `app.listen(0)`.
  - One Playwright test with two browser contexts for live update (SC-004).
  - CI and pre-merge gates: `tsc --noEmit -b`, `eslint`, `vitest run`.
- **Rationale**: Matches constitution gates; fast feedback; minimal tool count.
