import Link from "next/link";
import { RoomImportForm } from "./RoomImportForm";

export default function RoomImportPage() {
  return (
    <div className="max-w-3xl">
      <div className="mb-4">
        <Link href="/admin/rooms" className="text-sm font-medium text-slate-500 hover:text-slate-700">
          ← Back to Rooms
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-slate-900">Room Master Import</h1>
      <p className="mt-1 text-sm text-slate-500">
        Bulk create or update rooms from an Excel file. Rows and Columns are informational only — used
        just to estimate a brand-new room&apos;s starting capacity. They never generate or change a
        room&apos;s actual seat layout; use the{" "}
        <Link href="/admin/rooms" className="font-semibold text-slate-700 underline">
          Room Layout editor
        </Link>{" "}
        (or Room Layout Import) for that. If a room already has a saved layout, its capacity is left
        untouched by this import.
      </p>

      <div className="mt-6">
        <RoomImportForm />
      </div>
    </div>
  );
}
