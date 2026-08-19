import type { DailyExaminationEvent } from "@/types/database";

const STATUS_STYLES: Record<DailyExaminationEvent["status"], string> = {
  draft: "bg-slate-200 text-slate-700",
  published: "bg-green-100 text-green-800",
  closed: "bg-slate-800 text-white",
};

export function DailyEventStatusBadge({ status }: { status: DailyExaminationEvent["status"] }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold uppercase ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}
