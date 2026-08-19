import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/admin/audit";
import { loadSeatingRuleSetInput } from "@/lib/admin/seating-rules-io";

/** Import/Export architecture (approved) — Seating Rules config export.
 * JSON, not Excel (it's one small structured object, not tabular data). No
 * new database structure — reads the exact same shape the Seating Rules
 * form already edits. */
export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const input = await loadSeatingRuleSetInput(supabase, "global", null);

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "seating_rules_exported",
    entityType: "seating_rules",
  });

  const body = JSON.stringify(input, null, 2);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="SEATING_RULES_GLOBAL.json"',
    },
  });
}
