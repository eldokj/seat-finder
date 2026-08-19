import { z } from "zod";
import { SEAT_PATTERNS } from "./room-layout";
import type { SeatingRule, SeatingRuleScope, SeatingRuleType, SeatingRulePriorityTier } from "@/types/database";

/**
 * Phase 7 — Seating Rules configuration. Pure, I/O-free: validates the
 * flattened form input, and converts it to/from the `seating_rules` row
 * shape. The I/O layer (route actions) does the actual reads/writes.
 *
 * There is deliberately NO standalone "custom grouping" setting. Per the
 * approved decision, "grouping" is realized entirely through row_jump /
 * column_jump's own `group_by` (any combination of programme/department/
 * course) — Allocation Pattern, Row Jump, and Column Jump stay separate,
 * self-contained settings; nothing shares a hidden global "grouping" knob.
 */

export const SEATING_GROUP_BY_FIELDS = ["programme", "department", "course"] as const;
export type SeatingGroupByField = (typeof SEATING_GROUP_BY_FIELDS)[number];

const jumpRuleSchema = z
  .object({
    enabled: z.boolean(),
    gap: z.coerce.number("Gap must be a number.").int("Gap must be a whole number.").positive("Gap must be 1 or more.").optional(),
    group_by: z.array(z.enum(SEATING_GROUP_BY_FIELDS)).optional(),
  })
  .refine((data) => !data.enabled || (data.gap != null && (data.group_by?.length ?? 0) >= 1), {
    message: "Set a gap of 1 or more and select at least one group (Programme/Department/Course) when enabled.",
    path: ["gap"],
  });

export const seatingRuleSetInputSchema = z.object({
  allocation_pattern: z.enum(SEAT_PATTERNS),
  row_jump: jumpRuleSchema,
  column_jump: jumpRuleSchema,
  avoid_same_programme_adjacent: z.boolean(),
  avoid_same_department_adjacent: z.boolean(),
  avoid_same_course_adjacent: z.boolean(),
});

export type SeatingRuleSetInput = z.infer<typeof seatingRuleSetInputSchema>;

/** Pulls the SeatingRuleSetInput shape out of a FormData submission. Every
 * checkbox is present-or-absent (never a literal "false"), and group_by is
 * a repeated field (`getAll`). */
export function parseSeatingRuleSetFormData(formData: FormData): unknown {
  return {
    allocation_pattern: formData.get("allocation_pattern"),
    row_jump: {
      enabled: formData.get("row_jump_enabled") === "on",
      gap: formData.get("row_jump_gap") || undefined,
      group_by: formData.getAll("row_jump_group_by"),
    },
    column_jump: {
      enabled: formData.get("column_jump_enabled") === "on",
      gap: formData.get("column_jump_gap") || undefined,
      group_by: formData.getAll("column_jump_group_by"),
    },
    avoid_same_programme_adjacent: formData.get("avoid_same_programme_adjacent") === "on",
    avoid_same_department_adjacent: formData.get("avoid_same_department_adjacent") === "on",
    avoid_same_course_adjacent: formData.get("avoid_same_course_adjacent") === "on",
  };
}

export interface SeatingRuleRowDraft {
  scope: SeatingRuleScope;
  daily_examination_event_id: string | null;
  rule_type: SeatingRuleType;
  priority_tier: SeatingRulePriorityTier;
  is_active: boolean;
  parameters: Record<string, unknown>;
}

/** Converts validated form input into the full set of `seating_rules` rows
 * this rule set represents — always all 6 rule_types, `is_active` carrying
 * the on/off state rather than the row's mere presence, so the I/O layer
 * can do one clean "replace all rows for this scope" write. Allocation
 * Pattern has no on/off switch — a pattern is always in effect (defaults to
 * row_wise), so it's always active, same as Phase 6's numbering_scheme. */
export function buildSeatingRuleRows(
  input: SeatingRuleSetInput,
  scope: SeatingRuleScope,
  eventId: string | null
): SeatingRuleRowDraft[] {
  const base = { scope, daily_examination_event_id: eventId };
  return [
    { ...base, rule_type: "allocation_pattern", priority_tier: "preference", is_active: true, parameters: { pattern: input.allocation_pattern } },
    {
      ...base,
      rule_type: "row_jump",
      priority_tier: "high",
      is_active: input.row_jump.enabled,
      parameters: input.row_jump.enabled ? { gap: input.row_jump.gap, group_by: input.row_jump.group_by } : {},
    },
    {
      ...base,
      rule_type: "column_jump",
      priority_tier: "high",
      is_active: input.column_jump.enabled,
      parameters: input.column_jump.enabled ? { gap: input.column_jump.gap, group_by: input.column_jump.group_by } : {},
    },
    { ...base, rule_type: "avoid_same_programme_adjacent", priority_tier: "high", is_active: input.avoid_same_programme_adjacent, parameters: {} },
    { ...base, rule_type: "avoid_same_department_adjacent", priority_tier: "high", is_active: input.avoid_same_department_adjacent, parameters: {} },
    { ...base, rule_type: "avoid_same_course_adjacent", priority_tier: "high", is_active: input.avoid_same_course_adjacent, parameters: {} },
  ];
}

const DEFAULT_INPUT: SeatingRuleSetInput = {
  allocation_pattern: "row_wise",
  row_jump: { enabled: false },
  column_jump: { enabled: false },
  avoid_same_programme_adjacent: false,
  avoid_same_department_adjacent: false,
  avoid_same_course_adjacent: false,
};

/** Reverse direction — hydrates form default values from existing rows
 * (read side), so the config screen shows current state, not always blank. */
export function seatingRuleRowsToInput(rows: Pick<SeatingRule, "rule_type" | "is_active" | "parameters">[]): SeatingRuleSetInput {
  const byType = new Map(rows.map((row) => [row.rule_type, row]));
  const input: SeatingRuleSetInput = structuredClone(DEFAULT_INPUT);

  const pattern = byType.get("allocation_pattern");
  if (pattern && typeof pattern.parameters.pattern === "string") {
    input.allocation_pattern = pattern.parameters.pattern as SeatingRuleSetInput["allocation_pattern"];
  }

  for (const key of ["row_jump", "column_jump"] as const) {
    const row = byType.get(key);
    if (row) {
      input[key] = {
        enabled: row.is_active,
        gap: typeof row.parameters.gap === "number" ? row.parameters.gap : undefined,
        group_by: Array.isArray(row.parameters.group_by) ? (row.parameters.group_by as SeatingGroupByField[]) : undefined,
      };
    }
  }

  for (const key of ["avoid_same_programme_adjacent", "avoid_same_department_adjacent", "avoid_same_course_adjacent"] as const) {
    const row = byType.get(key);
    if (row) input[key] = row.is_active;
  }

  return input;
}
