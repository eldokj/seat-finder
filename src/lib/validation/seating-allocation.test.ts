import { describe, it, expect } from "vitest";
import {
  sortSeatsByPattern,
  generateSeed,
  buildPlacementQueue,
  allocateSeats,
  classifySeatAllocations,
  repairPass,
  type RoomSeatSlot,
  type AllocationParticipant,
  type AllocationRoomInput,
  type ClassifiableAllocation,
} from "./seating-allocation";
import { checkSeatingViolations, type GridPlacement } from "./seating-rules-engine";
import type { SeatingRule } from "@/types/database";

function rule(overrides: Partial<SeatingRule>): SeatingRule {
  return {
    id: overrides.id ?? "rule-1",
    scope: "global",
    daily_examination_event_id: null,
    rule_type: "avoid_same_programme_adjacent",
    priority_tier: "high",
    is_active: true,
    parameters: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function student(id: string, programme: string, extra?: Partial<AllocationParticipant>): AllocationParticipant {
  return { seatAllocationId: `sa-${id}`, studentId: `s-${id}`, programme, department: null, courseCode: "C1", ...extra };
}

function gridOf(rows: number, columns: number): RoomSeatSlot[] {
  const seats: RoomSeatSlot[] = [];
  for (let r = 1; r <= rows; r++) for (let c = 1; c <= columns; c++) seats.push({ roomSeatId: `r${r}c${c}`, rowNumber: r, columnNumber: c });
  return seats;
}

describe("sortSeatsByPattern", () => {
  const seats = gridOf(2, 3);

  it("row_wise orders row-major", () => {
    const order = sortSeatsByPattern(seats, "row_wise").map((s) => s.roomSeatId);
    expect(order).toEqual(["r1c1", "r1c2", "r1c3", "r2c1", "r2c2", "r2c3"]);
  });

  it("column_wise orders column-major", () => {
    const order = sortSeatsByPattern(seats, "column_wise").map((s) => s.roomSeatId);
    expect(order).toEqual(["r1c1", "r2c1", "r1c2", "r2c2", "r1c3", "r2c3"]);
  });

  it("serpentine_row alternates direction per row", () => {
    const order = sortSeatsByPattern(seats, "serpentine_row").map((s) => s.roomSeatId);
    expect(order).toEqual(["r1c1", "r1c2", "r1c3", "r2c3", "r2c2", "r2c1"]);
  });

  it("handles a sparse seat set (gaps already excluded) without assuming a dense grid", () => {
    const sparse = gridOf(2, 3).filter((s) => !(s.rowNumber === 1 && s.columnNumber === 2)); // gap at r1c2
    const order = sortSeatsByPattern(sparse, "row_wise").map((s) => s.roomSeatId);
    expect(order).toEqual(["r1c1", "r1c3", "r2c1", "r2c2", "r2c3"]);
  });
});

describe("generateSeed", () => {
  it("is deterministic for the same input", () => {
    expect(generateSeed("event-123")).toBe(generateSeed("event-123"));
  });
  it("differs for different input", () => {
    expect(generateSeed("event-123")).not.toBe(generateSeed("event-456"));
  });
});

describe("buildPlacementQueue", () => {
  it("is deterministic for the same seed", () => {
    const students = [student("1", "A"), student("2", "B"), student("3", "A"), student("4", "B")];
    const q1 = buildPlacementQueue(students, ["programme"], 42).map((s) => s.seatAllocationId);
    const q2 = buildPlacementQueue(students, ["programme"], 42).map((s) => s.seatAllocationId);
    expect(q1).toEqual(q2);
  });

  it("interleaves groups round-robin when dimensions are given", () => {
    const students = [student("1", "A"), student("2", "A"), student("3", "A"), student("4", "B")];
    const queue = buildPlacementQueue(students, ["programme"], 42);
    const programmes = queue.map((s) => s.programme);
    // Group B (1 student) should appear in the first round-robin cycle (position 0 or 1), not stranded at the end.
    expect(programmes.indexOf("B")).toBeLessThan(2);
  });

  it("handles unequal group sizes without dropping anyone", () => {
    const students = [student("1", "A"), student("2", "A"), student("3", "A"), student("4", "A"), student("5", "B")];
    const queue = buildPlacementQueue(students, ["programme"], 1);
    expect(queue).toHaveLength(5);
    expect(new Set(queue.map((s) => s.seatAllocationId)).size).toBe(5);
  });

  it("returns all students as one shuffled pool when no dimensions are active", () => {
    const students = [student("1", "A"), student("2", "B")];
    const queue = buildPlacementQueue(students, [], 1);
    expect(queue).toHaveLength(2);
  });
});

describe("allocateSeats — basic placement", () => {
  it("produces Student -> Room -> Physical Seat for every participant when capacity allows", () => {
    const rooms: AllocationRoomInput[] = [{ roomId: "room-1", availableSeats: gridOf(2, 2), additionalSeatSlots: [] }];
    const students = [student("1", "A"), student("2", "B"), student("3", "A"), student("4", "B")];
    const result = allocateSeats(rooms, students, [], "row_wise", 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.placements).toHaveLength(4);
    for (const p of result.placements) {
      expect(p.roomId).toBe("room-1");
      expect(p.roomSeatId !== null || p.seatNo !== null).toBe(true);
    }
  });

  it("hard-blocks with zero placements when participants exceed total capacity", () => {
    const rooms: AllocationRoomInput[] = [{ roomId: "room-1", availableSeats: gridOf(1, 2), additionalSeatSlots: [] }];
    const students = [student("1", "A"), student("2", "B"), student("3", "A")];
    const result = allocateSeats(rooms, students, [], "row_wise", 1);
    expect(result.ok).toBe(false);
  });

  it("counts additional seats toward capacity", () => {
    const rooms: AllocationRoomInput[] = [{ roomId: "room-1", availableSeats: gridOf(1, 1), additionalSeatSlots: ["ADD-1", "ADD-2"] }];
    const students = [student("1", "A"), student("2", "B"), student("3", "A")];
    const result = allocateSeats(rooms, students, [], "row_wise", 1);
    expect(result.ok).toBe(true);
  });
});

describe("allocateSeats — compliant vs forced violation vs additional seats", () => {
  it("places same-programme students compliantly when the grid has room to avoid adjacency", () => {
    // 1x4 room, rule active: two programmes A/A/B/B should never be forced adjacent-same here
    // since row_wise fill + interleaved queue naturally separates them, and there's enough space.
    const rooms: AllocationRoomInput[] = [{ roomId: "room-1", availableSeats: gridOf(1, 4), additionalSeatSlots: [] }];
    const students = [student("1", "A"), student("2", "A"), student("3", "B"), student("4", "B")];
    const rules = [rule({ rule_type: "avoid_same_programme_adjacent" })];
    const result = allocateSeats(rooms, students, rules, "row_wise", 7);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const classifications = classifySeatAllocations(
      result.placements.map((p) => toClassifiable(p, rooms, students)),
      rules
    );
    // With only 4 seats in a row and 2+2 groups, a fully compliant layout (A,B,A,B) exists —
    // the algorithm should find it, not settle for a violation.
    expect(classifications.every((c) => c.status === "compliant")).toBe(true);
  });

  it("only accepts a forced violation once zero compliant grid seats remain, and flags it", () => {
    // 1x2 room: two same-programme students, rule active -> physically impossible to avoid
    // adjacency (only one seat pair exists). Must still seat both (grid not exhausted into
    // additional seats prematurely) and must flag the violation.
    const rooms: AllocationRoomInput[] = [{ roomId: "room-1", availableSeats: gridOf(1, 2), additionalSeatSlots: [] }];
    const students = [student("1", "A"), student("2", "A")];
    const rules = [rule({ rule_type: "avoid_same_programme_adjacent" })];
    const result = allocateSeats(rooms, students, rules, "row_wise", 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.placements.every((p) => p.seatKind === "grid")).toBe(true);

    const classifications = classifySeatAllocations(
      result.placements.map((p) => toClassifiable(p, rooms, students)),
      rules
    );
    expect(classifications.some((c) => c.status === "violation")).toBe(true);
  });

  it("does not touch additional seats while any grid seat remains free, even if using the grid seat means a violation", () => {
    // 1x2 grid, both same programme, rule active, PLUS 2 additional seats available.
    // Both students must land on the grid (forced violation) — additional seats stay unused.
    const rooms: AllocationRoomInput[] = [{ roomId: "room-1", availableSeats: gridOf(1, 2), additionalSeatSlots: ["ADD-1", "ADD-2"] }];
    const students = [student("1", "A"), student("2", "A")];
    const rules = [rule({ rule_type: "avoid_same_programme_adjacent" })];
    const result = allocateSeats(rooms, students, rules, "row_wise", 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.placements.filter((p) => p.seatKind === "additional")).toHaveLength(0);
    expect(result.placements.filter((p) => p.seatKind === "grid")).toHaveLength(2);
  });

  it("uses additional seats once the grid is genuinely full", () => {
    const rooms: AllocationRoomInput[] = [{ roomId: "room-1", availableSeats: gridOf(1, 1), additionalSeatSlots: ["ADD-1"] }];
    const students = [student("1", "A"), student("2", "B")];
    const result = allocateSeats(rooms, students, [], "row_wise", 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.placements.filter((p) => p.seatKind === "grid")).toHaveLength(1);
    expect(result.placements.filter((p) => p.seatKind === "additional")).toHaveLength(1);
  });
});

describe("allocateSeats — unequal group strengths", () => {
  it("places a large and a tiny group together without special-casing", () => {
    const rooms: AllocationRoomInput[] = [{ roomId: "room-1", availableSeats: gridOf(5, 4), additionalSeatSlots: [] }];
    const students = [
      ...Array.from({ length: 18 }, (_, i) => student(`a${i}`, "A")),
      student("b1", "B"),
      student("b2", "B"),
    ];
    const result = allocateSeats(rooms, students, [rule({ rule_type: "avoid_same_programme_adjacent" })], "row_wise", 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.placements).toHaveLength(20);
  });
});

describe("repairPass", () => {
  it("swaps two mutually-violating students to reduce violations when a beneficial swap exists", () => {
    // Room: 1x3. A sits at col1, A at col2 (violating), B at col3 (fine).
    // Swapping col2<->col3 makes everyone compliant.
    const placed: GridPlacement[] = [
      { seatAllocationId: "a1", roomId: "room-1", roomSeatId: "c1", rowNumber: 1, columnNumber: 1, student: { studentId: "s1", programme: "A", department: null, courseCode: "C" } },
      { seatAllocationId: "a2", roomId: "room-1", roomSeatId: "c2", rowNumber: 1, columnNumber: 2, student: { studentId: "s2", programme: "A", department: null, courseCode: "C" } },
      { seatAllocationId: "b1", roomId: "room-1", roomSeatId: "c3", rowNumber: 1, columnNumber: 3, student: { studentId: "s3", programme: "B", department: null, courseCode: "C" } },
    ];
    const rules = [rule({ rule_type: "avoid_same_programme_adjacent" })];
    expect(checkSeatingViolations(placed, rules)).toHaveLength(1);

    const repaired = repairPass(placed, rules);
    expect(checkSeatingViolations(repaired, rules)).toHaveLength(0);
    // Same students still present, just reassigned.
    expect(new Set(repaired.map((p) => p.seatAllocationId))).toEqual(new Set(["a1", "a2", "b1"]));
  });

  it("returns the input unchanged when there is nothing to repair", () => {
    const placed: GridPlacement[] = [
      { seatAllocationId: "a1", roomId: "room-1", roomSeatId: "c1", rowNumber: 1, columnNumber: 1, student: { studentId: "s1", programme: "A", department: null, courseCode: "C" } },
    ];
    expect(repairPass(placed, [])).toEqual(placed);
  });

  it("leaves an unfixable violation in place rather than silently discarding the student", () => {
    // Only 2 seats, both same programme, rule active -> no swap can help; both students remain seated.
    const placed: GridPlacement[] = [
      { seatAllocationId: "a1", roomId: "room-1", roomSeatId: "c1", rowNumber: 1, columnNumber: 1, student: { studentId: "s1", programme: "A", department: null, courseCode: "C" } },
      { seatAllocationId: "a2", roomId: "room-1", roomSeatId: "c2", rowNumber: 1, columnNumber: 2, student: { studentId: "s2", programme: "A", department: null, courseCode: "C" } },
    ];
    const rules = [rule({ rule_type: "avoid_same_programme_adjacent" })];
    const repaired = repairPass(placed, rules);
    expect(repaired).toHaveLength(2);
    expect(checkSeatingViolations(repaired, rules)).toHaveLength(1);
  });
});

function toClassifiable(
  p: { seatAllocationId: string; roomId: string; roomSeatId: string | null; seatNo: string | null; studentId: string },
  rooms: AllocationRoomInput[],
  students: AllocationParticipant[]
): ClassifiableAllocation {
  const seat = rooms.flatMap((r) => r.availableSeats).find((s) => s.roomSeatId === p.roomSeatId);
  const s = students.find((st) => st.studentId === p.studentId)!;
  return {
    seatAllocationId: p.seatAllocationId,
    roomId: p.roomId,
    roomSeatId: p.roomSeatId,
    seatNo: p.seatNo,
    rowNumber: seat?.rowNumber ?? null,
    columnNumber: seat?.columnNumber ?? null,
    student: { studentId: s.studentId, programme: s.programme, department: s.department, courseCode: s.courseCode },
  };
}

describe("classifySeatAllocations", () => {
  it("classifies an all-null allocation as unallocated", () => {
    const result = classifySeatAllocations(
      [{ seatAllocationId: "sa-1", roomId: null, roomSeatId: null, seatNo: null, rowNumber: null, columnNumber: null, student: { studentId: "s1", programme: "A", department: null, courseCode: "C1" } }],
      []
    );
    expect(result[0].status).toBe("unallocated");
    expect(result[0].seatKind).toBe("none");
  });

  it("classifies a seat_no-only allocation as compliant + additional seatKind, never rule-checked", () => {
    const result = classifySeatAllocations(
      [{ seatAllocationId: "sa-1", roomId: "room-1", roomSeatId: null, seatNo: "ADD-1", rowNumber: null, columnNumber: null, student: { studentId: "s1", programme: "A", department: null, courseCode: "C1" } }],
      [rule({ rule_type: "avoid_same_programme_adjacent" })]
    );
    expect(result[0].status).toBe("compliant");
    expect(result[0].seatKind).toBe("additional");
    expect(result[0].violations).toEqual([]);
  });

  it("classifies a grid seat with a real violation as 'violation', never silently compliant", () => {
    const allocations: ClassifiableAllocation[] = [
      { seatAllocationId: "sa-1", roomId: "room-1", roomSeatId: "r1c1", seatNo: null, rowNumber: 1, columnNumber: 1, student: { studentId: "s1", programme: "A", department: null, courseCode: "C1" } },
      { seatAllocationId: "sa-2", roomId: "room-1", roomSeatId: "r1c2", seatNo: null, rowNumber: 1, columnNumber: 2, student: { studentId: "s2", programme: "A", department: null, courseCode: "C2" } },
    ];
    const result = classifySeatAllocations(allocations, [rule({ rule_type: "avoid_same_programme_adjacent" })]);
    expect(result.every((r) => r.status === "violation")).toBe(true);
    expect(result[0].violations.length).toBeGreaterThan(0);
  });

  it("classifies a compliant grid seat as compliant", () => {
    const allocations: ClassifiableAllocation[] = [
      { seatAllocationId: "sa-1", roomId: "room-1", roomSeatId: "r1c1", seatNo: null, rowNumber: 1, columnNumber: 1, student: { studentId: "s1", programme: "A", department: null, courseCode: "C1" } },
      { seatAllocationId: "sa-2", roomId: "room-1", roomSeatId: "r1c2", seatNo: null, rowNumber: 1, columnNumber: 2, student: { studentId: "s2", programme: "B", department: null, courseCode: "C2" } },
    ];
    const result = classifySeatAllocations(allocations, [rule({ rule_type: "avoid_same_programme_adjacent" })]);
    expect(result.every((r) => r.status === "compliant")).toBe(true);
  });
});
