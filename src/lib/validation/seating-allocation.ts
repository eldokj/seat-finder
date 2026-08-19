import type { SeatingRule } from "@/types/database";
import type { SeatPattern } from "@/types/database";
import type { SeatingGroupByField } from "./seating-rule";
import {
  checkSeatingViolations,
  collectActiveDimensions,
  type GridPlacement,
  type RuleViolation,
  type SeatingStudentInfo,
} from "./seating-rules-engine";

/**
 * Phase 7 — automatic allocation + classification. Pure, I/O-free (mirrors
 * room-layout.ts's split): everything here operates on plain data the I/O
 * layer (route actions) reads from/writes to Supabase.
 *
 * Placement order, always: exhaust compliant grid seats -> forced-violation
 * grid seats (only once zero compliant ones remain anywhere) -> additional
 * seats (only once the grid itself is fully exhausted) -> a bounded repair
 * pass. Nothing is ever silently dropped or silently downgraded to
 * "compliant" — see classifySeatAllocations for the always-live status.
 */

export interface RoomSeatSlot {
  roomSeatId: string;
  rowNumber: number;
  columnNumber: number;
}

export interface AllocationRoomInput {
  roomId: string;
  /** Already filtered by the caller: position_type='seat', status='available', not already occupied for this event. */
  availableSeats: RoomSeatSlot[];
  /** Free ADD-N seat_no values for this room, already excluding ones in use for this event. */
  additionalSeatSlots: string[];
}

export interface AllocationParticipant {
  seatAllocationId: string;
  studentId: string;
  programme: string | null;
  department: string | null;
  courseCode: string;
}

export type ProposedSeatKind = "grid" | "additional";

export interface ProposedPlacement {
  seatAllocationId: string;
  studentId: string;
  roomId: string;
  roomSeatId: string | null;
  seatNo: string | null;
  seatKind: ProposedSeatKind;
}

export type AllocationRunResult = { ok: true; placements: ProposedPlacement[] } | { ok: false; error: string };

function toStudentInfo(p: AllocationParticipant): SeatingStudentInfo {
  return { studentId: p.studentId, programme: p.programme, department: p.department, courseCode: p.courseCode };
}

function fieldValue(student: SeatingStudentInfo, field: SeatingGroupByField): string | null {
  if (field === "programme") return student.programme;
  if (field === "department") return student.department;
  return student.courseCode;
}

const ADJACENCY_FIELDS: { type: string; field: SeatingGroupByField }[] = [
  { type: "avoid_same_programme_adjacent", field: "programme" },
  { type: "avoid_same_department_adjacent", field: "department" },
  { type: "avoid_same_course_adjacent", field: "course" },
];

/**
 * Phase 10 performance fix: incremental spatial/group index over the
 * placements made so far, so the placement loop can check a candidate
 * seat in O(1) (adjacency — direct neighbor lookup) / O(gap) (row_jump /
 * column_jump — a small range check) instead of O(placed.length).
 *
 * Why this was needed: the original `violationsAgainst` scanned the ENTIRE
 * placed list for every candidate slot tried, and the placement loop tries
 * many candidates per student — that's O(students × slots × placed), which
 * measured out at 1.3s / 16s / 120s for 100 / 250 / 500 participants with a
 * realistic multi-room layout and rule set (see the Phase 10 benchmark).
 * This index changes nothing about WHICH seat gets chosen or WHEN a
 * violation is forced — only how fast "is this seat compliant" is
 * answered — so it's a pure speed fix, not a behavior change (verified by
 * re-running the full existing test suite unchanged after this edit).
 */
