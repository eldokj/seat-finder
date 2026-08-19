-- ============================================================================
-- Exam Seat Finder — Rebuild seat_allocations, retarget import_batches, retire exams
-- ============================================================================
-- seat_allocations and exams both have ZERO rows in the live project (verified
-- before writing this migration) — safe to drop and recreate cleanly instead
-- of patching column-by-column. import_batches also has zero rows, but is
-- altered in place since only its FK target changes, not its shape.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- seat_allocations — student-level: participation → room-assigned → seated
-- ----------------------------------------------------------------------------
-- room_id / room_seat_id / seat_no are all nullable on purpose: a row is
-- created the moment a student is confirmed as a participant of an event
-- (Student Roster import), with those three columns null. They're filled in
-- later — first optionally room_id (bulk room assignment), then room_seat_id
-- + seat_no together (an actual seat, whether from the automatic allocator or
-- a manual placement). "Allocated" in any report always means room_seat_id
-- (or seat_no, for rooms with no detailed layout) is set — a participating-
-- but-unseated student is reported as Unallocated, never silently counted.
drop table public.seat_allocations;

create table public.seat_allocations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  daily_examination_event_id uuid not null references public.daily_examination_events (id) on delete cascade,
  master_timetable_record_id uuid not null references public.master_timetable_records (id) on delete cascade,
  room_id uuid references public.rooms (id) on delete restrict,
  room_seat_id uuid references public.room_seats (id) on delete restrict,
  seat_no text,
  import_batch_id uuid references public.import_batches (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Hard rule: "a student can have only one seat for a particular daily
  -- examination" — a real constraint, not just an app-level check.
  unique (daily_examination_event_id, student_id),
  -- Hard rule: "a seat can have only one student". Postgres treats every NULL
  -- as distinct, so any number of not-yet-seated (null room_seat_id) rows
  -- coexist without conflict; only two rows both pointing at the same real
  -- seat would violate this.
  unique (daily_examination_event_id, room_seat_id),
  -- Same guarantee for rooms with no detailed room_seats layout, keyed on the
  -- human-readable seat_no instead.
  unique (daily_examination_event_id, room_id, seat_no)
);

-- RLS enabled immediately, closed by default (zero policies yet) — same
-- safe posture as every other table between its creation and 0006 below.
alter table public.seat_allocations enable row level security;

create trigger seat_allocations_set_updated_at
  before update on public.seat_allocations
  for each row execute function public.set_updated_at();

create index seat_allocations_event_idx on public.seat_allocations (daily_examination_event_id);
create index seat_allocations_student_idx on public.seat_allocations (student_id);
create index seat_allocations_room_idx on public.seat_allocations (room_id);
create index seat_allocations_timetable_record_idx on public.seat_allocations (master_timetable_record_id);

comment on table public.seat_allocations is 'Student-level participation and seating for one daily_examination_event. room_id/room_seat_id/seat_no null = registered but not yet seated. Never permanent across events — a student gets a fresh row (and typically a different hall/seat) for every daily_examination_event they sit.';

-- ----------------------------------------------------------------------------
-- master_timetable_records.import_batch_id — add the FK deferred from 0004
-- ----------------------------------------------------------------------------
alter table public.master_timetable_records
  add constraint master_timetable_records_import_batch_id_fkey
  foreign key (import_batch_id) references public.import_batches (id) on delete set null;

-- ----------------------------------------------------------------------------
-- import_batches — retarget from exams to daily_examination_events, add type
-- ----------------------------------------------------------------------------
alter table public.import_batches add column import_type text not null default 'timetable'
  check (import_type in ('timetable', 'roster'));

alter table public.import_batches drop constraint import_batches_exam_id_fkey;
alter table public.import_batches rename column exam_id to daily_examination_event_id;
alter table public.import_batches
  add constraint import_batches_daily_examination_event_id_fkey
  foreign key (daily_examination_event_id) references public.daily_examination_events (id) on delete cascade;
alter index public.import_batches_exam_id_idx rename to import_batches_daily_examination_event_id_idx;

comment on column public.import_batches.import_type is 'Which upload workflow produced this batch: the Master Timetable (programme/course/strength) or the Student Roster (individual register numbers).';

-- ----------------------------------------------------------------------------
-- exams — fully replaced by daily_examination_events + master_timetable_records.
-- Zero rows live; nothing else references it after the changes above.
-- ----------------------------------------------------------------------------
drop table public.exams;
