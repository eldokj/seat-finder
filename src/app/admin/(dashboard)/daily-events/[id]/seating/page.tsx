import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatLongDate } from "@/lib/utils/date";
import { loadSeatingWorkspaceData } from "@/lib/admin/seating-data-io";
import { SeatingWorkspace } from "@/components/admin/SeatingWorkspace";
import { publishDailyEventAction } from "../../actions";
import {
  previewAutomaticAllocationAction,
  confirmAllocationAction,
  manualAssignSeatAction,
  manualSwapSeatsAction,
  manualUnseatAction,
  resolveConflictsAction,
} from "./actions";

export default async function SeatingWorkspacePage(props: PageProps<"/admin/daily-events/[id]/seating">) {
  const { id } = await props.params;

  const supabase = await createSupabaseServerClient();
  const data = await loadSeatingWorkspaceData(supabase, id);
  if (!data) notFound();

  const boundPublish = publishDailyEventAction.bind(null, id);

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Seating Allocation</p>
          <h1 className="text-2xl font-bold text-slate-900">
            {formatLongDate(data.event.examDate)} — {data.event.session}
          </h1>
        </div>
        <Link href={`/admin/daily-events/${id}`} className="text-sm font-medium text-slate-600 hover:underline">
          ← Back to Session
        </Link>
      </div>

      <div className="mt-6">
        <SeatingWorkspace
          eventId={id}
          eventStatus={data.event.status}
          data={data}
          previewAction={previewAutomaticAllocationAction}
          confirmAction={confirmAllocationAction}
          assignAction={manualAssignSeatAction}
          swapAction={manualSwapSeatsAction}
          unseatAction={manualUnseatAction}
          resolveConflictsAction={resolveConflictsAction}
          publishAction={boundPublish}
        />
      </div>
    </div>
  );
}
