"use server";

import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/admin/audit";
import { dailyEventInputSchema } from "@/lib/validation/daily-event";
import type { z } from "zod";

export interface DailyEventFormState {
  errors?: Record<string, string>;
  formError?: string;
}

function parseDailyEventFormData(formData: FormData) {
  return dailyEventInputSchema.safeParse({
    examination_period_id: formData.get("examination_period_id"),
    exam_date: formData.get("exam_date"),
    session: formData.get("session"),
    start_time: formData.get("start_time"),
    end_time: formData.get("end_time"),
  });
}

function fieldErrorsFrom(
  error: z.ZodError<z.infer<typeof dailyEventInputSchema>>
): Record<string, string> {
  const flat = error.flatten().fieldErrors;
  const errors: Record<string, string> = {};
  for (const [key, messages] of Object.entries(flat)) {
    if (messages && messages[0]) errors[key] = messages[0];
  }
  return errors;
}

/** Every Daily Exam Session's date must fall within its Examination Period's range (section 14). */
async function validateDateWithinPeriod(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  periodId: string,
  examDate: string
): Promise<string | null> {
  const { data: period } = await supabase
    .from("examination_periods")
    .select("name, start_date, end_date")
    .eq("id", periodId)
    .maybeSingle();

  if (!period) return "That examination period no longer exists.";

  if (examDate < period.start_date || examDate > period.end_date) {
    return `The exam date must fall within "${period.name}" (${period.start_date} to ${period.end_date}).`;
  }

  return null;
}

export async function createDailyEventAction(
  _prevState: DailyEventFormState,
  formData: FormData
): Promise<DailyEventFormState> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const result = parseDailyEventFormData(formData);
  if (!result.success) {
    return { errors: fieldErrorsFrom(result.error) };
  }

  const supabase = await createSupabaseServerClient();

  const dateError = await validateDateWithinPeriod(supabase, result.data.examination_period_id, result.data.exam_date);
  if (dateError) return { errors: { exam_date: dateError } };

  const { start_time, end_time, ...rest } = result.data;

  const { data: event, error } = await supabase
    .from("daily_examination_events")
    .insert({
      ...rest,
      start_time: start_time || null,
      end_time: end_time || null,
      status: "draft",
      created_by: session.user.id,
    })
    .select("id")
    .single();

  if (error || !event) {
    const formError =
      error?.code === "23505"
        ? "A Daily Exam Session already exists for this date and session."
        : "Unable to create the Daily Exam Session. Please try again.";
    return { formError };
  }

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "daily_event_created",
    entityType: "daily_examination_event",
    entityId: event.id,
    newValue: result.data,
  });

  redirect(`/admin/daily-events/${event.id}`);
}

export async function updateDailyEventAction(
  eventId: string,
  _prevState: DailyEventFormState,
  formData: FormData
): Promise<DailyEventFormState> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const result = parseDailyEventFormData(formData);
  if (!result.success) {
    return { errors: fieldErrorsFrom(result.error) };
  }

  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from("daily_examination_events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();
  if (!existing) {
    return { formError: "This Daily Exam Session no longer exists." };
  }

  const dateError = await validateDateWithinPeriod(supabase, result.data.examination_period_id, result.data.exam_date);
  if (dateError) return { errors: { exam_date: dateError } };

  const { start_time, end_time, ...rest } = result.data;
  const { error } = await supabase
    .from("daily_examination_events")
    .update({ ...rest, start_time: start_time || null, end_time: end_time || null })
    .eq("id", eventId);

  if (error) {
    const formError =
      error.code === "23505"
        ? "Another Daily Exam Session already exists for this date and session."
        : "Unable to save changes. Please try again.";
    return { formError };
  }

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "daily_event_updated",
    entityType: "daily_examination_event",
    entityId: eventId,
    oldValue: existing,
    newValue: result.data,
  });

  redirect(`/admin/daily-events/${eventId}`);
}

/** Shared guard for the status-transition actions below. */
async function loadEventForTransition(eventId: string) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const supabase = await createSupabaseServerClient();
  const { data: event } = await supabase
    .from("daily_examination_events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();

  return { session, supabase, event };
}

function errorRedirect(eventId: string, message: string): never {
  redirect(`/admin/daily-events/${eventId}?error=${encodeURIComponent(message)}`);
}

export async function publishDailyEventAction(eventId: string, _formData: FormData): Promise<void> {
  const { session, supabase, event } = await loadEventForTransition(eventId);
  if (!event) redirect("/admin/daily-events");

  if (event.status !== "draft") {
    errorRedirect(eventId, "Only a draft Daily Exam Session can be published.");
  }

  // Phase 7 guard: publishing makes seating visible to student search — a
  // participant with no room_id/room_seat_id/seat_no would show up as "not
  // found" instead of their real seat. Rule (High/Preference) violations do
  // NOT block publish — only a genuinely unseated participant does.
  const { count: unallocatedCount } = await supabase
    .from("seat_allocations")
    .select("id", { count: "exact", head: true })
    .eq("daily_examination_event_id", eventId)
    .is("room_id", null);

  if ((unallocatedCount ?? 0) > 0) {
    errorRedirect(
      eventId,
      `${unallocatedCount} participant(s) still have no seat allocated. Finish Seating Allocation before publishing.`
    );
  }

  const { error } = await supabase
    .from("daily_examination_events")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", eventId);

  if (error) {
    errorRedirect(eventId, "Unable to publish this Daily Exam Session. Please try again.");
  }

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "daily_event_published",
    entityType: "daily_examination_event",
    entityId: eventId,
    oldValue: { status: event.status },
    newValue: { status: "published" },
  });

  redirect(`/admin/daily-events/${eventId}`);
}

