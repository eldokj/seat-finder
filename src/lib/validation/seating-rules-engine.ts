import type { SeatingRule, SeatingRuleType } from "@/types/database";
import type { SeatingGroupByField } from "./seating-rule";

/**
 * Phase 7 — the rule-violation checker. Pure, I/O-free, and used
 * identically by three call sites: the automatic allocator (deciding
 * placements), manual allocation (the non-blocking warning), and the
 * Review screen (always-live revalidation). Nothing here is ever cached —
 * every call recomputes fresh against whatever rules are currently active,
 * matching docs/SCHEMA.md's existing "a report is always computed live"
 * principle.
 *
 * Violations are always High/Preference tier — Hard rules are structural
 * (DB constraints) and can't reach this checker as a violation at all.
 */

export interface SeatingStudentInfo {
  studentId: string;
  programme: string | null;
  department: string | null;
  courseCode: string;
}

/** A student seated in a real grid position — additional-seat placements
 * are never represented here, since they have no row/column to check. */
export interface GridPlacement {
  seatAllocationId: string;
  roomId: string;
  roomSeatId: string;
  rowNumber: number;
  columnNumber: number;
  student: SeatingStudentInfo;
}

export interface RuleViolation {
  ruleType: SeatingRuleType;
  seatAllocationIds: [string, string];
  message: string;
}

/** Event-scoped rule of a given rule_type overrides the global rule of the
 * same type; if neither exists, that rule_type is simply inactive. */
export function resolveActiveRules(globalRules: SeatingRule[], eventRules: SeatingRule[]): SeatingRule[] {
  const byType = new Map<SeatingRuleType, SeatingRule>();
  for (const rule of globalRules) if (rule.is_active) byType.set(rule.rule_type, rule);
  for (const rule of eventRules) if (rule.is_active) byType.set(rule.rule_type, rule);
  return [...byType.values()];
}

function fieldValue(student: SeatingStudentInfo, field: SeatingGroupByField): string | null {
  if (field === "programme") return student.programme;
  if (field === "department") return student.department;
  return student.courseCode;
}

/** Physically neighboring seats in the room grid — 4-directional (row±1
 * same column, or column±1 same row). Diagonal neighbors don't count. */
export function isPhysicallyAdjacent(a: GridPlacement, b: GridPlacement): boolean {
  if (a.roomId !== b.roomId) return false;
  const rowDiff = Math.abs(a.rowNumber - b.rowNumber);
  const colDiff = Math.abs(a.columnNumber - b.columnNumber);
  return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
}

const ADJACENCY_RULES: { type: SeatingRuleType; field: SeatingGroupByField }[] = [
  { type: "avoid_same_programme_adjacent", field: "programme" },
  { type: "avoid_same_department_adjacent", field: "department" },
  { type: "avoid_same_course_adjacent", field: "course" },
];

const JUMP_RULES: { type: "row_jump" | "column_jump" }[] = [{ type: "row_jump" }, { type: "column_jump" }];

/** Checks every active rule against every pair of grid placements. O(n^2)
 * over placements — fine at exam-room scale (tens to low hundreds of
 * seats), not a hot path (admin-triggered, on demand). */
export function checkSeatingViolations(placements: GridPlacement[], activeRules: SeatingRule[]): RuleViolation[] {
  const violations: RuleViolation[] = [];

  for (const { type, field } of ADJACENCY_RULES) {
    if (!activeRules.some((r) => r.rule_type === type)) continue;
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        if (!isPhysicallyAdjacent(placements[i], placements[j])) continue;
        const va = fieldValue(placements[i].student, field);
        const vb = fieldValue(placements[j].student, field);
        if (va != null && va === vb) {
          violations.push({
            ruleType: type,
            seatAllocationIds: [placements[i].seatAllocationId, placements[j].seatAllocationId],
            message: `Same ${field} ("${va}") seated adjacent.`,
          });
        }
      }
    }
  }

  for (const { type } of JUMP_RULES) {
    const rule = activeRules.find((r) => r.rule_type === type);
    if (!rule) continue;
    const params = rule.parameters as { gap?: number; group_by?: SeatingGroupByField[] };
    const gap = params.gap ?? 0;
    const groupBy = params.group_by ?? [];
    if (gap < 1 || groupBy.length === 0) continue;

    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        if (placements[i].roomId !== placements[j].roomId) continue;
        const sameGroup = groupBy.every((field) => {
          const va = fieldValue(placements[i].student, field);
          const vb = fieldValue(placements[j].student, field);
          return va != null && va === vb;
        });
        if (!sameGroup) continue;

        const distance =
          type === "row_jump"
            ? Math.abs(placements[i].rowNumber - placements[j].rowNumber)
            : Math.abs(placements[i].columnNumber - placements[j].columnNumber);

        if (distance < gap) {
          violations.push({
            ruleType: type,
            seatAllocationIds: [placements[i].seatAllocationId, placements[j].seatAllocationId],
            message: `Same ${groupBy.join(" + ")} within ${type === "row_jump" ? "row" : "column"} distance ${distance} (minimum ${gap}).`,
          });
        }
      }
    }
  }

  return violations;
}

/** The set of grouping dimensions currently "in play" for interleaving —
 * the union of every active separation rule's fixed field plus every
 * active jump rule's group_by. Drives shuffling/interleaving in
 * seating-allocation.ts; there is no separate standalone grouping control. */
export function collectActiveDimensions(activeRules: SeatingRule[]): SeatingGroupByField[] {
  const dims = new Set<SeatingGroupByField>();
  for (const { type, field } of ADJACENCY_RULES) {
    if (activeRules.some((r) => r.rule_type === type)) dims.add(field);
  }
  for (const { type } of JUMP_RULES) {
    const rule = activeRules.find((r) => r.rule_type === type);
    if (!rule) continue;
    const groupBy = (rule.parameters as { group_by?: SeatingGroupByField[] }).group_by ?? [];
    for (const field of groupBy) dims.add(field);
  }
  return [...dims];
}