interface PlacementIndex {
  /** `${roomId}::${row}::${col}` -> the placement sitting there, for O(1) adjacency neighbor lookups. */
  bySeatKey: Map<string, GridPlacement>;
  /** `${roomId}::${groupValue}` -> row number -> how many of this group currently sit in that row (row_jump).
   * A count, not a plain Set, because repairPass's trial swaps need to
   * temporarily remove one occupant of a row without losing track of a
   * SECOND occupant of the same group in the same row — which is exactly
   * the pre-existing violation repairPass is trying to fix. */
  byGroupRow: Map<string, Map<number, number>>;
  /** Same idea, columns (column_jump). */
  byGroupColumn: Map<string, Map<number, number>>;
}

function seatKey(roomId: string, row: number, col: number): string {
  return `${roomId}::${row}::${col}`;
}

function createPlacementIndex(): PlacementIndex {
  return { bySeatKey: new Map(), byGroupRow: new Map(), byGroupColumn: new Map() };
}

function jumpRuleGroupKey(roomId: string, student: SeatingStudentInfo, groupBy: SeatingGroupByField[]): string {
  return `${roomId}::${groupBy.map((f) => fieldValue(student, f) ?? "∅").join("|")}`;
}

function bumpGroupCount(map: Map<string, Map<number, number>>, key: string, value: number, delta: number): void {
  const counts = map.get(key) ?? new Map<number, number>();
  const next = (counts.get(value) ?? 0) + delta;
  if (next <= 0) counts.delete(value);
  else counts.set(value, next);
  if (counts.size === 0) map.delete(key);
  else map.set(key, counts);
}

function addToPlacementIndex(index: PlacementIndex, placement: GridPlacement, activeRules: SeatingRule[]): void {
  index.bySeatKey.set(seatKey(placement.roomId, placement.rowNumber, placement.columnNumber), placement);

  const rowJumpRule = activeRules.find((r) => r.rule_type === "row_jump" && r.is_active);
  if (rowJumpRule) {
    const groupBy = (rowJumpRule.parameters as { group_by?: SeatingGroupByField[] }).group_by ?? [];
    if (groupBy.length > 0) {
      bumpGroupCount(index.byGroupRow, jumpRuleGroupKey(placement.roomId, placement.student, groupBy), placement.rowNumber, 1);
    }
  }

  const columnJumpRule = activeRules.find((r) => r.rule_type === "column_jump" && r.is_active);
  if (columnJumpRule) {
    const groupBy = (columnJumpRule.parameters as { group_by?: SeatingGroupByField[] }).group_by ?? [];
    if (groupBy.length > 0) {
      bumpGroupCount(index.byGroupColumn, jumpRuleGroupKey(placement.roomId, placement.student, groupBy), placement.columnNumber, 1);
    }
  }
}

/** Inverse of addToPlacementIndex — used by repairPass to temporarily pull
 * a placement out of a shared index for an O(1)-ish "what if they weren't
 * here" query, then put back either the original or a moved version.
 * Reference-counted (see PlacementIndex.byGroupRow's doc comment) so it's
 * safe even when two group-mates currently share a row/column. */
function removeFromPlacementIndex(index: PlacementIndex, placement: GridPlacement, activeRules: SeatingRule[]): void {
  const key = seatKey(placement.roomId, placement.rowNumber, placement.columnNumber);
  if (index.bySeatKey.get(key) === placement) index.bySeatKey.delete(key);

  const rowJumpRule = activeRules.find((r) => r.rule_type === "row_jump" && r.is_active);
  if (rowJumpRule) {
    const groupBy = (rowJumpRule.parameters as { group_by?: SeatingGroupByField[] }).group_by ?? [];
    if (groupBy.length > 0) {
      bumpGroupCount(index.byGroupRow, jumpRuleGroupKey(placement.roomId, placement.student, groupBy), placement.rowNumber, -1);
    }
  }

  const columnJumpRule = activeRules.find((r) => r.rule_type === "column_jump" && r.is_active);
  if (columnJumpRule) {
    const groupBy = (columnJumpRule.parameters as { group_by?: SeatingGroupByField[] }).group_by ?? [];
    if (groupBy.length > 0) {
      bumpGroupCount(index.byGroupColumn, jumpRuleGroupKey(placement.roomId, placement.student, groupBy), placement.columnNumber, -1);
    }
  }
}