export async function unpublishDailyEventAction(eventId: string, _formData: FormData): Promise<void> {
  const { session, supabase, event } = await loadEventForTransition(eventId);
  if (!event) redirect("/admin/daily-events");

  if (event.status !== "published") {
    errorRedirect(eventId, "Only a published Daily Exam Session can be unpublished.");
  }

  const { error } = await supabase
    .from("daily_examination_events")
    .update({ status: "draft", published_at: null })
    .eq("id", eventId);

  if (error) {
    errorRedirect(eventId, "Unable to unpublish this Daily Exam Session. Please try again.");
  }

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "daily_event_unpublished",
    entityType: "daily_examination_event",
    entityId: eventId,
    oldValue: { status: event.status },
    newValue: { status: "draft" },
  });

  redirect(`/admin/daily-events/${eventId}`);
}

export async function closeDailyEventAction(eventId: string, _formData: FormData): Promise<void> {
  const { session, supabase, event } = await loadEventForTransition(eventId);
  if (!event) redirect("/admin/daily-events");

  if (event.status !== "published") {
    errorRedirect(eventId, "Only a published Daily Exam Session can be closed.");
  }

  const { error } = await supabase
    .from("daily_examination_events")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", eventId);

  if (error) {
    errorRedirect(eventId, "Unable to close this Daily Exam Session. Please try again.");
  }

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "daily_event_closed",
    entityType: "daily_examination_event",
    entityId: eventId,
    oldValue: { status: event.status },
    newValue: { status: "closed" },
  });

  redirect(`/admin/daily-events/${eventId}`);
}

export async function deleteDailyEventAction(eventId: string, _formData: FormData): Promise<void> {
  const { session, supabase, event } = await loadEventForTransition(eventId);
  if (!event) redirect("/admin/daily-events");

  if (event.status !== "draft") {
    errorRedirect(eventId, "Only a draft Daily Exam Session can be deleted. Unpublish it first if needed.");
  }

  const { error } = await supabase.from("daily_examination_events").delete().eq("id", eventId);

  if (error) {
    errorRedirect(eventId, "Unable to delete this Daily Exam Session. Please try again.");
  }

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "daily_event_deleted",
    entityType: "daily_examination_event",
    entityId: eventId,
    oldValue: event,
  });

  redirect("/admin/daily-events");
}

// ---------------------------------------------------------------------------
// Phase 7 — Room Allocation ("which rooms serve this event"). A new UI on
// top of the existing room_allocations table (schema already had it,
// nothing built against it until now).
// ---------------------------------------------------------------------------

export interface RoomAllocationFormState {
  formError?: string;
}

export async function setRoomAllocationsAction(
  eventId: string,
  _prevState: RoomAllocationFormState,
  formData: FormData
): Promise<RoomAllocationFormState> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const supabase = await createSupabaseServerClient();

  const { data: event } = await supabase.from("daily_examination_events").select("id").eq("id", eventId).maybeSingle();
  if (!event) return { formError: "This Daily Exam Session no longer exists." };

  const { data: activeRooms } = await supabase.from("rooms").select("id, usable_seats").eq("status", "active");
  const activeRoomsById = new Map((activeRooms ?? []).map((r) => [r.id, r]));

  const selectedRoomIds = formData.getAll("room_ids").map(String).filter((id) => activeRoomsById.has(id));

  const { data: existing } = await supabase
    .from("room_allocations")
    .select("id, room_id")
    .eq("daily_examination_event_id", eventId);
  const existingByRoom = new Map((existing ?? []).map((r) => [r.room_id, r.id]));

  const toRemove = [...existingByRoom.entries()].filter(([roomId]) => !selectedRoomIds.includes(roomId));

  if (toRemove.length > 0) {
    const { data: occupied } = await supabase
      .from("seat_allocations")
      .select("room_id")
      .eq("daily_examination_event_id", eventId)
      .in(
        "room_id",
        toRemove.map(([roomId]) => roomId)
      );
    const occupiedRoomIds = new Set((occupied ?? []).map((o) => o.room_id));
    if (toRemove.some(([roomId]) => occupiedRoomIds.has(roomId))) {
      return { formError: "Can't remove a room that already has students seated for this session. Unseat them first." };
    }

    const { error: deleteError } = await supabase
      .from("room_allocations")
      .delete()
      .in(
        "id",
        toRemove.map(([, id]) => id)
      );
    if (deleteError) return { formError: "Unable to update the room allocation. Please try again." };
  }

  const toAdd = selectedRoomIds.filter((id) => !existingByRoom.has(id));
  if (toAdd.length > 0) {
    const inserts = toAdd.map((roomId) => ({
      daily_examination_event_id: eventId,
      room_id: roomId,
      usable_seats_snapshot: activeRoomsById.get(roomId)!.usable_seats,
    }));
    const { error: insertError } = await supabase.from("room_allocations").insert(inserts);
    if (insertError) return { formError: "Unable to update the room allocation. Please try again." };
  }

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "room_allocation_updated",
    entityType: "daily_examination_event",
    entityId: eventId,
    newValue: { room_ids: selectedRoomIds },
  });

  redirect(`/admin/daily-events/${eventId}`);
}
