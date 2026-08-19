-- ============================================================================
-- Exam Seat Finder — Initial schema
-- ============================================================================
-- Design notes (see docs/SCHEMA.md for full documentation):
--
--   * Admin identity lives in Supabase Auth (auth.users). This migration only
--     adds a public.admin_profiles table that *extends* an auth user with a
--     role. Creating the actual auth user (email/password) is done via the
--     Supabase Dashboard or Admin API in Phase 2 — this migration does not
--     create any login credentials.
--   * Seating is exam-specific: a student's hall/seat can change every exam,
--     so allocations live in seat_allocations and reference (student, exam),
--     never a permanent "student.hall" column.
--   * Only one exam can be PUBLISHED for a given (exam_date, session) at a
--     time — enforced with a partial unique index, matching the business
--     rule that the student portal always resolves to a single active
--     seating set for "today".
--   * Row Level Security is enabled on every table. No anon/authenticated
--     policies are added yet — all access in Phase 1 is via the Supabase
--     service-role key from trusted server code, which bypasses RLS by
--     design. Phase 2 (admin auth) will add policies scoped to
--     admin_profiles, and Phase 6 (student search) will add a narrow
--     SECURITY DEFINER function for public lookups. This keeps the schema
--     closed-by-default rather than open-by-default while auth is unwired.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
-- gen_random_uuid() ships in Postgres core since v13, so no pgcrypto/uuid-ossp
-- extension is required on Supabase's Postgres 15+.

-- ----------------------------------------------------------------------------
-- Helper: keep updated_at current on every UPDATE
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- settings — single-row table holding college branding & display config
-- ----------------------------------------------------------------------------
create table public.settings (
  id integer primary key default 1,
  college_name text not null default 'Your College Name',
  college_logo_url text,
  coe_office_name text not null default 'Controller of Examinations',
  website_title text not null default 'Exam Seat Finder',
  contact_email text,
  contact_phone text,
  updated_at timestamptz not null default now(),
  constraint settings_singleton check (id = 1)
);

insert into public.settings (id) values (1);

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

comment on table public.settings is 'Single-row table of college/branding configuration, editable by admins.';

-- ----------------------------------------------------------------------------
-- admin_profiles — extends auth.users with an application role
-- ----------------------------------------------------------------------------
create table public.admin_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null default 'admin' check (role in ('admin', 'superadmin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger admin_profiles_set_updated_at
  before update on public.admin_profiles
  for each row execute function public.set_updated_at();

comment on table public.admin_profiles is 'Extends Supabase auth.users with COE/admin role information.';

-- ----------------------------------------------------------------------------
-- halls — physical examination halls
-- ----------------------------------------------------------------------------
create table public.halls (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null,
  building text,
  floor text,
  capacity integer not null check (capacity > 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code)
);

create trigger halls_set_updated_at
  before update on public.halls
  for each row execute function public.set_updated_at();

create index halls_status_idx on public.halls (status);

comment on table public.halls is 'Examination halls that seats are allocated within.';

-- ----------------------------------------------------------------------------
-- exams — one row per (course/date/session) examination sitting
-- ----------------------------------------------------------------------------
create table public.exams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  course_code text not null,
  exam_date date not null,
  session text not null check (session in ('FN', 'AN')),
  start_time time,
  end_time time,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  created_by uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger exams_set_updated_at
  before update on public.exams
  for each row execute function public.set_updated_at();

-- Fast lookup of "what's happening today / this session".
create index exams_date_session_idx on public.exams (exam_date, session);
create index exams_status_idx on public.exams (status);

-- Business rule: at most one PUBLISHED exam per (date, session). This is what
-- lets the student portal resolve "today's seating" without the student
-- picking an exam.
create unique index exams_one_published_per_slot
  on public.exams (exam_date, session)
  where status = 'published';

comment on table public.exams is 'An examination sitting: one course, one date, one session (FN/AN).';

-- ----------------------------------------------------------------------------
-- students — minimal, de-duplicated by register number
-- ----------------------------------------------------------------------------
create table public.students (
  id uuid primary key default gen_random_uuid(),
  register_no text not null,
  -- Must mirror normalizeRegisterNumber() in src/lib/utils/register-number.ts:
  -- uppercase, with ALL whitespace (leading, trailing, and internal) removed.
  register_no_key text generated always as (upper(regexp_replace(register_no, '\s+', '', 'g'))) stored,
  full_name text not null,
  programme text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (register_no_key)
);

create trigger students_set_updated_at
  before update on public.students
  for each row execute function public.set_updated_at();

-- The public search path is entirely keyed on this normalized column.
create index students_register_no_key_idx on public.students (register_no_key);

comment on table public.students is 'Students are stored once and re-used across exams; register_no_key is the case/whitespace-normalized lookup key.';

-- ----------------------------------------------------------------------------
-- import_batches — one row per Excel/CSV upload attempt
-- ----------------------------------------------------------------------------
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  file_name text,
  uploaded_by uuid references auth.users (id) on delete set null,
  column_mapping jsonb,
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  error_rows integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'validated', 'imported', 'failed')),
  created_at timestamptz not null default now()
);

