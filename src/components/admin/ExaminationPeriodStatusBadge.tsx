import type { ExaminationPeriod } from "@/types/database";

const STATUS_STYLES: Record<ExaminationPeriod["status"], string> = {
  active: "bg-green-100 text-green-800",
  closed: "bg-slate-800 text-white",
};

export function ExaminationPeriodStatusBadge({ status }: { status: ExaminationPeriod["status"] }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold uppercase ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}
