import "server-only";

import { parseWorkbookBuffer, validateUploadedFile, ExcelParseError } from "./parse";
import { matchColumns, projectRows, ROOM_LAYOUT_COLUMNS } from "./columns";
import { classifyLayoutImportRows, type LayoutImportResult, type ExistingRoomLayoutsByCode } from "@/lib/validation/room-layout-import";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

export { ExcelParseError };

export interface PreparedRoomLayoutImport {
  result: LayoutImportResult;
  fileName: string;
  sheetName: string;
  /** Room Code -> room id, for every room the write step needs to touch. */
  roomIdByCode: Map<string, string>;
}

/**
 * Shared read-only pipeline used by BOTH the preview action and the confirm
 * (import) action. Never writes anything itself — actual writes happen one
 * room at a time via the EXISTING saveRoomLayoutAction (see
 * app/admin/(dashboard)/rooms/[id]/layout/import/actions.ts), which already
 * owns occupied-seat protection and the diff-based upsert.
 */
export async function prepareRoomLayoutImport(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  file: File
): Promise<PreparedRoomLayoutImport> {
  validateUploadedFile(file.name, file.size);

  const buffer = await file.arrayBuffer();
  const parsed = parseWorkbookBuffer(buffer, file.name);

  const { mapping, missingRequired } = matchColumns(parsed.headers, ROOM_LAYOUT_COLUMNS);
  if (missingRequired.length > 0) {
    throw new ExcelParseError(`Missing required column(s): ${missingRequired.map((c) => c.label).join(", ")}.`);
  }

  const projected = projectRows(parsed.rows, mapping);
  const parsedRows = projected.map((raw, index) => ({ rowNumber: index + 2, raw }));

  const candidateCodes = Array.from(
    new Set(
      parsedRows
        .map((r) => (typeof r.raw.roomCode === "string" ? r.raw.roomCode : String(r.raw.roomCode ?? "")))
        .map((v) => v.trim().toUpperCase())
        .filter(Boolean)
    )
  );

  const existingRoomsByCode: ExistingRoomLayoutsByCode = new Map();
  const roomIdByCode = new Map<string, string>();

  if (candidateCodes.length > 0) {
    const { data: rooms } = await supabase.from("rooms").select("id, code").in("code", candidateCodes);

    for (const room of rooms ?? []) {
      const codeUpper = room.code.toUpperCase();
      roomIdByCode.set(codeUpper, room.id);
      existingRoomsByCode.set(codeUpper, { roomId: room.id, cells: [] });
    }

    const roomIds = (rooms ?? []).map((r) => r.id);
    if (roomIds.length > 0) {
      const { data: seats } = await supabase
        .from("room_seats")
        .select("room_id, row_number, column_number, section, seat_label, position_type, status")
        .in("room_id", roomIds);

      const roomIdToCode = new Map((rooms ?? []).map((r) => [r.id, r.code.toUpperCase()]));
      for (const seat of seats ?? []) {
        const code = roomIdToCode.get(seat.room_id);
        if (!code) continue;
        existingRoomsByCode.get(code)!.cells.push({
          rowNumber: seat.row_number,
          columnNumber: seat.column_number,
          section: seat.section,
          seatLabel: seat.seat_label,
          positionType: seat.position_type,
          status: seat.status,
        });
      }
    }
  }

  const result = classifyLayoutImportRows(parsedRows, existingRoomsByCode);

  return { result, fileName: file.name, sheetName: parsed.sheetName, roomIdByCode };
}
