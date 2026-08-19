import { describe, it, expect } from "vitest";
import { classifyRoomImportRows, type ExistingRoomsByCode, type ExistingRoomForImport } from "./room-import";
import type { RoomColumnKey } from "@/lib/excel/columns";

const NO_EXISTING: ExistingRoomsByCode = new Map();

function row(rowNumber: number, raw: Partial<Record<RoomColumnKey, unknown>>) {
  const full: Record<RoomColumnKey, unknown> = {
    roomNumber: "Main Block Room 101",
    code: "M101",
    block: "Main Block",
    floor: "Ground",
    landmark: "",
    rows: 5,
    columns: 9,
    additionalSeats: 5,
    status: "Active",
    ...raw,
  };
  return { rowNumber, raw: full };
}

function existingRoom(overrides: Partial<ExistingRoomForImport> = {}): ExistingRoomForImport {
  return {
    code: "M101",
    roomNumber: "Main Block Room 101",
    block: "Main Block",
    floor: "Ground",
    landmark: null,
    additionalSeats: 5,
    status: "active",
    usableSeats: 50,
    hasLayout: false,
    ...overrides,
  };
}

describe("classifyRoomImportRows — field validation", () => {
  it("accepts a valid new room as 'added'", () => {
    const { rows, summary } = classifyRoomImportRows([row(2, {})], NO_EXISTING);
    expect(rows[0].severity).toBe("valid");
    expect(rows[0].classification).toBe("added");
    expect(summary.added).toBe(1);
  });

  it("rejects a missing Room Number", () => {
    const { rows } = classifyRoomImportRows([row(2, { roomNumber: "" })], NO_EXISTING);
    expect(rows[0].classification).toBe("rejected");
  });

  it("rejects a missing Code", () => {
    const { rows } = classifyRoomImportRows([row(2, { code: "" })], NO_EXISTING);
    expect(rows[0].classification).toBe("rejected");
  });

  it("rejects an invalid Status value", () => {
    const { rows } = classifyRoomImportRows([row(2, { status: "Maybe" })], NO_EXISTING);
    expect(rows[0].classification).toBe("rejected");
    expect(rows[0].messages.join(" ")).toMatch(/status/i);
  });

  it("defaults Status to active when blank", () => {
    const { rows } = classifyRoomImportRows([row(2, { status: "" })], NO_EXISTING);
    expect(rows[0].normalized?.status).toBe("active");
  });

  it("rejects an invalid Additional Seats value", () => {
    const { rows } = classifyRoomImportRows([row(2, { additionalSeats: "many" })], NO_EXISTING);
    expect(rows[0].classification).toBe("rejected");
  });

  it("defaults Additional Seats to 0 when blank", () => {
    const { rows } = classifyRoomImportRows([row(2, { additionalSeats: "" })], NO_EXISTING);
    expect(rows[0].normalized?.additionalSeats).toBe(0);
  });

  it("requires Rows and Columns for a brand-new room", () => {
    const { rows } = classifyRoomImportRows([row(2, { rows: "" })], NO_EXISTING);
    expect(rows[0].classification).toBe("rejected");
    expect(rows[0].messages.join(" ")).toMatch(/rows and columns are required/i);
  });

  it("warns (not rejects) on an invalid Rows value, treating it as absent", () => {
    const { rows } = classifyRoomImportRows([row(2, { rows: "many" })], NO_EXISTING);
    // Treated as absent -> for a NEW room this becomes the "required" rejection, not a format error.
    expect(rows[0].classification).toBe("rejected");
    expect(rows[0].messages.join(" ")).toMatch(/rows and columns are required|rows looks invalid/i);
  });

  it("flags a duplicate Code within the file", () => {
    const { rows, summary } = classifyRoomImportRows([row(2, {}), row(3, {})], NO_EXISTING);
    expect(rows[0].classification).toBe("added");
    expect(rows[1].classification).toBe("rejected");
    expect(rows[1].messages.join(" ")).toMatch(/duplicate code/i);
    expect(summary.rejected).toBe(1);
  });
});

