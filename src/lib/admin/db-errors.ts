import "server-only";

/**
 * Phase 10 — shared helper for turning a raw Postgres unique-constraint
 * violation (code 23505) into a specific "someone else just changed this"
 * message instead of a generic "please try again". Used by the seating and
 * room-layout actions, the two places most likely to race between two
 * admins (or one admin in two tabs) acting on the same seat/seat_allocations
 * rows concurrently. The DB's unique constraints remain the real
 * correctness backstop — this only improves what the admin sees when one
 * fires.
 */
export function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505";
}

/** Postgres foreign-key-restrict violation — e.g. a room_seats row was just
 * referenced by a new seat_allocations row (another admin seated a student
 * there) between this action's guard check and its delete. */
export function isForeignKeyViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23503";
}

export const CONCURRENT_SEATING_CONFLICT_MESSAGE =
  "This seat was just taken or changed by another action (possibly another admin). Refresh the page and try again.";

export const CONCURRENT_LAYOUT_CONFLICT_MESSAGE =
  "This room's layout was just changed elsewhere (possibly by another admin). Refresh the page and try again.";
