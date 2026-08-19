/**
 * Hand-written types mirroring `supabase/migrations/0001` through `0006`.
 *
 * Once type generation is wired up, these can be replaced/augmented with
 * generated types (see docs/SCHEMA.md → "Regenerating TypeScript types").
 * Keep this file in sync with the migrations until then.
 */

export type ExamSession = "FN" | "AN";

export type DailyEventStatus = "draft" | "published" | "closed";

export type ExaminationPeriodStatus = "active" | "closed";

export type RoomStatus = "active" | "inactive";

/**
 * Shared vocabulary for both `rooms.numbering_scheme` (how seats are
 * labelled) and the `allocation_pattern` seating rule (fill order during
 * automatic allocation). Deliberately the same 5 values in both places.
 */
export type SeatPattern = "row_wise" | "column_wise" | "serpentine_row" | "serpentine_column" | "custom";

export type SeatPositionType = "seat" | "gap";

export type RoomSeatStatus = "available" | "disabled";

export type SeatingRuleScope = "global" | "daily_examination_event";

export type SeatingRuleType =
  | "avoid_same_programme_adjacent"
  | "avoid_same_department_adjacent"
  | "avoid_same_course_adjacent"
  | "row_jump"
  | "column_jump"
  | "allocation_pattern"
  | "gender_mixing";

/**
 * 'hard' is a valid value for reporting-label symmetry only — hard-tier
 * rules are structural (DB constraints + algorithm design), never stored as
 * a seating_rules row. Only 'high' and 'preference' rows should ever exist.
 */
export type SeatingRulePriorityTier = "hard" | "high" | "preference";

export type AdminRole = "admin" | "superadmin";

export type ImportBatchStatus = "pending" | "validated" | "imported" | "failed";

// "consolidated" requires migration 0009_import_batches_consolidated_type.sql
// to be applied — the DB check constraint only allows it once that
// migration has been run. See that file's comment for why it's needed.
export type ImportType = "timetable" | "roster" | "consolidated";

// NOTE: these are `type` aliases, not `interface` declarations, on purpose.
// postgrest-js's query-result inference requires each Row/Insert/Update
// shape to structurally satisfy `Record<string, unknown>` in a conditional
// type, and TypeScript only accepts that implicit index-signature match for
// object *type literals*, not for named `interface`s. Using `interface`
// here silently makes every `supabase.from(...).select(...)` resolve to
// `never`. Keep these as `type`. (See docs/SCHEMA.md "Gotcha for future edits".)

export type Settings = {
  id: 1;
  college_name: string;
  college_logo_url: string | null;
  coe_office_name: string;
  website_title: string;
  contact_email: string | null;
  contact_phone: string | null;
  updated_at: string;
};

