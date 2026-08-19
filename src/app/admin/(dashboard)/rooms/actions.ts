"use server";

import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/admin/audit";
import { roomInputSchema } from "@/lib/validation/room";
import type { z } from "zod";

export interface RoomFormState {
  errors?: Record<string, string>;
  formError?: string;
}

function parseRoomFormData(formData: FormData) {
  return roomInputSchema.safeParse({
    room_number: formData.get("room_number"),
    code: formData.get("code"),
    block: formData.get("block"),
    floor: formData.get("floor"),
    landmark: formData.get("landmark"),
    usable_seats: formData.get("usable_seats"),
    additional_seats: formData.get("additional_seats"),
    display_order: formData.get("display_order"),
  });
}

function fieldErrorsFrom(
  error: z.ZodError<z.infer<typeof roomInputSchema>>
): Record<string, string> {
  const flat = error.flatten().fieldErrors;
  const errors: Record<string, string> = {};
  for (const [key, messages] of Object.entries(flat)) {
    if (messages && messages[0]) errors[key] = messages[0];
  }
  return errors;
}

function duplicateCodeOrGenericError(errorCode: string | undefined): string {
  return errorCode === "23505"
    ? "A room with this code already exists."
    : "Unable to save the room. Please try again.";
}

export async function createRoomAction(
  _prevState: RoomFormState,
  formData: FormData
): Promise<RoomFormState> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const result = parseRoomFormData(formData);
  if (!result.success) {
    return { errors: fieldErrorsFrom(result.error) };
  }

  const supabase = await createSupabaseServerClient();
  const { block, floor, landmark, ...rest } = result.data;

  const { data: room, error } = await supabase
    .from("rooms")
    .insert({
      ...rest,
      block: block || null,
      floor: floor || null,
      landmark: landmark || null,
      status: "active",
    })
    .select("id")
    .single();

  if (error || !room) {
    return { formError: duplicateCodeOrGenericError(error?.code) };
  }

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "room_created",
    entityType: "room",
    entityId: room.id,
    newValue: result.data,
  });

  redirect(`/admin/rooms/${room.id}`);
}

export async function updateRoomAction(
  roomId: string,
  _prevState: RoomFormState,
  formData: FormData
): Promise<RoomFormState> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const result = parseRoomFormData(formData);
  if (!result.success) {
    return { errors: fieldErrorsFrom(result.error) };
  }

  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase.from("rooms").select("*").eq("id", roomId).maybeSingle();
  if (!existing) {
    return { formError: "This room no longer exists." };
  }

  const { block, floor, landmark, ...rest } = result.data;
  const { error } = await supabase
    .from("rooms")
    .update({ ...rest, block: block || null, floor: floor || null, landmark: landmark || null })
    .eq("id", roomId);

  if (error) {
    return { formError: duplicateCodeOrGenericError(error.code) };
  }

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "room_updated",
    entityType: "room",
    entityId: roomId,
    oldValue: existing,
    newValue: result.data,
  });

  redirect(`/admin/rooms/${roomId}`);
}

export async function setRoomStatusAction(
  roomId: string,
  status: "active" | "inactive",
  _formData: FormData
): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase.from("rooms").select("*").eq("id", roomId).maybeSingle();
  if (!existing) redirect("/admin/rooms");

  const { error } = await supabase.from("rooms").update({ status }).eq("id", roomId);

  if (error) {
    redirect(`/admin/rooms/${roomId}?error=${encodeURIComponent("Unable to update room status. Please try again.")}`);
  }

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: status === "active" ? "room_activated" : "room_deactivated",
    entityType: "room",
    entityId: roomId,
    oldValue: { status: existing.status },
    newValue: { status },
  });

  redirect(`/admin/rooms/${roomId}`);
}
