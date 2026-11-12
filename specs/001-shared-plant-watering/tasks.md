---

description: "Task list for the Shared Plant Watering Tracker feature"
---

# Tasks: Shared Plant Watering Tracker

**Input**: Design documents from `specs/001-shared-plant-watering/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/rest-api.md,
contracts/realtime-events.md, quickstart.md

**Tests**: The tasks include tests. Constitution Principle II requires them:

- Domain logic is built test-first.
- Every endpoint and every real-time event needs a success test and an unauthorized test.

Write each test task **before** its implementation tasks and confirm that it fails.

**Organization**: Tasks are grouped by user story. US4 (authentication) is a P1 enabler and
comes first. US1 is the MVP slice.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on unfinished tasks)
- **[Story]**: US1–US4, matching the user stories in spec.md

## Path Conventions

The project is an npm-workspaces monorepo (see plan.md):

- `packages/shared/` holds Zod schemas, inferred types and pure domain logic.
- `apps/server/` is Fastify + Socket.IO + Prisma (SQLite).
- `apps/web/` is React 19 + Vite + TanStack Query.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the monorepo, the tooling and the three workspaces.

- [X] T001 Create the root `package.json` with npm workspaces `["packages/*", "apps/*"]`.
  Add scripts `dev`, `typecheck` (`tsc -b`), `lint`, `test` (`vitest run`), `e2e` and
  `db:migrate`. Add `.nvmrc` (`24`) and a `.gitignore` that covers `node_modules`, `dist`,
  `*.db`, `.env` and `playwright-report`.
- [X] T002 Create `tsconfig.base.json` with:
  - `"strict": true`
  - `"noUncheckedIndexedAccess": true`
  - `"target": "ES2022"`
  - `"module"`/`"moduleResolution"`: `"NodeNext"` (server/shared) or `"Bundler"` (web)
  - `"composite": true`

  Create a root `tsconfig.json` with project references to `packages/shared`,
  `apps/server` and `apps/web`.
- [X] T003 [P] Create `eslint.config.js` using `typescript-eslint`'s `strictTypeChecked`
  config. Set `@typescript-eslint/no-explicit-any: "error"` and
  `@typescript-eslint/ban-ts-comment` (allow `ts-expect-error` with a description). Add
  `.prettierrc` and a `format` script.
- [X] T004 [P] Scaffold `packages/shared/`:
  - `package.json` (name `@water/shared`; dependencies `zod@4`, `date-fns`, `@date-fns/tz`)
  - `tsconfig.json` extending the base config
  - `src/index.ts`
  - `vitest.config.ts`
- [X] T005 [P] Scaffold `apps/server/` with `package.json` (name `@water/server`) and
  `tsconfig.json`:
  - Dependencies: `fastify@5`, `@fastify/cookie`, `@fastify/rate-limit`, `socket.io@4`,
    `@prisma/client`, `@node-rs/argon2`, `zod@4`, `@water/shared`
  - Dev dependencies: `prisma`, `tsx`, `vitest`, `socket.io-client`
- [X] T006 [P] Scaffold `apps/web/` with Vite (React + TS template), `package.json` (name
  `@water/web`) and `tsconfig.json`:
  - Dependencies: `react@19`, `react-dom`, `react-router`, `@tanstack/react-query`,
    `socket.io-client`, `@water/shared`
  - Dev dependencies: `vitest`, `@testing-library/react`, `jsdom`, `@playwright/test`
- [X] T007 [P] Configure `apps/web/vite.config.ts` to proxy `/api` and `/socket.io` (with
  `ws: true`) to `http://localhost:4000`.
- [X] T008 [P] Create `vitest.workspace.ts` at the repo root listing
  `packages/shared`, `apps/server` and `apps/web`.
- [X] T009 [P] Create `apps/server/.env.example` with these entries:
  - `DATABASE_URL="file:./dev.db"`
  - `PORT=4000` (3000 is commonly taken by editor tooling)
  - `NODE_ENV=development`
  - `COOKIE_SECURE=false`
  - `WEB_ORIGIN=http://localhost:5173`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the database schema, shared schemas, app skeleton, session/auth hook,
authorization guards and the real-time emitter interface. Every story depends on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Database & shared schemas

- [X] T010 Write `apps/server/prisma/schema.prisma` (SQLite provider) with the models
  below, then run `prisma migrate dev --name init`. Constraints come from `data-model.md`.
  - **User**: `id` cuid, `email` unique, `displayName`, `passwordHash`, `timeZone`,
    `createdAt`.
  - **Session**: `id` is "a 32-byte random token, stored hashed (SHA-256)"; `userId` FK
    with cascade delete; `expiresAt`.
  - **Group**: `id`, `name`, `isPersonal` boolean default false, `createdAt`.
  - **Membership**: composite PK `(groupId, userId)`; `role` String (`owner` \|
    `caretaker`); `joinedAt`.
  - **Invitation**: `id`, `groupId`, `email`, `invitedById`, `status` String (`pending` \|
    `accepted` \| `declined` \| `revoked` \| `expired`), `expiresAt`, `createdAt`; index on
    `(groupId, email, status)`.
  - **Plant**: `id`, `groupId`, `name`, `intervalDays` Int, `location` String (`inside` \|
    `outside`), `notes` String?, `version` Int default 1, `createdAt`, `updatedAt`.
  - **WateringEvent**: `id`, `plantId` with cascade delete, `wateredById`, `wateredAt`,
    `undoneAt` DateTime?; index on `(plantId, wateredAt)`.
  - Deleting a Group cascades to its Membership, Invitation and Plant rows (and their
    WateringEvents).
