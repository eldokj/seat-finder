import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/admin/audit";
import { loadReportEvent, loadRoomCapacityReport } from "@/lib/admin/reports-data-io";
import { buildExcelResponse } from "@/lib/admin/reports-excel";

export async function GET(_request: Request, props: { params: Promise<{ eventId: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await props.params;
  const supabase = await createSupabaseServerClient();
  const event = await loadReportEvent(supabase, eventId);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = (await loadRoomCapacityReport(supabase, eventId))
    .sort((a, b) => b.utilizationPercent - a.utilizationPercent)
    .map((r) => [
      r.roomNumber,
      r.breakdown.physicalPositions,
      r.breakdown.gaps,
      r.breakdown.disabled,
      r.breakdown.availableGridSeats,
      r.breakdown.additionalSeats,
      r.breakdown.finalUsableCapacity,
      r.seatedCount,
      `${r.utilizationPercent}%`,
    ]);

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "report_exported",
    entityType: "daily_examination_event",
    entityId: eventId,
    newValue: { report: "capacity" },
  });

  return buildExcelResponse(
    "Capacity",
    ["Room", "Physical Positions", "Gaps", "Disabled", "Available Grid Seats", "Additional Seats", "Final Usable Capacity", "Seated", "Utilization"],
    rows,
    `capacity-utilization-${event.examDate}-${event.session}.xlsx`
  );
}
