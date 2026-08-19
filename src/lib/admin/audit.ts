import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

interface LogAuditEventInput {
  adminId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
}

/**
 * Records an admin action to audit_logs (see section 22 of the spec: login,
 * exam created, seating published, seat changed, etc). Reused across every
 * phase that performs an auditable admin action.
 *
 * Never throws — a failure to write an audit entry must not block the
 * admin action it's describing. Errors are logged server-side for
 * investigation instead.
 */
export async function logAuditEvent(
  supabase: SupabaseClient<Database>,
  { adminId, action, entityType, entityId, oldValue, newValue }: LogAuditEventInput
): Promise<void> {
  const { error } = await supabase.from("audit_logs").insert({
    admin_id: adminId,
    action,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
    old_value: oldValue ?? null,
    new_value: newValue ?? null,
  });

  if (error) {
    console.error("Failed to write audit log entry:", { action, entityType, entityId, error });
  }
}
