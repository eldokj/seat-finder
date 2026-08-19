import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16 renamed the "middleware" file convention to "proxy" (same
// mechanism, new name/file/export) — see AGENTS.md and
// node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Scoped to the admin area only. The public student search page is the
  // high-traffic path (see docs/SCHEMA.md performance notes) and has no
  // session to refresh, so it must not pay for this middleware.
  matcher: ["/admin/:path*"],
};
