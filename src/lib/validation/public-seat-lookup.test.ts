import { describe, it, expect } from "vitest";
import { classifySeatLookup, type TodayEventStatus } from "./public-seat-lookup";
import type { PublicSeatResult } from "@/types/database";

function result(overrides: Partial<PublicSeatResult> = {}): PublicSeatResult {
  return {
    registerNo: "25BCS034",
    studentName: "Test Student",
    programme: "BSc CS",
    courseCode: "C101",
    courseName: "Advanced Testing",
    examDate: "2026-08-18",
    session: "FN",
    roomName: "M101",
    seatNo: "A12",
    ...overrides,
  };
}

describe("classifySeatLookup", () => {
  it("returns not_published when no events exist today at all", () => {
    expect(classifySeatLookup([], [])).toEqual({ status: "not_published" });
  });

  it("returns not_published when every event today is still draft", () => {
    const events: TodayEventStatus[] = [{ session: "FN", status: "draft" }];
    expect(classifySeatLookup(events, [])).toEqual({ status: "not_published" });
  });

  it("returns closed when every event today is closed", () => {
    const events: TodayEventStatus[] = [{ session: "FN", status: "closed" }];
    expect(classifySeatLookup(events, [])).toEqual({ status: "closed" });
  });

  it("returns not_published (not closed) for a mix of draft and closed with nothing published", () => {
    const events: TodayEventStatus[] = [
      { session: "FN", status: "closed" },
      { session: "AN", status: "draft" },
    ];
    expect(classifySeatLookup(events, [])).toEqual({ status: "not_published" });
  });

  it("returns not_found when a published event exists but no seated result comes back (wrong register number)", () => {
    const events: TodayEventStatus[] = [{ session: "FN", status: "published" }];
    expect(classifySeatLookup(events, [])).toEqual({ status: "not_found" });
  });

  it("returns not_found identically whether the register number doesn't exist or just isn't seated today — no distinguishing information", () => {
    const events: TodayEventStatus[] = [{ session: "FN", status: "published" }];
    const a = classifySeatLookup(events, []);
    const b = classifySeatLookup(events, []);
    expect(a).toEqual(b);
    expect(a).toEqual({ status: "not_found" });
  });

  it("returns found with exactly one FN result when the student has only an FN exam today", () => {
    const events: TodayEventStatus[] = [
      { session: "FN", status: "published" },
      { session: "AN", status: "draft" },
    ];
    const fnResult = result({ session: "FN" });
    const classification = classifySeatLookup(events, [fnResult]);
    expect(classification).toEqual({ status: "found", results: [fnResult] });
    if (classification.status === "found") {
      expect(classification.results).toHaveLength(1);
      expect(classification.results[0].session).toBe("FN");
    }
  });

  it("returns found with exactly one AN result when the student has only an AN exam today", () => {
    const events: TodayEventStatus[] = [{ session: "AN", status: "published" }];
    const anResult = result({ session: "AN", roomName: "M202", seatNo: "B5" });
    const classification = classifySeatLookup(events, [anResult]);
    expect(classification).toEqual({ status: "found", results: [anResult] });
    if (classification.status === "found") {
      expect(classification.results).toHaveLength(1);
      expect(classification.results[0].session).toBe("AN");
    }
  });

  it("returns found with both FN and AN results when the student has exams in both sessions today", () => {
    const events: TodayEventStatus[] = [
      { session: "FN", status: "published" },
      { session: "AN", status: "published" },
    ];
    const fnResult = result({ session: "FN", roomName: "M101", seatNo: "A12" });
    const anResult = result({ session: "AN", roomName: "M202", seatNo: "B5" });
    const classification = classifySeatLookup(events, [fnResult, anResult]);
    expect(classification.status).toBe("found");
    if (classification.status === "found") {
      expect(classification.results).toHaveLength(2);
      expect(new Set(classification.results.map((r) => r.session))).toEqual(new Set(["FN", "AN"]));
    }
  });

  it("returns found for a published event with a matching seated result", () => {
    const events: TodayEventStatus[] = [{ session: "FN", status: "published" }];
    const classification = classifySeatLookup(events, [result()]);
    expect(classification.status).toBe("found");
  });
});
