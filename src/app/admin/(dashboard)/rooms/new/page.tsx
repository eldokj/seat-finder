import { RoomForm } from "../RoomForm";
import { createRoomAction } from "../actions";

export default function NewRoomPage() {
  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-slate-900">New Room</h1>
      <p className="mt-1 text-sm text-slate-500">Room code must be unique (e.g. M1).</p>

      <div className="mt-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <RoomForm mode="create" action={createRoomAction} />
      </div>
    </div>
  );
}
