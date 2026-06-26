"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { MarketIntel } from "@/lib/market-data";
import { buildMarketReport, type RiskRating } from "@/lib/market-report";

function usd(n: number | null): string {
  return n === null ? "—" : "$" + Math.round(n).toLocaleString("en-US");
}

const RATING_BG: Record<RiskRating, string> = {
  LOW: "bg-emerald-600",
  MODERATE: "bg-amber-500",
  HIGH: "bg-orange-600",
  CRITICAL: "bg-red-600",
};
const RATING_WORD: Record<RiskRating, string> = {
  LOW: "LOW RISK",
  MODERATE: "MODERATE RISK",
  HIGH: "HIGH RISK",
  CRITICAL: "CRITICAL — ESCALATE",
};

const LEVEL_COLOR: Record<string, string> = {
  TIGHT: "bg-emerald-100 text-emerald-800",
  BALANCED: "bg-slate-100 text-slate-700",
  SOFT: "bg-amber-100 text-amber-800",
  OVERSUPPLIED: "bg-orange-100 text-orange-800",
  SEVERE: "bg-red-100 text-red-800",
};

const VERDICT_COLOR: Record<string, string> = {
  MOVING: "text-emerald-700",
  BALANCED: "text-slate-500",
  SITTING: "text-red-700",
};

