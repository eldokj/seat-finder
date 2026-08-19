# Database Schema

Source of truth: [`supabase/migrations/`](../supabase/migrations/), applied in
filename order (`0001` → `0007`). This document explains the *why*; the
migrations are the *what*.

`0007` is small and additive (Phase 5): `import_batches` gains
`warning_rows` (count of rows imported successfully but flagged for admin
review), and `import_errors` gains `severity` (`'error'` = row rejected,
`'warning'` = row imported but worth reviewing). No relationships or
existing columns change.

## Entity relationships

```
examination_periods ──< daily_examination_events ──< master_timetable_records
                                    │                          │
                                    │                          │
                                    ├──< room_allocations >── rooms ──< room_seats
                                    │
students ──< seat_allocations >────┘
                    │
                    └── references master_timetable_records + rooms + room_seats

daily_examination_events ──< import_batches ──< import_errors
daily_examination_events ──< seating_rules (per-event scope; global scope has no event)

auth.users ──1:1── admin_profiles
auth.users ──< audit_logs
```

- A **daily_examination_event** is one (date, session) slot — e.g. "18 Aug
  2026 FN" — and the unit that gets published/closed. It is **not**
  per-course: multiple programmes/courses running in the same session are
  multiple **master_timetable_records** underneath one event.
- A **master_timetable_record** is what the Consolidated Exam + Student
  import creates: one row per programme+course within an event, carrying a
  student **strength** that's always computed by counting that import's own
  student rows — never typed in by the admin. (Purely internal naming
  history: this table and the "Master Timetable" concept predate the
  Consolidated importer, which is the only thing that writes to it now.)
- A **student** exists once, keyed by a normalized register number, with
  `programme`/`department`/`gender` as free-text fields sourced from the
  same Consolidated import.
- A **seat_allocation** is student-level and has three readable states,
  distinguished by which columns are populated, not three separate tables:
  1. **Participating** — `room_id`, `room_seat_id`, `seat_no` all null. Created
     by the Consolidated import: this student is confirmed for this course,
     in this event, no seat yet.
  2. **Room-assigned** (optional intermediate) — `room_id` set, seat still null.
  3. **Seated** — `room_id` + `room_seat_id` (or `seat_no`, for rooms with no
     detailed layout) set. This is the only state that counts as "Allocated"
     in any report.
  A student's seat is never permanent — a fresh `seat_allocations` row exists
  per event, and it can (and normally will) point at a different room every day.
- A **room_allocation** is room-level, not student-level: "Room X is serving
  this event" — the "Hall Allocation" concept. Independent of which/how many
  students end up seated there.
- A **room** (renamed from `halls`) is the physical space; a **room_seat** is
  one grid position within it — a room can exist and be used for simple
  capacity planning (`usable_seats`) with zero `room_seats` rows, before its
  detailed layout is ever drawn.
- An **import_batch** records one Consolidated Exam + Student import
  (`import_type = 'consolidated'`), scoped to one `daily_examination_event`,
  and owns the **import_errors** raised while validating that file.
  `'timetable'`/`'roster'` remain valid historical values on old rows (from
  the now-removed two-step importers) but nothing writes them anymore.
- **seating_rules** holds only **High** and **Preference** tier constraints.
  **Hard**-tier rules are never rows in this table — they're structural (see
  below).
- **admin_profiles**, **audit_logs**, **settings** — unchanged since Phase 1/2.

## Tables

| Table | Purpose | Key constraints |
|---|---|---|
| `settings` | College/branding config (single row) | `id` pinned to `1` |
| `admin_profiles` | Role for a Supabase Auth admin user | `id` = `auth.users.id` |
| `examination_periods` | Optional semester/term container | `end_date >= start_date` |
| `daily_examination_events` | One (date, session) slot — the publish/close unit | unique `(exam_date, session)` |
| `master_timetable_records` | Programme+course+strength within an event | unique `(event_id, programme, course_code)` |
| `students` | De-duplicated student directory | unique normalized `register_no_key` |
| `rooms` | Physical examination rooms (was `halls`) | unique `code`, `usable_seats > 0` |
| `room_seats` | Visual grid: one row per physical position | unique `(room_id, row, column)`; unique `(room_id, seat_label)` where a real seat |
| `room_allocations` | Which rooms serve an event ("Hall Allocation") | unique `(event_id, room_id)` |
| `seat_allocations` | Student × event → (room, seat) or unseated | unique `(event_id, student_id)`; unique `(event_id, room_seat_id)`; unique `(event_id, room_id, seat_no)` |
| `seating_rules` | Configurable High/Preference constraints | `scope='global'` ⇒ no event id; `scope='daily_examination_event'` ⇒ event id required |
| `import_batches` | One row per upload attempt | FK to `daily_examination_events`; `import_type` in (`timetable`,`roster`) |
| `import_errors` | Row-level validation failures | FK to `import_batches` |
| `audit_logs` | Admin action trail | FK to `auth.users` (nullable, `on delete set null`) |

