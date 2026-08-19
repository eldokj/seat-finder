import { NextResponse } from "next/server";
import { isValidRegisterNumberInput, normalizeRegisterNumber } from "@/lib/utils/register-number";
import { getTodayDateString } from "@/lib/utils/date";
import { STUDENT_MESSAGES } from "@/lib/config/messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { classifySeatLookup } from "@/lib/validation/public-seat-lookup";
import { InMemoryRateLimiter, getClientIp } from "@/lib/rate-limit";
import type { PublicSeatResult } from "@/types/database";

/**
 * Public register-number → seat lookup.
 *
 * Phase 8. Uses the plain anon-key server client (createSupabaseServerClient)
 * — NEVER the service-role/admin client — for the highest-exposure route in
 * this app. Both RPC functions it calls are SECURITY DEFINER and are the
 * only path past RLS for this data; every other table stays exactly as
 * closed to anon as before (see supabase/migrations/0008_public_seat_lookup.sql).
 *
 * "Today" is computed once here via getTodayDateString() (the college's
 * configured IANA timezone) and passed to both RPCs as a parameter — the
 * database never derives "today" on its own.
 *
 * Phase 10: rate-limited via a best-effort, per-process in-memory limiter
 * (see lib/rate-limit.ts's doc comment for why this is deliberately not a
 * distributed limiter) — module-scoped so the counters persist across
 * requests handled by the same server process.
 */
const rateLimiter = new InMemoryRateLimiter({ limit: 20, windowMs: 60_000 });

export async function POST(request: Request) {
  const rateLimitResult = rateLimiter.check(getClientIp(request));
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: STUDENT_MESSAGES.tooManyRequests },
      { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: STUDENT_MESSAGES.genericError }, { status: 400 });
  }

  const registerNumber =
    typeof body === "object" && body !== null && "registerNumber" in body
      ? String((body as { registerNumber: unknown }).registerNumber ?? "")
      : "";

  if (!isValidRegisterNumberInput(registerNumber)) {
    return NextResponse.json({ error: STUDENT_MESSAGES.emptyRegisterNumber }, { status: 400 });
  }

  const normalized = normalizeRegisterNumber(registerNumber);
  const today = getTodayDateString();

  try {
    const supabase = await createSupabaseServerClient();

    const [{ data: eventStatusRows, error: statusError }, { data: seatRows, error: seatError }] = await Promise.all([
      supabase.rpc("public_today_event_status", { p_exam_date: today }),
      supabase.rpc("public_seat_lookup", { p_register_no: normalized, p_exam_date: today }),
    ]);

    if (statusError || seatError) {
      console.error("Public seat lookup RPC failed:", statusError ?? seatError);
      return NextResponse.json({ error: STUDENT_MESSAGES.genericError }, { status: 500 });
    }

    const results: PublicSeatResult[] = (seatRows ?? []).map((row) => ({
      registerNo: row.register_no,
      studentName: row.student_name,
      programme: row.programme,
      courseCode: row.course_code,
      courseName: row.course_name,
      examDate: row.exam_date,
      session: row.session,
      roomName: row.room_name,
      seatNo: row.seat_no,
    }));

    const classification = classifySeatLookup(eventStatusRows ?? [], results);

    switch (classification.status) {
      case "not_published":
        return NextResponse.json({ error: STUDENT_MESSAGES.notPublished }, { status: 404 });
      case "closed":
        return NextResponse.json({ error: STUDENT_MESSAGES.closed }, { status: 404 });
      case "not_found":
        return NextResponse.json({ error: STUDENT_MESSAGES.notFound }, { status: 404 });
      case "found":
        return NextResponse.json({ results: classification.results }, { status: 200 });
    }
  } catch (error) {
    console.error("Public seat lookup failed:", error);
    return NextResponse.json({ error: STUDENT_MESSAGES.genericError }, { status: 500 });
  }
}
