"use server";

import { getAdminSession } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/admin/audit";
import { loadActiveRulesForEvent } from "@/lib/admin/seating-data-io";
import { loadSeatingRuleSetInput } from "@/lib/admin/seating-rules-io";
import {
  allocateSeats,
  generateSeed,
  repairPass,
  type AllocationRoomInput,
  type AllocationParticipant,
} from "@/lib/validation/seating-allocation";
import { checkSeatingViolations, type GridPlacement } from "@/lib/validation/seating-rules-engine";
import { isUniqueViolation, CONCURRENT_SEATING_CONFLICT_MESSAGE } from "@/lib/admin/db-errors";

/**
 * Phase 7 — Seating Allocation workspace actions. Called directly from the
 * client component (not bound to a <form>), same pattern as Phase 6's
 * saveRoomLayoutAction. Every write here follows the two-phase null-first
 * pattern established for Phase 6's label-swap bug: reassigning
 * room_seat_id / seat_no values across multiple rows in one batch can
 * transiently collide against the (event_id, room_seat_id) / (event_id,
 * room_id, seat_no) unique constraints the same way — nulling first is
 * always safe because Postgres treats every NULL as distinct.
 */

export interface ActionResult {
  success: boolean;
  error?: string;
}

export interface ProposedPlacementView {
  seatAllocationId: string;
  studentId: string;
  registerNo: string;
  fullName: string;
  programme: string | null;
  courseCode: string;
  /** Display only (approved decision #13) — never fed into the allocation
   * algorithm, which stays Year/Term-unaware (see AllocationParticipant). */
  year: number | null;
  term: number | null;
  roomId: string;
  roomNumber: string;
  seatLabel: string;
  roomSeatId: string | null;
  seatNo: string | null;
  seatKind: "grid" | "additional";
  status: "compliant" | "violation";
  violationMessages: string[];
}

export interface PreviewResult {
  ok: boolean;
  error?: string;
  placements: ProposedPlacementView[];
}

async function loadAllocationInputs(eventId: string) {
  const supabase = await createSupabaseServerClient();

  const { data: roomAllocations } = await supabase
    .from("room_allocations")
    .select("room_id")
    .eq("daily_examination_event_id", eventId);
  const roomIds = (roomAllocations ?? []).map((r) => r.room_id);

  const [{ data: rooms }, { data: roomSeats }, { data: seatAllocations }, activeRules, ruleSetInput] = await Promise.all([
    roomIds.length > 0 ? supabase.from("rooms").select("id, room_number, additional_seats").in("id", roomIds) : Promise.resolve({ data: [] }),
    roomIds.length > 0 ? supabase.from("room_seats").select("*").in("room_id", roomIds) : Promise.resolve({ data: [] }),
    supabase.from("seat_allocations").select("*").eq("daily_examination_event_id", eventId),
    loadActiveRulesForEvent(supabase, eventId),
    loadSeatingRuleSetInput(supabase, "daily_examination_event", eventId),
  ]);

  return { supabase, roomIds, rooms: rooms ?? [], roomSeats: roomSeats ?? [], seatAllocations: seatAllocations ?? [], activeRules, ruleSetInput };
}

