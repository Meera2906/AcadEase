// Minimal RFC-4180-ish CSV reader. The existing bulk-import used a naive
// String.split(",") which corrupts any field containing a comma (addresses,
// "Surname, Name"). Admission rows are legal records, so quoted fields and
// escaped quotes have to survive the round trip.

export function parseCsvRows(text = "") {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let sawAnyChar = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    row.push(field);
    field = "";
    rows.push(row);
    row = [];
  };

  const src = text.replace(/^﻿/, ""); // strip BOM from Excel exports

  for (let i = 0; i < src.length; i += 1) {
    const char = src[i];

    if (inQuotes) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      sawAnyChar = true;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      sawAnyChar = true;
    } else if (char === ",") {
      pushField();
      sawAnyChar = true;
    } else if (char === "\n") {
      pushRow();
      sawAnyChar = false;
    } else if (char === "\r") {
      // handled by the \n branch
    } else {
      field += char;
      sawAnyChar = true;
    }
  }

  if (sawAnyChar || field.length || row.length) pushRow();

  return rows.map((cells) => cells.map((cell) => cell.trim())).filter((cells) => cells.some(Boolean));
}

// Returns { headers, records } where each record carries its 1-based CSV line
// number so the import report can point the university admin at the bad row.
export function parseCsvRecords(text = "") {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return { headers: rows[0] || [], records: [] };

  const headers = rows[0].map((header) => header.replace(/\s+/g, "").toLowerCase());
  const records = rows.slice(1).map((cells, index) => {
    const item = { __row: index + 2 };
    headers.forEach((header, headerIndex) => {
      if (header) item[header] = cells[headerIndex] ?? "";
    });
    return item;
  });

  return { headers, records };
}
