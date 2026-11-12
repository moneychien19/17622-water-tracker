# Feature Specification: Shared Plant Watering Tracker

**Feature Branch**: `001-shared-plant-watering`

**Created**: 2026-11-12

**Status**: Draft

**Input**: User description: "Use `docs/initial-spec.md`" — an application that helps users track
watering activities and coordinate shared plant care: a dashboard of what needs attention
(which plants need watering, which are still outside), live updates when someone waters a plant,
login/authentication, and permission-controlled sharing of schedules. Notifications are deferred.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See which plants need attention and log a watering (Priority: P1)

A signed-in user adds their plants, each with its own watering needs, and opens a dashboard
that clearly separates plants that need watering now (due or overdue) from plants that are fine.
The dashboard also shows which plants are currently outside. When the user waters a plant, they
mark it as watered with one action, and the plant's next due time is recalculated.

**Why this priority**: This is the core value of the product — knowing what needs care today.
It is useful even for a single person with no sharing.

**Independent Test**: Sign in, create three plants with different watering intervals, backdate
one plant's last watering so it is overdue, open the dashboard, and confirm the overdue plant is
shown under "Needs water"; mark it watered and confirm it moves to "OK" with a new due date.

**Acceptance Scenarios**:

1. **Given** a signed-in user with no plants, **When** they add a plant with a name, a watering
   interval, and a location (inside/outside), **Then** the plant appears on their dashboard.
2. **Given** a plant whose next watering is due today or earlier, **When** the user opens the
   dashboard, **Then** the plant appears in the "Needs water" group, ordered by how overdue it is.
3. **Given** a plant in "Needs water", **When** the user marks it watered, **Then** a watering
   record is saved with who and when, and the plant's next due date becomes
   (time watered + its interval).
4. **Given** plants marked as outside, **When** the user opens the dashboard, **Then** those
   plants are clearly indicated as "Outside", and the user can toggle a plant between inside and
   outside.
5. **Given** a plant, **When** the user views its details, **Then** they see its watering
   history (date/time and who watered it), most recent first.

---

### User Story 2 - Share a plant collection with specific people (Priority: P2)

A user who owns plants invites other people (e.g., housemates, a plant-sitter) to help care for
them. Only the people the owner has invited can see those plants and their schedule; invited
caretakers can mark plants as watered. The owner can revoke access at any time.

**Why this priority**: Shared care is the problem the product exists to solve, but it builds on
the single-user dashboard from Story 1.

**Independent Test**: User A creates a plant group and invites User B. Confirm B sees the
group's plants on their dashboard and can mark one watered; confirm a third user C, not invited,
cannot see or access those plants by any means; revoke B and confirm B loses access.

**Acceptance Scenarios**:

1. **Given** an owner with a plant group, **When** they invite another registered user by email,
   **Then** that user gains access to the group's plants after accepting the invitation.
2. **Given** a user without access to a group, **When** they try to view or modify any plant in
   it (including by direct link), **Then** access is denied and no plant details are revealed.
3. **Given** a caretaker with access, **When** they mark a shared plant watered, **Then** the
   watering record shows the caretaker as the person who watered it.
4. **Given** an owner, **When** they remove a member, **Then** that member immediately loses
   access to the group and stops receiving its updates.
5. **Given** a member who is not the owner, **When** they try to invite or remove people, delete
   the group, or delete plants, **Then** the action is not permitted.

---

### User Story 3 - Live updates across everyone sharing a plant (Priority: P3)

When anyone with access waters a plant or moves it inside/outside, everyone else currently
viewing that plant or dashboard sees the change right away, without refreshing.

**Why this priority**: Prevents double-watering and missed watering among caretakers; it
enhances Story 2 but the app is usable (with refresh) without it.

**Independent Test**: Open the same shared group's dashboard in two sessions as two different
members; mark a plant watered in one; confirm the other session updates within a few seconds
without a manual refresh.

**Acceptance Scenarios**:

1. **Given** two members viewing the same dashboard, **When** one marks a plant watered,
   **Then** the other sees the plant move out of "Needs water" within 5 seconds.
2. **Given** two members mark the same plant watered at nearly the same moment, **When** both
   actions complete, **Then** both watering records are kept in history, the next due date is
   calculated from the most recent watering, and both views show the same final state.
3. **Given** a member whose connection drops temporarily, **When** the connection returns,
   **Then** their view catches up to the current state without requiring a manual refresh.

---

### User Story 4 - Sign up, sign in, and sign out (Priority: P1, enabler)

A person creates an account, signs in to reach their dashboard, and signs out. All plant data
is available only to signed-in users with permission.

**Why this priority**: Required for every other story; listed separately so it can be tested on
its own.

**Independent Test**: Register a new account, sign out, confirm the dashboard is no longer
reachable, sign back in, and confirm the dashboard returns.

**Acceptance Scenarios**:

1. **Given** a visitor, **When** they register with email and password, **Then** an account is
   created and they are signed in.
2. **Given** a signed-out visitor, **When** they try to open any dashboard or plant page,
   **Then** they are redirected to sign in.
3. **Given** a user who enters wrong credentials, **When** they submit, **Then** they see a
   generic error that does not reveal whether the email exists.

---

### Edge Cases