export async function previewAutomaticAllocationAction(eventId: string, reshuffle: boolean): Promise<PreviewResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Your session has expired. Please sign in again.", placements: [] };

  const { supabase, roomIds, rooms, roomSeats, seatAllocations, activeRules, ruleSetInput } = await loadAllocationInputs(eventId);
  if (roomIds.length === 0) return { ok: false, error: "No rooms are allocated to this session yet.", placements: [] };

  const occupiedRoomSeatIds = new Set(seatAllocations.filter((a) => a.room_seat_id).map((a) => a.room_seat_id));
  const occupiedAdditional = new Set(seatAllocations.filter((a) => !a.room_seat_id && a.seat_no).map((a) => `${a.room_id}::${a.seat_no}`));

  const roomInputs: AllocationRoomInput[] = rooms.map((room) => {
    const availableSeats = roomSeats
      .filter((rs) => rs.room_id === room.id && rs.position_type === "seat" && rs.status === "available" && !occupiedRoomSeatIds.has(rs.id))
      .map((rs) => ({ roomSeatId: rs.id, rowNumber: rs.row_number, columnNumber: rs.column_number }));
    const additionalSeatSlots: string[] = [];
    for (let i = 1; i <= room.additional_seats; i++) {
      const seatNo = `ADD-${i}`;
      if (!occupiedAdditional.has(`${room.id}::${seatNo}`)) additionalSeatSlots.push(seatNo);
    }
    return { roomId: room.id, availableSeats, additionalSeatSlots };
  });

  const unallocatedAllocations = seatAllocations.filter((a) => !a.room_id);
  if (unallocatedAllocations.length === 0) return { ok: false, error: "No unallocated participants to place.", placements: [] };

  const studentIds = [...new Set(unallocatedAllocations.map((a) => a.student_id))];
  const recordIds = [...new Set(unallocatedAllocations.map((a) => a.master_timetable_record_id))];
  const [{ data: students }, { data: records }] = await Promise.all([
    supabase.from("students").select("id, register_no, full_name, programme, department").in("id", studentIds),
    supabase.from("master_timetable_records").select("id, course_code, year, term").in("id", recordIds),
  ]);
  const studentById = new Map((students ?? []).map((s) => [s.id, s]));
  const recordById = new Map((records ?? []).map((r) => [r.id, r]));

  const participants: AllocationParticipant[] = unallocatedAllocations.map((a) => {
    const student = studentById.get(a.student_id);
    const record = recordById.get(a.master_timetable_record_id);
    return {
      seatAllocationId: a.id,
      studentId: a.student_id,
      programme: student?.programme ?? null,
      department: student?.department ?? null,
      courseCode: record?.course_code ?? "",
    };
  });

  const seed = reshuffle ? Date.now() : generateSeed(eventId);
  const result = allocateSeats(roomInputs, participants, activeRules, ruleSetInput.allocation_pattern, seed);
  if (!result.ok) return { ok: false, error: result.error, placements: [] };

  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const roomSeatById = new Map(roomSeats.map((rs) => [rs.id, rs]));

  const gridPlacements: GridPlacement[] = result.placements
    .filter((p) => p.seatKind === "grid" && p.roomSeatId)
    .map((p) => {
      const seat = roomSeatById.get(p.roomSeatId!)!;
      const participant = participants.find((s) => s.seatAllocationId === p.seatAllocationId)!;
      return {
        seatAllocationId: p.seatAllocationId,
        roomId: p.roomId,
        roomSeatId: p.roomSeatId!,
        rowNumber: seat.row_number,
        columnNumber: seat.column_number,
        student: { studentId: participant.studentId, programme: participant.programme, department: participant.department, courseCode: participant.courseCode },
      };
    });
  const violations = checkSeatingViolations(gridPlacements, activeRules);
  const violationsBySeat = new Map<string, string[]>();
  for (const v of violations) {
    for (const id of v.seatAllocationIds) violationsBySeat.set(id, [...(violationsBySeat.get(id) ?? []), v.message]);
  }

  const placements: ProposedPlacementView[] = result.placements.map((p) => {
    const student = studentById.get(participants.find((s) => s.seatAllocationId === p.seatAllocationId)!.studentId);
    const record = recordById.get(unallocatedAllocations.find((a) => a.id === p.seatAllocationId)!.master_timetable_record_id);
    const room = roomById.get(p.roomId)!;
    const seatLabel = p.roomSeatId ? (roomSeatById.get(p.roomSeatId)?.seat_label ?? "?") : (p.seatNo ?? "?");
    const messages = violationsBySeat.get(p.seatAllocationId) ?? [];
    return {
      seatAllocationId: p.seatAllocationId,
      studentId: p.studentId,
      registerNo: student?.register_no ?? "?",
      fullName: student?.full_name ?? "?",
      programme: student?.programme ?? null,
      courseCode: record?.course_code ?? "?",
      year: record?.year ?? null,
      term: record?.term ?? null,
      roomId: p.roomId,
      roomNumber: room.room_number,
      seatLabel,
      roomSeatId: p.roomSeatId,
      seatNo: p.seatNo,
      seatKind: p.seatKind,
      status: messages.length > 0 ? "violation" : "compliant",
      violationMessages: messages,
    };
  });

  return { ok: true, placements };
}

