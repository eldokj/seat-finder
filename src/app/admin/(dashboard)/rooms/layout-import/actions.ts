"use server";

import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/admin/audit";
import { prepareRoomLayoutImport, ExcelParseError } from "@/lib/excel/room-layout-pipeline";
import { saveRoomLayoutAction } from "../[id]/layout/actions";
import type { LayoutImportResult, LayoutImportSummary } from "@/lib/validation/room-layout-import";
import type { SeatCell } from "@/lib/validation/room-layout";

export interface RoomLayoutImportPreviewState {
  ok: boolean;
  error?: string;
  result?: LayoutImportResult;
}

export interface RoomLayoutImportActionResult {
  ok: boolean;
  error?: string;
  summary?: LayoutImportSummary;
  roomsUpdated?: number;
}

export async function previewRoomLayoutImportAction(formData: FormData): Promise<RoomLayoutImportPreviewState> {
  const adminSession = await getAdminSession();
  if (!adminSession) redirect("/admin/login");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file to preview." };

  const supabase = await createSupabaseServerClient();

  try {
    const prepared = await prepareRoomLayoutImport(supabase, file);
    return { ok: true, result: prepared.result };
  } catch (error) {
    if (error instanceof ExcelParseError) return { ok: false, error: error.message };
    console.error("Room layout import preview failed:", error);
    return { ok: false, error: "Unable to process the uploaded file. Please try again." };
  }
}

/**
 * The file represents the FULL desired layout for each room it mentions —
 * matching how "Export exact saved layout" is meant to round-trip. Each
 * affected room is saved via the EXISTING saveRoomLayoutAction (one call per
 * room), which already: validates the grid, protects any seat that's
 * already allocated to a student (refuses to delete/relabel it), and does
 * the safe two-phase upsert. Nothing about that logic is duplicated here.
 *
 * Rooms have no daily_examination_event to hang an import_batches row off
 * (decision #11) — like Room Master import, this writes one summarizing
 * `audit_logs` entry instead.
 */
export async function importRoomLayoutImportAction(formData: FormData): Promise<RoomLayoutImportActionResult> {
  const adminSession = await getAdminSession();
  if (!adminSession) redirect("/admin/login");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file to import." };

  const supabase = await createSupabaseServerClient();

  let prepared;
  try {
    prepared = await prepareRoomLayoutImport(supabase, file);
  } catch (error) {
    if (error instanceof ExcelParseError) return { ok: false, error: error.message };
    console.error("Room layout import (prepare) failed:", error);
    return { ok: false, error: "Unable to process the uploaded file. Please try again." };
  }

  const { result, fileName, roomIdByCode } = prepared;

  if (result.affectedRoomCodes.length === 0) {
    return { ok: false, error: "No valid rows were found — nothing was imported. See the preview for details." };
  }

  let roomsUpdated = 0;
  const failures: { roomCode: string; message: string }[] = [];

  for (const roomCode of result.affectedRoomCodes) {
    const roomId = roomIdByCode.get(roomCode);
    if (!roomId) continue; // shouldn't happen — classify already rejects unknown codes

    const { data: room } = await supabase.from("rooms").select("additional_seats, numbering_scheme").eq("id", roomId).maybeSingle();
    if (!room) {
      failures.push({ roomCode, message: "Room no longer exists." });
      continue;
    }

    const desiredRows = result.rows.filter((r) => r.classification !== "rejected" && r.normalized?.roomCode === roomCode);

    const seats: SeatCell[] = desiredRows.map((r) => {
      const n = r.normalized!;
      return {
        row_number: n.rowNumber,
        column_number: n.columnNumber,
        seat_label: n.seatLabel ?? "",
        state: n.positionType === "gap" ? "gap" : n.status === "disabled" ? "disabled" : "available",
      };
    });

    const rows = Math.max(...seats.map((s) => s.row_number));
    const columns = Math.max(...seats.map((s) => s.column_number));

    const saveResult = await saveRoomLayoutAction(roomId, {
      rows,
      columns,
      additional_seats: room.additional_seats,
      // Imported labels are externally specified, not pattern-generated —
      // 'custom' is the exact existing semantic for that (see
      // room-layout.ts's mergeGrid doc comment).
      numbering_scheme: "custom",
      seats,
    });

    if (saveResult.success) {
      roomsUpdated++;
    } else {
      failures.push({ roomCode, message: saveResult.error ?? "Unknown error." });
    }
  }

  await logAuditEvent(supabase, {
    adminId: adminSession.user.id,
    action: "room_layout_imported",
    entityType: "room",
    newValue: {
      fileName,
      ...result.summary,
      roomsUpdated,
      failures: failures.length > 0 ? failures : undefined,
    },
  });

  return {
    ok: failures.length === 0,
    error: failures.length > 0 ? `${failures.length} room(s) failed to save — ${failures.map((f) => `${f.roomCode}: ${f.message}`).join("; ")}` : undefined,
    summary: result.summary,
    roomsUpdated,
  };
}
