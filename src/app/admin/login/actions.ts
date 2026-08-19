"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/admin/audit";

export interface LoginState {
  error?: string;
}

export async function signInAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Please enter both email and password." };
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return { error: "Admin login is not available yet. Please contact the site administrator." };
  }

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signInData.user) {
    return { error: "Invalid email or password." };
  }

  const { data: profile } = await supabase
    .from("admin_profiles")
    .select("id, is_active")
    .eq("id", signInData.user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return { error: "This account is not authorized for admin access. Contact the COE Office." };
  }

  await logAuditEvent(supabase, { adminId: signInData.user.id, action: "login" });

  redirect("/admin");
}
