# Data Model: Shared Plant Watering Tracker

All IDs are opaque strings (cuid). All timestamps are UTC instants. Each entity's Zod schema
lives in `packages/shared/src/schemas/`, and the Prisma models mirror those schemas.

## User

| Field | Type | Rules |
|-------|------|-------|
| id | string | PK |
| email | string | unique, lowercase-normalized, valid email, ≤ 254 chars |
| displayName | string | 1–50 chars, trimmed |
| passwordHash | string | argon2id; never returned by the API |
| timeZone | string | valid IANA zone (e.g. `America/New_York`); defaults to the browser zone at registration |
| createdAt | datetime | |

Relationships: has many Membership, Session and WateringEvent (as `wateredBy`).

## Session

| Field | Type | Rules |
|-------|------|-------|
| id | string | PK; a 32-byte random token, stored hashed (SHA-256) |
| userId | string | FK → User, cascade delete |
| expiresAt | datetime | 30 days, extended on use |

## Group

| Field | Type | Rules |
|-------|------|-------|
| id | string | PK |
| name | string | 1–60 chars |
| isPersonal | boolean | true for the auto-created group (FR-005); a personal group cannot be deleted or shared |
| createdAt | datetime | |

Relationships: has many Membership, Plant and Invitation. Deleting a group cascades to its
plants, waterings, memberships and invitations.

**Invariant**: a group has exactly one membership with role `owner`.

## Membership

| Field | Type | Rules |
|-------|------|-------|
| groupId | string | FK → Group; composite PK (groupId, userId) |
| userId | string | FK → User |
| role | enum | `owner` \| `caretaker` |
| joinedAt | datetime | |

**Rules**:

- The owner cannot remove themselves (spec edge case).
- Removing a membership triggers socket eviction (FR-017).

## Invitation

| Field | Type | Rules |
|-------|------|-------|
| id | string | PK |
| groupId | string | FK → Group |
| email | string | lowercase-normalized; unique among `pending` invitations for the same group |
| invitedById | string | FK → User (owner) |
| status | enum | `pending` \| `accepted` \| `declined` \| `revoked` \| `expired` |
| expiresAt | datetime | createdAt + 7 days |
| createdAt | datetime | |

**State transitions**:

```text
pending ──accept (invitee, before expiresAt)──▶ accepted   (creates caretaker Membership)
pending ──decline (invitee)──────────────────▶ declined
pending ──revoke (owner)─────────────────────▶ revoked
pending ──now > expiresAt (evaluated on read)─▶ expired
```

**Validation**:

- Inviting an existing member returns 409.
- Personal groups cannot have invitations.

## Plant

| Field | Type | Rules |
|-------|------|-------|
| id | string | PK |
| groupId | string | FK → Group (immutable after creation) |
| name | string | 1–60 chars |
| intervalDays | integer | 1–365 |
| location | enum | `inside` \| `outside` |
| notes | string \| null | ≤ 1000 chars |
| version | integer | starts at 1; incremented on every change to this plant or its waterings; used for client reconciliation |
| createdAt | datetime | |
| updatedAt | datetime | |

**Derived values** (computed by `packages/shared/domain/schedule.ts`; not stored):

- `lastWatering`: the latest WateringEvent with `undoneAt = null` (its time and the user who
  watered).
- `nextDueAt`: `lastWatering.wateredAt + intervalDays days`, or `createdAt` if the plant
  has never been watered.
- `status(viewerTz, now)`: `needs_water` if `nextDueAt` ≤ the end of today in `viewerTz`,
  otherwise `ok`.

**Permissions**:

- Owner: create, update any field, delete.
- Caretaker: may update only `location` and `notes` (FR-008, FR-015).

## WateringEvent

| Field | Type | Rules |
|-------|------|-------|
| id | string | PK |
| plantId | string | FK → Plant, cascade delete |
| wateredById | string | FK → User |
| wateredAt | datetime | the server time when recorded; clients cannot set it |
| undoneAt | datetime \| null | set when undone |

**Rules**:

- The record is append-only and is never hard-deleted except through a plant cascade.
- Undo is allowed only when `wateredById = currentUser`, `undoneAt = null` and
  `now − wateredAt ≤ 10 min` (FR-009; `canUndo` in shared domain).
- History (FR-010) lists events with `undoneAt = null`, newest first.

**Edge case**: an initial "last watered" date entered at plant creation is stored as a
WateringEvent with that `wateredAt`. This is the only path where the client supplies
`wateredAt`; it must not be in the future.

## Dashboard view (read model, not stored)

`DashboardPlant = Plant + { groupName, lastWatering?: { at, byDisplayName }, nextDueAt }`.

The client groups plants into "Needs water" (sorted by `nextDueAt` ascending, so the most
overdue comes first) and "OK" (sorted by `nextDueAt` ascending), and offers an
`outside`-only filter (FR-011–FR-013).