## Enforcing the business rules in the schema

- **"One examination event per date/session, holding many courses"** — a
  plain `unique (exam_date, session)` on `daily_examination_events`. Simpler
  than the old model: because the event no longer *is* a course, there's no
  need for a partial "only when published" index — the row itself is unique
  regardless of status.
- **Hard seating rules are mostly real constraints, not app checks:**
  - *"A student can have only one seat for a particular daily examination"* →
    `unique (daily_examination_event_id, student_id)` on `seat_allocations`.
  - *"A seat can have only one student"* → `unique (daily_examination_event_id,
    room_seat_id)`. Postgres treats every `NULL` as distinct, so any number of
    not-yet-seated rows coexist without conflict — only two rows both
    pointing at the same real seat would violate this.
  - *"Disabled/cannot-be-used seats can never be allocated"* → structural: the
    allocation engine excludes `room_seats.status='disabled'` and
    `position_type='gap'` from its candidate pool before placement even
    starts, not a constraint that could be violated and caught after the fact.
  - *"Student must belong to the selected event"* → algorithmic: seating only
    ever fills in `room_id`/`room_seat_id` on an *existing* seat_allocations
    row (created by the Roster import for that specific event) — there is no
    code path that seats a student outside their own registered event.
- **Register number normalization** — unchanged since Phase 1:
  `register_no_key` is a generated column
  (`upper(regexp_replace(register_no, '\s+', '', 'g'))`), mirrored in
  application code by `normalizeRegisterNumber()`
  (`src/lib/utils/register-number.ts`) — the two must be kept in sync.
- **Room capacity** is enforced in the application layer (at Seating
  Allocation time — total participants vs. total `usable_seats` across
  `room_allocations`), not the database, for the same reason as Phase 3: it
  needs a clearer error message than a raw constraint violation would give.
- **High-priority rules** (avoid same programme/department/course adjacent,
  row/column jump, allocation pattern) live as configurable rows in
  `seating_rules` and are checked by the allocation engine at generation and
  validation time — never cached as a stored "violations" table; a report is
  always computed live against whatever rules are currently active.

## Row Level Security

Every table has RLS **enabled**, with the same `is_active_admin()`-based
"active admins get full access" policy established in `0002`, extended in
`0006` to every table added since. `admin_profiles` itself still has no
insert/update policy for any role — admin accounts are provisioned manually,
never self-service (see `docs/DEPLOYMENT.md`). `audit_logs` and
`seat_allocations` both stay closed-by-default the moment they're created
(RLS enabled, zero policies) and only gain their actual policy afterward, in
the same migration or the very next one — never left open in between.

The public register-number lookup (student portal) does not have a policy
yet — it's still pending a narrow `SECURITY DEFINER` function, to be added
once the seating allocation engine exists and there's real published data to
query against.

## Regenerating TypeScript types

This schema's TypeScript types (`src/types/database.ts`) can be generated
automatically instead of hand-maintained:

```bash
npx supabase gen types typescript --project-id <your-project-ref> > src/types/database.generated.ts
```

It's currently hand-written to match the migrations exactly.

**Gotcha for future edits:** every Row/Insert/Update shape in that file must
be a `type` alias, never a named `interface`. postgrest-js's query-result
inference relies on `YourRowType extends Record<string, unknown>` inside a
conditional type, and TypeScript only treats plain object *type literals* as
satisfying an index signature that way — a named `interface` with the exact
same members does not, and every `.select(...)` call silently resolves to
`never` instead of erroring loudly. If you ever regenerate this file with
`supabase gen types typescript`, it already emits `type`, so this only
matters for hand edits.

**Another gotcha:** a PostgREST embedded select like
`.select("*, master_timetable_records(count)")` relies on relationship
metadata our hand-written `Database` type doesn't declare (every table lists
`Relationships: []`). It won't type-check reliably — use a separate per-row
count query instead (see `app/admin/(dashboard)/daily-events/page.tsx` for
the pattern), matching how the dashboard already computes stats.
