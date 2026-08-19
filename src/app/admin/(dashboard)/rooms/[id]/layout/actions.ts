"use server";

import { getAdminSession } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/admin/audit";
import {
  roomLayoutSaveSchema,
  validateGrid,
  computeCapacityBreakdown,
  computeSeatsToDelete,
  cellToDbShape,
  cellToPlaceholderShape,
  type RoomLayoutSaveInput,
} from "@/lib/validation/room-layout";
import { isForeignKeyViolation, CONCURRENT_LAYOUT_CONFLICT_MESSAGE } from "@/lib/admin/db-errors";

export interface RoomLayoutSaveResult {
  success: boolean;
  error?: string;
}

/**
 * Saves the Room Layout editor's full grid state. Called directly from the
 * client component (not bound to a <form>) since the payload is a
 * structured grid, not FormData — a plain "use server" function invoked
 * with `await saveRoomLayoutAction(roomId, payload)` is a supported Server
 * Action pattern.
 *
 * Diff-based: re-fetches the room's current room_seats fresh (never trusts
 * client-supplied ids), deletes cells no longer in the desired grid (after
 * checking none are already referenced by seat_allocations — Phase 7
 * doesn't exist yet, but this guard exists for when it does), then upserts
 * every desired cell via the `(room_id, row_number, column_number)` unique
 * constraint so insert-vs-update never has to be decided explicitly.
 *
 * usable_seats is derived from the layout on every save (Final Usable
 * Capacity = available grid seats + additional seats) — it's no longer a
 * freestanding number once a layout exists.
 */
export async function saveRoomLayoutAction(
  roomId: string,
  input: RoomLayoutSaveInput
): Promise<RoomLayoutSaveResult> {
  const session = await getAdminSession();
  if (!session) {
    return { success: false, error: "Your session has expired. Please sign in again." };
  }

  const parsed = roomLayoutSaveSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid layout data." };
  }

  const { rows, columns, additional_seats, numbering_scheme, seats } = parsed.data;

  const gridErrors = validateGrid(seats, rows, columns);
  if (gridErrors.length > 0) {
    return { success: false, error: gridErrors[0] };
  }

  const supabase = await createSupabaseServerClient();

  const { data: room } = await supabase.from("rooms").select("*").eq("id", roomId).maybeSingle();
  if (!room) {
    return { success: false, error: "This room no longer exists." };
  }

  const { data: existingSeats, error: fetchError } = await supabase
    .from("room_seats")
    .select("id, row_number, column_number")
    .eq("room_id", roomId);

  if (fetchError) {
    return { success: false, error: "Unable to load the current layout. Please try again." };
  }

  const toDeleteIds = computeSeatsToDelete(existingSeats ?? [], seats);

  if (toDeleteIds.length > 0) {
    const { data: blocking, error: blockingError } = await supabase
      .from("seat_allocations")
      .select("id")
      .in("room_seat_id", toDeleteIds)
      .limit(1);

    if (blockingError) {
      return { success: false, error: "Unable to save the layout. Please try again." };
    }
    if (blocking && blocking.length > 0) {
      return {
        success: false,
        error: "Can't remove seats that already have students allocated. Unseat them first.",
      };
    }

    const { error: deleteError } = await supabase.from("room_seats").delete().in("id", toDeleteIds);
    if (deleteError) {
      return {
        success: false,
        error: isForeignKeyViolation(deleteError)
          ? `${CONCURRENT_LAYOUT_CONFLICT_MESSAGE} A seat you're removing was just assigned to a student.`
          : "Unable to save the layout. Please try again.",
      };
    }
  }

  if (seats.length > 0) {
    // Two-phase upsert: blank every desired cell to a labelless gap first,
    // vacating the room's unique-label space, THEN write the real final
    // labels. A single-phase upsert that reassigns labels (e.g. a
    // numbering-pattern change) can otherwise hit a transient
    // unique-constraint violation mid-batch — see cellToPlaceholderShape's
    // doc comment.
    const placeholderRows = seats.map((cell) => ({ room_id: roomId, ...cellToPlaceholderShape(cell) }));
    const { error: placeholderError } = await supabase
      .from("room_seats")
      .upsert(placeholderRows, { onConflict: "room_id,row_number,column_number" });

    if (placeholderError) {
      return { success: false, error: "Unable to save the layout. Please try again." };
    }

    const upsertRows = seats.map((cell) => ({ room_id: roomId, ...cellToDbShape(cell) }));
    const { error: upsertError } = await supabase
      .from("room_seats")
      .upsert(upsertRows, { onConflict: "room_id,row_number,column_number" });

    if (upsertError) {
      return {
        success: false,
        error:
          upsertError.code === "23505"
            ? "Two or more seats have the same label. Labels must be unique within the room."
            : "Unable to save the layout. Please try again.",
      };
    }
  }

  const breakdown = computeCapacityBreakdown(seats, additional_seats);

  const { error: roomUpdateError } = await supabase
    .from("rooms")
    .update({
      rows,
      columns,
      numbering_scheme,
      additional_seats,
      total_physical_positions: rows * columns,
      usable_seats: breakdown.finalUsableCapacity,
    })
    .eq("id", roomId);

  if (roomUpdateError) {
    return {
      success: false,
      error: "The layout was saved, but the room summary couldn't be updated. Refresh the page to check.",
    };
  }

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "room_layout_saved",
    entityType: "room",
    entityId: roomId,
    oldValue: {
      rows: room.rows,
      columns: room.columns,
      additional_seats: room.additional_seats,
      usable_seats: room.usable_seats,
    },
    newValue: {
      rows,
      columns,
      additional_seats,
      numbering_scheme,
      ...breakdown,
    },
  });

  return { success: true };
}
