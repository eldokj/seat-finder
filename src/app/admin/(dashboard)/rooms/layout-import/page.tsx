import Link from "next/link";
import { RoomLayoutImportForm } from "./RoomLayoutImportForm";

export default function RoomLayoutImportPage() {
  return (
    <div className="max-w-4xl">
      <div className="mb-4">
        <Link href="/admin/rooms" className="text-sm font-medium text-slate-500 hover:text-slate-700">
          ← Back to Rooms
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-slate-900">Room Layout Import</h1>
      <p className="mt-1 text-sm text-slate-500">
        Bulk create or replace a room&apos;s exact seat layout from an Excel file — one row per
        position. The target room must already exist. A seat that&apos;s already allocated to a
        student is never deleted or relabeled by this import; the affected room&apos;s save is
        rejected instead, same protection as the visual Room Layout editor.
      </p>

      <div className="mt-6">
        <RoomLayoutImportForm />
      </div>
    </div>
  );
}
