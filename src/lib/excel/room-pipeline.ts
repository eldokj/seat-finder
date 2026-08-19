import "server-only";

import { parseWorkbookBuffer, validateUploadedFile, ExcelParseError } from "./parse";
import { matchColumns, projectRows, ROOM_COLUMNS } from "./columns";
import { classifyRoomImportRows, type RoomImportResult, type ExistingRoomsByCode } from "@/lib/validation/room-import";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

export { ExcelParseError };

export interface PreparedRoomImport {
  result: RoomImportResult;
  fileName: string;
  sheetName: string;
}

/**
 * Shared read-only pipeline used by BOTH the preview action and the confirm
 * (import) action. Mirrors consolidated-pipeline.ts's shape. Never writes
 * anything itself.
 */
export async function prepareRoomImport(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  file: File
): Promise<PreparedRoomImport> {
  validateUploadedFile(file.name, file.size);

  const buffer = await file.arrayBuffer();
  const parsed = parseWorkbookBuffer(buffer, file.name);

  const { mapping, missingRequired } = matchColumns(parsed.headers, ROOM_COLUMNS);
  if (missingRequired.length > 0) {
    throw new ExcelParseError(`Missing required column(s): ${missingRequired.map((c) => c.label).join(", ")}.`);
  }

  const projected = projectRows(parsed.rows, mapping);
  const parsedRows = projected.map((raw, index) => ({ rowNumber: index + 2, raw }));

  const candidateCodes = Array.from(
    new Set(
      parsedRows
        .map((r) => (typeof r.raw.code === "string" ? r.raw.code : String(r.raw.code ?? "")))
        .map((v) => v.trim().toUpperCase())
        .filter(Boolean)
    )
  );

  const existingRoomsByCode: ExistingRoomsByCode = new Map();

  if (candidateCodes.length > 0) {
    const { data: existingRooms } = await supabase
      .from("rooms")
      .select("code, room_number, block, floor, landmark, additional_seats, status, usable_seats, rows")
      .in("code", candidateCodes);

    for (const room of existingRooms ?? []) {
      existingRoomsByCode.set(room.code.toUpperCase(), {
        code: room.code,
        roomNumber: room.room_number,
        block: room.block,
        floor: room.floor,
        landmark: room.landmark,
        additionalSeats: room.additional_seats,
        status: room.status,
        usableSeats: room.usable_seats,
        hasLayout: room.rows !== null,
      });
    }
  }

  const result = classifyRoomImportRows(parsedRows, existingRoomsByCode);

  return { result, fileName: file.name, sheetName: parsed.sheetName };
}
