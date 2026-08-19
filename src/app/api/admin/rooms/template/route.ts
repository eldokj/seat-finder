import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { buildTemplateResponse } from "@/lib/admin/excel-template";

const HEADERS = ["Room Number", "Code", "Block", "Floor", "Landmark", "Rows", "Columns", "Additional Seats", "Status"];

const EXAMPLE_ROWS = [
  ["Main Block Room 101", "M101", "Main Block", "Ground", "Near main gate", 5, 9, 5, "Active"],
  ["Main Block Room 102", "M102", "Main Block", "Ground", "", 8, 9, 0, "Active"],
  ["Science Block Room 3", "S103", "Science Block", "First", "", 6, 10, 4, "Active"],
];

const INSTRUCTIONS = [
  { field: "Room Number", requirement: "Required", notes: "Display name shown throughout the admin portal, e.g. \"Main Block Room 101\"." },
  { field: "Code", requirement: "Required", notes: "Short unique identifier, e.g. \"M101\". Used to match this row against an existing room — same Code updates it, a new Code creates a room." },
  { field: "Block", requirement: "Optional", notes: "Building name." },
  { field: "Floor", requirement: "Optional", notes: "" },
  { field: "Landmark", requirement: "Optional", notes: "A short location hint." },
  { field: "Rows", requirement: "Required only for a brand-new room", notes: "Informational only — used just to estimate starting capacity (Rows × Columns + Additional Seats). Never generates or changes the room's actual seat layout. Ignored entirely for a room that already has a saved layout." },
  { field: "Columns", requirement: "Required only for a brand-new room", notes: "Same as Rows." },
  { field: "Additional Seats", requirement: "Optional (default 0)", notes: "Overflow/backup seats, whole number." },
  { field: "Status", requirement: "Optional (default Active)", notes: "\"Active\" or \"Inactive\"." },
];

export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return buildTemplateResponse("Rooms", HEADERS, EXAMPLE_ROWS, INSTRUCTIONS, "ROOM_MASTER_TEMPLATE.xlsx");
}
