import * as XLSX from "xlsx-js-style";

export type ParsedWorkbook = {
  fileName: string;
  workbook: XLSX.WorkBook;
  sheets: string[];
};

export type Table = {
  fileName: string;
  sheetName: string;
  headers: string[];
  rows: Record<string, unknown>[];
};

const SRC_ROW_KEY = "__srcRow" as const;

function safeString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

export function normalizeKey(v: unknown): string {
  return safeString(v).trim();
}

export function makeCompositeKey(row: Record<string, unknown>, keys: string[]): string {
  return keys.map((k) => normalizeKey(row[k])).join("␟"); // unlikely separator
}

export function getCommonHeaders(a: string[], b: string[]): string[] {
  const setB = new Set(b.map((h) => h.trim()));
  return a.map((h) => h.trim()).filter((h) => h.length > 0 && setB.has(h));
}

export async function parseExcel(file: File): Promise<ParsedWorkbook> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array", cellDates: true });
  return { fileName: file.name, workbook, sheets: workbook.SheetNames };
}

export function parseSheetToTable(parsed: ParsedWorkbook, sheetName: string): Table {
  const ws = parsed.workbook.Sheets[sheetName];
  if (!ws) return { fileName: parsed.fileName, sheetName, headers: [], rows: [] };

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: "",
    blankrows: false,
  });

  const headerRow = (aoa[0] ?? []) as unknown[];
  const headers = headerRow.map((h) => safeString(h).trim()).filter((h) => h.length > 0);

  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const r = (aoa[i] ?? []) as unknown[];
    if (headers.length === 0) continue;

    const obj: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) obj[headers[c]!] = r[c] ?? "";
    // Keep original Excel row number (1-based) so we can later export sorted rows
    // while preserving the original sheet formatting.
    obj[SRC_ROW_KEY] = i + 1;

    const isEmpty = headers.every((h) => normalizeKey(obj[h]) === "");
    if (!isEmpty) rows.push(obj);
  }

  return { fileName: parsed.fileName, sheetName, headers, rows };
}

function cloneCell(cell: XLSX.CellObject): XLSX.CellObject {
  // xlsx-js-style cells are plain objects; structuredClone isn't always available in all runtimes.
  return JSON.parse(JSON.stringify(cell)) as XLSX.CellObject;
}