export type AdminProfile = {
  id: string;
  full_name: string;
  role: AdminRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ExaminationPeriod = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: ExaminationPeriodStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DailyExaminationEvent = {
  id: string;
  examination_period_id: string | null;
  exam_date: string; // ISO date (YYYY-MM-DD)
  session: ExamSession;
  start_time: string | null; // HH:MM:SS
  end_time: string | null;
  status: DailyEventStatus;
  published_at: string | null;
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MasterTimetableRecord = {
  id: string;
  daily_examination_event_id: string;
  programme: string;
  course_name: string;
  course_code: string;
  /** Academic/admission batch year, e.g. 2024, 2025, 2026 — NOT "First Year"/"Second Year". */
  year: number;
  /** Academic term/semester number, e.g. 1-6. */
  term: number;
  strength: number;
  import_batch_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Student = {
  id: string;
  register_no: string;
  register_no_key: string;
  full_name: string;
  programme: string | null;
  department: string | null;
  gender: string | null;
  created_at: string;
  updated_at: string;
};

export type Room = {
  id: string;
  room_number: string;
  code: string;
  block: string | null;
  floor: string | null;
  landmark: string | null;
  rows: number | null;
  columns: number | null;
  sections: number | null;
  total_physical_positions: number | null;
  usable_seats: number;
  additional_seats: number;
  display_order: number;
  numbering_scheme: SeatPattern;
  status: RoomStatus;
  created_at: string;
  updated_at: string;
};

export type RoomSeat = {
  id: string;
  room_id: string;
  row_number: number;
  column_number: number;
  section: string | null;
  seat_label: string | null; // null only when position_type === 'gap'
  position_type: SeatPositionType;
  status: RoomSeatStatus;
  created_at: string;
  updated_at: string;
};

export type RoomAllocation = {
  id: string;
  daily_examination_event_id: string;
  room_id: string;
  usable_seats_snapshot: number;
  created_at: string;
  updated_at: string;
};

/**
 * Student-level participation and seating. `room_id` / `room_seat_id` /
 * `seat_no` are null for a registered-but-not-yet-seated student — never
 * treat a row's mere existence as "seated"; check `room_seat_id` (or
 * `seat_no`, for rooms without a detailed layout) instead.
 */
export type SeatAllocation = {
  id: string;
  student_id: string;
  daily_examination_event_id: string;
  master_timetable_record_id: string;
  room_id: string | null;
  room_seat_id: string | null;
  seat_no: string | null;
  import_batch_id: string | null;
  created_at: string;
  updated_at: string;
};

export type SeatingRule = {
  id: string;
  scope: SeatingRuleScope;
  daily_examination_event_id: string | null;
  rule_type: SeatingRuleType;
  priority_tier: SeatingRulePriorityTier;
  is_active: boolean;
  parameters: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ImportBatch = {
  id: string;
  daily_examination_event_id: string;
  import_type: ImportType;
  file_name: string | null;
  uploaded_by: string | null;
  column_mapping: Record<string, string> | null;
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  warning_rows: number;
  status: ImportBatchStatus;
  created_at: string;
};

export type ImportErrorSeverity = "error" | "warning";

export type ImportError = {
  id: string;
  import_batch_id: string;
  row_number: number;
  error_message: string;
  raw_data: Record<string, unknown> | null;
  severity: ImportErrorSeverity;
  created_at: string;
};

export type AuditLog = {
  id: string;
  admin_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
};

/**
 * Minimal, safe-to-expose shape returned by the public student seat lookup.
 * Deliberately excludes internal IDs and any field not needed by a student.
 */
export type PublicSeatResult = {
  registerNo: string;
  studentName: string;
  programme: string | null;
  courseCode: string;
  courseName: string;
  examDate: string;
  session: ExamSession;
  roomName: string;
  seatNo: string;
};

/** Supabase `Database` generic shape, hand-maintained. */
export type Database = {
  public: {
    Tables: {
      settings: {
        Row: Settings;
        Insert: Partial<Settings>;
        Update: Partial<Settings>;
        Relationships: [];
      };
      admin_profiles: {
        Row: AdminProfile;
        Insert: Partial<AdminProfile> & Pick<AdminProfile, "id" | "full_name">;
        Update: Partial<AdminProfile>;
        Relationships: [];
      };
      examination_periods: {
        Row: ExaminationPeriod;
        Insert: Partial<ExaminationPeriod> & Pick<ExaminationPeriod, "name" | "start_date" | "end_date">;
        Update: Partial<ExaminationPeriod>;
        Relationships: [];
      };
      daily_examination_events: {
        Row: DailyExaminationEvent;
        Insert: Partial<DailyExaminationEvent> & Pick<DailyExaminationEvent, "exam_date" | "session">;
        Update: Partial<DailyExaminationEvent>;
        Relationships: [];
      };
      master_timetable_records: {
        Row: MasterTimetableRecord;
        Insert: Partial<MasterTimetableRecord> &
          Pick<MasterTimetableRecord, "daily_examination_event_id" | "programme" | "course_name" | "course_code" | "year" | "term" | "strength">;
        Update: Partial<MasterTimetableRecord>;
        Relationships: [];
      };
      students: {
        Row: Student;
        Insert: Partial<Student> & Pick<Student, "register_no" | "full_name">;
        Update: Partial<Student>;
        Relationships: [];
      };
      rooms: {
        Row: Room;
        Insert: Partial<Room> & Pick<Room, "room_number" | "code" | "usable_seats">;
        Update: Partial<Room>;
        Relationships: [];
      };
      room_seats: {
        Row: RoomSeat;
        Insert: Partial<RoomSeat> & Pick<RoomSeat, "room_id" | "row_number" | "column_number">;
        Update: Partial<RoomSeat>;
        Relationships: [];
      };
      room_allocations: {
        Row: RoomAllocation;
        Insert: Partial<RoomAllocation> &
          Pick<RoomAllocation, "daily_examination_event_id" | "room_id" | "usable_seats_snapshot">;
        Update: Partial<RoomAllocation>;
        Relationships: [];
      };
      seat_allocations: {
        Row: SeatAllocation;
        Insert: Partial<SeatAllocation> &
          Pick<SeatAllocation, "student_id" | "daily_examination_event_id" | "master_timetable_record_id">;
        Update: Partial<SeatAllocation>;
        Relationships: [];
      };
      seating_rules: {
        Row: SeatingRule;
        Insert: Partial<SeatingRule> & Pick<SeatingRule, "rule_type" | "priority_tier">;
        Update: Partial<SeatingRule>;
        Relationships: [];
      };
      import_batches: {
        Row: ImportBatch;
        Insert: Partial<ImportBatch> & Pick<ImportBatch, "daily_examination_event_id">;
        Update: Partial<ImportBatch>;
        Relationships: [];
      };
      import_errors: {
        Row: ImportError;
        Insert: Partial<ImportError> &
          Pick<ImportError, "import_batch_id" | "row_number" | "error_message">;
        Update: Partial<ImportError>;
        Relationships: [];
      };
      audit_logs: {
        Row: AuditLog;
        Insert: Partial<AuditLog> & Pick<AuditLog, "action">;
        Update: Partial<AuditLog>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      // Phase 8 — the only two functions callable by the anon role (see
      // supabase/migrations/0008_public_seat_lookup.sql). Both SECURITY
      // DEFINER, both narrow, both take "today" as a parameter rather than
      // deriving it server-side.
      public_today_event_status: {
        Args: { p_exam_date: string };
        Returns: { session: ExamSession; status: DailyEventStatus }[];
      };
      public_seat_lookup: {
        Args: { p_register_no: string; p_exam_date: string };
        Returns: {
          register_no: string;
          student_name: string;
          programme: string | null;
          course_code: string;
          course_name: string;
          session: ExamSession;
          exam_date: string;
          room_name: string;
          seat_no: string;
        }[];
      };
    };
  };
};
