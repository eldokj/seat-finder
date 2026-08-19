import Link from "next/link";
import { SeatingRulesImportForm } from "./SeatingRulesImportForm";

export default function SeatingRulesImportExportPage() {
  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <Link href="/admin/seating-rules" className="text-sm font-medium text-slate-500 hover:text-slate-700">
          ← Back to Seating Rules
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-slate-900">Seating Rules — Import JSON</h1>
      <p className="mt-1 text-sm text-slate-500">
        Upload a JSON file previously downloaded via Export JSON — from this college, or copied from
        another configuration you want to reuse. It&apos;s validated against the exact same rules the
        Seating Rules form itself enforces before anything is saved. This replaces the{" "}
        <strong>global default</strong> rule set only.
      </p>

      <div className="mt-6">
        <SeatingRulesImportForm />
      </div>
    </div>
  );
}
