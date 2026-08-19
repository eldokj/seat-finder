import { describe, it, expect } from "vitest";
import {
  classifyConsolidatedRows,
  groupConsolidatedRowsBySession,
  type ExistingConsolidatedSessionsMap,
  type ExistingConsolidatedRegistration,
} from "./consolidated-import";
import type { ExistingStudent } from "./import-shared";
import type { ConsolidatedColumnKey } from "@/lib/excel/columns";

const TARGET_PERIOD = { id: "period-1", startDate: "2026-08-18", endDate: "2026-08-22" };
const NO_SESSIONS: ExistingConsolidatedSessionsMap = new Map();
const NO_STUDENTS: ExistingStudent[] = [];
const NO_REGISTRATIONS: ExistingConsolidatedRegistration[] = [];

function row(rowNumber: number, raw: Partial<Record<ConsolidatedColumnKey, unknown>>) {
  const full: Record<ConsolidatedColumnKey, unknown> = {
    date: "18-08-2026",
    session: "FN",
    year: "2024",
    term: "3",
    programme: "B.Sc CS",
    department: "Computer Science",
    courseCode: "26PSY301",
    course: "Advanced Social Psychology",
    registerNumber: "22BCS034",
    studentName: "Aisha Rahman",
    gender: "F",
    ...raw,
  };
  return { rowNumber, raw: full };
}

function classify(
  rows: { rowNumber: number; raw: Record<ConsolidatedColumnKey, unknown> }[],
  existingSessions: ExistingConsolidatedSessionsMap = NO_SESSIONS,
  existingStudents: ExistingStudent[] = NO_STUDENTS,
  existingRegistrations: ExistingConsolidatedRegistration[] = NO_REGISTRATIONS
) {
  return classifyConsolidatedRows(rows, TARGET_PERIOD, existingSessions, existingStudents, existingRegistrations);
}

describe("classifyConsolidatedRows — field validation", () => {
  it("accepts a valid row as 'added'", () => {
    const { rows, summary } = classify([row(2, {})]);
    expect(rows[0].severity).toBe("valid");
    expect(rows[0].classification).toBe("added");
    expect(summary.added).toBe(1);
    expect(summary.errors).toBe(0);
  });

  it("rejects a missing/invalid date", () => {
    const { rows } = classify([row(2, { date: "31-02-2026" })]);
    expect(rows[0].classification).toBe("rejected");
    expect(rows[0].messages.join(" ")).toMatch(/date/i);
  });

  it("rejects a missing session", () => {
    const { rows } = classify([row(2, { session: "" })]);
    expect(rows[0].classification).toBe("rejected");
    expect(rows[0].messages.join(" ")).toMatch(/session/i);
  });

  for (const field of ["programme", "department", "courseCode", "course", "registerNumber", "studentName"] as const) {
    it(`rejects a missing ${field}`, () => {
      const { rows } = classify([row(2, { [field]: "" })]);
      expect(rows[0].classification).toBe("rejected");
      expect(rows[0].severity).toBe("error");
    });
  }

  it("does not require gender", () => {
    const { rows } = classify([row(2, { gender: "" })]);
    expect(rows[0].classification).toBe("added");
  });

  it("rejects an over-long register number", () => {
    const { rows } = classify([row(2, { registerNumber: "X".repeat(50) })]);
    expect(rows[0].classification).toBe("rejected");
    expect(rows[0].messages.join(" ")).toMatch(/register number/i);
  });

  it("warns on an unreasonable course code format without rejecting", () => {
    const { rows } = classify([row(2, { courseCode: "!!" })]);
    expect(rows[0].severity).toBe("warning");
    expect(rows[0].classification).toBe("added");
  });

  it("rejects a date outside the target examination period", () => {
    const { rows } = classify([row(2, { date: "01-01-2026" })]);
    expect(rows[0].classification).toBe("rejected");
    expect(rows[0].messages.join(" ")).toMatch(/outside the selected examination period/i);
  });
});