- [X] T011 [P] Create `packages/shared/src/schemas/common.ts` with:
  - `IdSchema` (non-empty string)
  - `IsoDateTimeSchema` (ISO string → `Date`)
  - `ApiErrorSchema` (`{ error: string, issues?: unknown[] }`)
  - a `RoleSchema` enum of `owner | caretaker`
- [X] T012 [P] Create `packages/shared/src/schemas/user.ts`:
  - `UserSchema` (`id`, `email`, `displayName`, `timeZone`), with no `passwordHash`.
  - `RegisterBodySchema`:
    - email: "lowercase-normalized, valid email, ≤ 254 chars"
    - password: "≥ 8 chars"
    - displayName: "1–50 chars, trimmed"
    - timeZone: "valid IANA zone", checked with `Intl.supportedValuesOf('timeZone')` or by
      trying `new Intl.DateTimeFormat(undefined, { timeZone })`
  - `LoginBodySchema`.
- [X] T013 [P] Create `packages/shared/src/schemas/group.ts` with:
  - `GroupSchema` (name "1–60 chars")
  - `GroupWithRoleSchema`
  - `CreateGroupBodySchema` and `UpdateGroupBodySchema`
  - `MemberSchema` (`userId`, `displayName`, `email`, `role`)
  - `InvitationSchema`, whose status enum is
    `pending | accepted | declined | revoked | expired`
  - `CreateInvitationBodySchema` (email "lowercase-normalized")
- [X] T014 [P] Create `packages/shared/src/schemas/plant.ts` with:
  - `PlantSchema`:
    - name "1–60 chars"
    - intervalDays "integer 1–365"
    - location enum `inside | outside`
    - notes "≤ 1000 chars", nullable
    - version int
  - `CreatePlantBodySchema`, including optional `lastWateredAt` that must be "not in the
    future"
  - `UpdatePlantBodySchema` (partial)
  - `WateringSchema` (`id`, `wateredAt`, `wateredBy: { id, displayName }`)
  - `DashboardPlantSchema` (Plant + `groupName`, `lastWatering?: { at, byDisplayName }`,
    `nextDueAt`)
  - `DashboardResponseSchema` (`{ plants, serverTime }`)
  - `WateringHistoryPageSchema`
- [X] T015 [P] Create `packages/shared/src/schemas/events.ts` with one Zod schema per event
  in `contracts/realtime-events.md`:
  - `plant:created`, `plant:updated`, `plant:deleted`, `plant:watered`,
    `plant:watering-undone`
  - `group:updated`, `group:deleted`, `group:member-joined`, `group:member-left`,
    `group:access-revoked`
  - `invitation:received`

  Also export a `ServerToClientEvents` TypeScript interface derived from those schemas.
- [X] T016 Export all schemas and inferred types (`z.infer`) from
  `packages/shared/src/index.ts`. Depends on T011–T015.

### Shared domain: permissions (test-first)

- [X] T017 [P] Write a failing unit test `packages/shared/tests/unit/permissions.test.ts`
  for `can(role, action)` covering every row of the Roles table in
  `contracts/rest-api.md`. It must include that a caretaker may update only `location` and
  `notes`.
- [X] T018 Implement `packages/shared/src/domain/permissions.ts`. It exports an `Action`
  union type, `can(role: Role, action: Action): boolean` and
  `restrictedPlantFields(role): readonly (keyof UpdatePlantBody)[]`. T017 must pass.

### Server skeleton

- [X] T019 [P] Create `apps/server/src/config.ts`. It parses `process.env` with Zod
  (`DATABASE_URL`, `PORT`, `NODE_ENV`, `COOKIE_SECURE`, `WEB_ORIGIN`) and exports a typed
  `config`.
- [X] T020 [P] Create `apps/server/src/db.ts`, which exports `createPrisma(url?: string)`
  and a default `PrismaClient` instance.
- [X] T021 [P] Create `apps/server/src/lib/errors.ts` with these classes:
  - `HttpError(status, message)`
  - `NotFoundError` (404)
  - `ForbiddenError` (403)
  - `ConflictError` (409)
  - `UnauthorizedError` (401)
- [X] T022 [P] Create `apps/server/src/lib/validate.ts`, which exports
  `parseBody<T>(schema: ZodType<T>, body: unknown): T`. It throws a 400 error with Zod
  `issues`.
- [X] T023 [P] Create `apps/server/src/realtime/emitter.ts`. It defines:
  - an interface `RealtimeEmitter` with `toGroup(groupId, event, payload)`,
    `toUser(userId, event, payload)`, `joinGroup(userId, groupId)`,
    `leaveGroup(userId, groupId)`, `evictGroup(groupId)` and `disconnectUser(userId)`, all
    typed against `ServerToClientEvents`
  - a `NoopEmitter` implementation
  - a `RecordingEmitter` for tests
- [X] T024 Create `apps/server/src/app.ts`, which exports
  `buildApp({ prisma, emitter }): FastifyInstance`. It must:
  - register `@fastify/cookie` and `@fastify/rate-limit` (global off; enabled per route)
  - add an error handler that maps `HttpError` to its status and
    `{ error }` body, and maps ZodError to `400 { error: "validation", issues }`
  - add `GET /api/health` returning `200 { ok: true }`
  - decorate the app with `prisma` and `emitter`

  Depends on T019–T023.
