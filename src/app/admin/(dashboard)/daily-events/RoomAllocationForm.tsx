"use client";

import { useActionState } from "react";
import type { RoomAllocationFormState } from "./actions";

interface RoomOption {
  id: string;
  room_number: string;
  code: string;
  usable_seats: number;
  additional_seats: number;
}

interface RoomAllocationFormProps {
  action: (prevState: RoomAllocationFormState, formData: FormData) => Promise<RoomAllocationFormState>;
  rooms: RoomOption[];
  selectedRoomIds: string[];
}

const initialState: RoomAllocationFormState = {};

export function RoomAllocationForm({ action, rooms, selectedRoomIds }: RoomAllocationFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  if (rooms.length === 0) {
    return <p className="text-sm text-slate-500">No active rooms yet — add one under Rooms first.</p>;
  }

  return (
    <form action={formAction} className="space-y-3">
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {rooms.map((room) => (
          <label key={room.id} className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-slate-50">
            <span className="flex items-center gap-3">
              <input
                type="checkbox"
                name="room_ids"
                value={room.id}
                defaultChecked={selectedRoomIds.includes(room.id)}
                disabled={isPending}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="font-medium text-slate-900">{room.room_number}</span>
              <span className="text-xs text-slate-400">{room.code}</span>
            </span>
            <span className="text-slate-500">
              {room.usable_seats} seats{room.additional_seats > 0 && ` (+${room.additional_seats} additional)`}
            </span>
          </label>
        ))}
      </div>

      {state.formError && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {state.formError}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isPending ? "Saving…" : "Save Room Allocation"}
      </button>
    </form>
  );
}
