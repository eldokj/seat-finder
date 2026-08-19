import "server-only";

import * as XLSX from "xlsx";

/**
 * Import/Export architecture (approved) — shared "Download Template"
 * workbook builder. Reuses the same `xlsx` (SheetJS) package already
 * vetted/pinned for the import pipeline and reports-excel.ts — no new
 * dependency. Produces a 2-sheet workbook: the real header row (+ a few
 * example rows) on the first sheet, plain-English instructions on the
 * second — used for every "Download Template" button across the admin
 * portal (Consolidated Exam Data, Room Master, Room Layout).
 */
export interface TemplateInstruction {
  field: string;
  requirement: string;
  notes: string;
}

export function buildTemplateResponse(
  sheetName: string,
  headers: string[],
  exampleRows: (string | number)[][],
  instructions: TemplateInstruction[],
  fileName: string
): Response {
  const dataSheet = XLSX.utils.aoa_to_sheet([headers, ...exampleRows]);
  const instructionsSheet = XLSX.utils.aoa_to_sheet([
    ["Field", "Required?", "Notes"],
    ...instructions.map((i) => [i.field, i.requirement, i.notes]),
  ]);

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, dataSheet, sheetName);
  XLSX.utils.book_append_sheet(book, instructionsSheet, "Instructions");
  const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" });

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
