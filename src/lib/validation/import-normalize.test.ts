import { describe, it, expect } from "vitest";
import {
  normalizeExamDate,
  normalizeSession,
  normalizeText,
  normalizeCourseCode,
  normalizeStrength,
  normalizeInt,
  isReasonableCourseCode,
} from "./import-normalize";

describe("normalizeExamDate", () => {
  it("parses DD-MM-YYYY", () => {
    expect(normalizeExamDate("18-08-2026")).toBe("2026-08-18");
  });

  it("parses DD/MM/YYYY", () => {
    expect(normalizeExamDate("18/08/2026")).toBe("2026-08-18");
  });

  it("parses ISO YYYY-MM-DD", () => {
    expect(normalizeExamDate("2026-08-18")).toBe("2026-08-18");
  });

  it("parses a JS Date (from an Excel date-formatted cell)", () => {
    expect(normalizeExamDate(new Date(2026, 7, 18))).toBe("2026-08-18");
  });

  it("rejects a calendar-invalid date (Feb 31)", () => {
    expect(normalizeExamDate("31-02-2026")).toBeNull();
  });

  it("rejects garbage text", () => {
    expect(normalizeExamDate("not a date")).toBeNull();
  });

  it("rejects empty/missing values", () => {
    expect(normalizeExamDate("")).toBeNull();
    expect(normalizeExamDate(null)).toBeNull();
    expect(normalizeExamDate(undefined)).toBeNull();
  });
});

describe("normalizeSession", () => {
  it("accepts FN/AN case-insensitively with whitespace", () => {
    expect(normalizeSession(" fn ")).toBe("FN");
    expect(normalizeSession("An")).toBe("AN");
  });

  it("rejects anything else", () => {
    expect(normalizeSession("EN")).toBeNull();
    expect(normalizeSession("")).toBeNull();
  });
});

describe("normalizeText", () => {
  it("trims and collapses internal whitespace", () => {
    expect(normalizeText("  B.Sc   CS  ")).toBe("B.Sc CS");
  });

  it("returns null for empty/whitespace-only input", () => {
    expect(normalizeText("   ")).toBeNull();
    expect(normalizeText(null)).toBeNull();
  });
});

describe("normalizeCourseCode", () => {
  it("uppercases and strips all whitespace", () => {
    expect(normalizeCourseCode(" 26 psy 301 ")).toBe("26PSY301");
  });
});

describe("isReasonableCourseCode", () => {
  it("accepts a typical alphanumeric code", () => {
    expect(isReasonableCourseCode("26PSY301")).toBe(true);
  });

  it("rejects a single character or symbols-only code", () => {
    expect(isReasonableCourseCode("X")).toBe(false);
    expect(isReasonableCourseCode("@@")).toBe(false);
  });
});

describe("normalizeInt — used for Year (minValue 2000) and Term (minValue 1)", () => {
  it("Year: accepts a plausible 4-digit batch year as a number or numeric string", () => {
    expect(normalizeInt(2024, 2000)).toBe(2024);
    expect(normalizeInt("2024", 2000)).toBe(2024);
  });

  it("Year: rejects anything below the minimum (not a real batch year)", () => {
    expect(normalizeInt(3, 2000)).toBeNull();
    expect(normalizeInt("1999", 2000)).toBeNull();
    expect(normalizeInt(0, 2000)).toBeNull();
  });

  it("Year: rejects non-numeric text, including ordinal-style input ('First Year')", () => {
    expect(normalizeInt("First Year", 2000)).toBeNull();
    expect(normalizeInt("twenty twenty-four", 2000)).toBeNull();
  });

  it("Term: accepts a positive whole number as a number or numeric string", () => {
    expect(normalizeInt(3, 1)).toBe(3);
    expect(normalizeInt("6", 1)).toBe(6);
  });

  it("Term: rejects zero and negative values", () => {
    expect(normalizeInt(0, 1)).toBeNull();
    expect(normalizeInt(-1, 1)).toBeNull();
    expect(normalizeInt("-1", 1)).toBeNull();
  });

  it("Term: rejects non-integer and non-numeric values", () => {
    expect(normalizeInt(3.5, 1)).toBeNull();
    expect(normalizeInt("three", 1)).toBeNull();
    expect(normalizeInt(null, 1)).toBeNull();
    expect(normalizeInt(undefined, 1)).toBeNull();
  });
});

describe("normalizeStrength", () => {
  it("accepts a positive integer number", () => {
    expect(normalizeStrength(62)).toBe(62);
  });

  it("accepts a positive integer as numeric text", () => {
    expect(normalizeStrength("62")).toBe(62);
  });

  it("rejects zero, negative, and non-integer values", () => {
    expect(normalizeStrength(0)).toBeNull();
    expect(normalizeStrength(-5)).toBeNull();
    expect(normalizeStrength(4.5)).toBeNull();
    expect(normalizeStrength("sixty-two")).toBeNull();
  });
});
