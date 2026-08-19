-- ============================================================================
-- Exam Seat Finder — Add 'consolidated' to import_batches.import_type
-- ============================================================================
-- Import/Export architecture (approved). The new Consolidated Exam + Student
-- Data importer writes to BOTH master_timetable_records (course/strength)
-- AND students/seat_allocations (student registrations) in a single upload
-- — it is genuinely neither a 'timetable'-only nor a 'roster'-only batch.
-- Labeling it as either would make the import history on the Daily Exam
-- Session detail page actively misleading (it would look like a
-- Timetable-only upload with unexplained student writes attached, or vice
-- versa).
--
-- This is a pure additive change to the existing CHECK constraint — no
-- table, column, index, or RLS policy is touched. import_batches.import_type
-- already accepts ('timetable', 'roster'); this widens it to also accept
-- 'consolidated'. Every existing row and every existing query keeps working
-- unchanged.
-- ============================================================================

alter table public.import_batches drop constraint import_batches_import_type_check;

alter table public.import_batches add constraint import_batches_import_type_check
  check (import_type in ('timetable', 'roster', 'consolidated'));

comment on column public.import_batches.import_type is 'Which upload workflow produced this batch: the Master Timetable (programme/course/strength), the Student Roster (individual register numbers), or the Consolidated Exam + Student Data import (both at once, added in the Import/Export architecture phase).';
