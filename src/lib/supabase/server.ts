import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

/**
 * Supabase client for use in Server Components, Server Actions, and Route
 * Handlers. Reads/writes the Supabase auth session via cookies, so it acts
 * as "whoever is currently logged in" (or anonymous) — subject to RLS.
 *
 * Use this for anything that should respect the signed-in admin's identity
 * (e.g. so `auth.uid()` is available to RLS policies and audit logging).
 * For privileged operations that must bypass RLS entirely (service-role),
 * use `lib/supabase/admin.ts` instead.
 */
export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render (not a Route Handler or
          // Server Action) — cookies() is read-only there. Safe to ignore
          // as long as session refresh also happens in middleware/route
          // handlers, which own the response.
        }
      },
    },
  });
}
