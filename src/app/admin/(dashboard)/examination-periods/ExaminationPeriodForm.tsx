"use client";

import { useActionState } from "react";
import { TextField, SelectField } from "@/components/admin/form-fields";
import type { ExaminationPeriodFormState } from "./actions";
import type { ExaminationPeriod } from "@/types/database";

const initialState: ExaminationPeriodFormState = {};

interface ExaminationPeriodFormProps {
  mode: "create" | "edit";
  action: (prevState: ExaminationPeriodFormState, formData: FormData) => Promise<ExaminationPeriodFormState>;
  defaultValues?: Pick<ExaminationPeriod, "name" | "start_date" | "end_date" | "status">;
}

export function ExaminationPeriodForm({ mode, action, defaultValues }: ExaminationPeriodFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <TextField
        label="Examination Name"
        name="name"
        required
        defaultValue={defaultValues?.name}
        error={state.errors?.name}
        disabled={isPending}
        placeholder="e.g. Mid Semester Examination"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Start Date"
          name="start_date"
          type="date"
          required
          defaultValue={defaultValues?.start_date}
          error={state.errors?.start_date}
          disabled={isPending}
        />

        <TextField
          label="End Date"
          name="end_date"
          type="date"
          required
          defaultValue={defaultValues?.end_date}
          error={state.errors?.end_date}
          disabled={isPending}
        />
      </div>

      <SelectField
        label="Status"
        name="status"
        defaultValue={defaultValues?.status ?? "active"}
        error={state.errors?.status}
        disabled={isPending}
        options={[
          { value: "active", label: "Active" },
          { value: "closed", label: "Closed" },
        ]}
      />

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
        {isPending ? "Saving…" : mode === "create" ? "Create Examination Period" : "Save Changes"}
      </button>

      <p className="text-xs text-slate-400">
        Every timetable date uploaded under this examination must fall between the start and end
        date above.
      </p>
    </form>
  );
}
