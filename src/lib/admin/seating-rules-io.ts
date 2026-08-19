import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, SeatingRuleScope } from "@/types/database";
import {
  seatingRuleSetInputSchema,
  buildSeatingRuleRows,
  seatingRuleRowsToInput,
  parseSeatingRuleSetFormData,
  type SeatingRuleSetInput,
} from "@/lib/validation/seating-rule";

/**
 * I/O wrapper around the pure seating-rule.ts logic — reused by both the
 * event-scoped and global Seating Rules screens, so the "replace all rows
 * for this scope" write only exists once.
 */
export async function saveSeatingRuleSet(
  supabase: SupabaseClient<Database>,
  scope: SeatingRuleScope,
  eventId: string | null,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = seatingRuleSetInputSchema.safeParse(parseSeatingRuleSetFormData(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid seating rules." };
  }
  return writeSeatingRuleSet(supabase, scope, eventId, parsed.data);
}

/**
 * Import/Export architecture (approved) — same write, but for a plain
 * parsed-JSON value (Seating Rules JSON import) instead of a form
 * submission. Validated against the exact same
 * `seatingRuleSetInputSchema` — no new database structure, no separate
 * validation rules from the form-based screens.
 */
export async function saveSeatingRuleSetFromInput(
  supabase: SupabaseClient<Database>,
  scope: SeatingRuleScope,
  eventId: string | null,
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = seatingRuleSetInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid seating rules." };
  }
  return writeSeatingRuleSet(supabase, scope, eventId, parsed.data);
}

async function writeSeatingRuleSet(
  supabase: SupabaseClient<Database>,
  scope: SeatingRuleScope,
  eventId: string | null,
  data: SeatingRuleSetInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = buildSeatingRuleRows(data, scope, eventId);
  const ruleTypes = rows.map((r) => r.rule_type);

  const deleteBase = supabase.from("seating_rules").delete().eq("scope", scope).in("rule_type", ruleTypes);
  const { error: deleteError } = eventId
    ? await deleteBase.eq("daily_examination_event_id", eventId)
    : await deleteBase.is("daily_examination_event_id", null);
  if (deleteError) return { ok: false, error: "Unable to save seating rules. Please try again." };

  const { error: insertError } = await supabase.from("seating_rules").insert(rows);
  if (insertError) return { ok: false, error: "Unable to save seating rules. Please try again." };

  return { ok: true };
}

export async function loadSeatingRuleSetInput(
  supabase: SupabaseClient<Database>,
  scope: SeatingRuleScope,
  eventId: string | null
): Promise<SeatingRuleSetInput> {
  const selectBase = supabase.from("seating_rules").select("rule_type, is_active, parameters").eq("scope", scope);
  const { data } = eventId
    ? await selectBase.eq("daily_examination_event_id", eventId)
    : await selectBase.is("daily_examination_event_id", null);
  return seatingRuleRowsToInput(data ?? []);
}
