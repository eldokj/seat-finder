import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseWorkbookBuffer, validateUploadedFile, ExcelParseError } from "./parse";

function buildWorkbookBuffer(rows: unknown[][], sheetName = "Sheet1"): ArrayBuffer {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const out = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return out;
}

describe("validateUploadedFile", () => {
  it("rejects a non-Excel extension", () => {
    expect(() => validateUploadedFile("roster.pdf", 1000)).toThrow(ExcelParseError);
  });

  it("rejects an empty file", () => {
    expect(() => validateUploadedFile("roster.xlsx", 0)).toThrow(/empty/i);
  });

  it("rejects an oversized file", () => {
    expect(() => validateUploadedFile("roster.xlsx", 6 * 1024 * 1024)).toThrow(/too large/i);
  });

  it("accepts a reasonable .xlsx file", () => {
    expect(() => validateUploadedFile("roster.xlsx", 10_000)).not.toThrow();
  });

  it("accepts .xls", () => {
    expect(() => validateUploadedFile("roster.xls", 10_000)).not.toThrow();
  });
});

describe("parseWorkbookBuffer", () => {
  it("parses a well-formed sheet into headers + rows", () => {
    const buffer = buildWorkbookBuffer([
      ["Date", "Session", "Programme"],
      ["18-08-2026", "FN", "B.Sc CS"],
      ["18-08-2026", "FN", "B.Com"],
    ]);

    const result = parseWorkbookBuffer(buffer, "test.xlsx");
    expect(result.headers).toEqual(["Date", "Session", "Programme"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual(["18-08-2026", "FN", "B.Sc CS"]);
  });

  it("rejects a malformed (non-Excel binary) buffer", () => {
    const garbage = new TextEncoder().encode("this is not an excel file, just plain text").buffer;
    expect(() => parseWorkbookBuffer(garbage, "bad.xlsx")).toThrow(ExcelParseError);
  });

  it("rejects a completely empty workbook (header only, no data rows)", () => {
    const buffer = buildWorkbookBuffer([["Date", "Session", "Programme"]]);
    expect(() => parseWorkbookBuffer(buffer, "empty.xlsx")).toThrow(/no data rows/i);
  });

  it("skips fully blank rows in the middle of the sheet", () => {
    const buffer = buildWorkbookBuffer([
      ["Date", "Session"],
      ["18-08-2026", "FN"],
      [null, null],
      ["19-08-2026", "AN"],
    ]);
    const result = parseWorkbookBuffer(buffer, "test.xlsx");
    expect(result.rows).toHaveLength(2);
  });

  it("picks the first sheet that actually has data when a workbook has multiple sheets", () => {
    const worksheet1 = XLSX.utils.aoa_to_sheet([[]]);
    const worksheet2 = XLSX.utils.aoa_to_sheet([
      ["Date", "Session"],
      ["18-08-2026", "FN"],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet1, "Empty");
    XLSX.utils.book_append_sheet(workbook, worksheet2, "Data");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const result = parseWorkbookBuffer(buffer, "multi-sheet.xlsx");
    expect(result.sheetName).toBe("Data");
    expect(result.rows).toHaveLength(1);
  });
});
