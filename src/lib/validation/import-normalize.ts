/**
 * Pure normalization helpers shared by the Master Timetable and Student
 * Roster importers. Each returns `null` for anything it can't confidently
 * normalize — callers turn that into a validation error — rather than
 * guessing or silently coercing suspicious input.
 */

import type { ExamSession } from "@/types/database";

/** Trims and collapses internal whitespace runs to a single space. Empty → null. */
export function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(/\s+/g, " ");
  return text.length > 0 ? text : null;
}

/** Uppercases and strips whitespace entirely — matches course codes like "26PSY301". */
export function normalizeCourseCode(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  return text.toUpperCase().replace(/\s+/g, "");
}

/** A generous but real sanity check, not a strict format lock — flagged as a warning, never blocks. */
export function isReasonableCourseCode(code: string): boolean {
  return /^[A-Z0-9][A-Z0-9-]{1,19}$/.test(code);
}

export function normalizeSession(value: unknown): ExamSession | null {
  const text = normalizeText(value);
  if (!text) return null;
  const upper = text.toUpperCase();
  return upper === "FN" || upper === "AN" ? upper : null;
}

/** Accepts a positive integer from a number, numeric string, or Excel cell text. */
export function normalizeStrength(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  const text = normalizeText(value);
  if (!text || !/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return parsed > 0 ? parsed : null;
}

/** Generic whole-number parser for import columns that aren't "Strength"
 * specifically (e.g. Rows, Columns, Additional Seats) — same tolerant
 * number/numeric-string/Excel-cell-text handling, with a caller-supplied
 * minimum instead of always requiring > 0. */
export function normalizeInt(value: unknown, minValue: number): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= minValue ? value : null;
  }
  const text = normalizeText(value);
  if (!text || !/^-?\d+$/.test(text)) return null;
  const parsed = Number(text);
  return parsed >= minValue ? parsed : null;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/**
 * Accepts a JS Date (from an Excel date-formatted cell), an ISO string
 * (YYYY-MM-DD), or a DD-MM-YYYY / DD/MM/YYYY string (the common manual-entry
 * format). Returns YYYY-MM-DD, or null if the value doesn't cleanly parse
 * into a real calendar date — never guesses at an ambiguous format.
 */
export function normalizeExamDate(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getFullYear();
    const m = value.getMonth() + 1;
    const d = value.getDate();
    if (!isValidCalendarDate(y, m, d)) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  const text = normalizeText(value);
  if (!text) return null;

  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const [, y, m, d] = match.map(Number);
    if (!isValidCalendarDate(y, m, d)) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (match) {
    const [, d, m, y] = match.map(Number);
    if (!isValidCalendarDate(y, m, d)) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  return null;
}
