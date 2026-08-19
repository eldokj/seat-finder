-- ============================================================================
-- Exam Seat Finder — Public (anon) student seat lookup
-- ============================================================================
-- Phase 8. Two narrow SECURITY DEFINER functions — the only door past RLS
-- for the unauthenticated student portal, mirroring is_active_admin()'s
-- existing pattern from 0002. No table, column, or existing RLS policy is
-- touched by this migration; anon still has zero direct grants on
-- students/seat_allocations/daily_examination_events/rooms/room_seats/
-- master_timetable_records — RLS on those tables is unchanged, so a direct
-- anon SELECT against any of them still returns nothing.
--
-- "Today" is passed in by the app (p_exam_date), not derived from
-- current_date — the app already computes "today" correctly in the
-- college's configured IANA timezone (src/lib/utils/date.ts); duplicating
-- that logic in SQL against the server's own timezone would be a second,
-- possibly-diverging source of truth.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- public_today_event_status — event-level only, zero student data. Lets the
-- app distinguish "not published yet" from "closed" without exposing
-- anything else. Same result for every caller regardless of who's asking.
-- ----------------------------------------------------------------------------
create or replace function public.public_today_event_status(p_exam_date date)
returns table (session text, status text)
language sql
security definer
set search_path = public
stable
as $$
  select dee.session, dee.status
  from public.daily_examination_events dee
  where dee.exam_date = p_exam_date;
$$;

comment on function public.public_today_event_status(date) is
  'Public (anon-callable) — returns only {session, status} for a given date, no student or seat data. Used by the student portal to distinguish "not published yet" from "closed" before ever looking up a register number.';

revoke all on function public.public_today_event_status(date) from public;
grant execute on function public.public_today_event_status(date) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- public_seat_lookup — the actual student-facing lookup. Returns ONLY the
-- fields the student portal is allowed to show (see PublicSeatResult in
-- src/types/database.ts): no internal ids, no room_seat_id, no student_id,
-- no admin-only fields. Scoped internally to published events and SEATED
-- allocations only (room_id set AND (room_seat_id set OR seat_no set) —
-- the same "seated" definition used everywhere else in this project,
-- including the Phase 7 additional-seats case). A student not registered
-- for a published event, or a register number that doesn't exist at all,
-- both simply return zero rows — the caller cannot distinguish the two,
-- which is deliberate (never reveal whether a register number exists).
-- ----------------------------------------------------------------------------
create or replace function public.public_seat_lookup(p_register_no text, p_exam_date date)
returns table (
  register_no text,
  student_name text,
  programme text,
  course_code text,
  course_name text,
  session text,
  exam_date date,
  room_name text,
  seat_no text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    s.register_no,
    s.full_name as student_name,
    s.programme,
    mtr.course_code,
    mtr.course_name,
    dee.session,
    dee.exam_date,
    r.room_number as room_name,
    coalesce(rs.seat_label, sa.seat_no) as seat_no
  from public.students s
  join public.seat_allocations sa on sa.student_id = s.id
  join public.daily_examination_events dee on dee.id = sa.daily_examination_event_id
  join public.master_timetable_records mtr on mtr.id = sa.master_timetable_record_id
  join public.rooms r on r.id = sa.room_id
  left join public.room_seats rs on rs.id = sa.room_seat_id
  where s.register_no_key = upper(regexp_replace(p_register_no, '\s+', '', 'g'))
    and dee.exam_date = p_exam_date
    and dee.status = 'published'
    and sa.room_id is not null
    and (sa.room_seat_id is not null or sa.seat_no is not null);
$$;

comment on function public.public_seat_lookup(text, date) is
  'Public (anon-callable) — the ONLY path by which an unauthenticated caller can read seat_allocations/students data. Returns strictly Register Number, Student Name, Programme, Course Code, Course Name, Session, Exam Date, Room, Seat Number — never an internal id. Filters to published + seated rows only, for the given date only. Register number matching uses the same normalization as the students.register_no_key generated column.';

revoke all on function public.public_seat_lookup(text, date) from public;
grant execute on function public.public_seat_lookup(text, date) to anon, authenticated;
