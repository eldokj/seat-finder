import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session cookie on admin requests. This is the
 * standard @supabase/ssr proxy/middleware pattern: without it, an access
 * token can expire mid-session and Server Components would see a
 * stale/invalid session even though the user is still "logged in" from
 * their perspective.
 *
 * Only ever called for /admin/* (see src/proxy.ts matcher) — the public
 * student search path must stay fast and has no session to refresh.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // Supabase not configured yet — let the request through. The admin
    // layout's own auth check will redirect to /admin/login regardless.
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Do not remove: this call is what actually refreshes the token and
  // triggers setAll() above when needed.
  await supabase.auth.getUser();

  return supabaseResponse;
}
