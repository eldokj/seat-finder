"use server";

import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/admin/audit";
import { saveSeatingRuleSet } from "@/lib/admin/seating-rules-io";
import type { SeatingRuleFormState } from "@/components/admin/SeatingRuleForm";

export async function saveEventSeatingRulesAction(
  eventId: string,
  _prevState: SeatingRuleFormState,
  formData: FormData
): Promise<SeatingRuleFormState> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const supabase = await createSupabaseServerClient();

  const { data: event } = await supabase.from("daily_examination_events").select("id").eq("id", eventId).maybeSingle();
  if (!event) return { formError: "This Daily Exam Session no longer exists." };

  const result = await saveSeatingRuleSet(supabase, "daily_examination_event", eventId, formData);
  if (!result.ok) return { formError: result.error };

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "seating_rules_updated",
    entityType: "daily_examination_event",
    entityId: eventId,
  });

  redirect(`/admin/daily-events/${eventId}`);
}