export async function confirmAllocationAction(
  eventId: string,
  placements: { seatAllocationId: string; roomId: string; roomSeatId: string | null; seatNo: string | null }[]
): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { success: false, error: "Your session has expired. Please sign in again." };
  if (placements.length === 0) return { success: false, error: "Nothing to confirm." };

  const supabase = await createSupabaseServerClient();

  const ids = placements.map((p) => p.seatAllocationId);
  const { error: clearError } = await supabase
    .from("seat_allocations")
    .update({ room_id: null, room_seat_id: null, seat_no: null })
    .in("id", ids);
  if (clearError) return { success: false, error: "Unable to save the allocation. Please try again." };

  for (const p of placements) {
    const { error } = await supabase
      .from("seat_allocations")
      .update({ room_id: p.roomId, room_seat_id: p.roomSeatId, seat_no: p.seatNo })
      .eq("id", p.seatAllocationId);
    if (error) {
      return {
        success: false,
        error: isUniqueViolation(error)
          ? `${CONCURRENT_SEATING_CONFLICT_MESSAGE} Please re-run Preview.`
          : "Unable to save the allocation — some seats may conflict. Please re-run Preview.",
      };
    }
  }

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "seating_allocation_confirmed",
    entityType: "daily_examination_event",
    entityId: eventId,
    newValue: { placedCount: placements.length },
  });

  return { success: true };
}

async function checkSeatFree(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  eventId: string,
  roomId: string,
  roomSeatId: string | null,
  seatNo: string | null,
  excludeSeatAllocationId: string
): Promise<boolean> {
  let query = supabase.from("seat_allocations").select("id").eq("daily_examination_event_id", eventId).neq("id", excludeSeatAllocationId);
  query = roomSeatId ? query.eq("room_seat_id", roomSeatId) : query.eq("room_id", roomId).eq("seat_no", seatNo!);
  const { data } = await query.limit(1);
  return !data || data.length === 0;
}

/** Assign an unallocated student, or move an already-seated one — same
 * underlying write either way (a UI-level distinction, not a different DB
 * operation). */
export async function manualAssignSeatAction(
  eventId: string,
  seatAllocationId: string,
  roomId: string,
  roomSeatId: string | null,
  seatNo: string | null
): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { success: false, error: "Your session has expired. Please sign in again." };

  const supabase = await createSupabaseServerClient();

  const free = await checkSeatFree(supabase, eventId, roomId, roomSeatId, seatNo, seatAllocationId);
  if (!free) return { success: false, error: "That seat is already occupied. Refresh and try again." };

  const { error } = await supabase
    .from("seat_allocations")
    .update({ room_id: roomId, room_seat_id: roomSeatId, seat_no: seatNo })
    .eq("id", seatAllocationId);
  if (error) return { success: false, error: isUniqueViolation(error) ? CONCURRENT_SEATING_CONFLICT_MESSAGE : "Unable to assign this seat. Please try again." };

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "seat_manually_assigned",
    entityType: "seat_allocation",
    entityId: seatAllocationId,
    newValue: { roomId, roomSeatId, seatNo },
  });

  return { success: true };
}

export async function manualSwapSeatsAction(eventId: string, seatAllocationIdA: string, seatAllocationIdB: string): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { success: false, error: "Your session has expired. Please sign in again." };

  const supabase = await createSupabaseServerClient();

  const { data: rows } = await supabase
    .from("seat_allocations")
    .select("id, room_id, room_seat_id, seat_no")
    .in("id", [seatAllocationIdA, seatAllocationIdB])
    .eq("daily_examination_event_id", eventId);

  const a = rows?.find((r) => r.id === seatAllocationIdA);
  const b = rows?.find((r) => r.id === seatAllocationIdB);
  if (!a || !b) return { success: false, error: "Could not find both seats to swap." };

  const { error: clearError } = await supabase
    .from("seat_allocations")
    .update({ room_id: null, room_seat_id: null, seat_no: null })
    .in("id", [seatAllocationIdA, seatAllocationIdB]);
  if (clearError) return { success: false, error: "Unable to swap these seats. Please try again." };

  const { error: errorA } = await supabase
    .from("seat_allocations")
    .update({ room_id: b.room_id, room_seat_id: b.room_seat_id, seat_no: b.seat_no })
    .eq("id", seatAllocationIdA);
  const { error: errorB } = await supabase
    .from("seat_allocations")
    .update({ room_id: a.room_id, room_seat_id: a.room_seat_id, seat_no: a.seat_no })
    .eq("id", seatAllocationIdB);
  if (errorA || errorB) {
    return {
      success: false,
      error: isUniqueViolation(errorA) || isUniqueViolation(errorB) ? CONCURRENT_SEATING_CONFLICT_MESSAGE : "Unable to complete the swap. Please try again.",
    };
  }

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "seats_manually_swapped",
    entityType: "seat_allocation",
    entityId: seatAllocationIdA,
    newValue: { swappedWith: seatAllocationIdB },
  });

  return { success: true };
}

