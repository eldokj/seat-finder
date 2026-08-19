-- ============================================================================
-- Exam Seat Finder — RLS for every new/rebuilt table
-- ============================================================================
-- Same is_active_admin() pattern established in 0002. rooms (renamed from
-- halls) and import_batches already carry their RLS + policies across the
-- 0003/0005 renames automatically — only their policy label is refreshed
-- here for readability. seat_allocations had RLS re-enabled (closed, zero
-- policies) at creation time in 0005; its policy is added here alongside
-- every other new table.
-- ============================================================================

alter policy "admins manage halls" on public.rooms rename to "admins manage rooms";

alter table public.examination_periods enable row level security;
alter table public.daily_examination_events enable row level security;
alter table public.master_timetable_records enable row level security;
alter table public.room_seats enable row level security;
alter table public.room_allocations enable row level security;
alter table public.seating_rules enable row level security;

create policy "admins manage examination periods"
  on public.examination_periods for all
  using (public.is_active_admin())
  with check (public.is_active_admin());

create policy "admins manage daily examination events"
  on public.daily_examination_events for all
  using (public.is_active_admin())
  with check (public.is_active_admin());

create policy "admins manage master timetable records"
  on public.master_timetable_records for all
  using (public.is_active_admin())
  with check (public.is_active_admin());

create policy "admins manage room seats"
  on public.room_seats for all
  using (public.is_active_admin())
  with check (public.is_active_admin());

create policy "admins manage room allocations"
  on public.room_allocations for all
  using (public.is_active_admin())
  with check (public.is_active_admin());

create policy "admins manage seating rules"
  on public.seating_rules for all
  using (public.is_active_admin())
  with check (public.is_active_admin());

create policy "admins manage seat allocations"
  on public.seat_allocations for all
  using (public.is_active_admin())
  with check (public.is_active_admin());
