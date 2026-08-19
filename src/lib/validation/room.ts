import { z } from "zod";

/**
 * Validates the raw FormData fields for creating/editing a room. Field
 * names match the `rooms` table columns 1:1.
 *
 * `status` is not part of this schema — activate/deactivate is a dedicated
 * action (see app/admin/(dashboard)/rooms/actions.ts), not a raw form field.
 *
 * Layout fields (`rows`, `columns`, `sections`, `numbering_scheme`) are
 * deliberately NOT part of this form yet — they're set via the visual Room
 * Layout editor, a separate upcoming phase. This form only covers a room's
 * identity and simple capacity planning, matching what M101 already has.
 */
export const roomInputSchema = z.object({
  room_number: z.string().trim().min(1, "Room number is required.").max(50, "Room number is too long."),
  code: z.string().trim().min(1, "Room code is required.").max(50, "Room code is too long."),
  block: z.string().trim().max(200, "Block is too long.").optional().or(z.literal("")),
  floor: z.string().trim().max(100, "Floor is too long.").optional().or(z.literal("")),
  landmark: z.string().trim().max(200, "Landmark is too long.").optional().or(z.literal("")),
  usable_seats: z.coerce
    .number("Usable seats must be a number.")
    .int("Usable seats must be a whole number.")
    .positive("Usable seats must be greater than zero."),
  additional_seats: z.coerce
    .number("Additional seats must be a number.")
    .int("Additional seats must be a whole number.")
    .nonnegative("Additional seats can't be negative.")
    .optional()
    .default(0),
  display_order: z.coerce
    .number("Display order must be a number.")
    .int("Display order must be a whole number.")
    .optional()
    .default(0),
});

export type RoomInput = z.infer<typeof roomInputSchema>;
