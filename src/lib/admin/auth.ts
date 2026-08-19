import "server-only";

import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AdminProfile } from "@/types/database";

export interface AdminSession {
  user: User;
  profile: AdminProfile;
}

/**
 * Returns the current signed-in admin (auth user + admin_profiles row), or
 * null for any reason they shouldn't be treated as an authorized admin:
 * not signed in, no admin_profiles row, or is_active = false. Callers
 * decide how to respond — this function never redirects, so it's usable
 * from both pages (redirect to /admin/login) and future API routes
 * (respond 401 JSON).
 *
 * Never throws: if Supabase isn't configured yet, this resolves to null
 * (treated as "not signed in") rather than crashing the page.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return null;
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("admin_profiles")
    .select("*")
    .eq("id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (profileError || !profile) return null;

  return { user, profile };
}
