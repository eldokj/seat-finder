"use server";

import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/admin/audit";
import { examinationPeriodInputSchema } from "@/lib/validation/examination-period";
import type { z } from "zod";

export interface ExaminationPeriodFormState {
  errors?: Record<string, string>;
  formError?: string;
}

function parseExaminationPeriodFormData(formData: FormData) {
  return examinationPeriodInputSchema.safeParse({
    name: formData.get("name"),
    start_date: formData.get("start_date"),
    end_date: formData.get("end_date"),
    status: formData.get("status") || "active",
  });
}

function fieldErrorsFrom(
  error: z.ZodError<z.infer<typeof examinationPeriodInputSchema>>
): Record<string, string> {
  const flat = error.flatten().fieldErrors;
  const errors: Record<string, string> = {};
  for (const [key, messages] of Object.entries(flat)) {
    if (messages && messages[0]) errors[key] = messages[0];
  }
  return errors;
}

export async function createExaminationPeriodAction(
  _prevState: ExaminationPeriodFormState,
  formData: FormData
): Promise<ExaminationPeriodFormState> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const result = parseExaminationPeriodFormData(formData);
  if (!result.success) {
    return { errors: fieldErrorsFrom(result.error) };
  }

  const supabase = await createSupabaseServerClient();

  const { data: period, error } = await supabase
    .from("examination_periods")
    .insert({ ...result.data, created_by: session.user.id })
    .select("id")
    .single();

  if (error || !period) {
    return { formError: "Unable to create the examination period. Please try again." };
  }

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "examination_period_created",
    entityType: "examination_period",
    entityId: period.id,
    newValue: result.data,
  });

  redirect(`/admin/examination-periods/${period.id}`);
}

export async function updateExaminationPeriodAction(
  periodId: string,
  _prevState: ExaminationPeriodFormState,
  formData: FormData
): Promise<ExaminationPeriodFormState> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const result = parseExaminationPeriodFormData(formData);
  if (!result.success) {
    return { errors: fieldErrorsFrom(result.error) };
  }

  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from("examination_periods")
    .select("*")
    .eq("id", periodId)
    .maybeSingle();
  if (!existing) {
    return { formError: "This examination period no longer exists." };
  }

  const { error } = await supabase
    .from("examination_periods")
    .update(result.data)
    .eq("id", periodId);

  if (error) {
    return { formError: "Unable to save changes. Please try again." };
  }

  await logAuditEvent(supabase, {
    adminId: session.user.id,
    action: "examination_period_updated",
    entityType: "examination_period",
    entityId: periodId,
    oldValue: existing,
    newValue: result.data,
  });

  redirect(`/admin/examination-periods/${periodId}`);
}
