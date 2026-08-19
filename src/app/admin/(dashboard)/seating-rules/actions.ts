"use server";

import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/admin/audit";
import { saveSeatingRuleSet } from "@/lib/admin/seating-rules-io";
import type { SeatingRuleFormState } from "@/components/admin/SeatingRuleForm";

export async function saveGlobalSeatingRulesAction(
  _prevState: SeatingRuleFormState,
  formData: FormData
): Promise<SeatingRuleFormState> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const supabase = await createSupabaseServerClient();

  const result = await saveSeatingRuleSet(supabase, "global", null, formData);
  if (!result.ok) return { formError: result.error };

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "seating_rules_updated",
    entityType: "seating_rules",
  });

  redirect("/admin/seating-rules");
}
