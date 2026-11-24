/**
 * Reusable RFC-4180 CSV utility with spreadsheet formula-injection protection.
 *
 * Safeguards:
 * - Neutralizes leading spreadsheet formula prefixes (`=`, `+`, `-`, `@`),
 *   including values preceded by whitespace/control characters.
 * - Escapes embedded double quotation marks (`"` -> `""`).
 * - Properly quotes cells containing commas, quotes, or line breaks.
 */

export type CsvCellValue = string | number | boolean | null | undefined;

export interface CsvReportSection {
  title: string;
  headers: string[];
  rows: CsvCellValue[][];
}

const FORMULA_INJECTION_PATTERN = /^[\t\r\n ]*[=+\-@]/;

/**
 * Formats and sanitizes a single CSV cell.
 * Numeric finite primitives are preserved as unquoted numbers unless negative,
 * while string values starting with spreadsheet formula characters (`=`, `+`, `-`, `@`)
 * are neutralized with a leading single quote (`'`).
 */
export function sanitizeCsvCell(value: CsvCellValue): string {
  if (value === null || value === undefined) return "";

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    // Neutralize negative numbers only if someone tries formula semantics;
    // standard non-negative financial figures export cleanly as numbers.
    if (value < 0) {
      return `"'${String(value)}"`;
    }
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  let text = String(value);
  let neutralized = false;

  if (FORMULA_INJECTION_PATTERN.test(text)) {
    text = `'${text}`;
    neutralized = true;
  }

  const needsQuotes =
    neutralized ||
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r");

  const escaped = text.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

export function buildCsvRow(cells: CsvCellValue[]): string {
  return cells.map((cell) => sanitizeCsvCell(cell)).join(",");
}

export function buildCsvContent(headers: string[], rows: CsvCellValue[][]): string {
  const lines = [buildCsvRow(headers), ...rows.map((row) => buildCsvRow(row))];
  return lines.join("\r\n");
}

export function buildMultiSectionCsv(sections: CsvReportSection[]): string {
  const blocks = sections.map((section) => {
    const titleRow = buildCsvRow([section.title]);
    const headerRow = buildCsvRow(section.headers);
    const dataRows = section.rows.map((row) => buildCsvRow(row));
    return [titleRow, headerRow, ...dataRows].join("\r\n");
  });
  return blocks.join("\r\n\r\n");
}

export function downloadCsvFile(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
