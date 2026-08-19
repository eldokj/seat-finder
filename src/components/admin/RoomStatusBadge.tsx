import type { Room } from "@/types/database";

const STATUS_STYLES: Record<Room["status"], string> = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-slate-200 text-slate-600",
};

export function RoomStatusBadge({ status }: { status: Room["status"] }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold uppercase ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}