describe("classifyRoomImportRows — capacity estimation for new rooms", () => {
  it("computes usableSeats as rows*columns + additionalSeats for a new room", () => {
    const { rows } = classifyRoomImportRows([row(2, { rows: 5, columns: 9, additionalSeats: 5 })], NO_EXISTING);
    expect(rows[0].plannedWrite?.usableSeats).toBe(5 * 9 + 5);
  });
});

describe("classifyRoomImportRows — existing room, no layout yet", () => {
  it("classifies as 'unchanged' when nothing differs", () => {
    const existing: ExistingRoomsByCode = new Map([["M101", existingRoom({ usableSeats: 5 * 9 + 5 })]]);
    const { rows } = classifyRoomImportRows([row(2, {})], existing);
    expect(rows[0].classification).toBe("unchanged");
  });

  it("classifies as 'updated' when a field differs", () => {
    const existing: ExistingRoomsByCode = new Map([["M101", existingRoom({ floor: "First" })]]);
    const { rows } = classifyRoomImportRows([row(2, {})], existing);
    expect(rows[0].classification).toBe("updated");
  });

  it("recomputes usableSeats from Rows/Columns when provided", () => {
    const existing: ExistingRoomsByCode = new Map([["M101", existingRoom({ usableSeats: 20 })]]);
    const { rows } = classifyRoomImportRows([row(2, { rows: 6, columns: 10, additionalSeats: 0 })], existing);
    expect(rows[0].plannedWrite?.usableSeats).toBe(60);
    expect(rows[0].classification).toBe("updated");
  });

  it("leaves usableSeats untouched (passed through as-is) when Rows/Columns are omitted", () => {
    const existing: ExistingRoomsByCode = new Map([["M101", existingRoom({ usableSeats: 42 })]]);
    const { rows } = classifyRoomImportRows([row(2, { rows: "", columns: "" })], existing);
    expect(rows[0].plannedWrite?.usableSeatsRecomputed).toBe(false);
    expect(rows[0].plannedWrite?.usableSeats).toBe(42);
  });
});

describe("classifyRoomImportRows — occupied-layout protection", () => {
  it("never touches usableSeats for a room that already has a saved layout", () => {
    const existing: ExistingRoomsByCode = new Map([["M101", existingRoom({ hasLayout: true, usableSeats: 999 })]]);
    const { rows } = classifyRoomImportRows([row(2, { rows: 5, columns: 9 })], existing);
    expect(rows[0].plannedWrite?.usableSeatsRecomputed).toBe(false);
    expect(rows[0].plannedWrite?.usableSeats).toBe(999);
  });

  it("warns when Rows/Columns are supplied for a room that already has a layout", () => {
    const existing: ExistingRoomsByCode = new Map([["M101", existingRoom({ hasLayout: true })]]);
    const { rows } = classifyRoomImportRows([row(2, { rows: 5, columns: 9 })], existing);
    expect(rows[0].severity).toBe("warning");
    expect(rows[0].messages.join(" ")).toMatch(/already has a saved layout/i);
  });

  it("does not warn when Rows/Columns are omitted for a room with an existing layout", () => {
    const existing: ExistingRoomsByCode = new Map([["M101", existingRoom({ hasLayout: true })]]);
    const { rows } = classifyRoomImportRows([row(2, { rows: "", columns: "" })], existing);
    expect(rows[0].severity).toBe("valid");
  });

  it("still allows identity fields (block/floor/status) to update even with an existing layout", () => {
    const existing: ExistingRoomsByCode = new Map([["M101", existingRoom({ hasLayout: true, floor: "Second" })]]);
    const { rows } = classifyRoomImportRows([row(2, { rows: "", columns: "" })], existing);
    expect(rows[0].classification).toBe("updated");
    expect(rows[0].plannedWrite?.floor).toBe("Ground");
  });
});
