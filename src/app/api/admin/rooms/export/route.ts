import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/admin/audit";
import { buildExcelResponse } from "@/lib/admin/reports-excel";

/** Import/Export architecture (approved) — Room Master export. Rows/Columns
 * reflect the room's REAL saved layout dimensions when one exists (rooms.rows
 * only gets set once a layout has been drawn); blank for a room with no
 * layout yet, matching the same "informational only" meaning the importer
 * gives them. */
export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { data: rooms } = await supabase
    .from("rooms")
    .select("room_number, code, block, floor, landmark, rows, columns, additional_seats, status")
    .order("display_order", { ascending: true })
    .order("room_number", { ascending: true });

  const rows = (rooms ?? []).map((r) => [
    r.room_number,
    r.code,
    r.block ?? "",
    r.floor ?? "",
    r.landmark ?? "",
    r.rows ?? "",
    r.columns ?? "",
    r.additional_seats,
    r.status,
  ]);

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "room_master_exported",
    entityType: "room",
    newValue: { rowCount: rows.length },
  });

  return buildExcelResponse(
    "Rooms",
    ["Room Number", "Code", "Block", "Floor", "Landmark", "Rows", "Columns", "Additional Seats", "Status"],
    rows,
    "ROOM_MASTER.xlsx"
  );
}
