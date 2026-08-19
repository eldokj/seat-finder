import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { cellStateFromDb, computeCapacityBreakdown, type CapacityBreakdown } from "@/lib/validation/room-layout";
import { computeUtilizationPercent, type SeatedRow } from "@/lib/validation/reports";

/**
 * Phase 9 — I/O layer for Reports. Reads existing tables only (no new
 * schema). Deliberately reuses Phase 6's computeCapacityBreakdown /
 * cellStateFromDb verbatim for the capacity report, and (in the room-wise
 * report route) Phase 7's loadSeatingWorkspaceData verbatim for the grid —
 * no seating/capacity math is duplicated here.
 */

export interface ReportEvent {
  id: string;
  examDate: string;
  session: "FN" | "AN";
  status: "draft" | "published" | "closed";
}

export async function loadReportEvent(supabase: SupabaseClient<Database>, eventId: string): Promise<ReportEvent | null> {
  const { data } = await supabase.from("daily_examination_events").select("id, exam_date, session, status").eq("id", eventId).maybeSingle();
  if (!data) return null;
  return { id: data.id, examDate: data.exam_date, session: data.session, status: data.status };
}

/** Every seated student for an event — the shared base query behind the
 * Date/Session, Student-wise, Programme-wise, Course-wise, and
 * Notice-Board reports (each just sorts/groups/projects this differently). */
export async function loadEventSeatedRows(supabase: SupabaseClient<Database>, eventId: string): Promise<SeatedRow[]> {
  const { data: allocations } = await supabase
    .from("seat_allocations")
    .select("id, student_id, master_timetable_record_id, room_id, room_seat_id, seat_no")
    .eq("daily_examination_event_id", eventId)
    .not("room_id", "is", null);

  const seated = (allocations ?? []).filter((a) => a.room_seat_id !== null || a.seat_no !== null);
  if (seated.length === 0) return [];

  const studentIds = [...new Set(seated.map((a) => a.student_id))];
  const recordIds = [...new Set(seated.map((a) => a.master_timetable_record_id))];
  const roomIds = [...new Set(seated.map((a) => a.room_id as string))];
  const roomSeatIds = seated.filter((a) => a.room_seat_id).map((a) => a.room_seat_id as string);

  const [{ data: students }, { data: records }, { data: rooms }, { data: roomSeats }] = await Promise.all([
    supabase.from("students").select("id, register_no, full_name, programme").in("id", studentIds),
    supabase.from("master_timetable_records").select("id, course_code, course_name, year, term").in("id", recordIds),
    supabase.from("rooms").select("id, room_number").in("id", roomIds),
    roomSeatIds.length > 0
      ? supabase.from("room_seats").select("id, seat_label, row_number, column_number").in("id", roomSeatIds)
      : Promise.resolve({ data: [] }),
  ]);

  const studentById = new Map((students ?? []).map((s) => [s.id, s]));
  const recordById = new Map((records ?? []).map((r) => [r.id, r]));
  const roomById = new Map((rooms ?? []).map((r) => [r.id, r]));
  const roomSeatById = new Map((roomSeats ?? []).map((rs) => [rs.id, rs]));

  return seated.map((a): SeatedRow => {
    const student = studentById.get(a.student_id);
    const record = recordById.get(a.master_timetable_record_id);
    const room = roomById.get(a.room_id as string);
    const seat = a.room_seat_id ? roomSeatById.get(a.room_seat_id) : undefined;
    return {
      seatAllocationId: a.id,
      registerNo: student?.register_no ?? "?",
      studentName: student?.full_name ?? "?",
      programme: student?.programme ?? null,
      courseCode: record?.course_code ?? "?",
      courseName: record?.course_name ?? "?",
      year: record?.year ?? null,
      term: record?.term ?? null,
      roomId: a.room_id as string,
      roomNumber: room?.room_number ?? "?",
      seatLabel: seat?.seat_label ?? a.seat_no ?? "?",
      seatKind: a.room_seat_id ? "grid" : "additional",
      rowNumber: seat?.row_number ?? null,
      columnNumber: seat?.column_number ?? null,
    };
  });
}

export interface RoomCapacityReportRow {
  roomId: string;
  roomNumber: string;
  breakdown: CapacityBreakdown;
  seatedCount: number;
  utilizationPercent: number;
}

/** Room Capacity/Utilization report — Phase 6's computeCapacityBreakdown
 * run per allocated room, plus how many are actually seated. */
export async function loadRoomCapacityReport(supabase: SupabaseClient<Database>, eventId: string): Promise<RoomCapacityReportRow[]> {
  const { data: roomAllocations } = await supabase.from("room_allocations").select("room_id").eq("daily_examination_event_id", eventId);
  const roomIds = (roomAllocations ?? []).map((r) => r.room_id);
  if (roomIds.length === 0) return [];

  const [{ data: rooms }, { data: roomSeats }, { data: allocations }] = await Promise.all([
    supabase.from("rooms").select("id, room_number, additional_seats").in("id", roomIds),
    supabase.from("room_seats").select("room_id, position_type, status").in("room_id", roomIds),
    supabase.from("seat_allocations").select("room_id, room_seat_id, seat_no").eq("daily_examination_event_id", eventId).in("room_id", roomIds),
  ]);

  return (rooms ?? []).map((room): RoomCapacityReportRow => {
    const cells = (roomSeats ?? []).filter((rs) => rs.room_id === room.id).map((rs) => ({ state: cellStateFromDb(rs.position_type, rs.status) }));
    const breakdown = computeCapacityBreakdown(cells, room.additional_seats);
    const seatedCount = (allocations ?? []).filter((a) => a.room_id === room.id && (a.room_seat_id !== null || a.seat_no !== null)).length;
    return {
      roomId: room.id,
      roomNumber: room.room_number,
      breakdown,
      seatedCount,
      utilizationPercent: computeUtilizationPercent(breakdown, seatedCount),
    };
  });
}

export interface ReportRoomOption {
  id: string;
  roomNumber: string;
  code: string;
}

/** Rooms allocated to an event — used to populate the room picker on the
 * Reports Hub page for the 3 room-scoped reports. */
export async function loadEventRooms(supabase: SupabaseClient<Database>, eventId: string): Promise<ReportRoomOption[]> {
  const { data: roomAllocations } = await supabase.from("room_allocations").select("room_id").eq("daily_examination_event_id", eventId);
  const roomIds = (roomAllocations ?? []).map((r) => r.room_id);
  if (roomIds.length === 0) return [];
  const { data: rooms } = await supabase.from("rooms").select("id, room_number, code").in("id", roomIds).order("display_order", { ascending: true });
  return (rooms ?? []).map((r) => ({ id: r.id, roomNumber: r.room_number, code: r.code }));
}
