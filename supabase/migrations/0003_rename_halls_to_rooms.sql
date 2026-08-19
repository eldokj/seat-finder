-- ============================================================================
-- Exam Seat Finder — Rename halls to rooms, extend for the room-layout model
-- ============================================================================
-- Pure rename + additive columns. No data is copied, dropped, or recreated —
-- the existing halls row (M101 in the live project) survives as the exact
-- same row, same id, same indexes, same triggers, same RLS policies.
-- Postgres carries all of those across a table/column rename automatically.
-- ============================================================================

alter table public.halls rename to rooms;

alter table public.rooms rename column name to room_number;
alter table public.rooms rename column building to block;
alter table public.rooms rename column capacity to usable_seats;

alter table public.rooms add column landmark text;
alter table public.rooms add column rows integer;
alter table public.rooms add column columns integer;
alter table public.rooms add column sections integer;
-- App-maintained cache of the room_seats grid size once a layout is drawn;
-- null until then. Never hand-edited — recomputed when the layout is saved.
alter table public.rooms add column total_physical_positions integer;
alter table public.rooms add column additional_seats integer not null default 0;
alter table public.rooms add column display_order integer not null default 0;
alter table public.rooms add column numbering_scheme text not null default 'row_wise'
  check (numbering_scheme in ('row_wise', 'column_wise', 'serpentine_row', 'serpentine_column', 'custom'));

-- Cosmetic renames so internal object names don't keep saying "halls" —
-- purely for readability in the Dashboard/psql; no functional effect either way.
alter table public.rooms rename constraint halls_pkey to rooms_pkey;
alter table public.rooms rename constraint halls_code_key to rooms_code_key;
alter trigger halls_set_updated_at on public.rooms rename to rooms_set_updated_at;
alter index public.halls_status_idx rename to rooms_status_idx;

comment on table public.rooms is 'Examination rooms. Renamed from halls; room_number/code/block/floor/usable_seats/status are the pre-existing columns, everything else is new for the seat-grid + layout model.';
comment on column public.rooms.usable_seats is 'Primary capacity number for planning — editable directly even before a detailed seat layout exists. Once room_seats rows exist for this room, reconcile against the live seat count in application logic rather than trusting this blindly.';
comment on column public.rooms.additional_seats is 'Overflow/backup seats, excluded from automatic allocation by default.';