export async function manualUnseatAction(eventId: string, seatAllocationId: string): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { success: false, error: "Your session has expired. Please sign in again." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("seat_allocations")
    .update({ room_id: null, room_seat_id: null, seat_no: null })
    .eq("id", seatAllocationId)
    .eq("daily_examination_event_id", eventId);
  if (error) return { success: false, error: "Unable to unseat this student. Please try again." };

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "seat_manually_unseated",
    entityType: "seat_allocation",
    entityId: seatAllocationId,
  });

  return { success: true };
}

/** Repair-pass only: fixes violations among already-seated students,
 * without seating anyone new. */
export async function resolveConflictsAction(eventId: string): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { success: false, error: "Your session has expired. Please sign in again." };

  const { supabase, roomSeats, seatAllocations, activeRules } = await loadAllocationInputs(eventId);

  const roomSeatById = new Map(roomSeats.map((rs) => [rs.id, rs]));
  const studentIds = [...new Set(seatAllocations.filter((a) => a.room_seat_id).map((a) => a.student_id))];
  const recordIds = [...new Set(seatAllocations.filter((a) => a.room_seat_id).map((a) => a.master_timetable_record_id))];
  const [{ data: students }, { data: records }] = await Promise.all([
    studentIds.length > 0 ? supabase.from("students").select("id, programme, department").in("id", studentIds) : Promise.resolve({ data: [] }),
    recordIds.length > 0 ? supabase.from("master_timetable_records").select("id, course_code").in("id", recordIds) : Promise.resolve({ data: [] }),
  ]);
  const studentById = new Map((students ?? []).map((s) => [s.id, s]));
  const recordById = new Map((records ?? []).map((r) => [r.id, r]));

  const placedGrid: GridPlacement[] = seatAllocations
    .filter((a) => a.room_seat_id)
    .map((a) => {
      const seat = roomSeatById.get(a.room_seat_id!)!;
      const student = studentById.get(a.student_id);
      const record = recordById.get(a.master_timetable_record_id);
      return {
        seatAllocationId: a.id,
        roomId: a.room_id!,
        roomSeatId: a.room_seat_id!,
        rowNumber: seat.row_number,
        columnNumber: seat.column_number,
        student: { studentId: a.student_id, programme: student?.programme ?? null, department: student?.department ?? null, courseCode: record?.course_code ?? "" },
      };
    });

  const before = checkSeatingViolations(placedGrid, activeRules).length;
  const repaired = repairPass(placedGrid, activeRules);
  const after = checkSeatingViolations(repaired, activeRules).length;

  const changed = repaired.filter((p) => {
    const original = placedGrid.find((o) => o.seatAllocationId === p.seatAllocationId)!;
    return original.roomSeatId !== p.roomSeatId;
  });

  if (changed.length === 0) {
    return { success: true, error: before === 0 ? "No conflicts to resolve." : "No improving swap found — resolve remaining conflicts manually." };
  }

  const changedIds = changed.map((p) => p.seatAllocationId);
  const { error: clearError } = await supabase
    .from("seat_allocations")
    .update({ room_id: null, room_seat_id: null, seat_no: null })
    .in("id", changedIds);
  if (clearError) return { success: false, error: "Unable to apply the fix. Please try again." };

  for (const p of changed) {
    const { error } = await supabase
      .from("seat_allocations")
      .update({ room_id: p.roomId, room_seat_id: p.roomSeatId, seat_no: null })
      .eq("id", p.seatAllocationId);
    if (error) return { success: false, error: "Unable to apply the fix. Please try again." };
  }

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "seating_conflicts_resolved",
    entityType: "daily_examination_event",
    entityId: eventId,
    newValue: { violationsBefore: before, violationsAfter: after, seatsMoved: changed.length },
  });

  return { success: true };
}
