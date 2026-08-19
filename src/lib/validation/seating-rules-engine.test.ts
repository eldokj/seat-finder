import { describe, it, expect } from "vitest";
import {
  resolveActiveRules,
  checkSeatingViolations,
  collectActiveDimensions,
  isPhysicallyAdjacent,
  type GridPlacement,
} from "./seating-rules-engine";
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

function placement(overrides: Partial<GridPlacement>): GridPlacement {
  return {
    seatAllocationId: "sa-1",
    roomId: "room-1",
    roomSeatId: "seat-1",
    rowNumber: 1,
    columnNumber: 1,
    student: { studentId: "s-1", programme: "BSc CS", department: "CS", courseCode: "C1" },
    ...overrides,
  };
}

describe("resolveActiveRules", () => {
  it("event-scoped rule overrides global rule of the same type", () => {
    const global = [rule({ id: "g1", rule_type: "row_jump", parameters: { gap: 1, group_by: ["programme"] } })];
    const event = [rule({ id: "e1", scope: "daily_examination_event", rule_type: "row_jump", parameters: { gap: 5, group_by: ["course"] } })];
    const resolved = resolveActiveRules(global, event);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].id).toBe("e1");
  });

  it("ignores inactive rows", () => {
    const resolved = resolveActiveRules([rule({ is_active: false })], []);
    expect(resolved).toHaveLength(0);
  });

  it("keeps global rules whose type has no event override", () => {
    const global = [rule({ id: "g1", rule_type: "avoid_same_department_adjacent" })];
    const event = [rule({ id: "e1", scope: "daily_examination_event", rule_type: "row_jump", parameters: { gap: 1, group_by: ["programme"] } })];
    const resolved = resolveActiveRules(global, event);
    expect(resolved.map((r) => r.id).sort()).toEqual(["e1", "g1"]);
  });
});

describe("isPhysicallyAdjacent", () => {
  it("treats row+-1 same column as adjacent", () => {
    expect(isPhysicallyAdjacent(placement({ rowNumber: 1, columnNumber: 1 }), placement({ rowNumber: 2, columnNumber: 1 }))).toBe(true);
  });
  it("treats column+-1 same row as adjacent", () => {
    expect(isPhysicallyAdjacent(placement({ rowNumber: 1, columnNumber: 1 }), placement({ rowNumber: 1, columnNumber: 2 }))).toBe(true);
  });
  it("does not treat diagonal neighbors as adjacent", () => {
    expect(isPhysicallyAdjacent(placement({ rowNumber: 1, columnNumber: 1 }), placement({ rowNumber: 2, columnNumber: 2 }))).toBe(false);
  });
  it("does not treat seats in different rooms as adjacent", () => {
    expect(isPhysicallyAdjacent(placement({ roomId: "room-1", rowNumber: 1, columnNumber: 1 }), placement({ roomId: "room-2", rowNumber: 1, columnNumber: 2 }))).toBe(false);
  });
});

describe("checkSeatingViolations — adjacency rules", () => {
  it("flags two physically-adjacent seats with the same programme when the rule is active", () => {
    const a = placement({ seatAllocationId: "a", rowNumber: 1, columnNumber: 1, student: { studentId: "s1", programme: "BSc CS", department: null, courseCode: "C1" } });
    const b = placement({ seatAllocationId: "b", rowNumber: 1, columnNumber: 2, student: { studentId: "s2", programme: "BSc CS", department: null, courseCode: "C2" } });
    const violations = checkSeatingViolations([a, b], [rule({ rule_type: "avoid_same_programme_adjacent" })]);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleType).toBe("avoid_same_programme_adjacent");
  });

  it("does not flag adjacent seats with different programmes", () => {
    const a = placement({ seatAllocationId: "a", rowNumber: 1, columnNumber: 1, student: { studentId: "s1", programme: "BSc CS", department: null, courseCode: "C1" } });
    const b = placement({ seatAllocationId: "b", rowNumber: 1, columnNumber: 2, student: { studentId: "s2", programme: "BCom", department: null, courseCode: "C2" } });
    expect(checkSeatingViolations([a, b], [rule({ rule_type: "avoid_same_programme_adjacent" })])).toHaveLength(0);
  });

  it("does not flag same-programme seats that aren't adjacent", () => {
    const a = placement({ seatAllocationId: "a", rowNumber: 1, columnNumber: 1, student: { studentId: "s1", programme: "BSc CS", department: null, courseCode: "C1" } });
    const b = placement({ seatAllocationId: "b", rowNumber: 5, columnNumber: 5, student: { studentId: "s2", programme: "BSc CS", department: null, courseCode: "C2" } });
    expect(checkSeatingViolations([a, b], [rule({ rule_type: "avoid_same_programme_adjacent" })])).toHaveLength(0);
  });

  it("is inactive unless the matching rule_type is present and active", () => {
    const a = placement({ seatAllocationId: "a", rowNumber: 1, columnNumber: 1, student: { studentId: "s1", programme: "BSc CS", department: null, courseCode: "C1" } });
    const b = placement({ seatAllocationId: "b", rowNumber: 1, columnNumber: 2, student: { studentId: "s2", programme: "BSc CS", department: null, courseCode: "C2" } });
    expect(checkSeatingViolations([a, b], [])).toHaveLength(0);
  });
});

