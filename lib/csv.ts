// Minimal, dependency-free CSV parsing + serialization.
// Handles quoted fields, embedded commas/newlines, and "" escaped quotes.

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export function parseCsv(text: string): ParsedCsv {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  // Strip a UTF-8 BOM if present.
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      // Close the field/record on a line break; swallow \r\n as one.
      if (ch === "\r" && s[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      // Skip fully-empty lines.
      if (record.length > 1 || record[0] !== "") records.push(record);
      record = [];
    } else {
      field += ch;
    }
  }
  // Trailing field/record (no final newline).
  if (field !== "" || record.length > 0) {
    record.push(field);
    if (record.length > 1 || record[0] !== "") records.push(record);
  }

  if (records.length === 0) return { headers: [], rows: [] };
  const headers = records[0].map((h) => h.trim());
  return { headers, rows: records.slice(1) };
}

function escapeField(v: string): string {
  if (/[",\n\r]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers.map(escapeField).join(",")];
  for (const row of rows) {
    lines.push(row.map((c) => escapeField(c === null ? "" : String(c))).join(","));
  }
  return lines.join("\r\n");
}