export default function LookupPage() {
  const [address, setAddress] = useState("");
  const [priceStr, setPriceStr] = useState("");
  const [intel, setIntel] = useState<MarketIntel | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testValue = useMemo(() => {
    const n = Number(priceStr.replace(/[$,\s]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [priceStr]);
  const report = useMemo(
    () => (intel ? buildMarketReport(intel, { testValue, testLabel: "Loan / list price" }) : null),
    [intel, testValue],
  );

  async function run(e?: React.FormEvent, addressOverride?: string) {
    e?.preventDefault();
    const a = (addressOverride ?? address).trim();
    if (!a) return;
    setLoading(true);
    setError(null);
    setIntel(null);
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: a }),
      });
      const data = (await res.json()) as { intel?: MarketIntel; error?: string };
      if (!res.ok || !data.intel) throw new Error(data.error || "Lookup failed.");
      setIntel(data.intel);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed.");
    } finally {
      setLoading(false);
    }
  }

  // Auto-run when an address is passed from the homepage (/lookup?address=…).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("address");
    if (q) {
      setAddress(q);
      void run(undefined, q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function downloadPdf() {
    if (!intel) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/lookup/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intel, meta: { testValue, testLabel: "Loan / list price" } }),
      });
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(intel.subject.address || "market-intelligence").replace(/[^\w.-]+/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(String(e));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-xs font-semibold uppercase tracking-wide text-pi-accent">
          ← Home
        </Link>
        <span className="text-xs text-slate-400">Automated market intelligence</span>
      </div>

      <h1 className="text-2xl font-black text-pi-navy">Market Intelligence</h1>
      <p className="mt-1 text-sm text-slate-600">
        Type an address. We pull every active and sold comp around it, build the ½-mile ring (expanding
        only if needed), and read the real market — absorption, which price bands move vs. sit, and a
        defensible value range.
      </p>

      <form onSubmit={run} className="mt-5 flex flex-col gap-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, Cleveland, OH 44109"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-pi-accent"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-pi-navy px-5 py-2 text-sm font-semibold text-white hover:bg-pi-navy-soft disabled:opacity-60"
          >
            {loading ? "Reading market…" : "Run intelligence"}
          </button>
        </div>
        <input
          value={priceStr}
          onChange={(e) => setPriceStr(e.target.value)}
          placeholder="Optional: loan amount or list price (e.g. 250000) — lets us assess market support"
          className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-pi-accent"
        />
      </form>

      {error && (
        <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {intel && (
        <div className="mt-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Market read</h2>
            <button
              onClick={downloadPdf}
              disabled={downloading}
              className="rounded-md bg-pi-navy px-4 py-1.5 text-sm font-semibold text-white hover:bg-pi-navy-soft disabled:opacity-60"
            >
              {downloading ? "Generating…" : "Download PDF report"}
            </button>
          </div>

          {intel.usingSampleData && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              <strong>Sample data.</strong> No Rentcast API key is set yet, so this shows the built-in
              demo market. Add <code>RENTCAST_API_KEY</code> to pull live data for any address.
            </div>
          )}

          {/* verdict */}
          {report && (
            <div className="overflow-hidden rounded-lg border border-pi-border bg-white">
              <div className={`flex items-center justify-between px-4 py-3 text-white ${RATING_BG[report.rating]}`}>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">Overall assessment</p>
                  <p className="text-xl font-black">{RATING_WORD[report.rating]}</p>
                </div>
                <p className="ml-4 max-w-[55%] text-right text-[11px] leading-snug opacity-95">{report.ratingLine}</p>
              </div>
              <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-5">
                {[
                  ["Market support", report.marketSupport.replace("_", " ")],
                  ["Condition", "Pending"],
                  ["Fraud signal", "Pending"],
                  ["Absorption", intel.absorption.level],
                  ["Red flags", `${report.criticalCount}C · ${report.advisoryCount}A`],
                ].map(([label, value]) => (
                  <div key={label} className="bg-white px-3 py-2 text-center">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                    <p className="mt-0.5 text-xs font-bold text-pi-navy">{value}</p>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3">
                <p className="mb-2 text-sm font-semibold text-pi-navy">
                  Red flags — {report.criticalCount} critical · {report.advisoryCount} advisory
                </p>
                {report.flags.length === 0 ? (
                  <p className="text-sm text-slate-500">No critical or advisory market flags from available data.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {report.flags.map((f, i) => (
                      <li key={i} className="flex gap-2 text-sm">
                        <span
                          className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            f.severity === "CRITICAL" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {f.severity}
                        </span>
                        <span className="text-slate-700">
                          <strong className="text-slate-900">{f.category}:</strong> {f.line}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[11px] text-slate-400">{report.marketSupportLine}</p>
              </div>
            </div>
          )}

          {/* subject */}
          <div className="rounded-lg border border-pi-border bg-white p-4">
            <p className="text-xs text-slate-500">Subject</p>
            <h2 className="text-lg font-bold text-pi-navy">{intel.subject.address}</h2>
            <p className="text-sm text-slate-600">
              {[intel.subject.city, intel.subject.state, intel.subject.zip].filter(Boolean).join(", ")}
              {intel.subject.sqft ? ` · ${intel.subject.sqft.toLocaleString()} sqft` : ""}
              {intel.subject.beds ? ` · ${intel.subject.beds} bd` : ""}
              {intel.subject.baths ? `/${intel.subject.baths} ba` : ""}
              {intel.subject.yearBuilt ? ` · built ${intel.subject.yearBuilt}` : ""}
            </p>
          </div>

          {/* headline hero */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-pi-border bg-gradient-to-br from-slate-50 to-white p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Indicated as-is value range
              </p>
              <p className="mt-1 text-2xl font-black text-pi-navy">
                {usd(intel.valueRange.low)} – {usd(intel.valueRange.high)}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">{intel.valueRange.basis}</p>
            </div>
            <div
              className={`rounded-lg border p-4 ${
                intel.absorption.level === "SEVERE" || intel.absorption.level === "OVERSUPPLIED"
                  ? "border-red-200 bg-red-50"
                  : "border-pi-border bg-gradient-to-br from-slate-50 to-white"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Absorption</p>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${LEVEL_COLOR[intel.absorption.level]}`}>
                  {intel.absorption.level}
                </span>
              </div>
              <p className="mt-1 text-2xl font-black text-pi-navy">
                {intel.absorption.monthsOfSupply !== null
                  ? `${intel.absorption.monthsOfSupply} mo supply`
                  : "No clearance"}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">{intel.absorption.ratioLine}</p>
            </div>
          </div>

          {/* comp ring */}
          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Comp ring</p>
            <p className="mt-1">{intel.ring.note}</p>
            <p className="mt-1 text-xs text-slate-500">
              {intel.ring.activeCount} active · {intel.ring.pendingCount} pending · {intel.ring.soldCount} sold
              {" "}in {intel.ring.windowMonths} mo · radius {intel.ring.radiusReachedMiles} mi
              {intel.medianDom !== null ? ` · median ${intel.medianDom} DOM` : ""}
            </p>
          </div>

          {/* price bands */}
          {intel.priceBands.length > 0 && (
            <div className="rounded-lg border border-pi-border bg-white p-4">
              <p className="mb-2 text-sm font-semibold text-pi-navy">What&apos;s moving vs. sitting</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="pb-1">Price band</th>
                    <th className="pb-1 text-center">Active</th>
                    <th className="pb-1 text-center">Sold</th>
                    <th className="pb-1 text-right">Read</th>
                  </tr>
                </thead>
                <tbody>
                  {intel.priceBands.map((b) => (
                    <tr key={b.label} className="border-t border-slate-100">
                      <td className="py-1 font-medium text-slate-700">{b.label}</td>
                      <td className="py-1 text-center text-slate-600">{b.active}</td>
                      <td className="py-1 text-center text-slate-600">{b.sold}</td>
                      <td className={`py-1 text-right font-bold ${VERDICT_COLOR[b.verdict]}`}>{b.verdict}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* three lenses */}
          <div className="rounded-lg border border-pi-border bg-white p-4">
            <p className="mb-2 text-sm font-semibold text-pi-navy">Three lenses</p>
            <div className="flex flex-col gap-3">
              {intel.lenses.map((l) => (
                <div key={l.lens}>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-pi-accent">{l.lens}</p>
                  <p className="text-sm text-slate-700">{l.takeaway}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
