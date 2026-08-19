/**
 * Phase 7 UI polish — pure logic behind the Seating Workspace's visual
 * Move/Swap target picking (replaces the old plain <select> dropdowns).
 * Zero I/O, zero React — decides whether a clicked seat is a legal target
 * for the in-progress pick, independent of how it's rendered.
 */

export type PickingKind = "move" | "swap";

export interface PickableCell {
  cellState: "available" | "disabled" | "gap";
  occupantSeatAllocationId: string | null;
}

/**
 * Move: only an empty, available (non-gap, non-disabled) seat is a legal
 * target. Swap: only a currently-occupied seat is legal, and never the
 * source seat itself (swapping a student with themselves is a no-op that
 * would otherwise look like a valid pick).
 */
export function isValidPickTarget(pickingKind: PickingKind, sourceSeatAllocationId: string, target: PickableCell): boolean {
  if (pickingKind === "move") {
    return target.cellState === "available" && target.occupantSeatAllocationId === null;
  }
  return target.occupantSeatAllocationId !== null && target.occupantSeatAllocationId !== sourceSeatAllocationId;
}