- [X] T025 Create `apps/server/src/auth/sessions.ts`:
  - `createSession(userId)` generates a 32-byte random token, stores its SHA-256 hash with
    `expiresAt` 30 days ahead, and returns the raw token.
  - `validateSession(token)` hashes and looks up the token, rejects expired sessions, and
    extends `expiresAt` on use.
  - `destroySession(token)`.
  - `setSessionCookie(reply, token)` sets cookie `sid`: `HttpOnly`, `SameSite=Lax`,
    `Secure` when `config.COOKIE_SECURE`, `Path=/`.
- [X] T026 Create `apps/server/src/auth/hook.ts`. Its `requireAuth` `preHandler` reads the
  `sid` cookie, calls `validateSession`, sets `request.user` (typed via Fastify module
  augmentation in `apps/server/src/types/fastify.d.ts`), and throws `UnauthorizedError`
  otherwise. Register it on the `/api` route prefix except `/api/auth/register`,
  `/api/auth/login` and `/api/health`.
- [X] T027 Create `apps/server/src/authz/guards.ts`:
  - `loadMembership(prisma, userId, groupId)` returns the Membership or null.
  - `requireMember(userId, groupId)` throws `NotFoundError` if there is no membership. It
    must never return 403 to a non-member (research.md §5).
  - `requireRole(userId, groupId, action)` uses `can()` from shared and throws
    `ForbiddenError` when the member's role lacks the action.
  - `groupIdForPlant(plantId)` and `groupIdForWatering(wateringId)` resolve the group from
    the resource and throw `NotFoundError` if the resource is missing.
- [X] T028 Create `apps/server/src/server.ts`, the entry point. It builds the app with the
  real Prisma client and `NoopEmitter` (Socket.IO replaces this in US3), listens on
  `config.PORT`, and is wired to `npm run dev -w apps/server` via `tsx watch`.
- [X] T029 Create test helpers in `apps/server/tests/helpers/app.ts`:
  - `setupTestApp()` creates a unique temporary SQLite file, runs `prisma migrate deploy`
    against it, and returns `{ app, prisma, emitter: RecordingEmitter }`.
  - `createUserAndLogin(app, overrides?)` returns `{ user, cookie }`.
  - `teardown()` deletes the database file.

### Web skeleton

- [X] T030 [P] Create `apps/web/src/api/client.ts`. It exports `apiFetch<T>(path, schema,
  init?)`, which:
  - prefixes `/api` and sets `credentials: "include"`
  - parses the JSON response with the given Zod schema
  - throws `ApiError { status, body }` when the response is not OK
- [X] T031 Create the app shell:
  - `apps/web/src/main.tsx` (QueryClientProvider, BrowserRouter)
  - `apps/web/src/App.tsx` (route table with placeholder pages and a layout component in
    `apps/web/src/components/Layout.tsx`)

**Checkpoint**: Typecheck, lint and the T017 tests pass, and `GET /api/health` returns 200.

---

## Phase 3: User Story 4 - Sign up, sign in, and sign out (Priority: P1, enabler)

**Goal**: People can register, sign in and sign out, and every other page requires sign-in
(FR-001 to FR-003).

**Independent Test**: Register, sign out, confirm the dashboard redirects to `/login`, sign
in again and reach the dashboard (quickstart Scenario 4).

### Tests for User Story 4 ⚠️ (write first and confirm they fail)

- [X] T032 [P] [US4] Write the contract test `apps/server/tests/contract/auth.test.ts`. It
  must cover:
  - `POST /api/auth/register` returns 201, sets the `sid` cookie, and the response has no
    `passwordHash`.
  - After registering, `GET /api/groups` (or a direct Prisma check) shows one group with
    `isPersonal=true` and the user as owner.
  - Registering a duplicate email returns 409; invalid bodies return 400.
  - `POST /api/auth/login` succeeds with 200; a wrong password **and** an unknown email
    both return the identical `401 { error: "Invalid email or password" }`.
  - `POST /api/auth/logout` returns 204, and a later `GET /api/auth/me` returns 401.
  - `GET /api/auth/me` without a cookie returns 401.
- [X] T033 [P] [US4] Write the unit test `apps/server/tests/unit/passwords.test.ts`.
  `hashPassword` returns an argon2id string that is not the plaintext; `verifyPassword`
  returns true for the right password and false for a wrong one.

### Implementation for User Story 4

- [X] T034 [P] [US4] Implement `apps/server/src/auth/passwords.ts` with
  `hashPassword(plain)` and `verifyPassword(hash, plain)`, using `@node-rs/argon2`
  (argon2id). T033 must pass.
- [X] T035 [US4] Implement `apps/server/src/services/auth.service.ts`:
  - `register(body)` normalizes the email to lowercase. In one Prisma transaction it
    creates the User, a personal Group (`name: "My Plants"`, `isPersonal: true`) and an
    owner Membership. A duplicate email throws `ConflictError`.
  - `login(body)` returns the user or throws `UnauthorizedError("Invalid email or
    password")`. It always runs `verifyPassword` (against a dummy hash when the user is
    missing) to avoid leaking timing.