function getSrcRowNumber(row: Record<string, unknown>): number | null {
  const v = row[SRC_ROW_KEY];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function buildSortedWorkbookPreserveSheetFormat(params: {
  parsed: ParsedWorkbook;
  sheetName: string;
  sortedRows: Record<string, unknown>[];
  headerRowNumber?: number; // 1-based, default 1
}): XLSX.WorkBook | null {
  const headerRowNumber = params.headerRowNumber ?? 1;
  const wsOrig = params.parsed.workbook.Sheets[params.sheetName];
  if (!wsOrig) return null;

  const origRef = wsOrig["!ref"];
  if (!origRef) return null;
  const origRange = XLSX.utils.decode_range(origRef);

  const dataStartRowNumber = headerRowNumber + 1; // 1-based
  const dataStartR0 = dataStartRowNumber - 1; // 0-based

  // Map source (0-based row) -> destination (0-based row)
  const mapping = new Map<number, number>();
  const orderedSrcRows: number[] = [];
  for (const r of params.sortedRows) {
    const srcRowNumber = getSrcRowNumber(r);
    if (srcRowNumber == null) continue;
    const srcR0 = srcRowNumber - 1;
    if (srcR0 < dataStartR0) continue;
    orderedSrcRows.push(srcR0);
  }

  if (orderedSrcRows.length === 0) return null;

  for (let i = 0; i < orderedSrcRows.length; i++) {
    mapping.set(orderedSrcRows[i]!, dataStartR0 + i);
  }

  const wsNew: XLSX.WorkSheet = {};

  // Copy over workbook-level sheet metadata
  const metaKeys = ["!cols", "!rows", "!outline", "!autofilter", "!freeze", "!margins", "!protect"] as const;
  for (const k of metaKeys) {
    const v = (wsOrig as any)[k];
    if (v != null) (wsNew as any)[k] = JSON.parse(JSON.stringify(v));
  }

  // Copy header area (all rows before dataStartR0) exactly
  for (let R = origRange.s.r; R < dataStartR0; R++) {
    for (let C = origRange.s.c; C <= origRange.e.c; C++) {
      const a = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = (wsOrig as any)[a] as XLSX.CellObject | undefined;
      if (cell) (wsNew as any)[a] = cloneCell(cell);
    }
  }

  // Copy data rows in new order
  for (const [srcR0, dstR0] of mapping.entries()) {
    for (let C = origRange.s.c; C <= origRange.e.c; C++) {
      const srcAddr = XLSX.utils.encode_cell({ r: srcR0, c: C });
      const dstAddr = XLSX.utils.encode_cell({ r: dstR0, c: C });
      const cell = (wsOrig as any)[srcAddr] as XLSX.CellObject | undefined;
      if (cell) (wsNew as any)[dstAddr] = cloneCell(cell);
    }

    // Preserve row formatting when available
    const origRows = (wsOrig as any)["!rows"] as any[] | undefined;
    if (origRows && origRows[srcR0]) {
      const newRows = ((wsNew as any)["!rows"] as any[]) ?? [];
      newRows[dstR0] = JSON.parse(JSON.stringify(origRows[srcR0]));
      (wsNew as any)["!rows"] = newRows;
    }
  }

  // Preserve merges: keep header merges; move single-row merges for mapped data rows; drop multi-row merges.
  const merges = ((wsOrig as any)["!merges"] as XLSX.Range[] | undefined) ?? [];
  const newMerges: XLSX.Range[] = [];
  for (const m of merges) {
    if (m.e.r < dataStartR0) {
      newMerges.push(JSON.parse(JSON.stringify(m)));
      continue;
    }
    if (m.s.r !== m.e.r) continue; // multi-row merge won't survive reordering safely
    const dstR0 = mapping.get(m.s.r);
    if (dstR0 == null) continue;
    newMerges.push({
      s: { r: dstR0, c: m.s.c },
      e: { r: dstR0, c: m.e.c },
    });
  }
  if (newMerges.length) (wsNew as any)["!merges"] = newMerges;

  // Update ref to include header + sorted rows.
  const lastDataR0 = dataStartR0 + orderedSrcRows.length - 1;
  wsNew["!ref"] = XLSX.utils.encode_range({
    s: { r: origRange.s.r, c: origRange.s.c },
    e: { r: Math.max(origRange.e.r, lastDataR0), c: origRange.e.c },
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsNew, params.sheetName);
  return wb;
}

export function buildWorkbookFromRows(params: {
  sheetName: string;
  headers: string[];
  rows: Record<string, unknown>[];
}): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const aoa: unknown[][] = [params.headers];
  for (const row of params.rows) aoa.push(params.headers.map((h) => row[h]));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, params.sheetName);
  return wb;
}

export function downloadWorkbook(wb: XLSX.WorkBook, fileName: string) {
  XLSX.writeFile(wb, fileName, { compression: true });
}

export type DuplicateKey = { key: string; count: number };

export function findDuplicateKeys(rows: Record<string, unknown>[], keys: string[]): DuplicateKey[] {
  if (keys.length === 0) return [];
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = makeCompositeKey(r, keys);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const dups: DuplicateKey[] = [];
  for (const [key, count] of counts) if (count > 1) dups.push({ key, count });
  dups.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return dups;
}

export type DuplicatePolicy = "keep_all" | "keep_first" | "keep_last" | "manual_match";

export function applyDuplicatePolicy(params: {
  rows: Record<string, unknown>[];
  keys: string[];
  policy: DuplicatePolicy;
}): Record<string, unknown>[] {
  const { rows, keys, policy } = params;
  if (policy === "keep_all" || policy === "manual_match" || keys.length === 0) return rows;

  const seen = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const k = makeCompositeKey(r, keys);
    const arr = seen.get(k) ?? [];
    arr.push(r);
    seen.set(k, arr);
  }

  const out: Record<string, unknown>[] = [];
  const pick = (arr: Record<string, unknown>[]) => (policy === "keep_first" ? arr[0] : arr[arr.length - 1]);
  const picked = new Set<Record<string, unknown>>();

  for (const r of rows) {
    const k = makeCompositeKey(r, keys);
    if (picked.has(r)) continue;
    const arr = seen.get(k);
    if (!arr || arr.length === 0) continue;
    const chosen = pick(arr);
    out.push(chosen);
    for (const a of arr) picked.add(a);
  }
  return out;
}