/** Same semantics as the original array-scanning version (kept for
 * classification/repair, where the full list is needed anyway) — just
 * answered via the index instead of a linear scan. */
function violationsAgainstIndex(candidate: GridPlacement, index: PlacementIndex, activeRules: SeatingRule[]): number {
  let count = 0;

  const activeAdjacencyFields = ADJACENCY_FIELDS.filter(({ type }) => activeRules.some((r) => r.rule_type === type && r.is_active));
  if (activeAdjacencyFields.length > 0) {
    const neighborCoords: [number, number][] = [
      [candidate.rowNumber - 1, candidate.columnNumber],
      [candidate.rowNumber + 1, candidate.columnNumber],
      [candidate.rowNumber, candidate.columnNumber - 1],
      [candidate.rowNumber, candidate.columnNumber + 1],
    ];
    for (const [row, col] of neighborCoords) {
      const other = index.bySeatKey.get(seatKey(candidate.roomId, row, col));
      if (!other) continue;
      for (const { field } of activeAdjacencyFields) {
        const va = fieldValue(candidate.student, field);
        const vb = fieldValue(other.student, field);
        if (va != null && va === vb) count++;
      }
    }
  }

  const rowJumpRule = activeRules.find((r) => r.rule_type === "row_jump" && r.is_active);
  if (rowJumpRule) {
    const { gap = 0, group_by: groupBy = [] } = rowJumpRule.parameters as { gap?: number; group_by?: SeatingGroupByField[] };
    if (gap >= 1 && groupBy.length > 0) {
      const occupiedRows = index.byGroupRow.get(jumpRuleGroupKey(candidate.roomId, candidate.student, groupBy));
      if (occupiedRows) {
        for (let delta = -(gap - 1); delta <= gap - 1; delta++) {
          if ((occupiedRows.get(candidate.rowNumber + delta) ?? 0) > 0) count++;
        }
      }
    }
  }

  const columnJumpRule = activeRules.find((r) => r.rule_type === "column_jump" && r.is_active);
  if (columnJumpRule) {
    const { gap = 0, group_by: groupBy = [] } = columnJumpRule.parameters as { gap?: number; group_by?: SeatingGroupByField[] };
    if (gap >= 1 && groupBy.length > 0) {
      const occupiedColumns = index.byGroupColumn.get(jumpRuleGroupKey(candidate.roomId, candidate.student, groupBy));
      if (occupiedColumns) {
        for (let delta = -(gap - 1); delta <= gap - 1; delta++) {
          if ((occupiedColumns.get(candidate.columnNumber + delta) ?? 0) > 0) count++;
        }
      }
    }
  }

  return count;
}

/** Fill order for a room's available seats — a comparator per pattern, safe
 * for a SPARSE seat set (gaps/disabled already excluded by the caller), so
 * it never assumes a dense rectangular grid. 'custom' = the seats' own
 * (row, column) order, same resolution Phase 6 uses for custom labeling. */
export function sortSeatsByPattern(seats: RoomSeatSlot[], pattern: SeatPattern): RoomSeatSlot[] {
  const sorted = [...seats];
  switch (pattern) {
    case "column_wise":
      sorted.sort((a, b) => a.columnNumber - b.columnNumber || a.rowNumber - b.rowNumber);
      break;
    case "serpentine_row":
      sorted.sort((a, b) => {
        if (a.rowNumber !== b.rowNumber) return a.rowNumber - b.rowNumber;
        const forward = (a.rowNumber - 1) % 2 === 0;
        return forward ? a.columnNumber - b.columnNumber : b.columnNumber - a.columnNumber;
      });
      break;
    case "serpentine_column":
      sorted.sort((a, b) => {
        if (a.columnNumber !== b.columnNumber) return a.columnNumber - b.columnNumber;
        const forward = (a.columnNumber - 1) % 2 === 0;
        return forward ? a.rowNumber - b.rowNumber : b.rowNumber - a.rowNumber;
      });
      break;
    case "row_wise":
    case "custom":
    default:
      sorted.sort((a, b) => a.rowNumber - b.rowNumber || a.columnNumber - b.columnNumber);
      break;
  }
  return sorted;
}

