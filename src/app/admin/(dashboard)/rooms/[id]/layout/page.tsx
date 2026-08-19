import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RoomLayoutEditor } from "@/components/admin/RoomLayoutEditor";
import { saveRoomLayoutAction } from "./actions";

export default async function RoomLayoutPage(props: PageProps<"/admin/rooms/[id]/layout">) {
  const { id } = await props.params;

  const supabase = await createSupabaseServerClient();
  const { data: room } = await supabase.from("rooms").select("*").eq("id", id).maybeSingle();
  if (!room) notFound();

  const { data: seats } = await supabase
    .from("room_seats")
    .select("*")
    .eq("room_id", id)
    .order("row_number", { ascending: true })
    .order("column_number", { ascending: true });

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Room Layout</p>
          <h1 className="text-2xl font-bold text-slate-900">{room.room_number}</h1>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`/api/admin/rooms/layout/export?roomId=${room.id}`}
            className="text-sm font-medium text-slate-600 hover:underline"
          >
            Export Layout
          </a>
          <Link href={`/admin/rooms/${room.id}`} className="text-sm font-medium text-slate-600 hover:underline">
            ← Back to Room
          </Link>
        </div>
      </div>

      <div className="mt-6">
        <RoomLayoutEditor room={room} initialSeats={seats ?? []} saveAction={saveRoomLayoutAction} />
      </div>
    </div>
  );
}
