"use client";

import { useActionState } from "react";
import Link from "next/link";
import { TextField, SelectField } from "@/components/admin/form-fields";
import type { DailyEventFormState } from "./actions";
import type { DailyExaminationEvent } from "@/types/database";
import { formatLongDate } from "@/lib/utils/date";

const initialState: DailyEventFormState = {};

interface PeriodOption {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

interface DailyEventFormProps {
  mode: "create" | "edit";
  action: (prevState: DailyEventFormState, formData: FormData) => Promise<DailyEventFormState>;
  periods: PeriodOption[];
  defaultValues?: Pick<DailyExaminationEvent, "exam_date" | "session" | "start_time" | "end_time" | "examination_period_id">;
}

export function DailyEventForm({ mode, action, periods, defaultValues }: DailyEventFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  if (periods.length === 0) {
    return (
      <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
        No examination periods yet.{" "}
        <Link href="/admin/examination-periods/new" className="font-semibold underline">
          Create one first
        </Link>{" "}
        — every Daily Exam Session belongs to an examination period.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <SelectField
        label="Examination Period"
        name="examination_period_id"
        required
        defaultValue={defaultValues?.examination_period_id ?? ""}
        error={state.errors?.examination_period_id}
        disabled={isPending}
        placeholder="Select examination period"
        options={periods.map((p) => ({
          value: p.id,
          label: `${p.name} (${formatLongDate(p.start_date)} – ${formatLongDate(p.end_date)})`,
        }))}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Exam Date"
          name="exam_date"
          type="date"
          required
          defaultValue={defaultValues?.exam_date}
          error={state.errors?.exam_date}
          disabled={isPending}
        />

        <SelectField
          label="Session"
          name="session"
          required
          defaultValue={defaultValues?.session}
          error={state.errors?.session}
          disabled={isPending}
          placeholder="Select session"
          options={[
            { value: "FN", label: "FN (Forenoon)" },
            { value: "AN", label: "AN (Afternoon)" },
          ]}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Start Time"
          name="start_time"
          type="time"
          defaultValue={defaultValues?.start_time ?? ""}
          error={state.errors?.start_time}
          disabled={isPending}
        />

        <TextField
          label="End Time"
          name="end_time"
          type="time"
          defaultValue={defaultValues?.end_time ?? ""}
          error={state.errors?.end_time}
          disabled={isPending}
        />
      </div>

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
        {isPending ? "Saving…" : mode === "create" ? "Create Daily Exam Session" : "Save Changes"}
      </button>

      <p className="text-xs text-slate-400">
        Programme, course, and strength are added afterward as Master Timetable Records — upload the
        Master Timetable and this normally happens automatically instead of creating sessions by hand.
      </p>
    </form>
  );
}
