# Quickstart & Validation Guide

This guide shows how to run the app and prove that the feature works from end to end. For
endpoint details, see [contracts/rest-api.md](./contracts/rest-api.md) and
[contracts/realtime-events.md](./contracts/realtime-events.md). For field rules, see
[data-model.md](./data-model.md).

## Prerequisites

- Node.js 24 LTS and npm 10 or later
- Playwright browsers (`npx playwright install chromium`, run once)

## Setup

```bash
npm install
cp apps/server/.env.example apps/server/.env    # DATABASE_URL, PORT=4000, COOKIE_SECURE, WEB_ORIGIN
npm run db:migrate -w apps/server               # prisma migrate dev
npm run dev                                     # server :4000 + web :5173 (Vite proxies /api and /socket.io)
```

## Quality gates (must all pass; Constitution II and the Workflow section)

```bash
npm run typecheck     # tsc -b --noEmit across all workspaces
npm run lint          # eslint, including no-explicit-any
npm test              # vitest: shared unit + server contract/integration + web unit
npm run e2e           # playwright: two-member live update
```

## Manual validation scenarios

Open http://localhost:5173.

### Scenario 1: Dashboard and watering (Story 1, P1)

1. Register as **Alice** in time zone `America/New_York`. The dashboard is empty and the
   personal group exists.
2. Add these plants:
   - "Fern": 3 days, inside
   - "Basil": 1 day, outside, last watered 2 days ago
   - "Cactus": 14 days, inside, last watered today
3. **Expect** "Needs water" to list Basil first (most overdue), then Fern (never watered).
   "OK" lists Cactus. Basil shows an **Outside** badge.
4. Turn on the "Outside only" filter. **Expect** to see only Basil.
5. Mark Basil watered; it should take at most 2 clicks. **Expect** Basil to move to "OK"
   with tomorrow's due date.
6. Open Basil. **Expect** the history to show the new watering by Alice at the top.
7. Click Undo within 10 minutes. **Expect** Basil to return to "Needs water".

### Scenario 2: Sharing and access control (Story 2, P2)

1. As Alice, create the group "Balcony", add "Tomato", and invite `bob@example.com`.
2. In a private window, register **Bob** with that email. Accept the invitation from the
   Invitations page. **Expect** Tomato to appear on Bob's dashboard.
3. As Bob, try to delete Tomato or invite someone. **Expect** these controls to be hidden,
   and the API to return `403`.
4. Register **Carol**. Paste Tomato's URL (`/plants/<id>`). **Expect** a "Not found" page
   and the API to return `404`.
5. As Alice, remove Bob. **Expect** Tomato to vanish from Bob's open dashboard without a
   refresh.

### Scenario 3: Live update (Story 3, P3; SC-004)

1. Re-invite Bob and have him accept. Put Alice's and Bob's windows side by side on the
   dashboard.
2. Alice marks Tomato watered. **Expect** Bob's view to update within 5 seconds.
3. Both click "Watered" on Tomato at about the same moment. **Expect** both views to end
   in the same state, with two history entries.
4. Stop the server for 10 seconds, water a plant through the other session after the
   server restarts, and confirm the disconnected client catches up on reconnect.

### Scenario 4: Auth (Story 4)

1. Sign out, then visit `/`. **Expect** to be redirected to `/login`.
2. Sign in with a wrong password, and separately with an unknown email. **Expect** the same
   generic error both times.

## Automated coverage map

| Spec item | Test location |
|-----------|---------------|
| FR-006 next due / classification, time zones | `packages/shared/tests/unit/schedule.test.ts` |
| FR-009 undo window | `packages/shared/tests/unit/undo.test.ts`, `apps/server/tests/contract/waterings.test.ts` |
| FR-015/016 role matrix (401/403/404) | `apps/server/tests/contract/*.test.ts` |
| FR-017 eviction | `apps/server/tests/integration/realtime-eviction.test.ts` |
| FR-018/019 broadcast and convergence | `apps/server/tests/integration/realtime-watering.test.ts` |
| SC-004 UI updates without refresh | `apps/web/e2e/live-update.spec.ts` |
