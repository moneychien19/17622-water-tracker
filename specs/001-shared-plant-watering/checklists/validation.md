# Quickstart Validation: Shared Plant Watering Tracker

**Date**: 2026-11-12
**Feature**: [quickstart.md](../quickstart.md)

**Method**: Each quickstart step is mapped to an automated test that ran green. Steps run
in a real browser (Playwright, Chromium) are marked **e2e**. Steps covered at the API or
socket level are marked **api** or **socket**. Gaps are listed explicitly.

## Quality gates

| Gate | Result |
|------|--------|
| `npm run typecheck` | ✅ pass |
| `npm run lint` (strict-type-checked, `no-explicit-any`) | ✅ pass, 0 problems |
| Prettier check | ✅ pass |
| `npm test` (Vitest) | ✅ 19 files, 159 tests |
| `npm run e2e` (Playwright) | ✅ 3 tests |
| Type-escape audit (Constitution I) | ✅ no `any` and no `@ts-*` directives; the 4 `as` casts each have a justification comment |

## Scenario 1: Dashboard and watering (US1)

- [x] Register; the dashboard is empty and a personal group exists. **e2e**, plus
  **api** `auth.test.ts`
- [x] Add Fern, Basil (outside, last watered 2 days ago) and Cactus (watered today).
  **e2e**
- [x] "Needs water" lists Basil then Fern, and "OK" lists Cactus. **e2e**, plus unit
  `schedule.test.ts`
- [x] Basil shows the Outside badge. **e2e**
- [x] The "Outside only" filter shows only Basil. **e2e**
- [x] Marking Basil watered takes one click, moves it to OK and shows "Due tomorrow".
  **e2e**
- [x] History shows the watering by the user. **e2e**, plus **api** `waterings.test.ts`
- [x] Undo within 10 minutes returns Basil to "Needs water". **e2e**, plus **api** and
  unit `undo.test.ts`. The 10-minute boundary is checked with a fake clock.

## Scenario 2: Sharing and access control (US2)

- [x] Alice creates "Balcony", adds Tomato and invites Bob. **e2e**
- [x] Bob registers with that email, sees the invitation and accepts; Tomato appears.
  **e2e**
- [x] Bob has no Delete plant button, and the edit form hides name and interval; the API
  returns 403. **e2e**, plus **api** `authorization-matrix.test.ts`
- [x] Carol gets 404 on Tomato's URL, and the body has no group or plant details.
  **api** `authorization-matrix.test.ts` and `plants.test.ts`. The web app renders the
  generic NotFound page on a 404, but this step was not clicked through in a browser.
- [x] Alice removes Bob, and Tomato disappears from Bob's open dashboard without a
  refresh. **e2e**

## Scenario 3: Live updates (US3)

- [x] Alice waters Tomato and Bob's view updates within 5 seconds with no reload. **e2e**
  (SC-004), plus **socket** `realtime-watering.test.ts`
- [x] Simultaneous waterings converge to the same version with two history entries.
  **socket** `realtime-watering.test.ts`. Not exercised by two simultaneous browser
  clicks.
- [x] A location toggle by Bob reaches Alice live. **e2e**
- [ ] **Not verified:** catching up after a server restart. The client refetches the
  dashboard, invitations and groups on every socket `connect`
  (`apps/web/src/realtime/useRealtime.ts`), but no test restarts the server mid-session.

## Scenario 4: Auth (US4)

- [x] A signed-out visit to `/` redirects to `/login`. **e2e**
- [x] A wrong password and an unknown email give the identical generic error. **e2e**,
  plus **api** `auth.test.ts`

## Deviations from plan (for review)

- **Node 22 instead of 24:** Node 22.12+ is the installed LTS, and every tool's engine range
  accepts it.
- **API port 4000 instead of 3000:** a VS Code helper process was already listening on
  `127.0.0.1:3000` and intercepting localhost requests.
- **Pinned majors:** TypeScript 5.9 (typescript-eslint doesn't support 7 yet), Prisma 6
  (npm `latest` is an 8.x release candidate), Vite 7 and Vitest 5. Vitest was upgraded
  from 3 to clear a critical `tinypool` advisory.
- **Remaining `npm audit` findings, all dev-only:** Prisma CLI → `deepmerge-ts` (high; only
  fixed in Prisma 7+) and typescript-eslint → `minimatch` (moderate). Neither ships in the
  runtime dependencies.
- **Per-workspace `tsc --noEmit` instead of `tsc -b`:** the server and web apps import
  `@water/shared` as TypeScript source, which doesn't need composite builds.
- **`vitest.config.ts` with `test.projects` instead of `vitest.workspace.ts`:** the
  workspace file is deprecated in current Vitest.
- **Data model:** `DashboardPlant.lastWatering` also carries `id` and `byUserId`, so the
  UI can show Undo only to the person who recorded the watering.
- **Groups page (`/groups`):** added to host the create-group form (T059) and link to group
  settings.