create index import_batches_exam_id_idx on public.import_batches (exam_id);

comment on table public.import_batches is 'Audit trail of each Excel/CSV upload, independent of whether it was ultimately imported.';

-- ----------------------------------------------------------------------------
-- import_errors — row-level validation errors for a batch
-- ----------------------------------------------------------------------------
create table public.import_errors (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.import_batches (id) on delete cascade,
  row_number integer not null,
  error_message text not null,
  raw_data jsonb,
  created_at timestamptz not null default now()
);

create index import_errors_batch_id_idx on public.import_errors (import_batch_id);

comment on table public.import_errors is 'Per-row validation failures surfaced in the import validation report.';

-- ----------------------------------------------------------------------------
-- seat_allocations — the actual hall/seat assignment for a student+exam
-- ----------------------------------------------------------------------------
create table public.seat_allocations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  exam_id uuid not null references public.exams (id) on delete cascade,
  hall_id uuid not null references public.halls (id) on delete restrict,
  seat_no text not null,
  import_batch_id uuid references public.import_batches (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A student can only have one seat per exam.
  unique (exam_id, student_id),
  -- A seat can only be occupied by one student per exam.
  unique (exam_id, hall_id, seat_no)
);

create trigger seat_allocations_set_updated_at
  before update on public.seat_allocations
  for each row execute function public.set_updated_at();

create index seat_allocations_exam_id_idx on public.seat_allocations (exam_id);
create index seat_allocations_student_id_idx on public.seat_allocations (student_id);
create index seat_allocations_hall_id_idx on public.seat_allocations (hall_id);

comment on table public.seat_allocations is 'Exam-specific hall/seat assignment. Never treat a seat as permanent for a student.';

-- ----------------------------------------------------------------------------
-- audit_logs — admin action trail
-- ----------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_admin_id_idx on public.audit_logs (admin_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

comment on table public.audit_logs is 'Append-only log of admin actions (logins, publishes, seat changes, etc).';

-- ----------------------------------------------------------------------------
-- Row Level Security — enabled everywhere, closed by default.
-- ----------------------------------------------------------------------------
-- No policies are created in this migration. With RLS enabled and zero
-- policies, anon/authenticated roles get zero access; the service-role key
-- (used only in trusted server-side code, never shipped to the browser)
-- bypasses RLS entirely. Phase 2 adds admin-scoped policies once Supabase
-- Auth admin accounts exist; Phase 6 adds a narrow public search function.
alter table public.settings enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.halls enable row level security;
alter table public.exams enable row level security;
alter table public.students enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_errors enable row level security;
alter table public.seat_allocations enable row level security;
alter table public.audit_logs enable row level security;
