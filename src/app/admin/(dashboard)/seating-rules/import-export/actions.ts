"use server";

import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/admin/audit";
import { saveSeatingRuleSetFromInput, loadSeatingRuleSetInput } from "@/lib/admin/seating-rules-io";
import { seatingRuleSetInputSchema, type SeatingRuleSetInput } from "@/lib/validation/seating-rule";

export interface SeatingRulesImportPreviewState {
  ok: boolean;
  error?: string;
  parsed?: SeatingRuleSetInput;
  current?: SeatingRuleSetInput;
}

export interface SeatingRulesImportActionResult {
  ok: boolean;
  error?: string;
}

async function readAndValidate(file: File): Promise<{ ok: true; data: SeatingRuleSetInput } | { ok: false; error: string }> {
  if (!file.name.toLowerCase().endsWith(".json")) {
    return { ok: false, error: "Please upload a .json file (the one downloaded via Export JSON)." };
  }
  const MAX_JSON_BYTES = 64 * 1024; // this is one small config object — anything larger isn't a legitimate export
  if (file.size === 0 || file.size > MAX_JSON_BYTES) {
    return { ok: false, error: "The uploaded file is empty or unexpectedly large." };
  }

  let text: string;
  let raw: unknown;
  try {
    text = await file.text();
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }

  const parsed = seatingRuleSetInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "This JSON doesn't match the expected seating rules shape." };
  }

  return { ok: true, data: parsed.data };
}

/** Preview never writes — re-validated independently by Confirm against a
 * fresh upload of the same file, same "never trust the browser" discipline
 * as every other importer in this project. */
export async function previewSeatingRulesImportAction(formData: FormData): Promise<SeatingRulesImportPreviewState> {
  const adminSession = await getAdminSession();
  if (!adminSession) redirect("/admin/login");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file to preview." };

  const result = await readAndValidate(file);
  if (!result.ok) return { ok: false, error: result.error };

  const supabase = await createSupabaseServerClient();
  const current = await loadSeatingRuleSetInput(supabase, "global", null);

  return { ok: true, parsed: result.data, current };
}

export async function importSeatingRulesImportAction(formData: FormData): Promise<SeatingRulesImportActionResult> {
  const adminSession = await getAdminSession();
  if (!adminSession) redirect("/admin/login");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file to import." };

  const result = await readAndValidate(file);
  if (!result.ok) return { ok: false, error: result.error };

  const supabase = await createSupabaseServerClient();
  const before = await loadSeatingRuleSetInput(supabase, "global", null);

  const saveResult = await saveSeatingRuleSetFromInput(supabase, "global", null, result.data);
  if (!saveResult.ok) return { ok: false, error: saveResult.error };

  await logAuditEvent(supabase, {
    adminId: adminSession.user.id,
    action: "seating_rules_imported",
    entityType: "seating_rules",
    oldValue: before,
    newValue: result.data,
  });

  return { ok: true };
}
