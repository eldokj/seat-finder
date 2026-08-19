import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RoomStatusBadge } from "@/components/admin/RoomStatusBadge";
import { ErrorBanner } from "@/components/admin/ErrorBanner";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { CapacitySummaryCards } from "@/components/admin/CapacitySummaryCards";
import { RoomForm } from "../RoomForm";
import { updateRoomAction, setRoomStatusAction } from "../actions";
import { cellStateFromDb, computeCapacityBreakdown } from "@/lib/validation/room-layout";

export default async function RoomDetailPage(props: PageProps<"/admin/rooms/[id]">) {
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const errorMessage = typeof searchParams.error === "string" ? searchParams.error : undefined;

  const supabase = await createSupabaseServerClient();
  const { data: room } = await supabase.from("rooms").select("*").eq("id", id).maybeSingle();

  if (!room) notFound();

  const hasLayout = room.total_physical_positions !== null;

  const { data: seats } = hasLayout
    ? await supabase.from("room_seats").select("position_type, status").eq("room_id", id)
    : { data: null };

  const breakdown = hasLayout
    ? computeCapacityBreakdown(
        (seats ?? []).map((row) => ({ state: cellStateFromDb(row.position_type, row.status) })),
        room.additional_seats
      )
    : null;

  const boundUpdate = updateRoomAction.bind(null, room.id);
  const nextStatus = room.status === "active" ? "inactive" : "active";
  const boundSetStatus = setRoomStatusAction.bind(null, room.id, nextStatus);

  return (
    <div className="max-w-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{room.room_number}</h1>
          <p className="text-sm text-slate-500">
            {room.code} · Usable seats {room.usable_seats}
            {room.additional_seats > 0 && ` (+${room.additional_seats} additional)`}
          </p>
        </div>
        <RoomStatusBadge status={room.status} />
      </div>

      {errorMessage && (
        <div className="mt-4">
          <ErrorBanner message={errorMessage} />
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <form action={boundSetStatus}>
          <ConfirmButton
            type="submit"
            confirmMessage={
              nextStatus === "inactive"
                ? "Deactivate this room? It will no longer be available for new seating uploads."
                : "Activate this room again?"
            }
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              nextStatus === "inactive"
                ? "border border-red-300 text-red-700 hover:bg-red-50"
                : "bg-green-700 text-white hover:bg-green-800"
            }`}
          >
            {nextStatus === "inactive" ? "Deactivate Room" : "Activate Room"}
          </ConfirmButton>
        </form>
        <Link
          href={`/admin/rooms/${room.id}/layout`}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          {hasLayout ? "Edit Room Layout" : "Create Room Layout"}
        </Link>
      </div>

      {hasLayout && breakdown && (
        <div className="mt-6">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Layout</h2>
          <p className="mb-3 text-sm text-slate-500">
            {room.rows} rows × {room.columns} columns · {room.numbering_scheme.replace("_", " ")} numbering
          </p>
          <CapacitySummaryCards breakdown={breakdown} />
        </div>
      )}

      <div className="mt-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <RoomForm mode="edit" action={boundUpdate} defaultValues={room} hasLayout={hasLayout} />
      </div>
    </div>
  );
}