/** Deterministic seed from a string (event id) — same input, same shuffle,
 * so re-running automatic allocation is reproducible unless the caller
 * deliberately passes a fresh seed (e.g. Date.now()) to reshuffle. */
export function generateSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) hash = (hash * 31 + input.charCodeAt(i)) | 0;
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function groupKey(student: AllocationParticipant, dimensions: SeatingGroupByField[]): string {
  if (dimensions.length === 0) return "__all__";
  return dimensions.map((d) => fieldValue(toStudentInfo(student), d) ?? "∅").join("||");
}

/** Shuffles within groups (anti-copying) then round-robins across groups
 * (dealt like cards) so consecutive fill-order seats naturally alternate
 * groups wherever separation rules are active. Unequal group sizes need no
 * special-casing — a bucket just stops contributing once exhausted. */
export function buildPlacementQueue(
  students: AllocationParticipant[],
  dimensions: SeatingGroupByField[],
  seed: number
): AllocationParticipant[] {
  const rng = mulberry32(seed);
  const groups = new Map<string, AllocationParticipant[]>();
  for (const student of students) {
    const key = groupKey(student, dimensions);
    const list = groups.get(key) ?? [];
    list.push(student);
    groups.set(key, list);
  }
  const bucketKeys = [...groups.keys()].sort();
  const buckets = bucketKeys.map((k) => seededShuffle(groups.get(k)!, rng));

  const queue: AllocationParticipant[] = [];
  const cursors = new Array(buckets.length).fill(0);
  let remaining = buckets.reduce((sum, b) => sum + b.length, 0);
  while (remaining > 0) {
    for (let i = 0; i < buckets.length; i++) {
      if (cursors[i] < buckets[i].length) {
        queue.push(buckets[i][cursors[i]]);
        cursors[i]++;
        remaining--;
      }
    }
  }
  return queue;
}

const MAX_REPAIR_CANDIDATES = 40;

/**
 * Bounded best-effort swap repair: for each of the (up to
 * MAX_REPAIR_CANDIDATES) currently-violated students, tries swapping with
 * every other placed student — not just other violated ones, since the
 * fix for a violated student is very often swapping with an UNrelated
 * compliant student, not another violator — and applies whichever swap
 * reduces the total violation count the most. A full search is a general
 * CSP solver, which this project deliberately doesn't attempt (see the
 * Phase 7 design doc). Exported (not just used internally by
 * allocateSeats) so the "Resolve Conflicts" manual action can run it
 * directly against live, already-seated students without re-running the
 * whole generator (which would also try to seat unallocated students —
 * not what that button does).
 */
