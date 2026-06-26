"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { parseCsv, toCsv, type ParsedCsv } from "@/lib/csv";
import type { MarketIntel } from "@/lib/market-data";

type RowStatus = "pending" | "running" | "done" | "error";

interface RowResult {
  index: number;
  address: string;
  status: RowStatus;
  intel: MarketIntel | null;
  error: string | null;
}

function usd(n: number | null): string {
  return n === null ? "—" : "$" + Math.round(n).toLocaleString("en-US");
}

// Guess a column index whose header matches any of the given keywords.
function guess(headers: string[], keywords: string[]): number {
  const lower = headers.map((h) => h.toLowerCase());
  for (const k of keywords) {
    const i = lower.findIndex((h) => h.includes(k));
    if (i >= 0) return i;
  }
  return -1;
}

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
  const [limit, setLimit] = useState(5);
  const [results, setResults] = useState<RowResult[]>([]);
  const [running, setRunning] = useState(false);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result ?? ""));
      setCsv(parsed);
      setResults([]);
      // Auto-guess column mapping.
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

  const previewAddresses = useMemo(() => {
    if (!csv) return [];
    return csv.rows.slice(0, Math.max(0, limit)).map((r) => addressFor(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csv, mode, addressCol, streetCol, cityCol, stateCol, zipCol, limit]);

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
      status: "pending",
      intel: null,
      error: null,
    }));
    setResults(initial);
    setRunning(true);

    // Simple concurrency pool.
    let cursor = 0;
    async function worker() {
      while (cursor < initial.length) {
        const myIndex = cursor++;
        const item = initial[myIndex];
        if (!item.address) {
          setResults((prev) =>
            prev.map((r) => (r.index === myIndex ? { ...r, status: "error", error: "No address" } : r)),
          );
          continue;
        }
        setResults((prev) => prev.map((r) => (r.index === myIndex ? { ...r, status: "running" } : r)));
        const { intel, error } = await lookupOne(item.address);
        setResults((prev) =>
          prev.map((r) =>
            r.index === myIndex ? { ...r, status: error ? "error" : "done", intel, error } : r,
          ),
        );
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, initial.length) }, worker));
    setRunning(false);
  }

  async function downloadPdf(r: RowResult) {
    if (!r.intel) return;
    const res = await fetch("/api/lookup/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intel: r.intel, meta: { orderNumber: r.address } }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${r.address.replace(/[^\w.-]+/g, "_")}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportResults() {
    const headers = [
      "address",
      "value_low",
      "value_high",
      "absorption_level",
      "months_of_supply",
      "active",
      "sold",
      "active_per_sold",
      "radius_mi",
      "median_dom",
      "status",
      "error",
    ];
    const rows = results.map((r) => {
      const i = r.intel;
      return [
        r.address,
        i?.valueRange.low ?? null,
        i?.valueRange.high ?? null,
        i?.absorption.level ?? null,
        i?.absorption.monthsOfSupply ?? null,
        i?.ring.activeCount ?? null,
        i?.ring.soldCount ?? null,
        i?.absorption.activePerSold ?? null,
        i?.ring.radiusReachedMiles ?? null,
        i?.medianDom ?? null,
        r.status,
        r.error,
      ];
    });
    const blob = new Blob([toCsv(headers, rows)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "propintel-bulk-results.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const doneCount = results.filter((r) => r.status === "done").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  const totalRows = csv?.rows.length ?? 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-xs font-semibold uppercase tracking-wide text-pi-accent">
          ← Home
        </Link>
        <Link href="/lookup" className="text-xs font-semibold uppercase tracking-wide text-pi-accent">
          Single address →
        </Link>
      </div>

      <h1 className="text-2xl font-black text-pi-navy">Bulk Market Intelligence</h1>
      <p className="mt-1 text-sm text-slate-600">
        Upload a CSV of properties. We run each address through the engine and produce a mini report —
        value range, absorption, what&apos;s moving vs. sitting. Test a few first, then run the batch.
      </p>

      {/* upload */}
      <div className="mt-5 rounded-lg border border-pi-border bg-white p-4">
        <label className="text-sm font-semibold text-pi-navy">1. Upload CSV</label>
        <input type="file" accept=".csv,text/csv" onChange={onFile} className="mt-2 block text-sm" />
        {fileName && (
          <p className="mt-1 text-xs text-slate-500">
            {fileName} — {totalRows} rows, {csv?.headers.length ?? 0} columns
          </p>
        )}
      </div>

      {/* mapping */}
      {csv && (
        <div className="mt-4 rounded-lg border border-pi-border bg-white p-4">
          <p className="text-sm font-semibold text-pi-navy">2. Map the address</p>
          <div className="mt-2 flex gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={mode === "single"} onChange={() => setMode("single")} />
              One full-address column
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={mode === "parts"} onChange={() => setMode("parts")} />
              Separate street / city / state / zip
            </label>
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
          </div>

          {previewAddresses.length > 0 && (
            <div className="mt-3 rounded bg-slate-50 p-2 text-xs text-slate-600">
              <span className="font-semibold">Preview:</span> {previewAddresses[0] || "(empty — check mapping)"}
              {previewAddresses.length > 1 ? `  ·  +${previewAddresses.length - 1} more` : ""}
            </div>
          )}
        </div>
      )}

      {/* run */}
      {csv && (
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-pi-border bg-white p-4">
          <div>
            <label className="block text-sm font-semibold text-pi-navy">3. Rows to process</label>
            <input
              type="number"
              min={1}
              max={totalRows || 1}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Number(e.target.value) || 1))}
              className="mt-1 w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <span className="ml-2 text-xs text-slate-500">of {totalRows} (start small to test)</span>
          </div>
          <button
            onClick={run}
            disabled={running}
            className="rounded-md bg-pi-navy px-5 py-2 text-sm font-semibold text-white hover:bg-pi-navy-soft disabled:opacity-60"
          >
            {running ? `Running… ${doneCount + errorCount}/${results.length}` : `Run ${limit}`}
          </button>
          {results.length > 0 && !running && (
            <button
              onClick={exportResults}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Export results CSV
            </button>
          )}
          {results.length > 0 && (
            <span className="text-xs text-slate-500">
              {doneCount} done · {errorCount} error
            </span>
          )}
        </div>
      )}

      {/* results */}
      {results.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-pi-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Address</th>
                <th className="px-3 py-2">Value range</th>
                <th className="px-3 py-2">Absorption</th>
                <th className="px-3 py-2 text-center">MoS</th>
                <th className="px-3 py-2 text-center">Act/Sold</th>
                <th className="px-3 py-2 text-right">PDF</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.index} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2 text-slate-400">{r.index + 1}</td>
                  <td className="px-3 py-2 text-slate-700">{r.address || <em className="text-slate-400">no address</em>}</td>
                  {r.status === "done" && r.intel ? (
                    <>
                      <td className="px-3 py-2 font-medium text-pi-navy">
                        {usd(r.intel.valueRange.low)} – {usd(r.intel.valueRange.high)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-slate-700">{r.intel.absorption.level}</span>
                      </td>
                      <td className="px-3 py-2 text-center text-slate-600">
                        {r.intel.absorption.monthsOfSupply ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-center text-slate-600">
                        {r.intel.ring.activeCount}/{r.intel.ring.soldCount}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => downloadPdf(r)} className="text-pi-accent hover:underline">
                          PDF
                        </button>
                      </td>
                    </>
                  ) : (
                    <td className="px-3 py-2 text-slate-500" colSpan={5}>
                      {r.status === "running"
                        ? "Reading market…"
                        : r.status === "pending"
                          ? "Queued"
                          : r.status === "error"
                            ? <span className="text-red-600">{r.error}</span>
                            : ""}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ColSelect({
  label,
  headers,
  value,
  onChange,
}: {
  label: string;
  headers: string[];
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      >
        <option value={-1}>— select —</option>
        {headers.map((h, i) => (
          <option key={i} value={i}>
            {h || `Column ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}
