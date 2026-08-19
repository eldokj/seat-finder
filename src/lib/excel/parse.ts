import * as XLSX from "xlsx";

/**
 * A parsing failure the admin should see as a plain, human-readable message
 * — never a raw library stack trace. Every throw site in this module uses
 * this class specifically so callers can distinguish "bad file" from an
 * unexpected bug.
 */
export class ExcelParseError extends Error {}

export interface ParsedWorkbook {
  sheetName: string;
  headers: string[];
  /** Raw data rows (excludes the header row), each row aligned to `headers` by index. Fully blank rows are dropped. */
  rows: unknown[][];
}

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_EXTENSIONS = [".xlsx", ".xls"];

/** Validates the file's extension and size before any parsing is attempted. */
export function validateUploadedFile(fileName: string, sizeBytes: number): void {
  const lower = fileName.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    throw new ExcelParseError("Please upload an Excel file (.xlsx or .xls).");
  }
  if (sizeBytes === 0) {
    throw new ExcelParseError("The uploaded file is empty.");
  }
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new ExcelParseError("The uploaded file is too large (max 5 MB).");
  }
}

/**
 * Parses an uploaded workbook into a header row + raw data rows. Picks the
 * first sheet that actually has data (handles "multiple sheets" and "empty
 * sheet" per the spec) and never throws anything but ExcelParseError.
 */
export function parseWorkbookBuffer(buffer: ArrayBuffer, fileName: string): ParsedWorkbook {
  let workbook: XLSX.WorkBook;
  try {
    // cellDates: true so date-formatted Excel cells arrive as JS Date
    // objects instead of ambiguous serial numbers.
    workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  } catch {
    throw new ExcelParseError(
      `Unable to read "${fileName}" — it doesn't look like a valid Excel file.`
    );
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new ExcelParseError("The workbook has no sheets.");
  }

  const sheetName = workbook.SheetNames.find((name) => {
    const sheet = workbook.Sheets[name];
    return Boolean(sheet && sheet["!ref"]);
  });

  if (!sheetName) {
    throw new ExcelParseError("The workbook has no sheets with any data.");
  }

  const sheet = workbook.Sheets[sheetName];
  let grid: unknown[][];
  try {
    grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: null,
    });
  } catch {
    throw new ExcelParseError(`Unable to read sheet "${sheetName}" — the file may be malformed.`);
  }

  if (grid.length === 0) {
    throw new ExcelParseError(`Sheet "${sheetName}" is empty.`);
  }

  const headerRow = grid[0];
  const headers = headerRow.map((cell) => (cell === null || cell === undefined ? "" : String(cell)));

  const rows = grid
    .slice(1)
    .filter((row) => row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ""));

  if (rows.length === 0) {
    throw new ExcelParseError(`Sheet "${sheetName}" has a header row but no data rows.`);
  }

  return { sheetName, headers, rows };
}