function isOrdinalHeader(header: string): boolean {
  const h = header.trim().toLowerCase();
  return (
    h === "stt" ||
    h === "no" ||
    h === "no." ||
    h === "#" ||
    h === "số thứ tự" ||
    h === "so thu tu" ||
    h === "index" ||
    h === "idx"
  );
}

export function formatForExport(params: {
  headers: string[];
  rows: Record<string, unknown>[];
  keysToFront?: string[];
  highlightDuplicateKeys?: Set<string>;
  duplicateKeyColumns?: string[];
  sttByKeyColumns?: string[];
  forceText?: boolean;
  coerceNumericStrings?: boolean;
  sortRemainingHeaders?: boolean;
}): XLSX.WorkBook {
  const keys = (params.keysToFront ?? []).filter((k) => params.headers.includes(k));

  const strippedHeaders = params.headers.filter((h) => !isOrdinalHeader(h));
  const restUnsorted = strippedHeaders.filter((h) => !keys.includes(h));
  const rest =
    params.sortRemainingHeaders === false ? restUnsorted : restUnsorted.sort((a, b) => a.localeCompare(b, "vi"));
  const orderedHeaders = ["STT", ...keys, ...rest];

  // Header row + data (NO extra heading row)
  const aoa: unknown[][] = [];
  aoa.push(orderedHeaders);

  const sttCols = params.sttByKeyColumns?.length ? params.sttByKeyColumns : null;
  const sttMap = new Map<string, number>();
  let sttNext = 1;

  for (let i = 0; i < params.rows.length; i++) {
    const src = params.rows[i]!;
    const row: Record<string, unknown> = { ...src };
    // remove old ordinal columns
    for (const h of params.headers) if (isOrdinalHeader(h)) delete row[h];

    const out: unknown[] = [];
    if (sttCols) {
      const k = makeCompositeKey(src, sttCols);
      const existing = sttMap.get(k);
      if (existing) out.push(existing);
      else {
        sttMap.set(k, sttNext);
        out.push(sttNext);
        sttNext++;
      }
    } else {
      out.push(i + 1); // STT
    }
    const coerce = (v: unknown) => (params.forceText ? safeString(v) : v);
    for (const h of keys) out.push(coerce(row[h]));
    for (const h of rest) out.push(coerce(row[h]));
    aoa.push(out);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  const lastCol = Math.max(0, orderedHeaders.length - 1);

  // set column widths (basic, works in community build)
  const cols = orderedHeaders.map((h, idx) => {
    const min = idx === 0 ? 10 : Math.min(40, Math.max(10, h.length + 2));
    return { wch: min };
  });
  ws["!cols"] = cols;

  // auto-filter on header row (row index 0)
  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } }),
  };

  const border = {
    top: { style: "thin", color: { rgb: "D4D4D8" } },
    bottom: { style: "thin", color: { rgb: "D4D4D8" } },
    left: { style: "thin", color: { rgb: "D4D4D8" } },
    right: { style: "thin", color: { rgb: "D4D4D8" } },
  } as const;

  const headerStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" } },
    fill: { patternType: "solid", fgColor: { rgb: "111827" } },
    alignment: { vertical: "center", horizontal: "center", wrapText: true },
    border,
  } as const;

  const baseCellStyle = {
    font: { color: { rgb: "111827" } },
    alignment: { vertical: "top", horizontal: "left", wrapText: true },
    border,
  } as const;

  const sttCellStyle = {
    ...baseCellStyle,
    alignment: { vertical: "center", horizontal: "center", wrapText: false },
    numFmt: "0",
  } as const;

  const dupRowStyle = {
    ...baseCellStyle,
    fill: { patternType: "solid", fgColor: { rgb: "FEE2E2" } }, // light red
  } as const;

  const dupSttCellStyle = {
    ...sttCellStyle,
    fill: { patternType: "solid", fgColor: { rgb: "FEE2E2" } },
  } as const;

  // Apply styles: header row + all data cells, with optional duplicate highlight
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");
  for (let R = range.s.r; R <= range.e.r; R++) {
    const isHeader = R === 0;
    let isDup = false;
    if (!isHeader && params.highlightDuplicateKeys && params.duplicateKeyColumns?.length) {
      const dataIndex = R - 1;
      const srcRow = params.rows[dataIndex];
      if (srcRow) {
        const k = makeCompositeKey(srcRow, params.duplicateKeyColumns);
        isDup = params.highlightDuplicateKeys.has(k);
      }
    }

    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (!cell) continue;
      if (isHeader) {
        (cell as any).s = headerStyle;
      } else if (C === 0) {
        (cell as any).s = isDup ? dupSttCellStyle : sttCellStyle;
        // ensure excel doesn't infer date format
        (cell as any).t = "n";
        (cell as any).z = "0";
      } else {
        (cell as any).s = isDup ? dupRowStyle : baseCellStyle;
        // Keep everything as "General-safe text" to prevent Excel auto-typing (dates, scientific, etc.)
        if (params.forceText) {
          const v = (cell as any).v;
          (cell as any).t = "s";
          (cell as any).v = safeString(v);
          (cell as any).z = "@";
        }
      }
    }
  }

  // Freeze header row
  (ws as any)["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };

  XLSX.utils.book_append_sheet(wb, ws, "Export");
  return wb;
}