describe("checkSeatingViolations — row_jump / column_jump", () => {
  const gapRule = (type: "row_jump" | "column_jump", gap: number, group_by: string[]) =>
    rule({ rule_type: type, parameters: { gap, group_by } });

  it("flags same-group students within the row gap", () => {
    const a = placement({ seatAllocationId: "a", rowNumber: 1, columnNumber: 1, student: { studentId: "s1", programme: "BSc CS", department: null, courseCode: "C1" } });
    const b = placement({ seatAllocationId: "b", rowNumber: 2, columnNumber: 5, student: { studentId: "s2", programme: "BSc CS", department: null, courseCode: "C2" } });
    const violations = checkSeatingViolations([a, b], [gapRule("row_jump", 3, ["programme"])]);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleType).toBe("row_jump");
  });

  it("does not flag once the row gap is satisfied (boundary: distance == gap)", () => {
    const a = placement({ seatAllocationId: "a", rowNumber: 1, columnNumber: 1, student: { studentId: "s1", programme: "BSc CS", department: null, courseCode: "C1" } });
    const b = placement({ seatAllocationId: "b", rowNumber: 4, columnNumber: 1, student: { studentId: "s2", programme: "BSc CS", department: null, courseCode: "C2" } });
    expect(checkSeatingViolations([a, b], [gapRule("row_jump", 3, ["programme"])])).toHaveLength(0);
  });

  it("flags just inside the boundary (distance == gap - 1)", () => {
    const a = placement({ seatAllocationId: "a", rowNumber: 1, columnNumber: 1, student: { studentId: "s1", programme: "BSc CS", department: null, courseCode: "C1" } });
    const b = placement({ seatAllocationId: "b", rowNumber: 3, columnNumber: 1, student: { studentId: "s2", programme: "BSc CS", department: null, courseCode: "C2" } });
    expect(checkSeatingViolations([a, b], [gapRule("row_jump", 3, ["programme"])])).toHaveLength(1);
  });

  it("column_jump checks column distance, ignoring row distance", () => {
    const a = placement({ seatAllocationId: "a", rowNumber: 1, columnNumber: 1, student: { studentId: "s1", programme: "BSc CS", department: null, courseCode: "C1" } });
    const b = placement({ seatAllocationId: "b", rowNumber: 9, columnNumber: 2, student: { studentId: "s2", programme: "BSc CS", department: null, courseCode: "C2" } });
    expect(checkSeatingViolations([a, b], [gapRule("column_jump", 3, ["programme"])])).toHaveLength(1);
  });

  it("combined group_by requires every field to match", () => {
    const a = placement({ seatAllocationId: "a", rowNumber: 1, columnNumber: 1, student: { studentId: "s1", programme: "BSc CS", department: "Dept A", courseCode: "C1" } });
    const b = placement({ seatAllocationId: "b", rowNumber: 2, columnNumber: 1, student: { studentId: "s2", programme: "BSc CS", department: "Dept B", courseCode: "C1" } });
    // Same programme+course but different department -> not "same group" for a ["programme","department"] rule.
    expect(checkSeatingViolations([a, b], [gapRule("row_jump", 3, ["programme", "department"])])).toHaveLength(0);
  });

  it("does not check across different rooms", () => {
    const a = placement({ seatAllocationId: "a", roomId: "room-1", rowNumber: 1, columnNumber: 1, student: { studentId: "s1", programme: "BSc CS", department: null, courseCode: "C1" } });
    const b = placement({ seatAllocationId: "b", roomId: "room-2", rowNumber: 1, columnNumber: 1, student: { studentId: "s2", programme: "BSc CS", department: null, courseCode: "C2" } });
    expect(checkSeatingViolations([a, b], [gapRule("row_jump", 5, ["programme"])])).toHaveLength(0);
  });
});

describe("collectActiveDimensions", () => {
  it("collects the fixed field for each active separation rule", () => {
    const dims = collectActiveDimensions([rule({ rule_type: "avoid_same_department_adjacent" })]);
    expect(dims).toEqual(["department"]);
  });

  it("collects group_by fields from active jump rules", () => {
    const dims = collectActiveDimensions([rule({ rule_type: "row_jump", parameters: { gap: 2, group_by: ["programme", "course"] } })]);
    expect(new Set(dims)).toEqual(new Set(["programme", "course"]));
  });

  it("returns an empty array when nothing is active", () => {
    expect(collectActiveDimensions([])).toEqual([]);
  });

  it("de-duplicates a dimension referenced by multiple active rules", () => {
    const dims = collectActiveDimensions([
      rule({ rule_type: "avoid_same_programme_adjacent" }),
      rule({ rule_type: "row_jump", parameters: { gap: 2, group_by: ["programme"] } }),
    ]);
    expect(dims).toEqual(["programme"]);
  });
});
