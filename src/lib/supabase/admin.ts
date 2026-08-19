import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Privileged Supabase client using the service-role key.
 *
 * Bypasses Row Level Security entirely — only import this from trusted
 * server-side code (Route Handlers, Server Actions, server components that
 * never forward raw data to the client without checking authorization).
 *
 * The `server-only` import above makes bundling this into a Client
 * Component a build-time error, not just a code-review concern.
 *
 * SUPABASE_SERVICE_ROLE_KEY must never be prefixed with NEXT_PUBLIC_ and
 * must never be logged, returned in an API response, or committed to git.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase admin client is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
