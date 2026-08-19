"use server";

import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/admin/audit";
import { prepareRoomImport, ExcelParseError } from "@/lib/excel/room-pipeline";
import type { RoomImportResult, RoomImportSummary } from "@/lib/validation/room-import";

export interface RoomImportPreviewState {
  ok: boolean;
  error?: string;
  result?: RoomImportResult;
}

export interface RoomImportActionResult {
  ok: boolean;
  error?: string;
  summary?: RoomImportSummary;
}

export async function previewRoomImportAction(formData: FormData): Promise<RoomImportPreviewState> {
  const adminSession = await getAdminSession();
  if (!adminSession) redirect("/admin/login");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file to preview." };

  const supabase = await createSupabaseServerClient();

  try {
    const prepared = await prepareRoomImport(supabase, file);
    return { ok: true, result: prepared.result };
  } catch (error) {
    if (error instanceof ExcelParseError) return { ok: false, error: error.message };
    console.error("Room import preview failed:", error);
    return { ok: false, error: "Unable to process the uploaded file. Please try again." };
  }
}

/**
 * Rooms have no daily_examination_event to hang an import_batches row off
 * (decision #11) — this writes to `audit_logs` instead, one entry
 * summarizing the whole import, rather than stretching import_batches to
 * support a nullable event.
 */
export async function importRoomImportAction(formData: FormData): Promise<RoomImportActionResult> {
  const adminSession = await getAdminSession();
  if (!adminSession) redirect("/admin/login");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file to import." };

  const supabase = await createSupabaseServerClient();

  let prepared;
  try {
    prepared = await prepareRoomImport(supabase, file);
  } catch (error) {
    if (error instanceof ExcelParseError) return { ok: false, error: error.message };
    console.error("Room import (prepare) failed:", error);
    return { ok: false, error: "Unable to process the uploaded file. Please try again." };
  }

  const { result, fileName } = prepared;

  const writableRows = result.rows.filter((r) => r.classification !== "rejected" && r.plannedWrite);
  if (writableRows.length === 0) {
    return { ok: false, error: "No valid rows were found — nothing was imported. See the preview for details." };
  }

  let anyWriteFailed = false;
  const failures: { code: string; message: string }[] = [];

  for (const row of writableRows) {
    const write = row.plannedWrite!;
    if (row.classification === "unchanged") continue;

    const { error } = await supabase.from("rooms").upsert(
      {
        room_number: write.roomNumber,
        code: write.code,
        block: write.block,
        floor: write.floor,
        landmark: write.landmark,
        additional_seats: write.additionalSeats,
        status: write.status,
        usable_seats: write.usableSeats,
      },
      { onConflict: "code" }
    );
    if (error) {
      anyWriteFailed = true;
      failures.push({ code: write.code, message: error.message });
    }
  }

  await logAuditEvent(supabase, {
    adminId: adminSession.user.id,
    action: "room_master_imported",
    entityType: "room",
    newValue: {
      fileName,
      ...result.summary,
      failures: failures.length > 0 ? failures : undefined,
    },
  });

  return {
    ok: !anyWriteFailed,
    error: anyWriteFailed ? `${failures.length} room(s) failed to save — see the summary for details.` : undefined,
    summary: result.summary,
  };
}