- A plant has never been watered: it is treated as "Needs water" immediately after creation
  unless the user enters a last-watered date.
- A user marks a plant watered by mistake: the user who recorded it can undo that watering
  record within 10 minutes, after which the due date is recalculated from the previous record.
- A plant is deleted while another member is viewing it: the plant disappears from their view
  and further actions on it show a "no longer available" message.
- The owner deletes a group: all members lose access; watering history is removed with it.
- An invitation is sent to an email with no account: the invitation stays pending and is
  applied when that person registers with the same email; pending invitations expire after
  7 days.
- Members are in different time zones: due dates and history are shown in each viewer's local
  time; "due today" is evaluated in the viewer's time zone.
- The owner tries to remove themselves: not allowed while they are the only owner.

## Requirements *(mandatory)*

### Functional Requirements

**Accounts & access**

- **FR-001**: System MUST allow people to register, sign in, and sign out using email and
  password.
- **FR-002**: System MUST require sign-in for every page and action except registration and
  sign-in.
- **FR-003**: System MUST NOT reveal whether an email address is registered on failed sign-in.

**Plants & schedules**

- **FR-004**: Users MUST be able to create, edit, and delete plants within a group they own.
  Each plant has a name, a watering interval (in days), a location (inside or outside), and
  optional notes.
- **FR-005**: Every user MUST have a personal group created automatically; users MAY create
  additional groups (e.g., "Balcony", "Office").
- **FR-006**: System MUST calculate each plant's next due date as the last watering time plus
  the plant's interval, and classify each plant as "Needs water" (due today or overdue) or "OK".
- **FR-007**: Any member of a plant's group MUST be able to mark the plant watered; the system
  MUST record who watered it and when.
- **FR-008**: Any member MUST be able to toggle a plant's location between inside and outside.
- **FR-009**: The user who recorded a watering MUST be able to undo it within 10 minutes.
- **FR-010**: System MUST keep a watering history for each plant showing date/time and the
  person who watered it.

**Dashboard**

- **FR-011**: The dashboard MUST show all plants the user can access, across all their groups,
  grouped into "Needs water" (sorted most overdue first) and "OK" (sorted by soonest due).
- **FR-012**: The dashboard MUST visibly mark which plants are currently outside, and MUST let
  the user filter to show only outside plants.
- **FR-013**: Each plant on the dashboard MUST show its group, last watered time, who last
  watered it, and its next due date.

**Sharing & permissions**

- **FR-014**: Group owners MUST be able to invite people by email and remove members.
- **FR-015**: System MUST have two roles per group: **Owner** (manages members, plants, and the
  group) and **Caretaker** (views plants, marks watered, toggles location, edits notes).
- **FR-016**: Users MUST NOT be able to view or change any plant, schedule, or history in a group
  they are not a member of, regardless of how the request is made.
- **FR-017**: Removing a member MUST revoke their access immediately, including any live updates
  they were receiving.

**Live updates**

- **FR-018**: When a plant is watered, undone, edited, moved inside/outside, added, or deleted,
  all members currently viewing affected screens MUST see the change without refreshing.
- **FR-019**: When two members act on the same plant at nearly the same time, all members MUST
  end up seeing the same final state, and no watering record may be lost.

**Out of scope for this feature**

- **FR-020**: Notifications (push, email, SMS reminders) are explicitly out of scope and will be
  specified as a separate feature.

### Key Entities

- **User**: A person with an account (email, display name, time zone).
- **Group**: A named collection of plants that is the unit of sharing; has exactly one owner and
  zero or more caretakers.
- **Membership**: Links a user to a group with a role (Owner or Caretaker).
- **Invitation**: A pending offer for an email address to join a group; has status (pending,
  accepted, expired, revoked) and an expiry.
- **Plant**: Belongs to one group; has name, watering interval, location (inside/outside), notes,
  and derived next due date and status.
- **Watering Event**: A record that a plant was watered, by which user, at what time; can be
  undone within the undo window.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user can register, add their first plant, and see it on the dashboard in
  under 3 minutes.
- **SC-002**: From opening the dashboard, a user can identify every plant that needs water and
  every plant that is outside in under 10 seconds, without opening individual plants.
- **SC-003**: Marking a plant watered takes no more than 2 interactions from the dashboard.
- **SC-004**: In 95% of cases, a watering by one member appears on other members' open dashboards
  within 5 seconds; in 100% of cases within 30 seconds.
- **SC-005**: In access testing, 0 attempts by non-members to view or change a group's plants
  succeed.
- **SC-006**: In usability testing with shared groups, double-watering of the same plant within
  one interval (caused by stale information) occurs in fewer than 5% of watering tasks.

## Assumptions

- Users access the app through a web browser on desktop or mobile with internet connectivity;
  offline use is out of scope.
- Watering needs are expressed as a fixed interval in days per plant; seasonal or weather-based
  schedules are out of scope for this feature.
- "Which ones are still outside" is interpreted as tracking each plant's physical location
  (inside/outside) so caretakers can see which plants have been left out.
- Sharing is per group rather than per plant, matching the common case of a household or shared
  space; per-plant sharing can be added later.
- Email/password sign-in is sufficient for v1; social sign-in and password reset by email are
  deferred.
- A single group of ~50 plants and ~10 members is the expected upper scale for v1.
