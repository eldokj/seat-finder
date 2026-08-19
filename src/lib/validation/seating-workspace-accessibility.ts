/**
 * Phase 10 accessibility fix — pure logic behind the Seating Workspace
 * grid's accessible names. Zero I/O, zero React, mirrors
 * seating-workspace-picking.ts's split.
 *
 * The grid buttons' VISIBLE text is deliberately terse (just the last 4
 * digits of a register number, or a bare seat label) so a dense room grid
 * still fits on screen — but that terse text was also standing in as the
 * button's only accessible name, with the fuller "Room, Seat, occupant"
 * context living solely in a mouse-hover `title`, invisible to
 * keyboard/screen-reader users. These build that full context as an
 * explicit aria-label instead, independent of (and in addition to) both
 * the visible text and the title tooltip.
 */

export interface AccessibleSeatOccupant {
  registerNo: string;
  fullName: string;
  /** Matches ClassificationStatus (seating-allocation.ts) loosely — only
   * "violation" is ever distinguished, everything else reads as compliant,
   * same as the component's original inline ternary. */
  status: string;
}

export function seatAccessibleLabel(
  roomLabel: string,
  seatLabel: string | null,
  cellState: "available" | "disabled" | "gap",
  occupant: AccessibleSeatOccupant | null
): string {
  if (cellState === "gap") return `${roomLabel}, gap, not a seat`;
  const seatPart = seatLabel ? `seat ${seatLabel}` : "seat";
  if (cellState === "disabled") return `${roomLabel}, ${seatPart}, disabled`;
  if (!occupant) return `${roomLabel}, ${seatPart}, empty`;
  const statusPart = occupant.status === "violation" ? "rule violation" : "rule compliant";
  return `${roomLabel}, ${seatPart}, ${occupant.registerNo}, ${occupant.fullName}, ${statusPart}`;
}

export function additionalSeatAccessibleLabel(roomLabel: string, seatNo: string, occupant: AccessibleSeatOccupant | null): string {
  if (!occupant) return `${roomLabel}, additional seat ${seatNo}, empty`;
  const statusPart = occupant.status === "violation" ? "rule violation" : "rule compliant";
  return `${roomLabel}, additional seat ${seatNo}, ${occupant.registerNo}, ${occupant.fullName}, ${statusPart}`;
}
