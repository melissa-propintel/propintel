"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { parseCsv, toCsv, type ParsedCsv } from "@/lib/csv";
import type { MarketIntel } from "@/lib/market-data";
import { buildMarketReport } from "@/lib/market-report";
import { buildPortfolioRow, errorRow, gradePortfolio, type PortfolioRow, type Light } from "@/lib/portfolio";
import { makeZip } from "@/lib/zip";
import { makeToken, uploadReport, createDelivery, deliveriesConfigured, type DeliveryItem } from "@/lib/deliveries";

type RowStatus = "pending" | "running" | "done" | "error";

interface RowResult {
  index: number;
  address: string;
  testValue: number | null;
  status: RowStatus;
  intel: MarketIntel | null;
  row: PortfolioRow | null;
  error: string | null;
}

function usd(n: number | null): string {
  return n === null ? "—" : "$" + Math.round(n).toLocaleString("en-US");
}

function parseMoney(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function guess(headers: string[], keywords: string[]): number {
  const lower = headers.map((h) => h.toLowerCase());
  for (const k of keywords) {
    const i = lower.findIndex((h) => h.includes(k));
    if (i >= 0) return i;
  }
  return -1;
}

const LIGHT_DOT: Record<Light, string> = {
  GREEN: "bg-emerald-500",
  YELLOW: "bg-amber-400",
  RED: "bg-red-500",
};
const LIGHT_ROW: Record<Light, string> = {
  GREEN: "border-l-4 border-l-emerald-500",
  YELLOW: "border-l-4 border-l-amber-400",
  RED: "border-l-4 border-l-red-500",
};
const GRADE_COLOR: Record<string, string> = {
  A: "bg-emerald-600",
  B: "bg-emerald-500",
  C: "bg-amber-500",
  D: "bg-orange-600",
  F: "bg-red-600",
  "—": "bg-slate-400",
};
const LIGHT_RANK: Record<Light, number> = { RED: 0, YELLOW: 1, GREEN: 2 };

const CONCURRENCY = 3;

export default function BulkPage() {
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<"single" | "parts">("single");
  const [addressCol, setAddressCol] = useState(-1);
  const [streetCol, setStreetCol] = useState(-1);
  const [cityCol, setCityCol] = useState(-1);
  const [stateCol, setStateCol] = useState(-1);
  const [zipCol, setZipCol] = useState(-1);
  const [valueCol, setValueCol] = useState(-1);
  const [limit, setLimit] = useState(5);
  const [results, setResults] = useState<RowResult[]>([]);
  const [running, setRunning] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [bundling, setBundling] = useState(false);
  const [bundleMsg, setBundleMsg] = useState("");
  const [deliveryLink, setDeliveryLink] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result ?? ""));
      setCsv(parsed);
      setResults([]);
      const a = guess(parsed.headers, ["full address", "property address", "address"]);
      const st = guess(parsed.headers, ["street", "address line", "addr"]);
      const city = guess(parsed.headers, ["city"]);
      const state = guess(parsed.headers, ["state", "st"]);
      const zip = guess(parsed.headers, ["zip", "postal"]);
      setAddressCol(a);
      setStreetCol(st);
      setCityCol(city);
      setStateCol(state);
      setZipCol(zip);
      setValueCol(guess(parsed.headers, ["loan", "balance", "upb", "list price", "list", "value", "price"]));
      setMode(a >= 0 && city < 0 ? "single" : st >= 0 && city >= 0 ? "parts" : "single");
    };
    reader.readAsText(file);
  }

  function addressFor(row: string[]): string {
    if (mode === "single") return (row[addressCol] ?? "").trim();
    return [streetCol, cityCol, stateCol, zipCol]
      .filter((i) => i >= 0)
      .map((i) => (row[i] ?? "").trim())
      .filter(Boolean)
      .join(", ");
  }

  const previewAddress = useMemo(() => {
    if (!csv || !csv.rows.length) return "";
    return addressFor(csv.rows[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csv, mode, addressCol, streetCol, cityCol, stateCol, zipCol]);

  async function lookupOne(address: string): Promise<{ intel: MarketIntel | null; error: string | null }> {
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = (await res.json()) as { intel?: MarketIntel; error?: string };
      if (!res.ok || !data.intel) return { intel: null, error: data.error || "Lookup failed." };
      return { intel: data.intel, error: null };
    } catch (e) {
      return { intel: null, error: e instanceof Error ? e.message : "Lookup failed." };
    }
  }

  async function run() {
    if (!csv) return;
    const rows = csv.rows.slice(0, Math.max(0, limit));
    const initial: RowResult[] = rows.map((r, i) => ({
      index: i,
      address: addressFor(r),
      testValue: valueCol >= 0 ? parseMoney(r[valueCol]) : null,
      status: "pending",
      intel: null,
      row: null,
      error: null,
    }));
    setResults(initial);
    setRunning(true);

    let cursor = 0;
    async function worker() {
      while (cursor < initial.length) {
        const i = cursor++;
        const item = initial[i];
        if (!item.address) {
          setResults((prev) => prev.map((r) => (r.index === i ? { ...r, status: "error", error: "No address", row: errorRow("(no address)", "No address") } : r)));
          continue;
        }
        setResults((prev) => prev.map((r) => (r.index === i ? { ...r, status: "running" } : r)));
        const { intel, error } = await lookupOne(item.address);
        if (error || !intel) {
          setResults((prev) => prev.map((r) => (r.index === i ? { ...r, status: "error", error, row: errorRow(item.address, error || "Lookup failed") } : r)));
        } else {
          const report = buildMarketReport(intel, { testValue: item.testValue, testLabel: "Loan / list price" });
          const row = buildPortfolioRow(item.address, intel, report);
          setResults((prev) => prev.map((r) => (r.index === i ? { ...r, status: "done", intel, row } : r)));
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, initial.length) }, worker));
    setRunning(false);
  }

  const rows = results.map((r) => r.row).filter((x): x is PortfolioRow => x !== null);
  const grade = gradePortfolio(rows);
  const sorted = [...results].sort((a, b) => {
    const la = a.row?.light, lb = b.row?.light;
    const ra = la ? LIGHT_RANK[la] : 3;
    const rb = lb ? LIGHT_RANK[lb] : 3;
    return ra - rb || a.index - b.index;
  });
  const doneCount = results.filter((r) => r.status === "done").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  const totalRows = csv?.rows.length ?? 0;

  async function reportBlob(r: RowResult): Promise<Blob | null> {
    if (!r.intel) return null;
    const res = await fetch("/api/lookup/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intel: r.intel, meta: { orderNumber: r.address, testValue: r.testValue, testLabel: "Loan / list price" } }),
    });
    if (!res.ok) return null;
    return res.blob();
  }

  async function downloadFullPdf(r: RowResult) {
    const blob = await reportBlob(r);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${r.address.replace(/[^\w.-]+/g, "_")}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const doneResults = () => results.filter((r) => r.status === "done" && r.intel);

  // Download every report as one ZIP (the "grab everything" path).
  async function downloadAllZip() {
    const done = doneResults();
    if (done.length === 0) return;
    setBundling(true);
    setBundleMsg("");
    try {
      const files: { name: string; data: Uint8Array }[] = [];
      for (let i = 0; i < done.length; i++) {
        setBundleMsg(`Building ${i + 1}/${done.length}…`);
        const blob = await reportBlob(done[i]);
        if (!blob) continue;
        const data = new Uint8Array(await blob.arrayBuffer());
        files.push({ name: `${String(i + 1).padStart(3, "0")}-${done[i].address.replace(/[^\w.-]+/g, "_")}.pdf`, data });
      }
      const zip = makeZip(files);
      const url = URL.createObjectURL(zip);
      const a = document.createElement("a");
      a.href = url;
      a.download = "propintel-reports.zip";
      a.click();
      URL.revokeObjectURL(url);
      setBundleMsg("");
    } finally {
      setBundling(false);
    }
  }

  // Create a shareable client link with all the reports.
  async function createDeliveryLink() {
    const done = doneResults();
    if (done.length === 0) return;
    setBundling(true);
    setDeliveryLink("");
    setBundleMsg("");
    try {
      const token = makeToken();
      const items: DeliveryItem[] = [];
      for (let i = 0; i < done.length; i++) {
        setBundleMsg(`Uploading ${i + 1}/${done.length}…`);
        const blob = await reportBlob(done[i]);
        if (!blob) continue;
        const r = done[i];
        const item = await uploadReport(token, i, r.address, blob, {
          light: r.row?.light ?? null,
          valueLow: r.intel?.valueRange.low ?? null,
          valueHigh: r.intel?.valueRange.high ?? null,
          highlights: r.row?.lines ?? [],
        });
        items.push(item);
      }
      await createDelivery(token, fileName || null, items);
      const link = `${window.location.origin}/d/${token}`;
      setDeliveryLink(link);
      setBundleMsg("");
    } catch (e) {
      setBundleMsg(e instanceof Error ? e.message : "Could not create the link.");
    } finally {
      setBundling(false);
    }
  }

  async function copyLink() {
    if (!deliveryLink) return;
    try {
      await navigator.clipboard.writeText(deliveryLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  async function downloadPortfolioPdf() {
    if (rows.length === 0) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/portfolio/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade, rows, meta: { fileName } }),
      });
      if (!res.ok) throw new Error("PDF failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "propintel-portfolio.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  function exportResults() {
    const headers = ["address", "rating", "light", "value_low", "value_high", "absorption", "months_of_supply", "critical_flags", "advisory_flags", "flood_zone", "vacancy_pct", "top_flag", "status"];
    const out = results.map((r) => {
      const row = r.row;
      return [r.address, row?.rating ?? "", row?.light ?? "", row?.valueLow ?? null, row?.valueHigh ?? null, row?.absorptionLevel ?? "", row?.monthsOfSupply ?? null, row?.criticalFlags ?? null, row?.advisoryFlags ?? null, row?.floodZone ?? "", row?.vacancyPct ?? null, row?.topFlag ?? "", r.status];
    });
    const blob = new Blob([toCsv(headers, out)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "propintel-portfolio-results.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-xs font-semibold uppercase tracking-wide text-pi-accent">← Home</Link>
        <Link href="/lookup" className="text-xs font-semibold uppercase tracking-wide text-pi-accent">Single address →</Link>
      </div>

      <h1 className="text-2xl font-black text-pi-navy">Portfolio Intelligence</h1>
      <p className="mt-1 text-sm text-slate-600">
        Upload a tape of properties. Each home gets a red / yellow / green grade and a short read, rolled up into one
        portfolio grade. Map a loan or list-price column to grade collateral support too. Test a few first, then run the batch.
      </p>

      {/* upload */}
      <div className="mt-5 rounded-lg border border-pi-border bg-white p-4">
        <label className="text-sm font-semibold text-pi-navy">1. Upload CSV</label>
        <input type="file" accept=".csv,text/csv" onChange={onFile} className="mt-2 block text-sm" />
        {fileName && <p className="mt-1 text-xs text-slate-500">{fileName} — {totalRows} rows, {csv?.headers.length ?? 0} columns</p>}
      </div>

      {/* mapping */}
      {csv && (
        <div className="mt-4 rounded-lg border border-pi-border bg-white p-4">
          <p className="text-sm font-semibold text-pi-navy">2. Map columns</p>
          <div className="mt-2 flex gap-4 text-sm">
            <label className="flex items-center gap-1.5"><input type="radio" checked={mode === "single"} onChange={() => setMode("single")} /> One full-address column</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={mode === "parts"} onChange={() => setMode("parts")} /> Separate street / city / state / zip</label>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {mode === "single" ? (
              <ColSelect label="Address column" headers={csv.headers} value={addressCol} onChange={setAddressCol} />
            ) : (
              <>
                <ColSelect label="Street" headers={csv.headers} value={streetCol} onChange={setStreetCol} />
                <ColSelect label="City" headers={csv.headers} value={cityCol} onChange={setCityCol} />
                <ColSelect label="State" headers={csv.headers} value={stateCol} onChange={setStateCol} />
                <ColSelect label="Zip" headers={csv.headers} value={zipCol} onChange={setZipCol} />
              </>
            )}
            <ColSelect label="Loan / list price (optional)" headers={csv.headers} value={valueCol} onChange={setValueCol} />
          </div>
          {previewAddress && <div className="mt-3 rounded bg-slate-50 p-2 text-xs text-slate-600"><span className="font-semibold">Preview:</span> {previewAddress || "(empty — check mapping)"}</div>}
        </div>
      )}

      {/* run */}
      {csv && (
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-pi-border bg-white p-4">
          <div>
            <label className="block text-sm font-semibold text-pi-navy">3. Rows to process</label>
            <input type="number" min={1} max={totalRows || 1} value={limit} onChange={(e) => setLimit(Math.max(1, Number(e.target.value) || 1))} className="mt-1 w-24 rounded-md border border-slate-300 px-2 py-1 text-sm" />
            <span className="ml-2 text-xs text-slate-500">of {totalRows} (start small to test)</span>
          </div>
          <button onClick={run} disabled={running} className="rounded-md bg-pi-navy px-5 py-2 text-sm font-semibold text-white hover:bg-pi-navy-soft disabled:opacity-60">
            {running ? `Running… ${doneCount + errorCount}/${results.length}` : `Run ${limit}`}
          </button>
          {rows.length > 0 && !running && (
            <>
              <button onClick={downloadPortfolioPdf} disabled={downloading} className="rounded-md bg-pi-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
                {downloading ? "Generating…" : "Portfolio PDF"}
              </button>
              <button onClick={exportResults} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Export CSV</button>
            </>
          )}
        </div>
      )}

      {/* deliver */}
      {doneCount > 0 && !running && (
        <div className="mt-4 rounded-lg border border-pi-border bg-white p-4">
          <p className="text-sm font-semibold text-pi-navy">Deliver {doneCount} report{doneCount === 1 ? "" : "s"}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={downloadAllZip}
              disabled={bundling}
              className="rounded-md bg-pi-navy px-4 py-2 text-sm font-semibold text-white hover:bg-pi-navy-soft disabled:opacity-60"
            >
              Download all (ZIP)
            </button>
            {deliveriesConfigured() && (
              <button
                onClick={createDeliveryLink}
                disabled={bundling}
                className="rounded-md border border-pi-navy px-4 py-2 text-sm font-semibold text-pi-navy hover:bg-slate-50 disabled:opacity-60"
              >
                Create client link
              </button>
            )}
            {bundling && bundleMsg && <span className="text-xs text-slate-500">{bundleMsg}</span>}
          </div>
          {deliveryLink && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-2 text-sm">
              <span className="text-slate-500">Client link:</span>
              <a href={deliveryLink} target="_blank" rel="noopener noreferrer" className="font-medium text-pi-accent hover:underline">{deliveryLink}</a>
              <button onClick={copyLink} className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-white">
                {linkCopied ? "Copied!" : "Copy"}
              </button>
            </div>
          )}
          {!bundling && bundleMsg && <p className="mt-2 text-xs text-red-600">{bundleMsg}</p>}
        </div>
      )}

      {/* portfolio grade */}
      {rows.length > 0 && (
        <div className="mt-5 flex items-center gap-4 rounded-lg border border-pi-border bg-white p-4">
          <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-lg text-3xl font-black text-white ${GRADE_COLOR[grade.grade]}`}>{grade.grade}</div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-pi-navy">Portfolio grade · {grade.scorePct}% healthy</p>
            <p className="text-sm text-slate-600">{grade.headline}</p>
            <div className="mt-1.5 flex gap-4 text-xs">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> {grade.green} clean</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> {grade.yellow} watch</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> {grade.red} problem</span>
              {grade.errors > 0 && <span className="text-slate-400">{grade.errors} not found</span>}
            </div>
          </div>
        </div>
      )}

      {/* results */}
      {results.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {sorted.map((r) => (
            <div key={r.index} className={`rounded-lg border border-pi-border bg-white p-3 ${r.row?.light ? LIGHT_ROW[r.row.light] : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  {r.row?.light ? (
                    <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${LIGHT_DOT[r.row.light]}`} />
                  ) : (
                    <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-slate-300" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{r.address || "(no address)"}</p>
                    {r.status === "done" && r.row ? (
                      <div className="mt-0.5 text-xs text-slate-600">
                        {r.row.lines.map((l, i) => <p key={i}>{l}</p>)}
                      </div>
                    ) : (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {r.status === "running" ? "Reading market…" : r.status === "pending" ? "Queued" : <span className="text-red-600">{r.error}</span>}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {r.row?.rating && <span className="text-xs font-bold text-slate-700">{r.row.rating}</span>}
                  {r.status === "done" && r.intel && (
                    <button onClick={() => downloadFullPdf(r)} className="text-xs text-pi-accent hover:underline">Full report</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ColSelect({ label, headers, value, onChange }: { label: string; headers: string[]; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
        <option value={-1}>— none —</option>
        {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
      </select>
    </label>
  );
}