describe("classifyConsolidatedRows — Year/Term normalization and validation", () => {
  it("rejects a missing Year", () => {
    const { rows } = classify([row(2, { year: "" })]);
    expect(rows[0].classification).toBe("rejected");
    expect(rows[0].messages.join(" ")).toMatch(/year is required/i);
  });

  it("rejects a missing Term", () => {
    const { rows } = classify([row(2, { term: "" })]);
    expect(rows[0].classification).toBe("rejected");
    expect(rows[0].messages.join(" ")).toMatch(/term is required/i);
  });

  it("rejects a non-numeric Year", () => {
    const { rows } = classify([row(2, { year: "twenty-four" })]);
    expect(rows[0].classification).toBe("rejected");
    expect(rows[0].messages.join(" ")).toMatch(/year/i);
  });

  it("rejects a non-numeric Term", () => {
    const { rows } = classify([row(2, { term: "three" })]);
    expect(rows[0].classification).toBe("rejected");
    expect(rows[0].messages.join(" ")).toMatch(/term/i);
  });

  it("rejects a Year that isn't a plausible 4-digit batch year (e.g. too small)", () => {
    const { rows } = classify([row(2, { year: "3" })]);
    expect(rows[0].classification).toBe("rejected");
    expect(rows[0].messages.join(" ")).toMatch(/year/i);
  });

  it("rejects a Term of zero", () => {
    const { rows } = classify([row(2, { term: "0" })]);
    expect(rows[0].classification).toBe("rejected");
    expect(rows[0].messages.join(" ")).toMatch(/term/i);
  });

  it("rejects a negative Term", () => {
    const { rows } = classify([row(2, { term: "-1" })]);
    expect(rows[0].classification).toBe("rejected");
    expect(rows[0].messages.join(" ")).toMatch(/term/i);
  });

  it("accepts Year/Term supplied as native numbers (Excel numeric cells), not just strings", () => {
    const { rows } = classify([row(2, { year: 2025, term: 6 })]);
    expect(rows[0].classification).toBe("added");
    expect(rows[0].normalized?.year).toBe(2025);
    expect(rows[0].normalized?.term).toBe(6);
  });

  it("does not interpret Year as an ordinal ('First Year' style text is rejected, not coerced)", () => {
    const { rows } = classify([row(2, { year: "First Year" })]);
    expect(rows[0].classification).toBe("rejected");
  });
});

describe("classifyConsolidatedRows — protection rules", () => {
  it("rejects rows targeting a session that belongs to a different period", () => {
    const existing: ExistingConsolidatedSessionsMap = new Map([
      ["2026-08-18|FN", { eventId: "e1", periodId: "some-other-period", status: "draft", records: [] }],
    ]);
    const { rows } = classify([row(2, {})], existing);
    expect(rows[0].classification).toBe("rejected");
    expect(rows[0].messages.join(" ")).toMatch(/different examination period/i);
  });

  it("rejects rows targeting a published session — no override", () => {
    const existing: ExistingConsolidatedSessionsMap = new Map([
      ["2026-08-18|FN", { eventId: "e1", periodId: "period-1", status: "published", records: [] }],
    ]);
    const { rows } = classify([row(2, {})], existing);
    expect(rows[0].classification).toBe("rejected");
    expect(rows[0].messages.join(" ")).toMatch(/published/i);
  });

  it("rejects rows targeting a closed session", () => {
    const existing: ExistingConsolidatedSessionsMap = new Map([
      ["2026-08-18|FN", { eventId: "e1", periodId: "period-1", status: "closed", records: [] }],
    ]);
    const { rows } = classify([row(2, {})], existing);
    expect(rows[0].classification).toBe("rejected");
    expect(rows[0].messages.join(" ")).toMatch(/closed/i);
  });

  it("allows rows targeting a draft session belonging to the same period", () => {
    const existing: ExistingConsolidatedSessionsMap = new Map([
      ["2026-08-18|FN", { eventId: "e1", periodId: "period-1", status: "draft", records: [] }],
    ]);
    const { rows } = classify([row(2, {})], existing);
    expect(rows[0].classification).toBe("added");
  });

  it("allows adopting a session with no period assigned yet", () => {
    const existing: ExistingConsolidatedSessionsMap = new Map([
      ["2026-08-18|FN", { eventId: "e1", periodId: null, status: "draft", records: [] }],
    ]);
    const { rows } = classify([row(2, {})], existing);
    expect(rows[0].classification).toBe("added");
  });
});

