import { describe, it, expect } from "vitest";
import {
  sortSeatedRows,
  groupByProgramme,
  groupByCourse,
  groupByRoom,
  computeUtilizationPercent,
  isNoticeBoardAllowed,
  needsDraftWatermark,
  type SeatedRow,
} from "./reports";

function row(overrides: Partial<SeatedRow> = {}): SeatedRow {
  return {
    seatAllocationId: "sa-1",
    registerNo: "25BCS034",
    studentName: "Test Student",
    programme: "BSc CS",
    courseCode: "C101",
    courseName: "Advanced Testing",
    year: 2024,
    term: 3,
    roomId: "room-1",
    roomNumber: "M101",
    seatLabel: "A1",
    seatKind: "grid",
    rowNumber: 1,
    columnNumber: 1,
    ...overrides,
  };
}

describe("sortSeatedRows", () => {
  const rows = [
    row({ seatAllocationId: "a", registerNo: "B002", studentName: "Zed", roomNumber: "M2", rowNumber: 1, columnNumber: 1, seatLabel: "1" }),
    row({ seatAllocationId: "b", registerNo: "A001", studentName: "Amy", roomNumber: "M1", rowNumber: 2, columnNumber: 1, seatLabel: "3" }),
  ];

  it("sorts by register number by default", () => {
    const sorted = sortSeatedRows(rows, "registerNo");
    expect(sorted.map((r) => r.registerNo)).toEqual(["A001", "B002"]);
  });

  it("sorts by student name", () => {
    const sorted = sortSeatedRows(rows, "name");
    expect(sorted.map((r) => r.studentName)).toEqual(["Amy", "Zed"]);
  });

  it("sorts by room then row/column", () => {
    const sorted = sortSeatedRows(rows, "room");
    expect(sorted.map((r) => r.roomNumber)).toEqual(["M1", "M2"]);
  });

  it("does not mutate the input array", () => {
    const original = [...rows];
    sortSeatedRows(rows, "name");
    expect(rows).toEqual(original);
  });
});

describe("groupByProgramme / groupByCourse / groupByRoom", () => {
  const rows = [
    row({ seatAllocationId: "a", registerNo: "B002", programme: "BSc CS", courseCode: "C1", courseName: "Course One", roomNumber: "M2" }),
    row({ seatAllocationId: "b", registerNo: "A001", programme: "BSc CS", courseCode: "C1", courseName: "Course One", roomNumber: "M1" }),
    row({ seatAllocationId: "c", registerNo: "C003", programme: "BCom", courseCode: "C2", courseName: "Course Two", roomNumber: "M1" }),
  ];

  it("groups by programme, alphabetical group order, register-no order within group", () => {
    const groups = groupByProgramme(rows);
    expect(groups.map((g) => g.groupKey)).toEqual(["BCom", "BSc CS"]);
    expect(groups[1].rows.map((r) => r.registerNo)).toEqual(["A001", "B002"]);
  });

  it("groups by course code + name", () => {
    const groups = groupByCourse(rows);
    expect(groups.map((g) => g.groupKey)).toEqual(["C1 — Course One", "C2 — Course Two"]);
  });

  it("groups by room", () => {
    const groups = groupByRoom(rows);
    expect(groups.map((g) => g.groupKey)).toEqual(["M1", "M2"]);
    expect(groups[0].rows).toHaveLength(2);
  });

  it("falls back to an em-dash group for a null programme", () => {
    const groups = groupByProgramme([row({ programme: null })]);
    expect(groups[0].groupKey).toBe("—");
  });
});

describe("computeUtilizationPercent", () => {
  it("computes a rounded one-decimal percentage", () => {
    expect(computeUtilizationPercent({ finalUsableCapacity: 72 }, 67)).toBeCloseTo(93.1, 1);
  });

  it("returns 0 for a room with zero final usable capacity, not NaN/Infinity", () => {
    expect(computeUtilizationPercent({ finalUsableCapacity: 0 }, 0)).toBe(0);
  });

  it("handles 100% exactly", () => {
    expect(computeUtilizationPercent({ finalUsableCapacity: 20 }, 20)).toBe(100);
  });
});

describe("isNoticeBoardAllowed / needsDraftWatermark", () => {
  it("allows the notice board only when published", () => {
    expect(isNoticeBoardAllowed("published")).toBe(true);
    expect(isNoticeBoardAllowed("draft")).toBe(false);
    expect(isNoticeBoardAllowed("closed")).toBe(false);
  });

  it("shows the draft watermark for anything other than published", () => {
    expect(needsDraftWatermark("draft")).toBe(true);
    expect(needsDraftWatermark("closed")).toBe(true);
    expect(needsDraftWatermark("published")).toBe(false);
  });
});
