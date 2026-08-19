-- ============================================================================
-- Exam Seat Finder — Examination hierarchy, room seat layout, seating rules
-- ============================================================================
-- Adds the new entities from the seating-architecture redesign:
--   examination_periods → daily_examination_events → master_timetable_records
--   rooms (0003) → room_seats
--   room_allocations ("Hall Allocation" — which rooms serve an event)
--   seating_rules (configurable High/Preference tier constraints)
-- Also extends students with department/gender, both sourced from the future
-- Student Roster upload.
--
-- daily_examination_events is keyed by (exam_date, session) ONLY — one row
-- per session slot, not per course. Multiple programmes/courses running in
-- the same session are represented as multiple master_timetable_records
-- underneath one event. This is what lets 18-Aug FN carry B.Sc CS + B.Com +
-- BBA simultaneously, each with its own strength, all published/closed
-- together as one event.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- examination_periods — optional semester/term container
-- ----------------------------------------------------------------------------
create table public.examination_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'active' check (status in ('active', 'closed')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create trigger examination_periods_set_updated_at
  before update on public.examination_periods
  for each row execute function public.set_updated_at();

comment on table public.examination_periods is 'Optional semester/term container grouping daily examination events (e.g. "Nov 2026 UG Semester I"). Organisational only — an event does not require one.';

-- ----------------------------------------------------------------------------
-- daily_examination_events — one row per (date, session)
-- ----------------------------------------------------------------------------
create table public.daily_examination_events (
  id uuid primary key default gen_random_uuid(),
  examination_period_id uuid references public.examination_periods (id) on delete set null,
  exam_date date not null,
  session text not null check (session in ('FN', 'AN')),
  start_time time,
  end_time time,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  published_at timestamptz,
  closed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_date, session)
);

create trigger daily_examination_events_set_updated_at
  before update on public.daily_examination_events
  for each row execute function public.set_updated_at();

create index daily_examination_events_status_idx on public.daily_examination_events (status);
create index daily_examination_events_period_idx on public.daily_examination_events (examination_period_id);

comment on table public.daily_examination_events is 'The publish/close unit — one row per (exam_date, session), regardless of how many courses run inside it. Replaces the old per-course exams table.';

-- ----------------------------------------------------------------------------
-- master_timetable_records — one row per programme+course within an event
-- ----------------------------------------------------------------------------
create table public.master_timetable_records (
  id uuid primary key default gen_random_uuid(),
  daily_examination_event_id uuid not null references public.daily_examination_events (id) on delete cascade,
  programme text not null,
  course_name text not null,
  course_code text not null,
  strength integer not null check (strength > 0),
  import_batch_id uuid, -- FK added after import_batches is retargeted in 0005
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (daily_examination_event_id, programme, course_code)
);

create trigger master_timetable_records_set_updated_at
  before update on public.master_timetable_records
  for each row execute function public.set_updated_at();

create index master_timetable_records_event_idx on public.master_timetable_records (daily_examination_event_id);

comment on table public.master_timetable_records is 'What the Master Timetable Excel upload creates: one row per programme+course within a daily event, carrying expected strength. Re-uploading the same (event, programme, course_code) updates strength rather than duplicating the row.';
comment on column public.master_timetable_records.strength is 'Expected/registered student count from the timetable — planning number, reconciled against the actual Student Roster count as an informational (non-blocking) check.';

-- ----------------------------------------------------------------------------
-- room_seats — the visual grid: one row per physical position
-- ----------------------------------------------------------------------------
create table public.room_seats (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  row_number integer not null,
  column_number integer not null,
  section text,
  seat_label text,
  position_type text not null default 'seat' check (position_type in ('seat', 'gap')),
  status text not null default 'available' check (status in ('available', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, row_number, column_number),
  check (position_type = 'gap' or seat_label is not null)
);

-- Seat labels unique within a room, but only for actual seats — gaps don't
-- carry a label at all (enforced by the check constraint above).
create unique index room_seats_room_label_idx on public.room_seats (room_id, seat_label)
  where position_type = 'seat';

create trigger room_seats_set_updated_at
  before update on public.room_seats
  for each row execute function public.set_updated_at();

create index room_seats_room_idx on public.room_seats (room_id);

comment on table public.room_seats is 'Visual grid layout for a room. position_type=''gap'' means "cannot be placed" (not a real seat, e.g. an aisle); status=''disabled'' means "temporarily disabled" (a real seat, administratively turned off). A room with no rows here yet is a room with no detailed layout drawn — usable_seats on rooms still applies for simple capacity planning.';

-- ----------------------------------------------------------------------------
-- room_allocations — "Hall Allocation": which rooms serve a daily event
-- ----------------------------------------------------------------------------
create table public.room_allocations (
  id uuid primary key default gen_random_uuid(),
  daily_examination_event_id uuid not null references public.daily_examination_events (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete restrict,
  usable_seats_snapshot integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (daily_examination_event_id, room_id)
);

create trigger room_allocations_set_updated_at
  before update on public.room_allocations
  for each row execute function public.set_updated_at();

create index room_allocations_event_idx on public.room_allocations (daily_examination_event_id);
create index room_allocations_room_idx on public.room_allocations (room_id);

comment on table public.room_allocations is 'Room-level: which rooms are in play for a daily event, independent of any individual student. usable_seats_snapshot freezes the room''s capacity at allocation time so later room edits don''t rewrite historical reports.';

-- ----------------------------------------------------------------------------
-- seating_rules — configurable High/Preference tier constraints
-- ----------------------------------------------------------------------------
-- Hard-tier rules are NOT rows in this table — they're structural (DB unique
-- constraints + algorithm design, see supabase/migrations/0005 and
-- docs/SCHEMA.md). 'hard' remains a valid priority_tier value here only for
-- reporting-label symmetry; no row should normally use it.
create table public.seating_rules (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'global' check (scope in ('global', 'daily_examination_event')),
  daily_examination_event_id uuid references public.daily_examination_events (id) on delete cascade,
  rule_type text not null check (rule_type in (
    'avoid_same_programme_adjacent',
    'avoid_same_department_adjacent',
    'avoid_same_course_adjacent',
    'row_jump',
    'column_jump',
    'allocation_pattern',
    'gender_mixing'
  )),
  priority_tier text not null check (priority_tier in ('hard', 'high', 'preference')),
  is_active boolean not null default true,
  parameters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (scope = 'global' and daily_examination_event_id is null)
    or (scope = 'daily_examination_event' and daily_examination_event_id is not null)
  )
);

create trigger seating_rules_set_updated_at
  before update on public.seating_rules
  for each row execute function public.set_updated_at();

create index seating_rules_event_idx on public.seating_rules (daily_examination_event_id);

comment on table public.seating_rules is 'Configurable seating constraints. row_jump/column_jump are minimum-distance spacing rules (parameters: {"gap": N, "group_by": [...]}), NOT a seat-numbering pattern — that''s the separate allocation_pattern rule_type (parameters: {"pattern": "row_wise"|"column_wise"|"serpentine_row"|"serpentine_column"|"custom"}).';

-- ----------------------------------------------------------------------------
-- students — add department + gender, both sourced from the Student Roster
-- ----------------------------------------------------------------------------
alter table public.students add column department text;
alter table public.students add column gender text;

comment on column public.students.department is 'Free text, populated from the Student Roster upload. No normalized Programme→Department lookup table by design (per project decision) — kept simple for now.';
comment on column public.students.gender is 'Free text, optional. Feeds the Preference-tier gender-mixing rule only — never a hard or high-priority constraint.';
