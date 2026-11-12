# Real-Time Events Contract (Socket.IO)

Clients connect to the Socket.IO server on the same origin, path `/socket.io`.

- **Server → client only.** All writes go through REST
  ([rest-api.md](./rest-api.md)). Clients emit no events in v1.
- **Payloads** are typed by the Zod schemas in `packages/shared/src/schemas/events.ts`.
  The client validates each payload and ignores any that fail validation.

## Connection & authorization

1. The handshake reads the `sid` cookie. If the session is missing or invalid, the
   connection is rejected with `connect_error` `{ message: "unauthorized" }`.
2. On connect, the server joins the socket to these rooms:
   - `user:<userId>`
   - `group:<groupId>` for each membership the user has
3. Clients **cannot** join rooms themselves.
4. On reconnect, the client refetches `GET /dashboard` and `GET /me/invitations` to catch up
   on any events it missed (Story 3, scenario 3).

## Room membership changes

| Trigger | Server action |
|---------|---------------|
| Invitation accepted | `socketsJoin` on the `user:<id>` sockets for `group:<groupId>`; emit `group:member-joined` to the group |
| Member removed or leaves | `socketsLeave` for the `user:<id>` sockets on `group:<groupId>`; emit `group:access-revoked` to `user:<id>`; emit `group:member-left` to the group |
| Group deleted | Emit `group:deleted` to the group, then `socketsLeave` for everyone |
| Logout | Disconnect all of that user's sockets |

## Events

Every plant-scoped event carries the full `DashboardPlant`, including `version`. The client
replaces its cached plant **only if** `event.plant.version > cached.version`. This is the
convergence rule for concurrent edits ([research.md](../research.md) §4).

| Event | Room | Payload | Emitted after |
|-------|------|---------|---------------|
| `plant:created` | group | `{ plant }` | POST plant |
| `plant:updated` | group | `{ plant }` | PATCH plant (name, interval, location, notes) |
| `plant:deleted` | group | `{ plantId, groupId }` | DELETE plant |
| `plant:watered` | group | `{ plant, watering: { id, wateredAt, wateredBy: { id, displayName } } }` | POST watering |
| `plant:watering-undone` | group | `{ plant, wateringId }` | POST undo |
| `group:updated` | group | `{ group }` | PATCH group |
| `group:deleted` | group | `{ groupId }` | DELETE group |
| `group:member-joined` | group | `{ groupId, member: { userId, displayName, role } }` | accept invitation |
| `group:member-left` | group | `{ groupId, userId }` | remove or leave |
| `group:access-revoked` | user | `{ groupId }` | remove or leave; client drops the group's plants from its cache |
| `invitation:received` | user (invitee, if registered) | `{ invitation }` | POST invitation |

## Required tests (Constitution II, IV)

- A socket without a valid session is rejected.
- Member A waters a plant → member B's socket receives `plant:watered` within 5 s; a
  non-member C's socket receives nothing.
- A removed member's socket receives `group:access-revoked` and no further group events.
- Two simultaneous waterings → both sockets end at the same `plant.version`, and history
  contains both events.
