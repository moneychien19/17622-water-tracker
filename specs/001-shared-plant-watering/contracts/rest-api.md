# REST API Contract

- Base path: `/api`.
- Requests and responses are JSON.
- Request bodies are validated with the Zod schemas in `packages/shared/src/schemas`. A
  validation failure returns `400 { error: "validation", issues: [...] }`.
- Authentication uses the `sid` session cookie (see [research.md](../research.md) §3).

**Status conventions**:

| Status | Meaning |
|--------|---------|
| `401` | Not signed in |
| `404` | Resource missing **or** the caller is not a member of its group (no existence leak) |
| `403` | The caller is a member but their role does not allow the action |
| `409` | Conflict (duplicate invite, already a member, undo window passed) |

## Roles

| Action | Owner | Caretaker | Non-member |
|--------|:-----:|:---------:|:----------:|
| View group, plants, history | ✅ | ✅ | 404 |
| Mark watered / undo own watering | ✅ | ✅ | 404 |
| Toggle location, edit notes | ✅ | ✅ | 404 |
| Create, rename or delete plant; change interval | ✅ | 403 | 404 |
| Invite, revoke invite, remove member | ✅ | 403 | 404 |
| Rename or delete group | ✅ | 403 | 404 |
| Leave group | ❌ (409) | ✅ | 404 |

## Auth (public unless noted)

| Method & path | Body | Success | Errors |
|---------------|------|---------|--------|
| `POST /auth/register` | `{ email, password (≥ 8 chars), displayName, timeZone }` | `201 { user }`, sets cookie; personal group created; pending invitations for that email become visible | `400`; `409` if the email is taken |
| `POST /auth/login` | `{ email, password }` | `200 { user }`, sets cookie | `401 { error: "Invalid email or password" }` (generic) |
| `POST /auth/logout` *(auth)* | — | `204`, clears cookie, deletes session, disconnects sockets | `401` |
| `GET /auth/me` *(auth)* | — | `200 { user }` | `401` |
| `GET /health` | — | `200 { ok: true }` | — |

## Dashboard

| Method & path | Success |
|---------------|---------|
| `GET /dashboard` | `200 { plants: DashboardPlant[], serverTime }`: all plants in all of the caller's groups ([data-model.md](../data-model.md#dashboard-view-read-model-not-stored)) |

## Groups & members

| Method & path | Role | Body | Success |
|---------------|------|------|---------|
| `GET /groups` | any | — | `200 { groups: (Group & { role })[] }` |
| `POST /groups` | any user | `{ name }` | `201 { group }`; caller becomes owner |
| `PATCH /groups/:groupId` | owner | `{ name }` | `200 { group }` |
| `DELETE /groups/:groupId` | owner | — | `204`; `409` if the group is personal |
| `GET /groups/:groupId/members` | member | — | `200 { members: { userId, displayName, email, role }[] }` |
| `DELETE /groups/:groupId/members/:userId` | owner (or self, to leave) | — | `204`; `409` if the target is the owner |

## Invitations

| Method & path | Role | Body | Success |
|---------------|------|------|---------|
| `GET /groups/:groupId/invitations` | owner | — | `200 { invitations }` |
| `POST /groups/:groupId/invitations` | owner | `{ email }` | `201 { invitation }`; `409` if the email is already a member or already has a pending invitation; `409` for a personal group |
| `DELETE /invitations/:id` | owner of the group | — | `204` (status → revoked) |
| `GET /me/invitations` | any | — | `200 { invitations: (Invitation & { groupName, invitedByName })[] }`: pending invitations for the caller's email that have not expired |
| `POST /invitations/:id/accept` | invitee | — | `200 { group }`; `404` if not addressed to the caller; `409` if expired or no longer pending |
| `POST /invitations/:id/decline` | invitee | — | `204` |

## Plants

| Method & path | Role | Body | Success |
|---------------|------|------|---------|
| `POST /groups/:groupId/plants` | owner | `{ name, intervalDays, location, notes?, lastWateredAt? (not in the future) }` | `201 { plant: DashboardPlant }` |
| `GET /plants/:plantId` | member | — | `200 { plant: DashboardPlant }` |
| `PATCH /plants/:plantId` | owner: all fields; caretaker: `location`, `notes` only | partial `{ name, intervalDays, location, notes }` | `200 { plant }`; `403` if a caretaker sends a restricted field |
| `DELETE /plants/:plantId` | owner | — | `204` |

## Waterings

| Method & path | Role | Body | Success |
|---------------|------|------|---------|
| `POST /plants/:plantId/waterings` | member | — (the server sets `wateredAt`) | `201 { watering, plant: DashboardPlant }` |
| `POST /waterings/:id/undo` | the member who recorded it | — | `200 { plant: DashboardPlant }`; `403` if the caller is not the recorder; `409` if more than 10 min old or already undone |
| `GET /plants/:plantId/waterings?cursor=` | member | — | `200 { items: { id, wateredAt, wateredBy: { id, displayName } }[], nextCursor }`, newest first, 20 per page, excluding undone events |

Every successful mutation above emits the matching real-time event **after** the database
commit (see [realtime-events.md](./realtime-events.md)).

## Required tests per endpoint (Constitution II)

Each row above needs a contract test for:

1. The success path.
2. Signed out → `401`.
3. Non-member → `404`.
4. Caretaker on an owner-only route → `403`.
