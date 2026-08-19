import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/admin/audit";
import { buildExcelResponse } from "@/lib/admin/reports-excel";

/** Import/Export architecture (approved) — reproduces the EXACT saved
 * layout (room_seats), so it round-trips through Room Layout Import. With
 * ?roomId=, exports just that room; omitted, exports every room that has a
 * saved layout. */
export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const roomId = url.searchParams.get("roomId");

  const supabase = await createSupabaseServerClient();

  let roomsQuery = supabase.from("rooms").select("id, code, room_number").not("rows", "is", null);
  if (roomId) roomsQuery = roomsQuery.eq("id", roomId);
  const { data: rooms } = await roomsQuery;

  if (roomId && (!rooms || rooms.length === 0)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const roomIds = (rooms ?? []).map((r) => r.id);
  const roomById = new Map((rooms ?? []).map((r) => [r.id, r]));

  const rows: (string | number)[][] = [];

  if (roomIds.length > 0) {
    const { data: seats } = await supabase
      .from("room_seats")
      .select("room_id, row_number, column_number, section, seat_label, position_type, status")
      .in("room_id", roomIds)
      .order("row_number", { ascending: true })
      .order("column_number", { ascending: true });

    for (const seat of seats ?? []) {
      const room = roomById.get(seat.room_id);
      if (!room) continue;
      rows.push([room.code, seat.row_number, seat.column_number, seat.section ?? "", seat.seat_label ?? "", seat.position_type, seat.status]);
    }
  }

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "room_layout_exported",
    entityType: "room",
    entityId: roomId ?? undefined,
    newValue: { roomCount: rooms?.length ?? 0, rowCount: rows.length },
  });

  const fileName = roomId && rooms?.[0] ? `ROOM_LAYOUT_${rooms[0].code.replace(/[^a-z0-9]+/gi, "_")}.xlsx` : "ROOM_LAYOUT_ALL.xlsx";

  return buildExcelResponse("Room Layout", ["Room Number", "Row", "Column", "Section", "Seat Label", "Position Type", "Status"], rows, fileName);
}
