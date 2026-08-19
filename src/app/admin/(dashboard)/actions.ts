"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/admin/audit";

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await logAuditEvent(supabase, { adminId: user.id, action: "logout" });
  }

  await supabase.auth.signOut();
  redirect("/admin/login");
}
