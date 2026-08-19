"use client";

import { useActionState } from "react";
import { SelectField } from "@/components/admin/form-fields";
import type { SeatingRuleSetInput, SeatingGroupByField } from "@/lib/validation/seating-rule";

export interface SeatingRuleFormState {
  formError?: string;
}

const initialState: SeatingRuleFormState = {};

const PATTERN_OPTIONS = [
  { value: "row_wise", label: "Row-wise" },
  { value: "column_wise", label: "Column-wise" },
  { value: "serpentine_row", label: "Serpentine (row)" },
  { value: "serpentine_column", label: "Serpentine (column)" },
  { value: "custom", label: "Custom (seat order as arranged in Room Layout)" },
];

const GROUP_BY_OPTIONS: { value: SeatingGroupByField; label: string }[] = [
  { value: "programme", label: "Programme" },
  { value: "department", label: "Department" },
  { value: "course", label: "Course" },
];

interface SeatingRuleFormProps {
  action: (prevState: SeatingRuleFormState, formData: FormData) => Promise<SeatingRuleFormState>;
  defaultValues: SeatingRuleSetInput;
  scopeDescription: string;
}

export function SeatingRuleForm({ action, defaultValues, scopeDescription }: SeatingRuleFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-8" noValidate>
      <p className="text-sm text-slate-500">These rules apply to {scopeDescription}.</p>

      <section>
        <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">Allocation Pattern</h3>
        <p className="mb-3 text-xs text-slate-400">
          The fill order automatic allocation uses when placing students into seats — independent of Row Jump and
          Column Jump below, and independent of how a room&apos;s own seats happen to be labeled.
        </p>
        <SelectField
          label="Pattern"
          name="allocation_pattern"
          defaultValue={defaultValues.allocation_pattern}
          disabled={isPending}
          options={PATTERN_OPTIONS}
        />
      </section>

      <section>
        <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">Row Jump</h3>
        <p className="mb-3 text-xs text-slate-400">
          The value represents the <strong>minimum row distance</strong> required between two students who belong to
          the same configured group (e.g. same Programme). A gap of 2 means students from the same group must be at
          least 2 rows apart. Separate from Allocation Pattern and Column Jump.
        </p>
        <JumpRuleFields prefix="row_jump" defaultValues={defaultValues.row_jump} disabled={isPending} />
      </section>

      <section>
        <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">Column Jump</h3>
        <p className="mb-3 text-xs text-slate-400">
          The value represents the <strong>minimum column distance</strong> required between two students who belong
          to the same configured group. Separate from Allocation Pattern and Row Jump.
        </p>
        <JumpRuleFields prefix="column_jump" defaultValues={defaultValues.column_jump} disabled={isPending} />
      </section>

      <section>
        <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">Separation</h3>
        <p className="mb-3 text-xs text-slate-400">
          Avoid seating two students physically next to each other (same row or column, immediately adjacent) when
          they share the selected attribute.
        </p>
        <div className="space-y-2">
          <CheckboxField
            name="avoid_same_programme_adjacent"
            label="Avoid same Programme adjacent"
            defaultChecked={defaultValues.avoid_same_programme_adjacent}
            disabled={isPending}
          />
          <CheckboxField
            name="avoid_same_department_adjacent"
            label="Avoid same Department adjacent"
            defaultChecked={defaultValues.avoid_same_department_adjacent}
            disabled={isPending}
          />
          <CheckboxField
            name="avoid_same_course_adjacent"
            label="Avoid same Course adjacent"
            defaultChecked={defaultValues.avoid_same_course_adjacent}
            disabled={isPending}
          />
        </div>
      </section>

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
        {isPending ? "Saving…" : "Save Seating Rules"}
      </button>
    </form>
  );
}

function JumpRuleFields({
  prefix,
  defaultValues,
  disabled,
}: {
  prefix: "row_jump" | "column_jump";
  defaultValues: SeatingRuleSetInput["row_jump"];
  disabled: boolean;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-4">
      <CheckboxField
        name={`${prefix}_enabled`}
        label={`Enable ${prefix === "row_jump" ? "Row Jump" : "Column Jump"}`}
        defaultChecked={defaultValues.enabled}
        disabled={disabled}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${prefix}_gap`} className="mb-1.5 block text-sm font-semibold text-slate-700">
            Minimum {prefix === "row_jump" ? "row" : "column"} distance
          </label>
          <input
            id={`${prefix}_gap`}
            name={`${prefix}_gap`}
            type="number"
            min={1}
            defaultValue={defaultValues.gap ?? ""}
            disabled={disabled}
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-base text-slate-900 outline-none transition focus:border-slate-600 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100"
          />
        </div>
        <fieldset>
          <legend className="mb-1.5 block text-sm font-semibold text-slate-700">Applies to group</legend>
          <div className="flex flex-wrap gap-3">
            {GROUP_BY_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-1.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name={`${prefix}_group_by`}
                  value={opt.value}
                  defaultChecked={defaultValues.group_by?.includes(opt.value) ?? false}
                  disabled={disabled}
                  className="h-4 w-4 rounded border-slate-300"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </div>
  );
}

function CheckboxField({
  name,
  label,
  defaultChecked,
  disabled,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
  disabled: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} disabled={disabled} className="h-4 w-4 rounded border-slate-300" />
      {label}
    </label>
  );
}
