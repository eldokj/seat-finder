import { describe, it, expect } from "vitest";
import { matchColumns, projectRows, CONSOLIDATED_COLUMNS, ROOM_COLUMNS, type ConsolidatedColumnKey } from "./columns";
import { classifyConsolidatedRows } from "@/lib/validation/consolidated-import";

describe("matchColumns", () => {
  it("matches exact headers", () => {
    const { mapping, missingRequired } = matchColumns(
      ["Date", "Session", "Year", "Term", "Programme", "Department", "Course Code", "Course", "Register No", "Student Name"],
      CONSOLIDATED_COLUMNS
    );
    expect(missingRequired).toHaveLength(0);
    expect(mapping.date).toBe(0);
    expect(mapping.year).toBe(2);
    expect(mapping.term).toBe(3);
    expect(mapping.registerNumber).toBe(8);
  });

  it("matches renamed/aliased headers case- and whitespace-insensitively", () => {
    const { mapping, missingRequired } = matchColumns(
      ["  date ", "SESSION", "Batch Year", "Semester", "program", "dept", "CourseCode", "course name", "Reg No", "name"],
      CONSOLIDATED_COLUMNS
    );
    expect(missingRequired).toHaveLength(0);
    expect(mapping.year).toBe(2);
    expect(mapping.term).toBe(3);
    expect(mapping.programme).toBe(4);
    expect(mapping.department).toBe(5);
    expect(mapping.courseCode).toBe(6);
    expect(mapping.course).toBe(7);
    expect(mapping.registerNumber).toBe(8);
    expect(mapping.studentName).toBe(9);
  });

  it("reports every missing required column", () => {
    const { missingRequired } = matchColumns(["Date", "Session"], CONSOLIDATED_COLUMNS);
    expect(missingRequired.map((m) => m.key).sort()).toEqual(
      ["course", "courseCode", "department", "programme", "registerNumber", "studentName", "term", "year"].sort()
    );
  });

  it("treats Gender as optional for the consolidated columns", () => {
    const { missingRequired } = matchColumns(
      ["Date", "Session", "Year", "Term", "Programme", "Department", "Course Code", "Course", "Register No", "Student Name"],
      CONSOLIDATED_COLUMNS
    );
    expect(missingRequired).toHaveLength(0);
  });

  it("treats Year and Term as mandatory for the consolidated columns", () => {
    const { missingRequired } = matchColumns(
      ["Date", "Session", "Programme", "Department", "Course Code", "Course", "Register No", "Student Name"],
      CONSOLIDATED_COLUMNS
    );
    expect(missingRequired.map((m) => m.key).sort()).toEqual(["term", "year"]);
  });

  it("treats Block/Floor/Landmark as optional for the room columns", () => {
    const withoutOptionalFields = matchColumns(["Room Number", "Code", "Additional Seats", "Status"], ROOM_COLUMNS);
    expect(withoutOptionalFields.missingRequired).toHaveLength(0);

    const withOptionalFields = matchColumns(["Room Number", "Code", "Block", "Floor", "Landmark"], ROOM_COLUMNS);
    expect(withOptionalFields.missingRequired).toHaveLength(0);
    expect(withOptionalFields.mapping.block).toBe(2);
  });
});

describe("Consolidated Exam Data — export/import round trip (approved decision #7/#8)", () => {
  // The exact header order the export route and the template route both
  // produce (Date, Session, Year, Term, Programme, Department, Course Code,
  // Course, Register No, Student Name, Gender) — a file downloaded from
  // /api/admin/exam-data/export must be re-importable without any manual
  // column remapping.
  const EXPORTED_HEADERS = ["Date", "Session", "Year", "Term", "Programme", "Department", "Course Code", "Course", "Register No", "Student Name", "Gender"];

  it("matches every column of a freshly-exported file with zero missing required columns", () => {
    const { mapping, missingRequired } = matchColumns(EXPORTED_HEADERS, CONSOLIDATED_COLUMNS);
    expect(missingRequired).toHaveLength(0);
    expect(mapping).toEqual({
      date: 0,
      session: 1,
      year: 2,
      term: 3,
      programme: 4,
      department: 5,
      courseCode: 6,
      course: 7,
      registerNumber: 8,
      studentName: 9,
      gender: 10,
    });
  });

  it("a row shaped exactly like an exported data row re-classifies cleanly as 'unchanged' against the state it was exported from", () => {
    const exportedDataRow = ["2026-08-18", "FN", 2024, 3, "B.Sc CS", "Computer Science", "26PSY301", "Advanced Social Psychology", "22BCS034", "Aisha Rahman", "F"];
    const { mapping } = matchColumns(EXPORTED_HEADERS, CONSOLIDATED_COLUMNS);
    const projected = projectRows<ConsolidatedColumnKey>([exportedDataRow], mapping);

    const existingSessions = new Map([
      [
        "2026-08-18|FN",
        {
          eventId: "e1",
          periodId: "period-1",
          status: "draft" as const,
          records: [{ programme: "B.Sc CS", courseCode: "26PSY301", courseName: "Advanced Social Psychology", year: 2024, term: 3, strength: 1 }],
        },
      ],
    ]);
    const existingStudents = [{ registerNoKey: "22BCS034", fullName: "Aisha Rahman", programme: "B.Sc CS", department: "Computer Science", gender: "F" }];
    const existingRegistrations = [
      { registerNoKey: "22BCS034", examDate: "2026-08-18", session: "FN" as const, programme: "B.Sc CS", courseCode: "26PSY301", year: 2024, term: 3 },
    ];

    const { rows } = classifyConsolidatedRows(
      [{ rowNumber: 2, raw: projected[0] }],
      { id: "period-1", startDate: "2026-08-01", endDate: "2026-08-31" },
      existingSessions,
      existingStudents,
      existingRegistrations
    );

    expect(rows[0].classification).toBe("unchanged");
    expect(rows[0].normalized?.year).toBe(2024);
    expect(rows[0].normalized?.term).toBe(3);
  });
});

describe("projectRows", () => {
  it("projects raw row arrays into keyed objects using the resolved mapping", () => {
    const { mapping } = matchColumns(["Date", "Session"], [
      { key: "date" as const, label: "Date", aliases: [], required: true },
      { key: "session" as const, label: "Session", aliases: [], required: true },
    ]);
    const projected = projectRows([["18-08-2026", "FN"]], mapping);
    expect(projected[0]).toEqual({ date: "18-08-2026", session: "FN" });
  });
});
