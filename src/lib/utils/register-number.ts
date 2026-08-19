/**
 * Normalizes a register number for lookup/comparison: trims surrounding
 * whitespace, collapses internal whitespace, and uppercases it.
 *
 * Must match the normalization used by the generated `register_no_key`
 * column in the `students` table (see supabase/migrations/0001_init.sql)
 * so that application-level and database-level normalization never drift
 * apart. "25bcs034", " 25BCS034 ", and "25BCS034" all normalize to the
 * same key.
 */
export function normalizeRegisterNumber(input: string): string {
  return input.trim().replace(/\s+/g, "").toUpperCase();
}

/** No real register number is anywhere near this long — this exists purely
 * to reject an oversized/abusive payload before it reaches the database
 * (Phase 10 hardening for the public, unauthenticated seat-lookup route). */
export const MAX_REGISTER_NUMBER_LENGTH = 32;

/** True if the (already-trimmed) input is non-empty, and not absurdly long,
 * after normalization. */
export function isValidRegisterNumberInput(input: string): boolean {
  const normalized = normalizeRegisterNumber(input);
  return normalized.length > 0 && normalized.length <= MAX_REGISTER_NUMBER_LENGTH;
}
