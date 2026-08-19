import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, SeatPattern } from "@/types/database";
import { cellStateFromDb } from "@/lib/validation/room-layout";
import { resolveActiveRules } from "@/lib/validation/seating-rules-engine";
import { classifySeatAllocations, type ClassifiableAllocation, type ClassificationStatus } from "@/lib/validation/seating-allocation";
import { loadSeatingRuleSetInput } from "@/lib/admin/seating-rules-io";

/**
 * Phase 7 — I/O layer for the Seating Allocation workspace. Reads live data
 * (never cached) and always runs classification fresh, so every load of
 * this data is itself a revalidation — the same function backs the initial
 * page render, the state after Confirm, and the state after any manual
 * edit (the client just calls router.refresh(), which re-runs this).
 */

export interface OccupantInfo {
  seatAllocationId: string;
  studentId: string;
  registerNo: string;
  fullName: string;
  programme: string | null;
  courseCode: string;
  /** Display only (approved decision #13) — never fed into seating
   * classification/allocation, which stays Year/Term-unaware. */
  year: number | null;
  term: number | null;
  status: ClassificationStatus;
  violationMessages: string[];
}

export interface SeatingCell {
  roomSeatId: string;
  roomId: string;
  rowNumber: number;
  columnNumber: number;
  seatLabel: string | null;
  cellState: "available" | "disabled" | "gap";
  occupant: OccupantInfo | null;
}

export interface AdditionalSlot {
  roomId: string;
  seatNo: string;
  occupant: OccupantInfo | null;
}

export interface RoomWithLayout {
  id: string;
  roomNumber: string;
  code: string;
  additionalSeats: number;
}

export interface ParticipantOption {
  seatAllocationId: string;
  studentId: string;
  registerNo: string;
  fullName: string;
  programme: string | null;
  courseCode: string;
  /** Display only (approved decision #13) — see OccupantInfo. */
  year: number | null;
  term: number | null;
}

export interface SeatingWorkspaceData {
  event: { id: string; examDate: string; session: string; status: string };
  pattern: SeatPattern;
  rooms: RoomWithLayout[];
  cells: SeatingCell[];
  additionalSlots: AdditionalSlot[];
  unallocated: ParticipantOption[];
  occupied: (ParticipantOption & { roomId: string; roomSeatId: string | null; seatNo: string | null })[];
  summary: {
    participants: number;
    unallocated: number;
    compliant: number;
    violation: number;
    additionalUsed: number;
  };
}

