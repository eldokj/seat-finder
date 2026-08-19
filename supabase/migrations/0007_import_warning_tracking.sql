-- ============================================================================
-- Exam Seat Finder — Warning tracking for imports
-- ============================================================================
-- Small additive change for Phase 5 (Master Timetable + Student Roster
-- import), NOT a redesign of the Phase 4 architecture: no tables, columns,
-- or relationships from the approved model change shape. Existing RLS
-- policies (table-wide "for all" on import_batches/import_errors) already
-- cover these new columns with no policy changes needed.
--
-- import_batches.total_rows/valid_rows/error_rows already exist (0001) but
-- there was no way to record how many otherwise-valid rows carried a
-- non-blocking warning. import_errors had no way to distinguish a blocking
-- error from an admin-reviewable warning on the same row.
-- ============================================================================

alter table public.import_batches add column warning_rows integer not null default 0;

comment on column public.import_batches.warning_rows is 'Count of rows that imported successfully but carried a non-blocking warning (e.g. a course-name/programme mismatch) — a subset of valid_rows, not additional to it.';

alter table public.import_errors add column severity text not null default 'error'
  check (severity in ('error', 'warning'));

comment on column public.import_errors.severity is '''error'' = this row was rejected and not imported. ''warning'' = the row WAS imported (or, for a duplicate/unchanged row, correctly skipped) but has something worth an admin reviewing.';