export function repairPass(placedGrid: GridPlacement[], activeRules: SeatingRule[]): GridPlacement[] {
  const working = [...placedGrid];
  const initialViolations = checkSeatingViolations(working, activeRules);
  if (initialViolations.length === 0) return working;

  const violatedIds = [...new Set(initialViolations.flatMap((v) => v.seatAllocationIds))].slice(0, MAX_REPAIR_CANDIDATES);

  // Phase 10 performance fix: the trial loop below used to rebuild the
  // WHOLE array and call the full O(N^2) checkSeatingViolations() once per
  // candidate swap — O(MAX_REPAIR_CANDIDATES * N * N^2) overall, and (once
  // the Pass A/B index fix was confirmed NOT to move the benchmark numbers
  // on its own) the actual dominant cost at scale: 120s for 500 students,
  // unchanged even after Pass A/B was sped up. A first pass rebuilt a
  // PlacementIndex from a filtered array per trial (O(N) per trial instead
  // of O(N^2)) and cut that to ~29s — real, but still not good enough.
  //
  // This version keeps ONE persistent PlacementIndex for `working`, synced
  // incrementally: temporarily remove a placement (O(1)/O(gap)), query,
  // then either put it back (trial rejected) or leave the moved version in
  // (trial committed) — no O(N) rebuild anywhere in the loop.
  //
  // Only two students ever move in a trial swap, so every violation not
  // touching either of them is identical before and after — comparing the
  // GLOBAL violation count is exactly equivalent to comparing counts LOCAL
  // to just the two swapped students. "Local against everyone else"
  // double-counts a direct A<->B violation (once from each side), so
  // `mutualBefore`/`mutualAfter` — an exact O(1) check via the real engine
  // on just the 2 affected placements — subtracts it back out, making the
  // comparison identical to the original global one, not an approximation.
  const index = createPlacementIndex();
  for (const p of working) addToPlacementIndex(index, p, activeRules);

  for (const violatedId of violatedIds) {
    const idxA = working.findIndex((p) => p.seatAllocationId === violatedId);
    if (idxA === -1) continue;

    removeFromPlacementIndex(index, working[idxA], activeRules);
    const beforeA = violationsAgainstIndex(working[idxA], index, activeRules);
    addToPlacementIndex(index, working[idxA], activeRules);
    if (beforeA === 0) continue;

    let bestIdxB = -1;
    let bestAfterCombined = Infinity;

    for (let idxB = 0; idxB < working.length; idxB++) {
      if (idxB === idxA) continue;

      removeFromPlacementIndex(index, working[idxB], activeRules);
      const beforeB = violationsAgainstIndex(working[idxB], index, activeRules);
      addToPlacementIndex(index, working[idxB], activeRules);
      const mutualBefore = checkSeatingViolations([working[idxA], working[idxB]], activeRules).length;
      const beforeCombined = beforeA + beforeB - mutualBefore;

      const seatA = { roomId: working[idxA].roomId, roomSeatId: working[idxA].roomSeatId, rowNumber: working[idxA].rowNumber, columnNumber: working[idxA].columnNumber };
      const seatB = { roomId: working[idxB].roomId, roomSeatId: working[idxB].roomSeatId, rowNumber: working[idxB].rowNumber, columnNumber: working[idxB].columnNumber };
      const candidateA: GridPlacement = { ...working[idxA], ...seatB };
      const candidateB: GridPlacement = { ...working[idxB], ...seatA };

      removeFromPlacementIndex(index, working[idxA], activeRules);
      removeFromPlacementIndex(index, working[idxB], activeRules);
      addToPlacementIndex(index, candidateB, activeRules);
      const afterA = violationsAgainstIndex(candidateA, index, activeRules);
      removeFromPlacementIndex(index, candidateB, activeRules);
      addToPlacementIndex(index, candidateA, activeRules);
      const afterB = violationsAgainstIndex(candidateB, index, activeRules);
      removeFromPlacementIndex(index, candidateA, activeRules);
      // Restore original state exactly — this trial wasn't (necessarily) chosen.
      addToPlacementIndex(index, working[idxA], activeRules);
      addToPlacementIndex(index, working[idxB], activeRules);

      const mutualAfter = checkSeatingViolations([candidateA, candidateB], activeRules).length;
      const afterCombined = afterA + afterB - mutualAfter;

      if (afterCombined < beforeCombined && afterCombined < bestAfterCombined) {
        bestAfterCombined = afterCombined;
        bestIdxB = idxB;
      }
    }

    if (bestIdxB !== -1) {
      const seatA = { roomId: working[idxA].roomId, roomSeatId: working[idxA].roomSeatId, rowNumber: working[idxA].rowNumber, columnNumber: working[idxA].columnNumber };
      const seatB = { roomId: working[bestIdxB].roomId, roomSeatId: working[bestIdxB].roomSeatId, rowNumber: working[bestIdxB].rowNumber, columnNumber: working[bestIdxB].columnNumber };
      removeFromPlacementIndex(index, working[idxA], activeRules);
      removeFromPlacementIndex(index, working[bestIdxB], activeRules);
      working[idxA] = { ...working[idxA], ...seatB };
      working[bestIdxB] = { ...working[bestIdxB], ...seatA };
      addToPlacementIndex(index, working[idxA], activeRules);
      addToPlacementIndex(index, working[bestIdxB], activeRules);
    }
  }
  return working;
}

