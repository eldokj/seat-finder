import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RoomStatusBadge } from "@/components/admin/RoomStatusBadge";
import { Pagination, DEFAULT_PAGE_SIZE, parsePageParam } from "@/components/admin/Pagination";

export default async function RoomsListPage(props: PageProps<"/admin/rooms">) {
  const searchParams = await props.searchParams;
  const page = parsePageParam(searchParams.page);
  const from = (page - 1) * DEFAULT_PAGE_SIZE;
  const to = from + DEFAULT_PAGE_SIZE - 1;

  const supabase = await createSupabaseServerClient();

  const [{ data: rooms, error }, { count }] = await Promise.all([
    supabase
      .from("rooms")
      .select("*")
      .order("display_order", { ascending: true })
      .order("room_number", { ascending: true })
      .range(from, to),
    supabase.from("rooms").select("id", { count: "exact", head: true }),
  ]);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / DEFAULT_PAGE_SIZE));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Rooms</h1>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/api/admin/rooms/export"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Export
          </a>
          <Link
            href="/admin/rooms/import"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Import
          </Link>
          <a
            href="/api/admin/rooms/layout/export"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Export Layouts
          </a>
          <Link
            href="/admin/rooms/layout-import"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Layout Import
          </Link>
          <Link
            href="/admin/rooms/new"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            + New Room
          </Link>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          Unable to load rooms right now. Please try again shortly.
        </p>
      )}

      {!error && (!rooms || rooms.length === 0) && (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-lg font-semibold text-slate-800">No rooms yet.</p>
          <p className="mt-2 text-sm text-slate-500">Add the examination rooms before uploading seating.</p>
        </div>
      )}

      {!error && rooms && rooms.length > 0 && (
        <>
          <div className="mt-6 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Room</th>
                  <th className="px-4 py-3">Block / Floor</th>
                  <th className="px-4 py-3">Usable Seats</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rooms.map((room) => (
                  <tr key={room.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/admin/rooms/${room.id}`} className="font-medium text-slate-900 hover:underline">
                        {room.room_number}
                      </Link>
                      <p className="text-xs text-slate-500">{room.code}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {[room.block, room.floor].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {room.usable_seats}
                      {room.additional_seats > 0 && (
                        <span className="text-slate-400"> (+{room.additional_seats})</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <RoomStatusBadge status={room.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination currentPage={page} totalPages={totalPages} totalCount={totalCount} pageSize={DEFAULT_PAGE_SIZE} basePath="/admin/rooms" />
        </>
      )}
    </div>
  );
}
