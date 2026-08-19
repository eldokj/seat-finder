import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/admin/auth";
import { logAuditEvent } from "@/lib/admin/audit";
import { loadReportEvent } from "@/lib/admin/reports-data-io";
import { loadSeatingWorkspaceData } from "@/lib/admin/seating-data-io";
import { needsDraftWatermark } from "@/lib/validation/reports";
import { ReportLetterhead } from "@/components/admin/reports/ReportLetterhead";
import { DraftWatermark } from "@/components/admin/reports/DraftWatermark";
import { ReportToolbar } from "@/components/admin/reports/ReportToolbar";
import { PrintableRoomGrid } from "@/components/admin/reports/PrintableRoomGrid";

export default async function RoomSeatingReportPage(props: PageProps<"/admin/reports/[eventId]/room/[roomId]/seating">) {
  const { eventId, roomId } = await props.params;
  const supabase = await createSupabaseServerClient();

  const event = await loadReportEvent(supabase, eventId);
  if (!event) notFound();

  // Reuses Phase 7's data loader verbatim — the exact same seat/occupant
  // computation the Seating Allocation workspace itself uses, not a
  // second copy of the same query.
  const workspace = await loadSeatingWorkspaceData(supabase, eventId);
  if (!workspace) notFound();

  const room = workspace.rooms.find((r) => r.id === roomId);
  if (!room) notFound();

  const cells = workspace.cells.filter((c) => c.roomId === roomId);
  const additionalSlots = workspace.additionalSlots.filter((s) => s.roomId === roomId);

  const session = await getAdminSession();
  if (session) {
    await logAuditEvent(supabase, { adminId: session.user.id, action: "report_viewed", entityType: "rooms", entityId: roomId, newValue: { report: "room_seating", eventId } });
  }

  return (
    <div className="max-w-3xl">
      <ReportToolbar backHref={`/admin/reports/${eventId}`} />
      {needsDraftWatermark(event.status) && <DraftWatermark />}
      <ReportLetterhead title={`Room-wise Seating Arrangement — ${room.roomNumber}`} examDate={event.examDate} session={event.session} />
      <PrintableRoomGrid cells={cells} additionalSlots={additionalSlots} />
    </div>
  );
}