export type SortResult = {
  sortedRows: Record<string, unknown>[];
  matchedCount: number;
  unmatchedCount: number;
};

export function sortToMatchReference(params: {
  referenceRows: Record<string, unknown>[];
  targetRows: Record<string, unknown>[];
  referenceKeys: string[];
  targetKeys: string[];
  appendUnmatched: boolean;
}): SortResult {
  const { referenceRows, targetRows, referenceKeys, targetKeys, appendUnmatched } = params;

  const buckets = new Map<string, Record<string, unknown>[]>();
  for (const r of targetRows) {
    const k = makeCompositeKey(r, targetKeys);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(r);
  }

  const used = new Set<Record<string, unknown>>();
  const sorted: Record<string, unknown>[] = [];

  for (const rr of referenceRows) {
    const k = makeCompositeKey(rr, referenceKeys);
    const matches = buckets.get(k);
    if (!matches) continue;
    for (const r of matches) {
      sorted.push(r);
      used.add(r);
    }
  }

  if (appendUnmatched) {
    for (const r of targetRows) if (!used.has(r)) sorted.push(r);
  }

  return { sortedRows: sorted, matchedCount: used.size, unmatchedCount: targetRows.length - used.size };
}

export type MergeResult = {
  headers: string[];
  rows: Record<string, unknown>[];
  leftOnlyCount: number;
  matchedRowCount: number;
};

export function leftJoin(params: {
  left: Table;
  right: Table;
  leftKeys: string[];
  rightKeys: string[];
}): MergeResult {
  const { left, right, leftKeys, rightKeys } = params;

  const rightBuckets = new Map<string, Record<string, unknown>[]>();
  for (const r of right.rows) {
    const k = makeCompositeKey(r, rightKeys);
    if (!rightBuckets.has(k)) rightBuckets.set(k, []);
    rightBuckets.get(k)!.push(r);
  }

  const leftNonKey = left.headers.filter((h) => !leftKeys.includes(h));
  const rightNonKey = right.headers.filter((h) => !rightKeys.includes(h));
  const headers = [...leftKeys, ...leftNonKey, ...rightNonKey];

  const rows: Record<string, unknown>[] = [];
  let leftOnlyCount = 0;
  let matchedRowCount = 0;

  for (const l of left.rows) {
    const k = makeCompositeKey(l, leftKeys);
    const matches = rightBuckets.get(k);

    if (!matches || matches.length === 0) {
      leftOnlyCount++;
      const out: Record<string, unknown> = {};
      for (const kk of leftKeys) out[kk] = l[kk];
      for (const h of leftNonKey) out[h] = l[h];
      for (const h of rightNonKey) out[h] = "";
      rows.push(out);
      continue;
    }

    for (const r of matches) {
      matchedRowCount++;
      const out: Record<string, unknown> = {};
      for (const kk of leftKeys) out[kk] = l[kk];
      for (const h of leftNonKey) out[h] = l[h];
      for (const h of rightNonKey) out[h] = r[h];
      rows.push(out);
    }
  }

  return { headers, rows, leftOnlyCount, matchedRowCount };
}