export function allocateSeats(
  rooms: AllocationRoomInput[],
  students: AllocationParticipant[],
  activeRules: SeatingRule[],
  pattern: SeatPattern,
  seed: number
): AllocationRunResult {
  const gridSlots: (RoomSeatSlot & { roomId: string })[] = [];
  for (const room of rooms) {
    for (const seat of sortSeatsByPattern(room.availableSeats, pattern)) gridSlots.push({ ...seat, roomId: room.roomId });
  }
  const additionalSlots: { roomId: string; seatNo: string }[] = [];
  for (const room of rooms) {
    for (const seatNo of room.additionalSeatSlots) additionalSlots.push({ roomId: room.roomId, seatNo });
  }

  const totalCapacity = gridSlots.length + additionalSlots.length;
  if (students.length > totalCapacity) {
    return {
      ok: false,
      error: `Not enough seats: ${students.length} participants but only ${totalCapacity} seats available (${gridSlots.length} grid + ${additionalSlots.length} additional) across the allocated rooms.`,
    };
  }

  const dimensions = collectActiveDimensions(activeRules);
  const queue = buildPlacementQueue(students, dimensions, seed);

  const placedGrid: GridPlacement[] = [];
  const placementIndex = createPlacementIndex();
  const usedSlotIndexes = new Set<number>();
  const deferred: AllocationParticipant[] = [];

  // Pass A — compliant-first: scan every remaining slot for the first that
  // causes zero new violations against everyone already placed. Checked
  // via the index (O(1)/O(gap) per candidate), not a linear scan — see
  // createPlacementIndex's doc comment for why this matters at scale.
  for (const student of queue) {
    const studentInfo = toStudentInfo(student);
    let placedAt = -1;
    for (let i = 0; i < gridSlots.length; i++) {
      if (usedSlotIndexes.has(i)) continue;
      const candidate: GridPlacement = { seatAllocationId: student.seatAllocationId, roomId: gridSlots[i].roomId, roomSeatId: gridSlots[i].roomSeatId, rowNumber: gridSlots[i].rowNumber, columnNumber: gridSlots[i].columnNumber, student: studentInfo };
      if (violationsAgainstIndex(candidate, placementIndex, activeRules) === 0) {
        placedGrid.push(candidate);
        addToPlacementIndex(placementIndex, candidate, activeRules);
        usedSlotIndexes.add(i);
        placedAt = i;
        break;
      }
    }
    if (placedAt === -1) deferred.push(student);
  }

  // Pass B — forced placement, only for students Pass A couldn't seat
  // compliantly: pick the remaining grid slot with fewest violations.
  const stillDeferred: AllocationParticipant[] = [];
  for (const student of deferred) {
    const studentInfo = toStudentInfo(student);
    let bestIndex = -1;
    let bestCount = Infinity;
    for (let i = 0; i < gridSlots.length; i++) {
      if (usedSlotIndexes.has(i)) continue;
      const candidate: GridPlacement = { seatAllocationId: student.seatAllocationId, roomId: gridSlots[i].roomId, roomSeatId: gridSlots[i].roomSeatId, rowNumber: gridSlots[i].rowNumber, columnNumber: gridSlots[i].columnNumber, student: studentInfo };
      const count = violationsAgainstIndex(candidate, placementIndex, activeRules);
      if (count < bestCount) {
        bestCount = count;
        bestIndex = i;
      }
    }
    if (bestIndex === -1) {
      stillDeferred.push(student); // grid fully exhausted
      continue;
    }
    const seat = gridSlots[bestIndex];
    const placed: GridPlacement = { seatAllocationId: student.seatAllocationId, roomId: seat.roomId, roomSeatId: seat.roomSeatId, rowNumber: seat.rowNumber, columnNumber: seat.columnNumber, student: studentInfo };
    placedGrid.push(placed);
    addToPlacementIndex(placementIndex, placed, activeRules);
    usedSlotIndexes.add(bestIndex);
  }

  const repaired = repairPass(placedGrid, activeRules);

  const placements: ProposedPlacement[] = repaired.map((p) => ({
    seatAllocationId: p.seatAllocationId,
    studentId: p.student.studentId,
    roomId: p.roomId,
    roomSeatId: p.roomSeatId,
    seatNo: null,
    seatKind: "grid",
  }));

  // Pass C — additional seats, strictly last resort: only reached once the
  // grid is fully exhausted, never merely because a student's own placement
  // would violate a rule.
  let additionalIndex = 0;
  for (const student of stillDeferred) {
    const slot = additionalSlots[additionalIndex++];
    placements.push({ seatAllocationId: student.seatAllocationId, studentId: student.studentId, roomId: slot.roomId, roomSeatId: null, seatNo: slot.seatNo, seatKind: "additional" });
  }

  return { ok: true, placements };
}

