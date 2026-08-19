import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { buildTemplateResponse } from "@/lib/admin/excel-template";

const HEADERS = ["Date", "Session", "Year", "Term", "Programme", "Department", "Course Code", "Course", "Register No", "Student Name", "Gender"];

const EXAMPLE_ROWS = [
  ["18-08-2026", "FN", "2024", "3", "B.Sc Computer Science", "Computer Science", "22UCS301", "Data Structures", "22BCS034", "Aisha Rahman", "F"],
  ["18-08-2026", "FN", "2024", "3", "B.Sc Computer Science", "Computer Science", "22UCS301", "Data Structures", "22BCS035", "Karthik Nair", "M"],
  ["18-08-2026", "AN", "2025", "1", "B.Com General", "Commerce", "22UCO212", "Financial Accounting", "22BCM011", "Divya Suresh", "F"],
];

const HOW_THIS_WORKS = [
  { field: "(How this works)", requirement: "Read first", notes: "One row = one student's registration for one course. Date + Session determines which Daily Exam Session the row belongs to (created or reused automatically). Programme + Course Code + Year + Term together identify one course group. Register No identifies the student (existing student records are matched and reused, never duplicated)." },
  { field: "(Strength)", requirement: "Automatic", notes: "Never a column in this file — always calculated by counting how many student rows share the same Date + Session + Programme + Course Code + Year + Term. Two groups with the same Programme and Course Code but a different Year or Term are counted separately, never combined." },
  { field: "(Duplicates)", requirement: "Avoid", notes: "Do not repeat the same student + course + year + term + session in more than one row — duplicates are rejected during import, not silently merged." },
  { field: "(Timetable / Roster)", requirement: "Not required", notes: "A successful import of this file is enough on its own — you do not need to separately upload the Master Timetable or Student Roster for the same exam." },
];

const INSTRUCTIONS = [
  { field: "Date", requirement: "Required", notes: "The examination date. Accepts DD-MM-YYYY, DD/MM/YYYY, or an Excel date cell. Must fall within the Examination Period selected on the upload screen." },
  { field: "Session", requirement: "Required", notes: "FN (forenoon) or AN (afternoon) only." },
  { field: "Year", requirement: "Required", notes: "The student's academic/admission batch year, e.g. \"2024\", \"2025\", \"2026\". This is the year the student's batch was admitted — NOT \"First Year\"/\"Second Year\"." },
  { field: "Term", requirement: "Required", notes: "The academic term/semester number, e.g. \"1\", \"2\", \"3\" ... \"6\". Combined with Date + Session + Programme + Course Code, this defines one course context — the same Course Code used by a different Year/Term (e.g. an arrear paper) is treated as a separate course, not merged." },
  { field: "Programme", requirement: "Required", notes: "e.g. \"B.Sc Computer Science\". Every row for a student should use the same Programme." },
  { field: "Department", requirement: "Required", notes: "e.g. \"Computer Science\". Stored on the student record, not the timetable." },
  { field: "Course Code", requirement: "Required", notes: "e.g. \"22UCS301\". Combined with Date + Session + Programme + Year + Term, this defines one course; every student row under it counts toward that course's Strength." },
  { field: "Course", requirement: "Required", notes: "The course's full name. Keep it identical across every row for the same Course Code + Year + Term." },
  { field: "Register No", requirement: "Required", notes: "The student's register number. Must be unique per student per Date + Session." },
  { field: "Student Name", requirement: "Required", notes: "The student's full name." },
  { field: "Gender", requirement: "Optional", notes: "Used only for the optional gender-mixing seating preference." },
];

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return buildTemplateResponse(
    "Exam Data",
    HEADERS,
    EXAMPLE_ROWS,
    [...HOW_THIS_WORKS, ...INSTRUCTIONS],
    "EXAM_DATA_TEMPLATE.xlsx"
  );
}
