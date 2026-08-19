import type { PublicSeatResult, ExamSession, DailyEventStatus } from "@/types/database";

/**
 * Phase 8 — pure classification for the public student seat lookup. Zero
 * I/O: the route handler calls the two RPC functions
 * (public_today_event_status, public_seat_lookup), then hands their
 * results here to decide which of the four outcomes to show. Mirrors the
 * pure/IO split used throughout this project (see room-layout.ts,
 * seating-allocation.ts).
 *
 * `seatedResults` is expected to already be scoped to published events
 * only — public_seat_lookup() filters that internally in SQL, so this
 * function trusts that boundary rather than re-checking it (single source
 * of truth for "published + seated", not duplicated in two places).
 */

export interface TodayEventStatus {
  session: ExamSession;
  status: DailyEventStatus;
}

export type SeatLookupClassification =
  | { status: "not_published" }
  | { status: "closed" }
  | { status: "not_found" }
  | { status: "found"; results: PublicSeatResult[] };

export function classifySeatLookup(
  todayEvents: TodayEventStatus[],
  seatedResults: PublicSeatResult[]
): SeatLookupClassification {
  if (todayEvents.length === 0) {
    // Nothing scheduled today at all — same message as "not published yet".
    return { status: "not_published" };
  }

  const hasPublished = todayEvents.some((e) => e.status === "published");
  if (!hasPublished) {
    // None published — distinguish "everything closed" from "still draft"
    // (or a mix, which reads better as "not published yet" than "closed").
    const allClosed = todayEvents.every((e) => e.status === "closed");
    return allClosed ? { status: "closed" } : { status: "not_published" };
  }

  if (seatedResults.length === 0) {
    // A published event exists today, but this register number has no
    // seated allocation for it — deliberately identical whether the
    // register number doesn't exist at all, or exists but isn't seated
    // today. Never distinguish the two.
    return { status: "not_found" };
  }

  return { status: "found", results: seatedResults };
}