describe("classifyConsolidatedRows — within-file duplicate/conflict detection", () => {
  it("flags an exact duplicate (same student, date, session, course, Year, Term) within the file", () => {
    const { rows, summary } = classify([row(2, {}), row(3, {})]);
    expect(rows[0].classification).toBe("added");
    expect(rows[1].classification).toBe("rejected");
    expect(rows[1].messages.join(" ")).toMatch(/duplicate of row 2/i);
    expect(summary.rejected).toBe(1);
  });

  it("rejects the same student appearing under a different course in the same date+session", () => {
    const { rows } = classify([row(2, {}), row(3, { courseCode: "26CSE101", course: "Compilers" })]);
    expect(rows[0].classification).toBe("added");
    expect(rows[1].classification).toBe("rejected");
    expect(rows[1].messages.join(" ")).toMatch(/different course/i);
  });

  it("rejects the same student appearing under the SAME Course Code but a different Year in the same date+session (approved decision #5 — Course Code alone is not course identity)", () => {
    const { rows } = classify([row(2, {}), row(3, { year: "2025", registerNumber: "22BCS034" })]);
    expect(rows[0].classification).toBe("added");
    expect(rows[1].classification).toBe("rejected");
    expect(rows[1].messages.join(" ")).toMatch(/different course/i);
  });

  it("rejects the same student appearing under the SAME Course Code but a different Term in the same date+session", () => {
    const { rows } = classify([row(2, {}), row(3, { term: "5", registerNumber: "22BCS034" })]);
    expect(rows[0].classification).toBe("added");
    expect(rows[1].classification).toBe("rejected");
    expect(rows[1].messages.join(" ")).toMatch(/different course/i);
  });

  it("allows the same student in two DIFFERENT date+session slots", () => {
    const { rows } = classify([row(2, {}), row(3, { date: "19-08-2026", courseCode: "26CSE101", course: "Compilers" })]);
    expect(rows[0].classification).toBe("added");
    expect(rows[1].classification).toBe("added");
  });

  it("warns (not rejects) when the same student's Programme/Department differs from an earlier row in the file", () => {
    const { rows } = classify([
      row(2, { date: "19-08-2026" }),
      row(3, { date: "20-08-2026", programme: "B.Sc Physics" }),
    ]);
    expect(rows[1].severity).toBe("warning");
    expect(rows[1].classification).not.toBe("rejected");
    expect(rows[1].messages.join(" ")).toMatch(/programme\/department differs/i);
  });

  it("warns when the course name for the same group differs within the file", () => {
    const { rows } = classify([
      row(2, { registerNumber: "22BCS034" }),
      row(3, { registerNumber: "22BCS035", studentName: "Karthik Nair", course: "Social Psychology Advanced" }),
    ]);
    expect(rows[1].severity).toBe("warning");
    expect(rows[1].messages.join(" ")).toMatch(/course name differs/i);
  });

  it("does NOT warn about course name differing when the rows differ in Year (they're different groups, not the same one)", () => {
    const { rows } = classify([
      row(2, { registerNumber: "22BCS034" }),
      row(3, { registerNumber: "22BCS035", studentName: "Karthik Nair", year: "2025", course: "Totally Different Name" }),
    ]);
    expect(rows[1].severity).toBe("valid");
  });
});

