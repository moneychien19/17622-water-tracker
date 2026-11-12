# Water Tracker

Track plant watering and share the care with other people. A dashboard shows which plants
need water and which are outside. Anyone in a shared group can mark a plant watered, and
everyone else viewing it sees the change live.

- **Spec, plan & tasks:** [`specs/001-shared-plant-watering/`](specs/001-shared-plant-watering/)
- **Project principles:** [`.specify/memory/constitution.md`](.specify/memory/constitution.md)

## Features

- **Dashboard:** plants are grouped into "Needs water" (most overdue first) and "OK", with
  an Outside badge and an "Outside only" filter.
- **Watering:** one-click "Watered", undo within 10 minutes, and per-plant history.
- **Sharing:** groups with Owner and Caretaker roles, and invitations by email that expire
  after 7 days. Non-members get "not found" for everything in a group.
- **Live updates:** waterings, edits and membership changes reach other members within
  seconds. Clients catch up after reconnecting.
- **Accounts:** email and password sign-in with server-side sessions and argon2id hashing.

## Stack

TypeScript (strict) end to end, in an npm-workspaces monorepo:

| Workspace         | What it is                                                                         |
| ----------------- | ---------------------------------------------------------------------------------- |
| `packages/shared` | Zod schemas, inferred types, and pure domain logic (scheduling, undo, permissions) |
| `apps/server`     | Fastify 5 REST API, Socket.IO 4 for live updates, Prisma 6 over SQLite             |
| `apps/web`        | React 19 + Vite SPA using TanStack Query and React Router                          |

## Getting started

Requires Node.js 22.12 or newer.

```bash
npm install                                     # also runs `prisma generate`
cp apps/server/.env.example apps/server/.env    # DATABASE_URL, PORT=4000, COOKIE_SECURE, WEB_ORIGIN
npm run db:migrate                              # create the dev SQLite database
npm run dev                                     # API on :4000, web on http://localhost:5173
```

Vite proxies `/api` and `/socket.io` to the API, so open http://localhost:5173.

The API uses port **4000** rather than 3000 because 3000 is often taken by editor or
port-forwarding tools.

## Quality gates

All of these must pass before merging (see the constitution's Development Workflow
section):

```bash
npm run typecheck   # tsc --noEmit for every workspace
npm run lint        # ESLint strict-type-checked, including no-explicit-any
npm test            # Vitest: shared unit, server contract + integration (real sockets), web unit
npm run e2e         # Playwright: two-browser live-update test (run `npx playwright install chromium` once)
npm run check       # typecheck + lint + test
```

The e2e run starts its own API (port 4100) and web server (port 5174) against a fresh
temporary database, so it never touches your dev data.

## Layout

```text
packages/shared/src/
  schemas/       Zod schemas (user, group, plant, events), the single source of types
  domain/        schedule.ts, undo.ts, invitation.ts, permissions.ts (pure, unit-tested)
apps/server/src/
  auth/          sessions (hashed tokens in DB), password hashing, auth hook
  authz/         requireMember / requireRole guards (non-members get 404)
  services/      business logic; emit real-time events only after commit
  routes/        thin Fastify handlers that validate with the shared schemas
  realtime/      Socket.IO server, rooms, and the RealtimeEmitter interface
apps/server/tests/
  contract/      every endpoint: success, 401, 403 and 404 paths
  integration/   authorization matrix, real-socket broadcast/eviction, secret-leak checks
apps/web/src/
  api/           typed fetch client + TanStack Query hooks
  realtime/      socket hook + pure cache reducer (newer-version-wins)
  pages/ components/
```
