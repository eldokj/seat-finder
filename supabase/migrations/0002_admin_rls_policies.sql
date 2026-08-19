-- ============================================================================
-- Exam Seat Finder — Admin RLS policies
-- ============================================================================
-- Migration 0001 enabled RLS on every table with zero policies (closed by
-- default). This migration adds the policies needed now that Supabase Auth
-- admin accounts exist: any authenticated user with an active row in
-- admin_profiles gets full read/write access to operational tables, using
-- the same session the Next.js server-side Supabase client already
-- forwards via cookies.
--
-- Deliberately NOT granted here:
--   * Self-service admin creation. There is no INSERT policy on
--     admin_profiles for the authenticated role — a signed-up Supabase Auth
--     user cannot grant themselves admin access. Admin accounts are
--     provisioned out-of-band (Supabase Dashboard / service role), matching
--     "no unnecessary student/self registration". See docs/DEPLOYMENT.md.
--   * Editing or deleting audit_logs. Admins can INSERT (write an entry)
--     and SELECT (view the trail), but never UPDATE/DELETE — the log stays
--     append-only even for admins.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper: is the current session an active admin?
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER so this can read admin_profiles regardless of the
-- calling role's own RLS visibility into that table (avoids a chicken-and-
-- egg problem where checking "am I an admin" requires already being able to
-- read the admin table).
create or replace function public.is_active_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.admin_profiles
    where id = auth.uid()
      and is_active = true
  );
$$;

comment on function public.is_active_admin is
  'True if the current auth session belongs to an active admin_profiles row. Used throughout RLS policies.';

-- ----------------------------------------------------------------------------
-- settings
-- ----------------------------------------------------------------------------
create policy "admins can view settings"
  on public.settings for select
  using (public.is_active_admin());

create policy "admins can update settings"
  on public.settings for update
  using (public.is_active_admin())
  with check (public.is_active_admin());

-- ----------------------------------------------------------------------------
-- admin_profiles — deliberately narrow: self-read only, no self-service
-- insert/update/delete for any role.
-- ----------------------------------------------------------------------------
create policy "admins can view their own profile"
  on public.admin_profiles for select
  using (id = auth.uid());

-- ----------------------------------------------------------------------------
-- halls / exams / students / seat_allocations / import_batches / import_errors
-- — active admins get full access; these are internal operational tables
-- never queried directly by the public anon role.
-- ----------------------------------------------------------------------------
create policy "admins manage halls"
  on public.halls for all
  using (public.is_active_admin())
  with check (public.is_active_admin());

create policy "admins manage exams"
  on public.exams for all
  using (public.is_active_admin())
  with check (public.is_active_admin());

create policy "admins manage students"
  on public.students for all
  using (public.is_active_admin())
  with check (public.is_active_admin());

create policy "admins manage seat allocations"
  on public.seat_allocations for all
  using (public.is_active_admin())
  with check (public.is_active_admin());

create policy "admins manage import batches"
  on public.import_batches for all
  using (public.is_active_admin())
  with check (public.is_active_admin());

create policy "admins manage import errors"
  on public.import_errors for all
  using (public.is_active_admin())
  with check (public.is_active_admin());

-- ----------------------------------------------------------------------------
-- audit_logs — append-only even for admins: select + insert, no update/delete.
-- ----------------------------------------------------------------------------
create policy "admins view audit logs"
  on public.audit_logs for select
  using (public.is_active_admin());

create policy "admins create audit log entries"
  on public.audit_logs for insert
  with check (public.is_active_admin());