describe("classifyConsolidatedRows — against existing DB state", () => {
  const existingStudent: ExistingStudent = {
    registerNoKey: "22BCS034",
    fullName: "Aisha Rahman",
    programme: "B.Sc CS",
    department: "Computer Science",
    gender: "F",
  };
  const existingRegistration: ExistingConsolidatedRegistration = {
    registerNoKey: "22BCS034",
    examDate: "2026-08-18",
    session: "FN",
    programme: "B.Sc CS",
    courseCode: "26PSY301",
    year: 2024,
    term: 3,
  };

  it("classifies as 'unchanged' when the registration and profile both already match", () => {
    const { rows } = classify([row(2, {})], NO_SESSIONS, [existingStudent], [existingRegistration]);
    expect(rows[0].classification).toBe("unchanged");
  });

  it("classifies as 'updated' when the registration matches but the profile changed", () => {
    const { rows } = classify([row(2, { studentName: "Aisha R. Rahman" })], NO_SESSIONS, [existingStudent], [existingRegistration]);
    expect(rows[0].classification).toBe("updated");
  });

  it("rejects when the student is already registered for a DIFFERENT course this session", () => {
    const conflicting: ExistingConsolidatedRegistration = { ...existingRegistration, courseCode: "26CSE999" };
    const { rows } = classify([row(2, {})], NO_SESSIONS, [existingStudent], [conflicting]);
    expect(rows[0].classification).toBe("rejected");
    expect(rows[0].messages.join(" ")).toMatch(/already registered for a different course/i);
  });

  it("rejects when the existing registration's Course Code matches but Year differs (approved decision #5)", () => {
    const conflicting: ExistingConsolidatedRegistration = { ...existingRegistration, year: 2025 };
    const { rows } = classify([row(2, {})], NO_SESSIONS, [existingStudent], [conflicting]);
    expect(rows[0].classification).toBe("rejected");
    expect(rows[0].messages.join(" ")).toMatch(/already registered for a different course/i);
  });

  it("rejects when the existing registration's Course Code matches but Term differs", () => {
    const conflicting: ExistingConsolidatedRegistration = { ...existingRegistration, term: 5 };
    const { rows } = classify([row(2, {})], NO_SESSIONS, [existingStudent], [conflicting]);
    expect(rows[0].classification).toBe("rejected");
    expect(rows[0].messages.join(" ")).toMatch(/already registered for a different course/i);
  });

  it("warns when the file's course name conflicts with the existing saved record for the same Year/Term", () => {
    const existing: ExistingConsolidatedSessionsMap = new Map([
      [
        "2026-08-18|FN",
        {
          eventId: "e1",
          periodId: "period-1",
          status: "draft",
          records: [{ programme: "B.Sc CS", courseCode: "26PSY301", courseName: "Social Psychology (Old Name)", year: 2024, term: 3, strength: 40 }],
        },
      ],
    ]);
    const { rows } = classify([row(2, {})], existing);
    expect(rows[0].severity).toBe("warning");
    expect(rows[0].messages.join(" ")).toMatch(/doesn't exactly match the existing record/i);
  });

  it("does NOT warn about course name when the existing record has the same Programme+CourseCode but a different Year/Term (different course context)", () => {
    const existing: ExistingConsolidatedSessionsMap = new Map([
      [
        "2026-08-18|FN",
        {
          eventId: "e1",
          periodId: "period-1",
          status: "draft",
          records: [{ programme: "B.Sc CS", courseCode: "26PSY301", courseName: "Completely Different Course Name", year: 2025, term: 1, strength: 40 }],
        },
      ],
    ]);
    const { rows } = classify([row(2, {})], existing);
    expect(rows[0].severity).toBe("valid");
  });
});

describe("classifyConsolidatedRows — automatic strength / course grouping", () => {
  it("computes Strength as the count of non-rejected rows in the (date,session,programme,courseCode,year,term) group", () => {
    const { courseGroups } = classify([
      row(2, { registerNumber: "22BCS034" }),
      row(3, { registerNumber: "22BCS035", studentName: "Karthik Nair" }),
      row(4, { registerNumber: "22BCS036", studentName: "Divya Suresh" }),
    ]);
    expect(courseGroups).toHaveLength(1);
    expect(courseGroups[0].computedStrength).toBe(3);
    expect(courseGroups[0].classification).toBe("added");
    expect(courseGroups[0].year).toBe(2024);
    expect(courseGroups[0].term).toBe(3);
  });

  it("excludes rejected rows from the computed Strength", () => {
    const { courseGroups, summary } = classify([
      row(2, { registerNumber: "22BCS034" }),
      row(3, { registerNumber: "" }), // rejected: missing register number
      row(4, { registerNumber: "22BCS036", studentName: "Divya Suresh" }),
    ]);
    expect(summary.rejected).toBe(1);
    expect(courseGroups[0].computedStrength).toBe(2);
  });

  it("classifies a course group as 'unchanged' when the computed strength matches the existing record", () => {
    const existing: ExistingConsolidatedSessionsMap = new Map([
      [
        "2026-08-18|FN",
        {
          eventId: "e1",
          periodId: "period-1",
          status: "draft",
          records: [{ programme: "B.Sc CS", courseCode: "26PSY301", courseName: "Advanced Social Psychology", year: 2024, term: 3, strength: 1 }],
        },
      ],
    ]);
    const { courseGroups } = classify([row(2, {})], existing);
    expect(courseGroups[0].classification).toBe("unchanged");
    expect(courseGroups[0].existingStrength).toBe(1);
  });

  it("classifies a course group as 'updated' when the computed strength differs from the existing record", () => {
    const existing: ExistingConsolidatedSessionsMap = new Map([
      [
        "2026-08-18|FN",
        {
          eventId: "e1",
          periodId: "period-1",
          status: "draft",
          records: [{ programme: "B.Sc CS", courseCode: "26PSY301", courseName: "Advanced Social Psychology", year: 2024, term: 3, strength: 5 }],
        },
      ],
    ]);
    const { courseGroups } = classify([row(2, {})], existing);
    expect(courseGroups[0].classification).toBe("updated");
    expect(courseGroups[0].existingStrength).toBe(5);
  });

  it("produces separate groups for different Date+Session+Programme+CourseCode combinations", () => {
    const { courseGroups } = classify([
      row(2, {}),
      row(3, { date: "19-08-2026", registerNumber: "22BCS035", studentName: "Karthik Nair" }),
      row(4, { programme: "B.Com General", courseCode: "22UCO212", course: "Financial Accounting", registerNumber: "22BCM011", studentName: "Divya Suresh" }),
    ]);
    expect(courseGroups).toHaveLength(3);
  });

  it("treats the same Programme+CourseCode with a different Year as a SEPARATE course group, never merged (approved decision #4)", () => {
    const { courseGroups } = classify([
      row(2, { registerNumber: "22BCS034" }),
      row(3, { registerNumber: "22BCS099", studentName: "Repeat Student", year: "2025" }),
    ]);
    expect(courseGroups).toHaveLength(2);
    const byYear = new Map(courseGroups.map((g) => [g.year, g]));
    expect(byYear.get(2024)?.computedStrength).toBe(1);
    expect(byYear.get(2025)?.computedStrength).toBe(1);
  });

  it("treats the same Programme+CourseCode with a different Term (same Year) as a SEPARATE course group", () => {
    const { courseGroups } = classify([
      row(2, { registerNumber: "22BCS034" }),
      row(3, { registerNumber: "22BCS099", studentName: "Backlog Student", term: "5" }),
    ]);
    expect(courseGroups).toHaveLength(2);
    const byTerm = new Map(courseGroups.map((g) => [g.term, g]));
    expect(byTerm.get(3)?.computedStrength).toBe(1);
    expect(byTerm.get(5)?.computedStrength).toBe(1);
  });

  it("computes Strength separately per Year/Term group even when every other field is identical", () => {
    const { courseGroups } = classify([
      row(2, { registerNumber: "22BCS034" }),
      row(3, { registerNumber: "22BCS035", studentName: "Karthik Nair" }), // same year/term as row 2 -> same group
      row(4, { registerNumber: "22BCS099", studentName: "Arrear Student", year: "2023", term: "6" }), // different group
    ]);
    expect(courseGroups).toHaveLength(2);
    const currentGroup = courseGroups.find((g) => g.year === 2024 && g.term === 3)!;
    const arrearGroup = courseGroups.find((g) => g.year === 2023 && g.term === 6)!;
    expect(currentGroup.computedStrength).toBe(2);
    expect(arrearGroup.computedStrength).toBe(1);
  });
});

describe("classifyConsolidatedRows — repeated import is idempotent (primary-workflow requirement)", () => {
  it("re-uploading the exact same file after a successful import classifies every row and the course group as 'unchanged'", () => {
    // Models the DB state exactly as it would be right after a first
    // successful import of these same 3 rows: same course, same strength,
    // same students, same registrations.
    const existingSessions: ExistingConsolidatedSessionsMap = new Map([
      [
        "2026-08-18|FN",
        {
          eventId: "e1",
          periodId: "period-1",
          status: "draft",
          records: [{ programme: "B.Sc CS", courseCode: "26PSY301", courseName: "Advanced Social Psychology", year: 2024, term: 3, strength: 3 }],
        },
      ],
    ]);
    const existingStudents: ExistingStudent[] = [
      { registerNoKey: "22BCS034", fullName: "Aisha Rahman", programme: "B.Sc CS", department: "Computer Science", gender: "F" },
      { registerNoKey: "22BCS035", fullName: "Karthik Nair", programme: "B.Sc CS", department: "Computer Science", gender: "M" },
      { registerNoKey: "22BCS036", fullName: "Divya Suresh", programme: "B.Sc CS", department: "Computer Science", gender: "F" },
    ];
    const existingRegistrations: ExistingConsolidatedRegistration[] = existingStudents.map((s) => ({
      registerNoKey: s.registerNoKey,
      examDate: "2026-08-18",
      session: "FN",
      programme: "B.Sc CS",
      courseCode: "26PSY301",
      year: 2024,
      term: 3,
    }));

    const sameFileAgain = [
      row(2, { registerNumber: "22BCS034" }),
      row(3, { registerNumber: "22BCS035", studentName: "Karthik Nair", gender: "M" }),
      row(4, { registerNumber: "22BCS036", studentName: "Divya Suresh" }),
    ];
    const { rows, courseGroups, summary } = classify(sameFileAgain, existingSessions, existingStudents, existingRegistrations);

    expect(rows.every((r) => r.classification === "unchanged")).toBe(true);
    expect(summary).toMatchObject({ added: 0, updated: 0, unchanged: 3, rejected: 0 });
    expect(courseGroups).toHaveLength(1);
    expect(courseGroups[0].classification).toBe("unchanged");
    expect(courseGroups[0].computedStrength).toBe(3);
    expect(courseGroups[0].existingStrength).toBe(3);
  });

  it("does not recreate or duplicate existing valid data on a repeated import", () => {
    const existingSessions: ExistingConsolidatedSessionsMap = new Map([
      ["2026-08-18|FN", { eventId: "e1", periodId: "period-1", status: "draft", records: [{ programme: "B.Sc CS", courseCode: "26PSY301", courseName: "Advanced Social Psychology", year: 2024, term: 3, strength: 1 }] }],
    ]);
    const existingStudents: ExistingStudent[] = [{ registerNoKey: "22BCS034", fullName: "Aisha Rahman", programme: "B.Sc CS", department: "Computer Science", gender: "F" }];
    const existingRegistrations: ExistingConsolidatedRegistration[] = [
      { registerNoKey: "22BCS034", examDate: "2026-08-18", session: "FN", programme: "B.Sc CS", courseCode: "26PSY301", year: 2024, term: 3 },
    ];

    const { rows } = classify([row(2, {})], existingSessions, existingStudents, existingRegistrations);
    // "unchanged" is a purely informational classification — the write
    // layer (exam-data/actions.ts) explicitly skips DB writes for
    // "unchanged" rows, which is what actually prevents duplication; this
    // asserts the classifier correctly signals that skip.
    expect(rows[0].classification).toBe("unchanged");
  });
});

describe("classifyConsolidatedRows — late student additions (primary-workflow requirement)", () => {
  it("adding one new student to an already-imported course updates only the group's strength — existing students stay 'unchanged'", () => {
    const existingSessions: ExistingConsolidatedSessionsMap = new Map([
      [
        "2026-08-18|FN",
        {
          eventId: "e1",
          periodId: "period-1",
          status: "draft",
          records: [{ programme: "B.Sc CS", courseCode: "26PSY301", courseName: "Advanced Social Psychology", year: 2024, term: 3, strength: 2 }],
        },
      ],
    ]);
    const existingStudents: ExistingStudent[] = [
      { registerNoKey: "22BCS034", fullName: "Aisha Rahman", programme: "B.Sc CS", department: "Computer Science", gender: "F" },
      { registerNoKey: "22BCS035", fullName: "Karthik Nair", programme: "B.Sc CS", department: "Computer Science", gender: "M" },
    ];
    const existingRegistrations: ExistingConsolidatedRegistration[] = existingStudents.map((s) => ({
      registerNoKey: s.registerNoKey,
      examDate: "2026-08-18",
      session: "FN",
      programme: "B.Sc CS",
      courseCode: "26PSY301",
      year: 2024,
      term: 3,
    }));

    // The updated file re-includes both original students plus one late addition.
    const updatedFile = [
      row(2, { registerNumber: "22BCS034" }),
      row(3, { registerNumber: "22BCS035", studentName: "Karthik Nair", gender: "M" }),
      row(4, { registerNumber: "22BCS037", studentName: "Late Student", gender: "F" }),
    ];
    const { rows, courseGroups, summary } = classify(updatedFile, existingSessions, existingStudents, existingRegistrations);

    expect(rows[0].classification).toBe("unchanged");
    expect(rows[1].classification).toBe("unchanged");
    expect(rows[2].classification).toBe("added");
    expect(summary).toMatchObject({ added: 1, updated: 0, unchanged: 2, rejected: 0 });

    expect(courseGroups).toHaveLength(1);
    expect(courseGroups[0].classification).toBe("updated"); // strength 2 -> 3
    expect(courseGroups[0].computedStrength).toBe(3);
    expect(courseGroups[0].existingStrength).toBe(2);
  });

  it("a late addition to a brand-new course (no prior import) still classifies the whole group as 'added'", () => {
    const { rows, courseGroups } = classify([
      row(2, { registerNumber: "22BCS034" }),
      row(3, { registerNumber: "22BCS099", studentName: "New Student", courseCode: "26PSY301" }),
    ]);
    expect(rows.every((r) => r.classification === "added")).toBe(true);
    expect(courseGroups[0].classification).toBe("added");
    expect(courseGroups[0].computedStrength).toBe(2);
  });

  it("a late arrear registration under the same Course Code but a different Year/Term forms its own group instead of inflating the current batch's strength", () => {
    const existingSessions: ExistingConsolidatedSessionsMap = new Map([
      [
        "2026-08-18|FN",
        {
          eventId: "e1",
          periodId: "period-1",
          status: "draft",
          records: [{ programme: "B.Sc CS", courseCode: "26PSY301", courseName: "Advanced Social Psychology", year: 2024, term: 3, strength: 1 }],
        },
      ],
    ]);
    const existingStudents: ExistingStudent[] = [
      { registerNoKey: "22BCS034", fullName: "Aisha Rahman", programme: "B.Sc CS", department: "Computer Science", gender: "F" },
    ];
    const existingRegistrations: ExistingConsolidatedRegistration[] = [
      { registerNoKey: "22BCS034", examDate: "2026-08-18", session: "FN", programme: "B.Sc CS", courseCode: "26PSY301", year: 2024, term: 3 },
    ];

    // Same file re-includes the current-batch student plus a late arrear
    // registration for a DIFFERENT batch (2023, Term 6) under the same code.
    const updatedFile = [
      row(2, { registerNumber: "22BCS034" }),
      row(3, { registerNumber: "22BCS999", studentName: "Arrear Student", year: "2023", term: "6" }),
    ];
    const { rows, courseGroups } = classify(updatedFile, existingSessions, existingStudents, existingRegistrations);

    expect(rows[0].classification).toBe("unchanged");
    expect(rows[1].classification).toBe("added");

    expect(courseGroups).toHaveLength(2);
    const currentBatch = courseGroups.find((g) => g.year === 2024 && g.term === 3)!;
    const arrearBatch = courseGroups.find((g) => g.year === 2023 && g.term === 6)!;
    expect(currentBatch.classification).toBe("unchanged");
    expect(currentBatch.computedStrength).toBe(1); // NOT inflated to 2
    expect(arrearBatch.classification).toBe("added");
    expect(arrearBatch.computedStrength).toBe(1);
  });
});

describe("groupConsolidatedRowsBySession", () => {
  it("groups rows by (date, session)", () => {
    const { rows } = classify([row(2, {}), row(3, { date: "19-08-2026", registerNumber: "22BCS035", studentName: "Karthik Nair" })]);
    const { sessions, unplaced } = groupConsolidatedRowsBySession(rows);
    expect(sessions.size).toBe(2);
    expect(unplaced).toHaveLength(0);
  });

  it("moves rows with no determinable session to unplaced", () => {
    const { rows } = classify([row(2, { date: "not-a-date" })]);
    const { sessions, unplaced } = groupConsolidatedRowsBySession(rows);
    expect(sessions.size).toBe(0);
    expect(unplaced).toHaveLength(1);
  });

  it("moves an entirely-rejected session group to unplaced instead of creating a phantom session", () => {
    const { rows } = classify([row(2, { date: "01-01-2026" })]); // outside period -> rejected, but has a normalized date
    const { sessions, unplaced } = groupConsolidatedRowsBySession(rows);
    expect(sessions.size).toBe(0);
    expect(unplaced).toHaveLength(1);
  });
});