- [X] T036 [US4] Implement `apps/server/src/routes/auth.ts` with the four routes:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/logout` (also calls `emitter.disconnectUser`)
  - `GET /api/auth/me`

  Validate bodies with `RegisterBodySchema` and `LoginBodySchema`. Apply
  `@fastify/rate-limit` (10 requests per minute per IP) to register and login. Register the
  routes in `app.ts`. T032 must pass.
- [X] T037 [P] [US4] Create `apps/web/src/api/auth.ts` with `useMe()` (a query on
  `/auth/me` that treats 401 as `null`) and the `useRegister()`, `useLogin()` and
  `useLogout()` mutations, all typed with the shared schemas.
- [X] T038 [P] [US4] Create `apps/web/src/pages/Register.tsx`:
  - fields: email, display name, password (min 8)
  - send `timeZone` from `Intl.DateTimeFormat().resolvedOptions().timeZone`
  - show the Zod validation messages
  - navigate to `/` on success
- [X] T039 [P] [US4] Create `apps/web/src/pages/Login.tsx`. It shows the server's generic
  error message unchanged and navigates to `/` on success.
- [X] T040 [US4] Create `apps/web/src/components/RequireAuth.tsx`, which redirects to
  `/login` when `useMe()` returns null. Wrap every route except `/login` and `/register`
  with it in `App.tsx`, and add a Sign out button to `Layout.tsx`.

**Checkpoint**: Quickstart Scenario 4 passes.

---

## Phase 4: User Story 1 - See which plants need attention and log a watering (Priority: P1) 🎯 MVP

**Goal**: A user manages plants in their groups and sees a dashboard grouped into "Needs
water" and "OK", with an Outside badge and filter. They can mark plants watered with one
action, undo within 10 minutes and view history (FR-004 to FR-013).

**Independent Test**: Quickstart Scenario 1. Create Fern, Basil and Cactus; check the
grouping, the order and the Outside badge and filter; water Basil, then undo.

### Tests for User Story 1 ⚠️ (write first and confirm they fail)

- [X] T041 [P] [US1] Write the unit test `packages/shared/tests/unit/schedule.test.ts`. It
  covers:
  - `computeNextDue({ createdAt, intervalDays, lastWateredAt })`:
    - a plant never watered returns `createdAt`
    - otherwise it returns `lastWateredAt + intervalDays × 24h`
  - `classifyPlant(nextDueAt, now, tz)`:
    - returns `needs_water` when `nextDueAt` is on or before the end of today in `tz`
    - `nextDueAt` at 23:59 local is `needs_water`; at 00:00 the next local day it is `ok`
    - the same instant can be `needs_water` in `Asia/Tokyo` but `ok` in
      `America/Los_Angeles`
  - `groupDashboard(plants, now, tz, { outsideOnly })`:
    - sorts both groups by `nextDueAt` ascending
    - `outsideOnly` filters to `location === "outside"`
- [X] T042 [P] [US1] Write the unit test `packages/shared/tests/unit/undo.test.ts` for
  `canUndo(watering, userId, now)`:
  - true at exactly 10:00 after the watering; false at 10:01
  - false when `wateredById !== userId`
  - false when `undoneAt` is set
- [X] T043 [P] [US1] Write the contract test `apps/server/tests/contract/groups.test.ts`:
  - `GET /api/groups` lists the caller's groups with their role
  - `POST /api/groups` returns 201 and the caller is owner
  - `PATCH /api/groups/:id`: the owner gets 200; a non-member gets 404
  - `DELETE /api/groups/:id`: the owner gets 204, and deleting a personal group returns 409
  - every route returns 401 when signed out
- [X] T044 [P] [US1] Write the contract test `apps/server/tests/contract/plants.test.ts`:
  - `POST /api/groups/:groupId/plants` returns 201 with a `DashboardPlant`
  - validation returns 400 for `intervalDays` 0 or 366, a name of 61 chars, notes of
    1001 chars, and a future `lastWateredAt`
  - with `lastWateredAt`, a WateringEvent exists at that time
  - `GET /api/plants/:id` returns 200 to a member and 404 to a non-member
  - `PATCH /api/plants/:id` increments `version`
  - `DELETE` returns 204
  - every route returns 401 when signed out
- [X] T045 [P] [US1] Write the contract test `apps/server/tests/contract/waterings.test.ts`:
  - `POST /api/plants/:id/waterings` returns 201
  - the server sets `wateredAt` and ignores any client-supplied value
  - `plant.version` increments and `nextDueAt` updates
  - `POST /api/waterings/:id/undo`: 200 within 10 min (use a fake clock), 409 after 10
    min, 409 when already undone, 403 for another member's watering (set up a membership
    directly via Prisma), and 404 for a non-member
  - `GET /api/plants/:id/waterings` returns newest first, excludes undone events, pages 20
    at a time with `nextCursor`
  - every route returns 401 when signed out
- [X] T046 [P] [US1] Write the contract test `apps/server/tests/contract/dashboard.test.ts`.
  `GET /api/dashboard` returns plants from all of the caller's groups with `groupName`,
  `lastWatering.byDisplayName`, `nextDueAt` and `serverTime`. It excludes plants from
  groups the caller is not in, and returns 401 when signed out.

### Implementation for User Story 1

- [X] T047 [P] [US1] Implement `packages/shared/src/domain/schedule.ts` (`computeNextDue`,
  `classifyPlant`, `groupDashboard`) using `date-fns` `addDays` and `@date-fns/tz`
  `TZDate` with `endOfDay`, and export it from `index.ts`. T041 must pass.
- [X] T048 [P] [US1] Implement `packages/shared/src/domain/undo.ts` with
  `UNDO_WINDOW_MS = 10 * 60 * 1000` and `canUndo`, and export it from `index.ts`. T042
  must pass.
- [X] T049 [US1] Implement `apps/server/src/services/groups.service.ts`:
  - `listForUser`
  - `create` (makes the caller owner in a transaction)
  - `rename` (owner only, via `requireRole`)
  - `remove` (owner only; `ConflictError` if `isPersonal`; cascade delete)

  Emit `group:updated` and `group:deleted` through `emitter` **after** the transaction
  commits.
- [X] T050 [US1] Implement `apps/server/src/services/dashboard.service.ts` with
  `toDashboardPlant(plant with group + latest non-undone watering + wateredBy)`, which uses
  shared `computeNextDue`. Also implement `getDashboard(userId)`: a single query over all
  of the user's memberships returning `{ plants, serverTime }`.
- [X] T051 [US1] Implement `apps/server/src/services/plants.service.ts`:
  - `create`: owner only. If `lastWateredAt` is provided, insert a WateringEvent with it.
  - `get`: member.
  - `update`: a caretaker sending fields outside `location`/`notes` gets `ForbiddenError`
    (use `restrictedPlantFields`). Increment `version` and set `updatedAt`.
  - `remove`: owner only.

  Every method resolves the group through `groupIdForPlant` and returns a
  `DashboardPlant`. Emit `plant:created`, `plant:updated` and `plant:deleted` after
  commit.
- [X] T052 [US1] Implement `apps/server/src/services/waterings.service.ts`:
  - `record(userId, plantId)`: member; `wateredAt = new Date()` on the server; in one
    transaction insert the event and increment `plant.version`; emit `plant:watered`.
  - `undo(userId, wateringId)`: uses shared `canUndo`. A different recorder gets
    `ForbiddenError`; an expired window or an already-undone event gets `ConflictError`.
    Set `undoneAt`, increment `plant.version`, and emit `plant:watering-undone`.
  - `history(plantId, cursor)`: 20 per page, `undoneAt = null`, ordered by `wateredAt`
    descending.

  Inject a `now()` clock for tests.
- [X] T053 [US1] Implement the routes and register them in `app.ts`. Validate every body
  with the shared schemas. T043–T046 must pass.
  - `apps/server/src/routes/groups.ts`: `GET`/`POST /api/groups`,
    `PATCH`/`DELETE /api/groups/:groupId`
  - `apps/server/src/routes/plants.ts`: `POST /api/groups/:groupId/plants`,
    `GET`/`PATCH`/`DELETE /api/plants/:plantId`
  - `apps/server/src/routes/waterings.ts`: `POST /api/plants/:plantId/waterings`,
    `POST /api/waterings/:id/undo`, `GET /api/plants/:plantId/waterings`
  - `apps/server/src/routes/dashboard.ts`: `GET /api/dashboard`
- [X] T054 [P] [US1] Create `apps/web/src/api/plants.ts` with these TanStack Query hooks:
  - queries: `useDashboard()`, `useGroups()`, `usePlant(id)`, `useWateringHistory(id)`
  - mutations: `useCreateGroup()`, `useCreatePlant(groupId)`, `useUpdatePlant(id)`,
    `useDeletePlant(id)`, `useWaterPlant(id)`, `useUndoWatering()`

  `useWaterPlant` applies an optimistic update that sets `lastWatering` to now, then
  reconciles with the server response (Constitution III).
- [X] T055 [P] [US1] Create `apps/web/src/components/PlantCard.tsx`. It shows:
  - the plant name, its group, "Last watered <relative> by <name>" and the next due date
    in the viewer's `timeZone`
  - an **Outside** badge when `location === "outside"`
  - a one-click **Watered** button (SC-003)
  - an inside/outside toggle

  The card links to `/plants/:id`.
- [X] T056 [P] [US1] Create `apps/web/src/components/AddPlantForm.tsx` with fields for
  group (select from the groups the user owns), name (1–60), interval in days (1–365),
  location (inside/outside), notes (≤ 1000) and an optional last-watered date (max today).
  It submits through `useCreatePlant`.
- [X] T057 [US1] Create `apps/web/src/pages/Dashboard.tsx`:
  - call `groupDashboard(plants, now, me.timeZone, { outsideOnly })` from shared
  - render a "Needs water" section, then "OK", each a list of `PlantCard`
  - add an "Outside only" filter toggle
  - show an empty state that offers `AddPlantForm`

  Make it the `/` route in `App.tsx`.
- [X] T058 [US1] Create `apps/web/src/pages/PlantDetail.tsx` at route `/plants/:id`:
  - plant fields with an edit form for owners
  - watering history (newest first, "Load more" pagination)
  - an **Undo** button on the current user's most recent watering, shown while
    `canUndo(...)` is true
  - a "Not found" state when the API returns 404
- [X] T059 [P] [US1] Create `apps/web/src/components/CreateGroupForm.tsx`, which takes a
  name (1–60) and calls `useCreateGroup`. Link it from `Layout.tsx`.

**Checkpoint**: Quickstart Scenario 1 passes. The MVP (US4 + US1) is demonstrable.

---

## Phase 5: User Story 2 - Share a plant collection with specific people (Priority: P2)

**Goal**: Owners invite people by email, invitees accept or decline, caretakers act within
their role, non-members see nothing, and owners can remove members (FR-014 to FR-017).

**Independent Test**: Quickstart Scenario 2. Alice invites Bob, and Bob accepts and can
water; Bob gets 403 on owner actions; Carol gets 404 on Tomato's URL; Alice removes Bob and
he loses access.

### Tests for User Story 2 ⚠️ (write first and confirm they fail)

- [X] T060 [P] [US2] Write the unit test `packages/shared/tests/unit/invitation.test.ts`
  for `effectiveStatus(invitation, now)`:
  - `pending` past `expiresAt` returns `expired`
  - `pending` before `expiresAt` returns `pending`
  - non-pending statuses are returned unchanged
- [X] T061 [P] [US2] Write the contract test `apps/server/tests/contract/invitations.test.ts`:
  - `POST /api/groups/:id/invitations`:
    - the owner gets 201 with `expiresAt = now + 7 days`
    - 409 when the email is already a member, already has a pending invite, or the group
      is personal
    - a caretaker gets 403; a non-member gets 404
  - `GET /api/groups/:id/invitations` is owner only
  - `DELETE /api/invitations/:id` changes the status to revoked
  - `GET /api/me/invitations` lists only pending, unexpired invitations for the caller's
    email, including ones created before the invitee registered
  - `POST /api/invitations/:id/accept` returns 200 and creates a caretaker membership; it
    returns 404 when the invitation is addressed to someone else and 409 when expired
  - `POST /api/invitations/:id/decline` returns 204
  - every route returns 401 when signed out
- [X] T062 [P] [US2] Write the contract test `apps/server/tests/contract/members.test.ts`:
  - `GET /api/groups/:id/members` returns 200 to a member and 404 to a non-member
  - `DELETE /api/groups/:id/members/:userId`: the owner removing a caretaker gets 204; a
    caretaker removing themselves (leave) gets 204; a caretaker removing someone else
    gets 403; removing the owner gets 409
  - after removal, the removed user gets 404 on that group's plants
  - every route returns 401 when signed out
- [X] T063 [P] [US2] Write the integration test
  `apps/server/tests/integration/authorization-matrix.test.ts`. It is table-driven over
  every route in `contracts/rest-api.md` and asserts:
  - non-member → 404 with a body that contains no plant or group fields
  - caretaker on owner-only routes → 403
  - caretaker `PATCH /plants/:id` with `{ location }` → 200
  - caretaker `PATCH /plants/:id` with `{ intervalDays }` → 403

  It covers SC-005.

### Implementation for User Story 2

- [X] T064 [P] [US2] Implement `packages/shared/src/domain/invitation.ts` with
  `INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000` and `effectiveStatus`, and export it from
  `index.ts`. T060 must pass.
- [X] T065 [US2] Implement `apps/server/src/services/invitations.service.ts`:
  - `create(ownerId, groupId, email)`:
    - normalize the email to lowercase
    - `ConflictError` if the group is personal, the email is already a member, or a
      pending invitation exists
    - if a registered user has that email, `emitter.toUser(..., "invitation:received")`
  - `listForGroup`
  - `revoke`
  - `listForUser(email)`, which uses `effectiveStatus`
  - `accept(userId, id)`:
    - invitee only; `NotFoundError` otherwise
    - `ConflictError` if not pending or expired
    - in a transaction, set status accepted and create a caretaker Membership
    - afterwards, call `emitter.joinGroup` and emit `group:member-joined`
  - `decline`
- [X] T066 [US2] Implement `apps/server/src/services/members.service.ts`:
  - `list(groupId)`
  - `remove(actorId, groupId, targetUserId)`:
    - owner → caretaker is allowed; self-leave by a caretaker is allowed
    - target is the owner → `ConflictError`
    - anything else → `ForbiddenError`
    - after commit, call `emitter.leaveGroup(target, groupId)` and emit
      `group:access-revoked` to the user and `group:member-left` to the group
- [X] T067 [US2] Implement and register these routes. T061–T063 must pass.
  - `apps/server/src/routes/invitations.ts`: `GET`/`POST /api/groups/:groupId/invitations`,
    `DELETE /api/invitations/:id`, `GET /api/me/invitations`,
    `POST /api/invitations/:id/accept`, `POST /api/invitations/:id/decline`
  - `apps/server/src/routes/members.ts`: `GET /api/groups/:groupId/members`,
    `DELETE /api/groups/:groupId/members/:userId`
- [X] T068 [P] [US2] Create `apps/web/src/api/sharing.ts` with these hooks:
  - `useMembers(groupId)`, `useGroupInvitations(groupId)`, `useMyInvitations()`
  - `useInvite(groupId)`, `useRevokeInvite()`, `useRemoveMember(groupId)`,
    `useAcceptInvite()`, `useDeclineInvite()`

  Accept and remove invalidate the `dashboard` and `groups` queries.
- [X] T069 [US2] Create `apps/web/src/pages/GroupSettings.tsx` at route
  `/groups/:groupId/settings`:
  - rename and delete the group (owner only)
  - a member list with a Remove button (owner) or a Leave button (self)
  - an invite-by-email form and a pending-invitations list with Revoke (owner only)
  - personal groups show "Personal group cannot be shared"
- [X] T070 [US2] Create `apps/web/src/pages/Invitations.tsx` at route `/invitations`,
  which lists pending invitations with group name and inviter plus Accept and Decline.
  Show a badge with the pending count in `Layout.tsx`.
- [X] T071 [US2] Make the UI role-aware with a `useRole(groupId)` helper in
  `apps/web/src/api/plants.ts`, using `can()` from shared:
  - In `PlantCard.tsx`, `PlantDetail.tsx` and `AddPlantForm.tsx`, hide delete, rename,
    interval edit and add-plant for caretakers.
  - In `AddPlantForm`, show only the groups the user owns.
- [X] T072 [P] [US2] Create `apps/web/src/pages/NotFound.tsx`. Use it for unknown routes
  and for any 404 from `usePlant` or the group queries, so the page reveals nothing about
  the resource.

**Checkpoint**: Quickstart Scenario 2 passes. Steps 1–4 work with a manual refresh; step 5
becomes live once US3 is done.

---

## Phase 6: User Story 3 - Live updates across everyone sharing a plant (Priority: P3)

**Goal**: Changes made by any member appear on other members' open screens within 5 s
without refreshing. Concurrent waterings converge, revoked members are evicted, and clients
catch up after reconnecting (FR-018, FR-019, SC-004).

**Independent Test**: Quickstart Scenario 3. Two members' dashboards sit side by side;
watering in one updates the other within 5 s; simultaneous waterings converge with two
history entries; a client catches up after the server restarts.

### Tests for User Story 3 ⚠️ (write first and confirm they fail)

- [X] T073 [P] [US3] Write the integration test
  `apps/server/tests/integration/realtime-auth.test.ts`:
  - connecting with `socket.io-client` and no cookie, or an invalid `sid`, yields
    `connect_error` with message `"unauthorized"`
  - a valid cookie connects and the socket is in `user:<id>` and every `group:<id>` the
    user belongs to (assert with `io.in(room).fetchSockets()`)
- [X] T074 [P] [US3] Write the integration test
  `apps/server/tests/integration/realtime-watering.test.ts`:
  - when A waters, B's socket receives `plant:watered` within 5000 ms with a payload that
    passes the shared schema, and non-member C receives nothing within 1000 ms
  - when A and B each send `POST /waterings` concurrently (`Promise.all`), both receive
    events, the final `plant.version` seen by both is equal, and history has 2 entries
  - `plant:updated`, `plant:created`, `plant:deleted` and `plant:watering-undone` are
    each received by group members
- [X] T075 [P] [US3] Write the integration test
  `apps/server/tests/integration/realtime-eviction.test.ts`:
  - after the owner removes B, B's socket receives `group:access-revoked` and then
    **no** `plant:watered` when A waters again
  - after an invitation is accepted, the new member's existing socket receives
    subsequent group events without reconnecting
  - logout disconnects the user's sockets
  - group delete emits `group:deleted`, then removes everyone from the room
- [X] T076 [P] [US3] Write the unit test `apps/web/tests/unit/applyEvent.test.ts` for the
  reducer `applyEvent(dashboardCache, event)`:
  - a `plant:*` event with a higher `version` replaces the plant
  - an equal or lower `version` is ignored
  - `plant:deleted` removes the plant
  - `group:access-revoked` and `group:deleted` remove all plants of that `groupId`
  - `plant:created` for an unknown plant appends it

### Implementation for User Story 3

- [X] T077 [US3] Implement `apps/server/src/realtime/socket.ts`:
  - `attachSocketServer(httpServer, prisma)` creates a Socket.IO `Server` typed with
    `ServerToClientEvents`, with CORS limited to `config.WEB_ORIGIN` and
    `credentials: true`.
  - Handshake middleware parses the `sid` cookie from `socket.handshake.headers.cookie`,
    calls `validateSession`, and on failure calls `next(new Error("unauthorized"))`.
  - On connection, the server joins the socket to `user:<id>` and to the `group:<id>` room
    for each membership the user has.
  - Clients have no event handlers (server → client only).
- [X] T078 [US3] Implement `SocketEmitter` (implements `RealtimeEmitter`) in
  `apps/server/src/realtime/socket-emitter.ts`:
  - `toGroup` → `io.to("group:"+id).emit`
  - `toUser` → `io.to("user:"+id).emit`
  - `joinGroup` → `io.in("user:"+userId).socketsJoin("group:"+groupId)`
  - `leaveGroup` → `socketsLeave`
  - `evictGroup` → `io.in("group:"+id).socketsLeave("group:"+id)`
  - `disconnectUser` → `io.in("user:"+id).disconnectSockets(true)`
- [X] T079 [US3] Wire `attachSocketServer` and `SocketEmitter` into
  `apps/server/src/server.ts`, replacing `NoopEmitter`. Extend
  `apps/server/tests/helpers/app.ts` with `setupRealtimeTestApp()`, which listens on port 0
  with a real `SocketEmitter` and provides a `connectAs(cookie)` helper.
- [X] T080 [US3] Audit the service emissions against `contracts/realtime-events.md`. Every
  mutation must emit **after** its transaction commits, and plant events must carry the
  full `DashboardPlant` with the new `version`. Fix any gaps in these files:
  - `groups.service.ts` (`group:deleted` must be followed by `evictGroup`)
  - `plants.service.ts`, `waterings.service.ts`, `invitations.service.ts`,
    `members.service.ts`

  T073–T075 must pass.
- [X] T081 [P] [US3] Implement `apps/web/src/realtime/applyEvent.ts`, the pure reducer
  covered by T076. It updates the `["dashboard"]` and `["plant", id]` query caches using
  the version rule. T076 must pass.
- [X] T082 [US3] Implement the `useRealtime()` hook in
  `apps/web/src/realtime/useRealtime.ts`:
  - connect `socket.io-client` with `withCredentials: true` only while `useMe()` returns a
    user
  - validate each incoming event with the shared event schemas and drop invalid ones
  - call `applyEvent` through `queryClient.setQueryData`
  - on `group:member-joined` / `member-left`, invalidate the `["members", groupId]` query
  - on `invitation:received`, invalidate `["myInvitations"]`
  - on `group:access-revoked`, if the current route belongs to that group, navigate to `/`
    with the notice "You no longer have access to that group"
  - on `connect` (including reconnect), invalidate `["dashboard"]` and `["myInvitations"]`
    so the client catches up

  Mount the hook once in `Layout.tsx`.
- [X] T083 [US3] Configure Playwright in `apps/web/playwright.config.ts`. Its `webServer`
  starts the server against a temporary SQLite database plus Vite. Then write
  `apps/web/e2e/live-update.spec.ts` with two browser contexts (Alice, the owner, and Bob,
  who has accepted an invitation):
  - when Alice clicks Watered on Tomato, Bob's dashboard moves Tomato from "Needs water"
    to "OK" within 5 s without a reload (SC-004)
  - when Alice removes Bob, Tomato disappears from Bob's page

**Checkpoint**: Quickstart Scenario 3 passes and `npm run e2e` is green. All stories work.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T084 [P] Write `apps/server/tests/integration/no-secret-leak.test.ts`. It calls every
  GET and POST route and asserts that no response body contains the keys `passwordHash` or
  `sid`, or the raw session token.
- [X] T085 [P] Accessibility pass on the web pages:
  - `apps/web/src/components/PlantCard.tsx`: labeled buttons ("Mark <plant> watered"),
    and the Outside badge has text, not only color
  - `Dashboard.tsx`: section headings
  - all form inputs: labels
- [X] T086 [P] Write the root `README.md` with the project overview, the setup and run
  commands from `specs/001-shared-plant-watering/quickstart.md`, the quality-gate commands
  and the workspace layout.
- [X] T087 Run `npm run typecheck && npm run lint && npm test && npm run e2e` and fix any
  failures. Confirm the codebase has no `any` and no unjustified `as` or
  `@ts-expect-error` (Constitution I).
- [X] T088 Walk through quickstart Scenarios 1–4 by hand
  (`specs/001-shared-plant-watering/quickstart.md`) and record the results in
  `specs/001-shared-plant-watering/checklists/validation.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** has no dependencies.
