"use client";

import { useActionState } from "react";
import { TextField } from "@/components/admin/form-fields";
import type { RoomFormState } from "./actions";
import type { Room } from "@/types/database";

const initialState: RoomFormState = {};

interface RoomFormProps {
  mode: "create" | "edit";
  action: (prevState: RoomFormState, formData: FormData) => Promise<RoomFormState>;
  defaultValues?: Pick<
    Room,
    "room_number" | "code" | "block" | "floor" | "landmark" | "usable_seats" | "additional_seats" | "display_order"
  >;
  /** True once this room has a saved Room Layout (Phase 6). Usable Seats
   * and Additional Seats are then derived from the layout — editable only
   * from the Layout screen, so this form shows them read-only instead of
   * accepting a conflicting manual value. */
  hasLayout?: boolean;
}

export function RoomForm({ mode, action, defaultValues, hasLayout = false }: RoomFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <TextField
        label="Room Number"
        name="room_number"
        required
        defaultValue={defaultValues?.room_number}
        error={state.errors?.room_number}
        disabled={isPending}
        placeholder="e.g. M101"
      />

      <TextField
        label="Room Code"
        name="code"
        required
        defaultValue={defaultValues?.code}
        error={state.errors?.code}
        disabled={isPending}
        placeholder="e.g. M1"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Block"
          name="block"
          defaultValue={defaultValues?.block ?? ""}
          error={state.errors?.block}
          disabled={isPending}
          placeholder="e.g. Main Block"
        />

        <TextField
          label="Floor"
          name="floor"
          defaultValue={defaultValues?.floor ?? ""}
          error={state.errors?.floor}
          disabled={isPending}
          placeholder="e.g. Ground Floor"
        />
      </div>

      <TextField
        label="Landmark"
        name="landmark"
        defaultValue={defaultValues?.landmark ?? ""}
        error={state.errors?.landmark}
        disabled={isPending}
        placeholder="e.g. Near the library"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label={hasLayout ? "Usable Seats (from Layout)" : "Usable Seats"}
          name="usable_seats"
          type="number"
          min={1}
          required
          defaultValue={defaultValues?.usable_seats}
          error={state.errors?.usable_seats}
          disabled={isPending}
          readOnly={hasLayout}
          placeholder="e.g. 45"
        />

        <TextField
          label={hasLayout ? "Additional Seats (from Layout)" : "Additional Seats"}
          name="additional_seats"
          type="number"
          min={0}
          defaultValue={defaultValues?.additional_seats ?? 0}
          error={state.errors?.additional_seats}
          disabled={isPending}
          readOnly={hasLayout}
        />

        <TextField
          label="Display Order"
          name="display_order"
          type="number"
          defaultValue={defaultValues?.display_order ?? 0}
          error={state.errors?.display_order}
          disabled={isPending}
        />
      </div>

      {hasLayout && (
        <p className="text-xs text-slate-400">
          Usable Seats and Additional Seats are derived from this room&apos;s saved Layout — edit them there.
        </p>
      )}

      {state.formError && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {state.formError}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isPending ? "Saving…" : mode === "create" ? "Create Room" : "Save Changes"}
      </button>

      {!hasLayout && (
        <p className="text-xs text-slate-400">
          Rows, columns, and seat numbering are configured on the room&apos;s Layout screen.
        </p>
      )}
    </form>
  );
}
