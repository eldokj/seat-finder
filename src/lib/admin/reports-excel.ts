import "server-only";

import * as XLSX from "xlsx";

/**
 * Phase 9 — shared Excel-building helper for every report export route.
 * Reuses the same `xlsx` (SheetJS) package already vetted and pinned for
 * the Phase 5 import pipeline — no new dependency, no new CVE surface.
 */
export function buildExcelResponse(sheetName: string, headers: string[], rows: (string | number)[][], fileName: string): Response {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" });

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