export async function loadSeatingWorkspaceData(
  supabase: SupabaseClient<Database>,
  eventId: string
): Promise<SeatingWorkspaceData | null> {
  const { data: event } = await supabase
    .from("daily_examination_events")
    .select("id, exam_date, session, status")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return null;

  const [{ data: roomAllocations }, { data: globalRules }, { data: eventRules }, ruleSetInput] = await Promise.all([
    supabase.from("room_allocations").select("room_id").eq("daily_examination_event_id", eventId),
    supabase.from("seating_rules").select("*").eq("scope", "global").is("daily_examination_event_id", null),
    supabase.from("seating_rules").select("*").eq("scope", "daily_examination_event").eq("daily_examination_event_id", eventId),
    loadSeatingRuleSetInput(supabase, "daily_examination_event", eventId),
  ]);

  const roomIds = (roomAllocations ?? []).map((r) => r.room_id);

  if (roomIds.length === 0) {
    return {
      event: { id: event.id, examDate: event.exam_date, session: event.session, status: event.status },
      pattern: ruleSetInput.allocation_pattern,
      rooms: [],
      cells: [],
      additionalSlots: [],
      unallocated: [],
      occupied: [],
      summary: { participants: 0, unallocated: 0, compliant: 0, violation: 0, additionalUsed: 0 },
    };
  }

  const [{ data: rooms }, { data: roomSeats }, { data: seatAllocations }] = await Promise.all([
    supabase.from("rooms").select("id, room_number, code, additional_seats").in("id", roomIds),
    supabase.from("room_seats").select("*").in("room_id", roomIds),
    supabase.from("seat_allocations").select("*").eq("daily_examination_event_id", eventId),
  ]);

  const studentIds = [...new Set((seatAllocations ?? []).map((a) => a.student_id))];
  const recordIds = [...new Set((seatAllocations ?? []).map((a) => a.master_timetable_record_id))];

  const [{ data: students }, { data: records }] = await Promise.all([
    studentIds.length > 0
      ? supabase.from("students").select("id, register_no, full_name, programme, department").in("id", studentIds)
      : Promise.resolve({ data: [] }),
    recordIds.length > 0
      ? supabase.from("master_timetable_records").select("id, course_code, year, term").in("id", recordIds)
      : Promise.resolve({ data: [] }),
  ]);

  const studentById = new Map((students ?? []).map((s) => [s.id, s]));
  const recordById = new Map((records ?? []).map((r) => [r.id, r]));
  const roomSeatById = new Map((roomSeats ?? []).map((rs) => [rs.id, rs]));

  const activeRules = resolveActiveRules(globalRules ?? [], eventRules ?? []);

  const classifiable: ClassifiableAllocation[] = (seatAllocations ?? []).map((a) => {
    const student = studentById.get(a.student_id);
    const record = recordById.get(a.master_timetable_record_id);
    const seat = a.room_seat_id ? roomSeatById.get(a.room_seat_id) : undefined;
    return {
      seatAllocationId: a.id,
      roomId: a.room_id,
      roomSeatId: a.room_seat_id,
      seatNo: a.seat_no,
      rowNumber: seat?.row_number ?? null,
      columnNumber: seat?.column_number ?? null,
      student: {
        studentId: a.student_id,
        programme: student?.programme ?? null,
        department: student?.department ?? null,
        courseCode: record?.course_code ?? "",
      },
    };
  });

  const classifications = classifySeatAllocations(classifiable, activeRules);
  const classificationById = new Map(classifications.map((c) => [c.seatAllocationId, c]));

  function occupantFor(seatAllocationId: string): OccupantInfo {
    const alloc = (seatAllocations ?? []).find((a) => a.id === seatAllocationId)!;
    const student = studentById.get(alloc.student_id);
    const record = recordById.get(alloc.master_timetable_record_id);
    const classification = classificationById.get(seatAllocationId);
    return {
      seatAllocationId,
      studentId: alloc.student_id,
      registerNo: student?.register_no ?? "?",
      fullName: student?.full_name ?? "?",
      programme: student?.programme ?? null,
      courseCode: record?.course_code ?? "?",
      year: record?.year ?? null,
      term: record?.term ?? null,
      status: classification?.status ?? "unallocated",
      violationMessages: classification?.violations.map((v) => v.message) ?? [],
    };
  }

  const occupantBySeatId = new Map<string, string>(); // room_seat_id -> seat_allocation_id
  const occupantByAdditional = new Map<string, string>(); // `${room_id}::${seat_no}` -> seat_allocation_id
  for (const a of seatAllocations ?? []) {
    if (a.room_seat_id) occupantBySeatId.set(a.room_seat_id, a.id);
    else if (a.room_id && a.seat_no) occupantByAdditional.set(`${a.room_id}::${a.seat_no}`, a.id);
  }

  const cells: SeatingCell[] = (roomSeats ?? []).map((rs) => {
    const occupantId = occupantBySeatId.get(rs.id);
    return {
      roomSeatId: rs.id,
      roomId: rs.room_id,
      rowNumber: rs.row_number,
      columnNumber: rs.column_number,
      seatLabel: rs.seat_label,
      cellState: cellStateFromDb(rs.position_type, rs.status),
      occupant: occupantId ? occupantFor(occupantId) : null,
    };
  });

  const additionalSlots: AdditionalSlot[] = [];
  for (const room of rooms ?? []) {
    for (let i = 1; i <= room.additional_seats; i++) {
      const seatNo = `ADD-${i}`;
      const occupantId = occupantByAdditional.get(`${room.id}::${seatNo}`);
      additionalSlots.push({ roomId: room.id, seatNo, occupant: occupantId ? occupantFor(occupantId) : null });
    }
  }

  const unallocated: ParticipantOption[] = (seatAllocations ?? [])
    .filter((a) => !a.room_id)
    .map((a) => {
      const student = studentById.get(a.student_id);
      const record = recordById.get(a.master_timetable_record_id);
      return {
        seatAllocationId: a.id,
        studentId: a.student_id,
        registerNo: student?.register_no ?? "?",
        fullName: student?.full_name ?? "?",
        programme: student?.programme ?? null,
        courseCode: record?.course_code ?? "?",
        year: record?.year ?? null,
        term: record?.term ?? null,
      };
    });

  const occupied = (seatAllocations ?? [])
    .filter((a) => a.room_id)
    .map((a) => {
      const student = studentById.get(a.student_id);
      const record = recordById.get(a.master_timetable_record_id);
      return {
        seatAllocationId: a.id,
        studentId: a.student_id,
        registerNo: student?.register_no ?? "?",
        fullName: student?.full_name ?? "?",
        programme: student?.programme ?? null,
        courseCode: record?.course_code ?? "?",
        year: record?.year ?? null,
        term: record?.term ?? null,
        roomId: a.room_id as string,
        roomSeatId: a.room_seat_id,
        seatNo: a.seat_no,
      };
    });

  const summary = {
    participants: (seatAllocations ?? []).length,
    unallocated: unallocated.length,
    compliant: classifications.filter((c) => c.status === "compliant").length,
    violation: classifications.filter((c) => c.status === "violation").length,
    additionalUsed: classifications.filter((c) => c.seatKind === "additional").length,
  };

  return {
    event: { id: event.id, examDate: event.exam_date, session: event.session, status: event.status },
    pattern: ruleSetInput.allocation_pattern,
    rooms: (rooms ?? []).map((r) => ({ id: r.id, roomNumber: r.room_number, code: r.code, additionalSeats: r.additional_seats })),
    cells,
    additionalSlots,
    unallocated,
    occupied,
    summary,
  };
}

export async function loadActiveRulesForEvent(supabase: SupabaseClient<Database>, eventId: string) {
  const [{ data: globalRules }, { data: eventRules }] = await Promise.all([
    supabase.from("seating_rules").select("*").eq("scope", "global").is("daily_examination_event_id", null),
    supabase.from("seating_rules").select("*").eq("scope", "daily_examination_event").eq("daily_examination_event_id", eventId),
  ]);
  return resolveActiveRules(globalRules ?? [], eventRules ?? []);
}
