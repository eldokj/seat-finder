import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { buildTemplateResponse } from "@/lib/admin/excel-template";

const HEADERS = ["Room Number", "Row", "Column", "Section", "Seat Label", "Position Type", "Status"];

const EXAMPLE_ROWS = [
  ["M101", 1, 1, "A", "A1", "seat", "available"],
  ["M101", 1, 2, "A", "A2", "gap", "available"],
  ["M101", 1, 3, "A", "A3", "seat", "available"],
  ["M101", 1, 4, "A", "A4", "seat", "disabled"],
];

const INSTRUCTIONS = [
  { field: "Room Number", requirement: "Required", notes: "The target room's Code (e.g. \"M101\"). The room must already exist — this import never creates rooms." },
  { field: "Row", requirement: "Required", notes: "Whole number, 1 or greater." },
  { field: "Column", requirement: "Required", notes: "Whole number, 1 or greater." },
  { field: "Section", requirement: "Optional", notes: "A free-text zone label, if you use one." },
  { field: "Seat Label", requirement: "Required for Position Type = Seat", notes: "Must be unique within the room. Leave blank for a Gap." },
  { field: "Position Type", requirement: "Required", notes: "\"Seat\" (a real, placeable seat) or \"Gap\" (an aisle/skip — never placeable)." },
  { field: "Status", requirement: "Optional (default Available)", notes: "\"Available\" or \"Disabled\". Only meaningful for a Seat." },
];

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return buildTemplateResponse(
    "Room Layout",
    HEADERS,
    EXAMPLE_ROWS,
    [
      ...INSTRUCTIONS,
      {
        field: "(the whole file)",
        requirement: "Represents the FULL layout",
        notes: "Every position you want the room to have must be in the file — a position that currently exists but is left out will be removed, UNLESS a student is already seated there (that room's import is rejected instead, nothing is silently skipped).",
      },
    ],
    "ROOM_LAYOUT_TEMPLATE.xlsx"
  );
}
