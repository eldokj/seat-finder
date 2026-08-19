import { describe, it, expect } from "vitest";
import { classifyLayoutImportRows, type ExistingRoomLayoutsByCode } from "./room-layout-import";
import type { RoomLayoutColumnKey } from "@/lib/excel/columns";

function row(rowNumber: number, raw: Partial<Record<RoomLayoutColumnKey, unknown>>) {
  const full: Record<RoomLayoutColumnKey, unknown> = {
    roomCode: "M101",
    row: 1,
    column: 1,
    section: "A",
    seatLabel: "A1",
    positionType: "seat",
    status: "available",
    ...raw,
  };
  return { rowNumber, raw: full };
}

const KNOWN_ROOM: ExistingRoomLayoutsByCode = new Map([["M101", { roomId: "room-1", cells: [] }]]);

describe("classifyLayoutImportRows — field validation", () => {
  it("accepts a valid seat row as 'added'", () => {
    const { rows, summary } = classifyLayoutImportRows([row(2, {})], KNOWN_ROOM);
    expect(rows[0].severity).toBe("valid");
    expect(rows[0].classification).toBe("added");
    expect(summary.added).toBe(1);
  });

  it("rejects an unknown room code", () => {
    const { rows } = classifyLayoutImportRows([row(2, { roomCode: "ZZZZ" })], KNOWN_ROOM);
    expect(rows[0].classification).toBe("rejected");
    expect(rows[0].messages.join(" ")).toMatch(/unknown room/i);
  });

  it("rejects an invalid Row/Column", () => {
    const { rows } = classifyLayoutImportRows([row(2, { row: 0 })], KNOWN_ROOM);
    expect(rows[0].classification).toBe("rejected");
  });

  it("rejects an invalid Position Type", () => {
    const { rows } = classifyLayoutImportRows([row(2, { positionType: "chair" })], KNOWN_ROOM);
    expect(rows[0].classification).toBe("rejected");
  });

  it("rejects a seat position with no Seat Label", () => {
    const { rows } = classifyLayoutImportRows([row(2, { seatLabel: "" })], KNOWN_ROOM);
    expect(rows[0].classification).toBe("rejected");
    expect(rows[0].messages.join(" ")).toMatch(/seat label is required/i);
  });

  it("accepts a gap position with no Seat Label", () => {
    const { rows } = classifyLayoutImportRows([row(2, { positionType: "gap", seatLabel: "" })], KNOWN_ROOM);
    expect(rows[0].classification).toBe("added");
    expect(rows[0].normalized?.seatLabel).toBeNull();
  });

  it("warns when a Seat Label is supplied for a gap", () => {
    const { rows } = classifyLayoutImportRows([row(2, { positionType: "gap", seatLabel: "X1" })], KNOWN_ROOM);
    expect(rows[0].severity).toBe("warning");
    expect(rows[0].normalized?.seatLabel).toBeNull();
  });

  it("rejects an invalid Status", () => {
    const { rows } = classifyLayoutImportRows([row(2, { status: "broken" })], KNOWN_ROOM);
    expect(rows[0].classification).toBe("rejected");
  });

  it("defaults Status to available when blank", () => {
    const { rows } = classifyLayoutImportRows([row(2, { status: "" })], KNOWN_ROOM);
    expect(rows[0].normalized?.status).toBe("available");
  });
});

describe("classifyLayoutImportRows — duplicate detection", () => {
  it("rejects a duplicate position within the same room", () => {
    const { rows, summary } = classifyLayoutImportRows([row(2, {}), row(3, { seatLabel: "A1-dup" })], KNOWN_ROOM);
    expect(rows[0].classification).toBe("added");
    expect(rows[1].classification).toBe("rejected");
    expect(rows[1].messages.join(" ")).toMatch(/duplicate position/i);
    expect(summary.rejected).toBe(1);
  });

  it("rejects a duplicate seat label within the same room", () => {
    const { rows } = classifyLayoutImportRows([row(2, {}), row(3, { row: 1, column: 2 })], KNOWN_ROOM);
    expect(rows[0].classification).toBe("added");
    expect(rows[1].classification).toBe("rejected");
    expect(rows[1].messages.join(" ")).toMatch(/duplicate seat label/i);
  });

  it("allows the same seat label in two DIFFERENT rooms", () => {
    const twoRooms: ExistingRoomLayoutsByCode = new Map([
      ["M101", { roomId: "room-1", cells: [] }],
      ["M102", { roomId: "room-2", cells: [] }],
    ]);
    const { rows } = classifyLayoutImportRows([row(2, {}), row(3, { roomCode: "M102" })], twoRooms);
    expect(rows[0].classification).toBe("added");
    expect(rows[1].classification).toBe("added");
  });
});

describe("classifyLayoutImportRows — against existing layout", () => {
  it("classifies as 'unchanged' when the position matches exactly", () => {
    const existing: ExistingRoomLayoutsByCode = new Map([
      ["M101", { roomId: "room-1", cells: [{ rowNumber: 1, columnNumber: 1, section: "A", seatLabel: "A1", positionType: "seat", status: "available" }] }],
    ]);
    const { rows } = classifyLayoutImportRows([row(2, {})], existing);
    expect(rows[0].classification).toBe("unchanged");
  });

  it("classifies as 'updated' when status differs", () => {
    const existing: ExistingRoomLayoutsByCode = new Map([
      ["M101", { roomId: "room-1", cells: [{ rowNumber: 1, columnNumber: 1, section: "A", seatLabel: "A1", positionType: "seat", status: "disabled" }] }],
    ]);
    const { rows } = classifyLayoutImportRows([row(2, {})], existing);
    expect(rows[0].classification).toBe("updated");
  });

  it("computes affectedRoomCodes from non-rejected rows only", () => {
    const twoRooms: ExistingRoomLayoutsByCode = new Map([
      ["M101", { roomId: "room-1", cells: [] }],
      ["M102", { roomId: "room-2", cells: [] }],
    ]);
    const { affectedRoomCodes } = classifyLayoutImportRows(
      [row(2, {}), row(3, { roomCode: "M102" }), row(4, { roomCode: "ZZZZ" })],
      twoRooms
    );
    expect(affectedRoomCodes.sort()).toEqual(["M101", "M102"]);
  });
});
