"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

/**
 * Supabase client for use in Client Components.
 *
 * Uses the public anon key only — this is safe to ship to the browser.
 * With RLS enabled and no anon policies yet (see supabase/migrations),
 * this client currently has no read/write access to any table until later
 * phases add scoped policies. Prefer server-side data access
 * (`lib/supabase/server.ts` or `lib/supabase/admin.ts`) wherever possible.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return createBrowserClient<Database>(url, anonKey);
}