- **Foundational (Phase 2)** depends on Setup and blocks every story.
- **US4 Auth (Phase 3)** depends on Foundational. US1–US3 need a signed-in user, so it
  must come before them.
- **US1 (Phase 4)** depends on US4.
- **US2 (Phase 5)** depends on US4. It reuses US1's plant and watering routes for its
  authorization-matrix test (T063) and role-aware UI (T071), so do it after US1.
- **US3 (Phase 6)** depends on US4 and on the mutations it broadcasts: US1's services, and
  US2's services for eviction and joins. Do it after US2.
- **Polish (Phase 7)** comes after all stories.

### Within Each Story

- Write the tests first and confirm they fail (Constitution II).
- Then build in this order: shared domain → services → routes → web API hooks → web pages
  and components.
- A story is complete when its checkpoint (the quickstart scenario) passes.

### Key Task Dependencies

- T016 depends on T011–T015.
- T024 depends on T019–T023.
- T026 depends on T025.
- T027 depends on T018 and T021.
- T035 depends on T034.
- T036 depends on T035 and T026.
- T049–T052 depend on T027, T047 and T048.
- T053 depends on T049–T052.
- T057 depends on T047, T054 and T055.
- T065 depends on T064.
- T067 depends on T065 and T066.
- T071 depends on T018.
- T078 depends on T077.
- T079 depends on T078.
- T080 depends on T079.
- T082 depends on T081.
- T083 depends on T082.