// ---------------------------------------------------------------------------
// Classification — always live, never cached, reused by the generator's own
// preview, manual-allocation warnings, and the Review screen after any edit.
// ---------------------------------------------------------------------------

export type ClassificationStatus = "unallocated" | "compliant" | "violation";
export type SeatKind = "none" | "grid" | "additional";

export interface AllocationClassification {
  seatAllocationId: string;
  status: ClassificationStatus;
  seatKind: SeatKind;
  violations: RuleViolation[];
}

export interface ClassifiableAllocation {
  seatAllocationId: string;
  roomId: string | null;
  roomSeatId: string | null;
  seatNo: string | null;
  rowNumber: number | null;
  columnNumber: number | null;
  student: SeatingStudentInfo;
}

export function classifySeatAllocations(
  allocations: ClassifiableAllocation[],
  activeRules: SeatingRule[]
): AllocationClassification[] {
  const gridPlacements: GridPlacement[] = [];
  for (const a of allocations) {
    if (a.roomId && a.roomSeatId && a.rowNumber != null && a.columnNumber != null) {
      gridPlacements.push({ seatAllocationId: a.seatAllocationId, roomId: a.roomId, roomSeatId: a.roomSeatId, rowNumber: a.rowNumber, columnNumber: a.columnNumber, student: a.student });
    }
  }
  const violations = checkSeatingViolations(gridPlacements, activeRules);
  const violationsBySeat = new Map<string, RuleViolation[]>();
  for (const v of violations) {
    for (const id of v.seatAllocationIds) {
      const list = violationsBySeat.get(id) ?? [];
      list.push(v);
      violationsBySeat.set(id, list);
    }
  }

  return allocations.map((a): AllocationClassification => {
    if (!a.roomId || (!a.roomSeatId && !a.seatNo)) {
      return { seatAllocationId: a.seatAllocationId, status: "unallocated", seatKind: "none", violations: [] };
    }
    if (!a.roomSeatId && a.seatNo) {
      return { seatAllocationId: a.seatAllocationId, status: "compliant", seatKind: "additional", violations: [] };
    }
    const v = violationsBySeat.get(a.seatAllocationId) ?? [];
    return { seatAllocationId: a.seatAllocationId, status: v.length > 0 ? "violation" : "compliant", seatKind: "grid", violations: v };
  });
}
