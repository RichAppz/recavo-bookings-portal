/**
 * Small RFC 4180 CSV reader/writer for client-side imports. Handles quoted fields,
 * embedded commas/newlines, doubled quotes, CRLF and a UTF-8 BOM. Comma or semicolon
 * delimiter is sniffed from the header row (continental exports use `;`).
 */
export type CsvTable = {
  headers: string[];
  rows: string[][];
  delimiter: string;
};

export function parseCsv(text: string): CsvTable {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const delimiter = sniffDelimiter(input);
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      records.push(record);
      record = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  // Drop fully blank trailing/interior lines (a stray newline at EOF is the common case).
  const nonEmpty = records.filter((r) => r.some((cell) => cell.trim().length > 0));
  const [headerRow, ...rows] = nonEmpty;
  const headers = (headerRow ?? []).map((h) => h.trim());
  return {
    headers,
    rows: rows.map((r) => padTo(r, headers.length)),
    delimiter,
  };
}

function sniffDelimiter(input: string): string {
  const firstLine = input.split(/\r?\n/, 1)[0] ?? "";
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

function padTo(row: string[], length: number): string[] {
  if (row.length >= length) return row.slice(0, length);
  return [...row, ...Array.from({ length: length - row.length }, () => "")];
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (value: string | number | null | undefined) => {
    const s = value === null || value === undefined ? "" : String(value);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(escape).join(",")).join("\r\n") + "\r\n";
}