---

## Parallel Examples

```bash
# Phase 2, shared schemas (different files):
T011 common.ts | T012 user.ts | T013 group.ts | T014 plant.ts | T015 events.ts

# Phase 2, server skeleton pieces:
T019 config.ts | T020 db.ts | T021 errors.ts | T022 validate.ts | T023 emitter.ts | T030 web client.ts

# US1, all tests first:
T041 schedule.test | T042 undo.test | T043 groups.test | T044 plants.test | T045 waterings.test | T046 dashboard.test

# US1, shared domain and web components after the tests:
T047 schedule.ts | T048 undo.ts | T054 api/plants.ts | T055 PlantCard | T056 AddPlantForm | T059 CreateGroupForm

# US2, tests:
T060 | T061 | T062 | T063

# US3, tests, then the client reducer alongside the server socket work:
T073 | T074 | T075 | T076    →    T077→T078→T079→T080  ||  T081→T082
```

---

## Implementation Strategy

### MVP First (US4 + US1)

1. Phase 1 Setup → Phase 2 Foundational.
2. Phase 3 (US4): users can register, sign in and sign out.
3. Phase 4 (US1): the dashboard, watering, undo and history.
4. **Stop and validate**: quickstart Scenarios 1 and 4, plus all gates green. This is the
   demoable MVP for a single user.

### Incremental Delivery

1. MVP (US4 + US1).
2. Add US2, sharing and access control → validate Scenario 2 (with refresh).
3. Add US3, live updates → validate Scenario 3 and the e2e test. Scenario 2 step 5 becomes
   live.
4. Polish.

---

## Notes

- **[P]** marks tasks that touch different files and depend on no unfinished task.
- Every endpoint test covers the success path, 401, 404 (non-member) and 403 where the
  caretaker role applies (Constitution II/IV).
- Services emit real-time events only through the `RealtimeEmitter` interface. US1 and US2
  run with `NoopEmitter` or `RecordingEmitter`, and US3 swaps in Socket.IO without changing
  the services.
- Commit after each task or logical group.
