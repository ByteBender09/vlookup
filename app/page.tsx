"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "./components/ui/Button";
import { Card } from "./components/ui/Card";
import { Dropdown } from "./components/ui/Dropdown";
import { FilePicker } from "./components/ui/FilePicker";
import { Modal } from "./components/ui/Modal";
import { Spinner } from "./components/ui/Spinner";
import { Stepper } from "./components/ui/Stepper";
import {
  downloadWorkbook,
  findDuplicateKeys,
  formatForExport,
  applyDuplicatePolicy,
  getCommonHeaders,
  leftJoin,
  makeCompositeKey,
  normalizeKey,
  parseExcel,
  parseSheetToTable,
  sortToMatchReference,
  type DuplicatePolicy,
  type ParsedWorkbook,
  type Table,
} from "./lib/excel";

type WizardStep = 1 | 2 | 3 | 4;

function baseName(fileName: string) {
  return fileName.replace(/\.(xlsx|xls|csv)$/i, "");
}

export default function Home() {
  const [step, setStep] = useState<WizardStep>(1);

  const [busy, setBusy] = useState<null | string>(null);
  const [error, setError] = useState<string | null>(null);

  const [wb1, setWb1] = useState<ParsedWorkbook | null>(null);
  const [wb2, setWb2] = useState<ParsedWorkbook | null>(null);

  const [sheet1, setSheet1] = useState<string>("");
  const [sheet2, setSheet2] = useState<string>("");

  const [table1, setTable1] = useState<Table | null>(null);
  const [table2, setTable2] = useState<Table | null>(null);

  const [commonColumns, setCommonColumns] = useState<string[]>([]);
  const [keyA, setKeyA] = useState<string>("");
  const [keyB, setKeyB] = useState<string>("");

  const [appendUnmatched, setAppendUnmatched] = useState(true);

  const [dupModalOpen, setDupModalOpen] = useState(false);
  // keep-all is the default. If user opens manual resolver, manual-match is enabled.
  const [manualMatchEnabled, setManualMatchEnabled] = useState(false);
  const [dupResolved, setDupResolved] = useState(false);
  const [pendingAction, setPendingAction] = useState<null | "sort" | "merge">(null);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  // For each duplicate-key group: an ordering of B rows (by index within that group's B list)
  const [manualOrder, setManualOrder] = useState<Record<string, number[]>>({});
  const [manualKey, setManualKey] = useState<string>("");
  const [manualResolved, setManualResolved] = useState<Record<string, boolean>>({});
  const [manualResolveError, setManualResolveError] = useState<string | null>(null);
  const bListRef = useRef<HTMLDivElement | null>(null);
  const bItemRefs = useRef(new Map<number, HTMLDivElement>());
  const bPrevRects = useRef(new Map<number, DOMRect>());
  const [bDragging, setBDragging] = useState<number | null>(null);

  function measureBRects(order: number[]) {
    const m = new Map<number, DOMRect>();
    for (const id of order) {
      const el = bItemRefs.current.get(id);
      if (el) m.set(id, el.getBoundingClientRect());
    }
    return m;
  }

  const hasBothFiles = Boolean(wb1 && wb2);
  const hasBothTables = Boolean(table1 && table2 && table1.headers.length > 0 && table2.headers.length > 0);
  const selectedKeys = useMemo(() => [keyA, keyB].filter((k) => k.trim().length > 0), [keyA, keyB]);
  const dup1 = useMemo(
    () => (table1 && selectedKeys.length ? findDuplicateKeys(table1.rows, selectedKeys) : []),
    [table1, selectedKeys]
  );
  const dup2 = useMemo(
    () => (table2 && selectedKeys.length ? findDuplicateKeys(table2.rows, selectedKeys) : []),
    [table2, selectedKeys]
  );
  const hasDup = dup1.length > 0 || dup2.length > 0;

  const canChooseFunction = hasBothTables && commonColumns.length > 0 && selectedKeys.length >= 1;

  useEffect(() => {
    if (!hasBothFiles) setStep(1);
    else if (!hasBothTables) setStep(2);
    else if (!canChooseFunction) setStep(3);
    else setStep(4);
  }, [hasBothFiles, hasBothTables, canChooseFunction]);

  useEffect(() => {
    // reset duplicate resolution whenever inputs change
    setDupResolved(false);
    setPendingAction(null);
    setManualModalOpen(false);
    setManualOrder({});
    setManualKey("");
    setManualResolved({});
    setManualResolveError(null);
    setManualMatchEnabled(false);
  }, [keyA, keyB, sheet1, sheet2, wb1, wb2]);

  async function pick(which: 1 | 2, file: File | null) {
    setError(null);
    if (!file) return;
    try {
      setBusy(`Đang đọc ${file.name}...`);
      const parsed = await parseExcel(file);
      if (which === 1) {
        setWb1(parsed);
        setSheet1(parsed.sheets[0] ?? "");
        setTable1(null);
        setDupResolved(false);
      } else {
        setWb2(parsed);
        setSheet2(parsed.sheets[0] ?? "");
        setTable2(null);
        setDupResolved(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đọc được file.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!wb1 || !sheet1) return;
    setError(null);
    try {
      setBusy("Đang parse File 1...");
      const t = parseSheetToTable(wb1, sheet1);
      setTable1(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không parse được sheet File 1.");
      setTable1(null);
    } finally {
      setBusy(null);
    }
  }, [wb1, sheet1]);

  useEffect(() => {
    if (!wb2 || !sheet2) return;
    setError(null);
    try {
      setBusy("Đang parse File 2...");
      const t = parseSheetToTable(wb2, sheet2);
      setTable2(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không parse được sheet File 2.");
      setTable2(null);
    } finally {
      setBusy(null);
    }
  }, [wb2, sheet2]);

  useEffect(() => {
    if (!table1 || !table2) {
      setCommonColumns([]);
      setKeyA("");
      setKeyB("");
      return;
    }
    setError(null);
    setBusy("Đang tìm các cột chung...");
    const common = getCommonHeaders(table1.headers, table2.headers);
    setCommonColumns(common);
    setKeyA(common[0] ?? "");
    setKeyB("");
    setDupResolved(false);
    setBusy(null);
  }, [table1, table2]);

  const effectiveTable1 = useMemo(() => table1, [table1]);
  const effectiveTable2 = useMemo(() => table2, [table2]);

  const manualEnabled = dupResolved && manualMatchEnabled;
  const keepAllEnabled = dupResolved && !manualMatchEnabled;

  const groups = useMemo(() => {
    if (!table1 || !table2 || selectedKeys.length === 0) return null;
    const g1 = new Map<string, number[]>();
    const g2 = new Map<string, number[]>();

    for (let i = 0; i < table1.rows.length; i++) {
      const k = makeCompositeKey(table1.rows[i]!, selectedKeys);
      const arr = g1.get(k) ?? [];
      arr.push(i);
      g1.set(k, arr);
    }
    for (let i = 0; i < table2.rows.length; i++) {
      const k = makeCompositeKey(table2.rows[i]!, selectedKeys);
      const arr = g2.get(k) ?? [];
      arr.push(i);
      g2.set(k, arr);
    }

    const keys = new Set<string>();
    for (const { key } of dup1) keys.add(key);
    for (const { key } of dup2) keys.add(key);

    const items = [...keys].map((k) => ({
      key: k,
      a: g1.get(k) ?? [],
      b: g2.get(k) ?? [],
    }));
    items.sort((x, y) => (y.a.length + y.b.length) - (x.a.length + x.b.length) || x.key.localeCompare(y.key));

    return { g1, g2, items };
  }, [table1, table2, selectedKeys, dup1, dup2]);

  useLayoutEffect(() => {
    // animate reorders in manual B list (FLIP)
    if (!manualKey || !groups) return;
    const it = groups.items.find((x) => x.key === manualKey);
    if (!it) return;
    const order = manualOrder[it.key];
    if (!order) return;

    const prev = bPrevRects.current;
    const next = measureBRects(order);
    bPrevRects.current = next;
    if (prev.size === 0) return;

    for (const id of order) {
      const el = bItemRefs.current.get(id);
      const a = prev.get(id);
      const b = next.get(id);
      if (!el || !a || !b) continue;
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (dx === 0 && dy === 0) continue;
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0px, 0px)" }],
        { duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
      );
    }
  }, [manualOrder, manualKey, groups]);

  function rowLabel(row: Record<string, unknown>, headers: string[], maxExtra = 2): string {
    const keyPart = selectedKeys.map((k) => `${k}=${normalizeKey(row[k])}`).join(" · ");
    const extras = headers
      .filter((h) => !selectedKeys.includes(h))
      .slice(0, maxExtra)
      .map((h) => `${h}=${normalizeKey(row[h])}`)
      .filter((x) => x !== `${""}=${""}` && !x.endsWith("="));
    return [keyPart, ...extras].filter((x) => x.length > 0).join(" | ");
  }

  function ensureManualSeeded() {
    if (!groups) return;
    setManualOrder((prev) => {
      const next: Record<string, number[]> = { ...prev };
      for (const it of groups.items) {
        const bLen = it.b.length;
        if (!next[it.key] || next[it.key]!.length !== bLen) next[it.key] = Array.from({ length: bLen }, (_, i) => i);
      }
      return next;
    });
    setManualKey((k) => k || groups.items[0]?.key || "");
    setManualResolved((prev) => {
      const next: Record<string, boolean> = { ...prev };
      for (const it of groups.items) if (!(it.key in next)) next[it.key] = false;
      return next;
    });
    setManualResolveError(null);
  }

  function runSort(mode?: "keep_all" | "manual") {
    if (!effectiveTable1 || !effectiveTable2) return;
    const manual = mode === "manual" || manualEnabled;

    if (!manual) {
      const res = sortToMatchReference({
        referenceRows: effectiveTable1.rows,
        targetRows: effectiveTable2.rows,
        referenceKeys: selectedKeys,
        targetKeys: selectedKeys,
        appendUnmatched,
      });
      const dupKeys =
        (mode === "keep_all" || keepAllEnabled) && selectedKeys.length
          ? new Set(findDuplicateKeys(res.sortedRows, selectedKeys).map((d) => d.key))
          : undefined;
      const wb = formatForExport({
        headers: effectiveTable2.headers,
        rows: res.sortedRows,
        keysToFront: selectedKeys,
        highlightDuplicateKeys: dupKeys,
        duplicateKeyColumns: dupKeys ? selectedKeys : undefined,
        sttByKeyColumns: selectedKeys.length ? selectedKeys : undefined,
        forceText: true,
      });
      downloadWorkbook(wb, `sorted_${baseName(effectiveTable2.fileName)}.xlsx`);
      return;
    }

    if (!groups) return;
    const used = new Set<number>();
    const out: Record<string, unknown>[] = [];
    const occ = new Map<string, number>();

    for (const aRow of effectiveTable1.rows) {
      const k = makeCompositeKey(aRow, selectedKeys);
      const n = occ.get(k) ?? 0;
      occ.set(k, n + 1);

      const order = manualOrder[k];
      const bIdxList = groups.g2.get(k) ?? [];
      const pos = order?.[n] ?? n;
      const chosenIdx = pos != null && pos >= 0 ? bIdxList[pos] : undefined;
      if (chosenIdx == null) continue;
      if (used.has(chosenIdx)) continue;
      used.add(chosenIdx);
      out.push(effectiveTable2.rows[chosenIdx]!);
    }

    if (appendUnmatched) {
      for (let i = 0; i < effectiveTable2.rows.length; i++) if (!used.has(i)) out.push(effectiveTable2.rows[i]!);
    }

    const wb = formatForExport({
      headers: effectiveTable2.headers,
      rows: out,
      keysToFront: selectedKeys,
      // after manual resolve, renumber STT top-down
      forceText: true,
    });
    downloadWorkbook(wb, `sorted_${baseName(effectiveTable2.fileName)}.xlsx`);
  }

  function runMerge(mode?: "keep_all" | "manual") {
    if (!effectiveTable1 || !effectiveTable2) return;
    const manual = mode === "manual" || manualEnabled;

    if (!manual) {
      const merged = leftJoin({
        left: effectiveTable1,
        right: effectiveTable2,
        leftKeys: selectedKeys,
        rightKeys: selectedKeys,
      });
      const dupKeys =
        mode === "keep_all" || keepAllEnabled
          ? new Set(findDuplicateKeys(merged.rows, selectedKeys).map((d) => d.key))
          : undefined;
      const wb = formatForExport({
        headers: merged.headers,
        rows: merged.rows,
        keysToFront: selectedKeys,
        highlightDuplicateKeys: dupKeys,
        duplicateKeyColumns: dupKeys ? selectedKeys : undefined,
        sttByKeyColumns: selectedKeys,
        forceText: true,
        sortRemainingHeaders: false,
      });
      downloadWorkbook(wb, `merged_${baseName(effectiveTable1.fileName)}.xlsx`);
      return;
    }

    if (!groups) return;
    const leftNonKey = effectiveTable1.headers.filter((h) => !selectedKeys.includes(h));
    const rightNonKey = effectiveTable2.headers.filter((h) => !selectedKeys.includes(h));
    const headers = [...selectedKeys, ...leftNonKey, ...rightNonKey];

    const occ = new Map<string, number>();
    const usedRight = new Set<number>();
    const rows: Record<string, unknown>[] = [];

    for (const aRow of effectiveTable1.rows) {
      const k = makeCompositeKey(aRow, selectedKeys);
      const n = occ.get(k) ?? 0;
      occ.set(k, n + 1);

      const order = manualOrder[k];
      const bIdxList = groups.g2.get(k) ?? [];
      const pos = order?.[n] ?? n;
      const chosenIdx = pos != null && pos >= 0 ? bIdxList[pos] : undefined;
      const bRow = chosenIdx != null ? effectiveTable2.rows[chosenIdx] : null;
      if (chosenIdx != null) usedRight.add(chosenIdx);

      const out: Record<string, unknown> = {};
      for (const kk of selectedKeys) out[kk] = aRow[kk];
      for (const h of leftNonKey) out[h] = aRow[h];
      for (const h of rightNonKey) out[h] = bRow ? bRow[h] : "";
      rows.push(out);
    }

    const wb = formatForExport({
      headers,
      rows,
      keysToFront: selectedKeys,
      sttByKeyColumns: selectedKeys,
      forceText: true,
      sortRemainingHeaders: false,
    });
    downloadWorkbook(wb, `merged_${baseName(effectiveTable1.fileName)}.xlsx`);
  }

  function ensureNoDupOrAsk(action: "sort" | "merge") {
    if (!hasDup || dupResolved) return true;
    setPendingAction(action);
    setDupModalOpen(true);
    return false;
  }

  const steps = [
    {
      id: "files",
      title: "Chọn 2 file",
      subtitle: "Upload File 1 và File 2",
      done: hasBothFiles,
      current: step === 1,
    },
    {
      id: "sheets",
      title: "Chọn sheet",
      subtitle: "Chọn sheet cho từng file",
      done: hasBothTables,
      current: step === 2,
    },
    {
      id: "keys",
      title: "Chọn khóa chung",
      subtitle: "Tool sẽ list cột chung",
      done: canChooseFunction,
      current: step === 3,
    },
    {
      id: "action",
      title: "Chọn chức năng",
      subtitle: "Sắp xếp hoặc ghép & tải về",
      done: false,
      current: step === 4,
    },
  ];

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-10 font-sans text-zinc-950">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Excel Match & Merge Tool</h1>
          </div>
          <p className="text-sm text-zinc-600">
            Flow tối ưu: chọn 2 file → chọn sheet → chọn khóa chung (1–2 cột) → chọn chức năng và tải file.
          </p>
        </header>

        <Stepper steps={steps} />

        <Modal
          open={dupModalOpen && selectedKeys.length > 0 && hasBothTables && hasDup && !dupResolved}
          onClose={() => setDupModalOpen(false)}
          title="Phát hiện trùng khóa"
          description="Chỉ hiển thị các key bị trùng. Chọn 1 cách xử lý để tiếp tục."
          footer={
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setDupModalOpen(false)}>
                Xem lại
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  ensureManualSeeded();
                  setManualModalOpen(true);
                  setManualMatchEnabled(true);
                }}
              >
                Match thủ công
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setDupResolved(true);
                  setManualMatchEnabled(false);
                  setDupModalOpen(false);
                  const next = pendingAction;
                  setPendingAction(null);
                  if (!next) return;
                  if (next === "sort") runSort("keep_all");
                  else runMerge("keep_all");
                }}
              >
                Giữ tất cả & tiếp tục
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Khóa đang dùng: <span className="font-semibold">{selectedKeys.join(" + ")}</span>
              <div className="mt-1 text-xs text-amber-800">
                Trùng khóa ở File 1: {dup1.length} nhóm • File 2: {dup2.length} nhóm
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Card title="Key trùng ở File 1" subtitle={table1?.fileName}>
                {dup1.length ? (
                  <div className="scrollbar-slim max-h-64 overflow-auto rounded-2xl border border-zinc-200 bg-white">
                    <table className="w-full border-collapse text-xs">
                      <thead className="sticky top-0 bg-zinc-50">
                        <tr className="border-b border-zinc-200">
                          <th className="px-3 py-2 text-left font-semibold text-zinc-700">Key</th>
                          <th className="px-3 py-2 text-right font-semibold text-zinc-700">Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dup1.slice(0, 200).map((d) => (
                          <tr key={d.key} className="border-b border-zinc-100 last:border-b-0">
                            <td className="px-3 py-2 font-medium text-zinc-900">
                              {(d.key || "(rỗng)").split("␟").join(" | ")}
                            </td>
                            <td className="px-3 py-2 text-right text-zinc-700">{d.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-sm text-emerald-700">Không có trùng khóa.</div>
                )}
              </Card>

              <Card title="Key trùng ở File 2" subtitle={table2?.fileName}>
                {dup2.length ? (
                  <div className="scrollbar-slim max-h-64 overflow-auto rounded-2xl border border-zinc-200 bg-white">
                    <table className="w-full border-collapse text-xs">
                      <thead className="sticky top-0 bg-zinc-50">
                        <tr className="border-b border-zinc-200">
                          <th className="px-3 py-2 text-left font-semibold text-zinc-700">Key</th>
                          <th className="px-3 py-2 text-right font-semibold text-zinc-700">Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dup2.slice(0, 200).map((d) => (
                          <tr key={d.key} className="border-b border-zinc-100 last:border-b-0">
                            <td className="px-3 py-2 font-medium text-zinc-900">
                              {(d.key || "(rỗng)").split("␟").join(" | ")}
                            </td>
                            <td className="px-3 py-2 text-right text-zinc-700">{d.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-sm text-emerald-700">Không có trùng khóa.</div>
                )}
              </Card>
            </div>
          </div>
        </Modal>

        <Modal
          open={manualModalOpen && Boolean(groups) && Boolean(table1) && Boolean(table2)}
          onClose={() => setManualModalOpen(false)}
          title="Match thủ công (A ↔ B)"
          description="Chọn key ở trên. Bên trái giữ nguyên, bên phải kéo lên/xuống để sắp đúng thứ tự với bên trái."
          panelClassName="w-[90vw] h-[85vh] max-w-none"
          bodyClassName="p-0 overflow-hidden"
          footer={
            <div className="flex w-full items-center justify-between gap-3">
              <Button variant="secondary" onClick={() => setManualModalOpen(false)}>
                Đóng
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (!groups) return;
                  const keys = groups.items.map((it) => it.key);
                  const resolvedCount = keys.filter((k) => manualResolved[k]).length;

                  // If only 1 conflict key, allow export right away after marking resolved.
                  const allResolved = resolvedCount === keys.length;
                  const single = keys.length <= 1;

                  if (!allResolved && !single) {
                    setManualResolveError(`Bạn cần resolve hết ${keys.length} key. Hiện mới resolve ${resolvedCount}.`);
                    return;
                  }

                  if (single && keys[0]) {
                    setManualResolved((prev) => ({ ...prev, [keys[0] as string]: true }));
                  }

                  setManualResolveError(null);
                  setDupResolved(true);
                  setManualModalOpen(false);
                  setDupModalOpen(false);

                  const next = pendingAction;
                  setPendingAction(null);
                  if (!next) return;
                  if (next === "sort") runSort("manual");
                  else runMerge("manual");
                }}
              >
                Hoàn tất & tiếp tục
              </Button>
            </div>
          }
        >
          {groups && table1 && table2 ? (
            <div className="flex h-full flex-col">
              {/* Top: key selection (fixed inside modal content) */}
              <div className="shrink-0 border-b border-zinc-200 bg-white px-5 pb-1.5">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    <Dropdown
                      label="Khóa cần resolve"
                      value={manualKey}
                      onChange={(v) => {
                        setManualKey(v);
                        setManualResolveError(null);
                      }}
                      options={groups.items.map((it, idx) => ({
                        value: it.key,
                        label: `${manualResolved[it.key] ? "✓ " : ""}${idx + 1}. ${(it.key || "(rỗng)")}${" "}— A:${it.a.length} B:${it.b.length}`,
                      }))}
                    />
                  </div>
                  <div className="flex items-end justify-start lg:justify-end">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const it = groups.items.find((x) => x.key === manualKey) ?? groups.items[0];
                        if (!it) return;
                        setManualOrder((prev) => ({ ...prev, [it.key]: Array.from({ length: it.b.length }, (_, i) => i) }));
                        setManualResolved((prev) => ({ ...prev, [it.key]: false }));
                        setManualResolveError(null);
                      }}
                    >
                      Reset thứ tự B
                    </Button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-zinc-600">
                    Trạng thái:{" "}
                    <span className="font-semibold text-zinc-900">
                      {groups.items.filter((it) => manualResolved[it.key]).length}/{groups.items.length}
                    </span>{" "}
                    key đã resolve
                  </div>
                  {groups.items.length > 1 ? (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          const it = groups.items.find((x) => x.key === manualKey) ?? groups.items[0];
                          if (!it) return;
                          setManualResolved((prev) => ({ ...prev, [it.key]: true }));
                          setManualResolveError(null);
                        }}
                      >
                        Mark key này đã resolve
                      </Button>
                    </div>
                  ) : (
                    <></>
                  )}
                </div>

                {manualResolveError ? (
                  <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                    {manualResolveError}
                  </div>
                ) : null}
              </div>

              {/* Middle: scroll area */}
              <div className="scrollbar-slim min-h-0 flex-1 overflow-auto p-5">
                {(() => {
                  const it = groups.items.find((x) => x.key === manualKey) ?? groups.items[0];
                  if (!it) return null;

                  const aRows = it.a.map((idx) => table1.rows[idx]!);
                  const bRows = it.b.map((idx) => table2.rows[idx]!);
                  const order = manualOrder[it.key] ?? Array.from({ length: bRows.length }, (_, i) => i);

                  const strip = (title: string, row: Record<string, unknown>, headers: string[]) => {
                    const keyPart = selectedKeys.map((k) => `${k}=${normalizeKey(row[k])}`).join(" · ");
                    const extras = headers
                      .filter((h) => !selectedKeys.includes(h))
                      .slice(0, 3)
                      .map((h) => `${h}=${normalizeKey(row[h])}`)
                      .filter((s) => !s.endsWith("=") && s.length > 1);
                    return (
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="text-[11px] font-semibold text-zinc-900">{title}</div>
                        <div className="truncate text-xs text-zinc-800">{keyPart || "(khóa rỗng)"}</div>
                        {extras.length ? <div className="truncate text-[11px] text-zinc-600">{extras.join(" | ")}</div> : null}
                      </div>
                    );
                  };

                  return (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <Card title="Bảng A (giữ nguyên)" subtitle={`A: ${aRows.length} dòng`}>
                        <div className="flex flex-col gap-2">
                          {aRows.map((r, i) => (
                            <div key={i} className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-900 text-xs font-semibold text-white">
                                {i + 1}
                              </div>
                              {strip(`A #${i + 1}`, r, table1.headers)}
                            </div>
                          ))}
                        </div>
                      </Card>

                      <Card title="Bảng B (kéo lên/xuống để sắp thứ tự)" subtitle={`B: ${bRows.length} dòng`}>
                        <div ref={bListRef} className="flex flex-col gap-2">
                          {order.map((bi, idx) => {
                            const r = bRows[bi]!;
                            return (
                              <div
                                key={bi}
                                ref={(el) => {
                                  if (el) bItemRefs.current.set(bi, el);
                                  else bItemRefs.current.delete(bi);
                                }}
                                draggable
                                onDragStart={(e) => {
                                  setBDragging(bi);
                                  bPrevRects.current = measureBRects(order);
                                  e.dataTransfer.setData("text/plain", String(idx));
                                  e.dataTransfer.effectAllowed = "move";
                                }}
                                onDragEnd={() => setBDragging(null)}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  const from = Number(e.dataTransfer.getData("text/plain"));
                                  if (!Number.isFinite(from)) return;
                                  if (from === idx) return;
                                  setManualOrder((prev) => {
                                    const cur = (prev[it.key] ?? order).slice();
                                    const [moved] = cur.splice(from, 1);
                                    cur.splice(idx, 0, moved!);
                                    return { ...prev, [it.key]: cur };
                                  });
                                }}
                                className={[
                                  "flex items-center gap-3 rounded-2xl border bg-white p-3 transition-shadow",
                                  "border-zinc-200 hover:border-zinc-300 hover:shadow-sm",
                                  bDragging === bi ? "opacity-70 shadow-lg" : "",
                                ].join(" ")}
                              >
                                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-100 text-xs font-semibold text-zinc-700">
                                  {idx + 1}
                                </div>
                                {strip(`B`, r, table2.headers)}
                                <div className="ml-auto rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                                  Drag
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-3 text-xs text-zinc-500">
                          Thứ tự B hiện tại sẽ được ghép theo vị trí: A #1 ↔ B #1, A #2 ↔ B #2...
                        </div>
                      </Card>
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : null}
        </Modal>

        {busy ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <Spinner label={busy} />
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card title="Step 1 — File 1 (tham chiếu)" subtitle="File dùng làm thứ tự chuẩn">
            <div className="flex flex-col gap-4">
              <FilePicker
                label="Upload File 1"
                description="Ví dụ: danh sách chuẩn / master list"
                fileName={wb1?.fileName}
                onPick={(f) => void pick(1, f)}
                disabled={Boolean(busy)}
              />
            </div>
          </Card>

          <Card title="Step 1 — File 2 (đối chiếu)" subtitle="File sẽ được sắp xếp lại hoặc ghép vào File 1">
            <div className="flex flex-col gap-4">
              <FilePicker
                label="Upload File 2"
                description="Ví dụ: danh sách cần reorder / cần join"
                fileName={wb2?.fileName}
                onPick={(f) => void pick(2, f)}
                disabled={Boolean(busy)}
              />
            </div>
          </Card>
        </div>

        {hasBothFiles ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card
              title="Step 2 — Chọn sheet (File 1)"
              subtitle={wb1 ? `${wb1.fileName}` : undefined}
              right={table1 ? <span className="text-xs text-zinc-600">{table1.rows.length} dòng</span> : null}
            >
              <Dropdown
                label="Sheet"
                value={sheet1}
                onChange={setSheet1}
                disabled={!wb1 || Boolean(busy)}
                options={(wb1?.sheets ?? []).map((s) => ({ value: s, label: s }))}
                placeholder="Chọn sheet..."
              />
            </Card>

            <Card
              title="Step 2 — Chọn sheet (File 2)"
              subtitle={wb2 ? `${wb2.fileName}` : undefined}
              right={table2 ? <span className="text-xs text-zinc-600">{table2.rows.length} dòng</span> : null}
            >
              <Dropdown
                label="Sheet"
                value={sheet2}
                onChange={setSheet2}
                disabled={!wb2 || Boolean(busy)}
                options={(wb2?.sheets ?? []).map((s) => ({ value: s, label: s }))}
                placeholder="Chọn sheet..."
              />
            </Card>
          </div>
        ) : null}

        {hasBothTables ? (
          <Card
            title="Step 3 — Chọn khóa chung (1–2 cột)"
            subtitle={
              commonColumns.length
                ? `Tìm thấy ${commonColumns.length} cột chung. Chọn ít nhất 1 cột làm khóa match.`
                : "Không tìm thấy cột chung (hãy kiểm tra header 2 file)."
            }
          >
            {commonColumns.length ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Dropdown
                  label="Khóa A (bắt buộc)"
                  value={keyA}
                  onChange={setKeyA}
                  options={commonColumns.map((c) => ({ value: c, label: c }))}
                />

                <Dropdown
                  label="Khóa B (tùy chọn)"
                  value={keyB}
                  onChange={setKeyB}
                  hint="Nếu cần match theo 2 cột (composite key)."
                  options={[
                    { value: "", label: "(Không dùng)" },
                    ...commonColumns.filter((c) => c !== keyA).map((c) => ({ value: c, label: c })),
                  ]}
                />
              </div>
            ) : (
              <div className="text-sm text-zinc-600">Tip: đảm bảo hàng đầu tiên là header và tên cột giống nhau.</div>
            )}
          </Card>
        ) : null}

        {step === 4 && effectiveTable1 && effectiveTable2 ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title="Chức năng 1 — Sắp xếp lại File 2" subtitle="Reorder File 2 theo thứ tự xuất hiện của File 1">
              <div className="flex flex-col gap-4">
                <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                  <div className="text-sm font-medium">Đưa dòng không match xuống cuối</div>
                  <input
                    type="checkbox"
                    checked={appendUnmatched}
                    onChange={(e) => setAppendUnmatched(e.target.checked)}
                    className="h-5 w-5 accent-zinc-900"
                  />
                </label>

                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="primary"
                    disabled={!canChooseFunction || Boolean(busy)}
                    onClick={() => {
                      if (!ensureNoDupOrAsk("sort")) return;
                      runSort();
                    }}
                  >
                    Tải File 2 đã sắp xếp
                  </Button>
                </div>
              </div>
            </Card>

            <Card title="Chức năng 2 — Ghép 2 file thành 1" subtitle="Left join: giữ toàn bộ File 1, match nhiều-dòng nếu có">
              <div className="flex flex-col gap-4">
                <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
                  Khóa đang dùng: <span className="font-semibold text-zinc-950">{selectedKeys.join(" + ")}</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="primary"
                    disabled={!canChooseFunction || Boolean(busy)}
                    onClick={() => {
                      if (!ensureNoDupOrAsk("merge")) return;
                      runMerge();
                    }}
                  >
                    Tải file đã ghép
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setWb1(null);
                      setWb2(null);
                      setSheet1("");
                      setSheet2("");
                      setTable1(null);
                      setTable2(null);
                      setCommonColumns([]);
                      setKeyA("");
                      setKeyB("");
                      setError(null);
                      setBusy(null);
                      setStep(1);
                    }}
                  >
                    Làm lại từ đầu
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
