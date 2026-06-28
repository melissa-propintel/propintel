"use client";

import { useState } from "react";

type Summary = { compsExtracted: number; active: number; sold: number; docs: number };
type FieldData = { recommendedPrice?: string; strategy?: string; comments?: string };

export default function ExtractPage() {
  const [order, setOrder] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intel, setIntel] = useState<unknown | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [field, setField] = useState<FieldData | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setIntel(null);
    setSummary(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order, address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      setIntel(data.intel);
      setSummary(data.summary);
      setField(data.fieldData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function downloadPdf() {
    if (!intel) return;
    const res = await fetch("/api/lookup/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intel, meta: { orderNumber: order } }),
    });
    if (!res.ok) {
      setError("PDF build failed");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PropIntel-${order || "report"}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const v = intel as { valueRange?: { low: number | null; high: number | null }; ring?: { totalComps: number; radiusReachedMiles: number } } | null;
  const inputCls = "w-full rounded-md border border-pi-border bg-white px-3 py-2 text-sm focus:border-pi-green-deep focus:outline-none";

  return (
    <main className="flex flex-1 flex-col bg-pi-cream px-4 py-10">
      <div className="mx-auto w-full max-w-xl">
        <h1 className="text-2xl font-medium text-pi-green-dark">Build report from uploaded data</h1>
        <p className="mt-1 text-sm text-pi-slate-mid">
          Reads the order&apos;s uploaded MLS / comps / tax documents, extracts the data, and builds the
          report. Upload the documents first on the order&apos;s capture link.
        </p>

        <div className="mt-6 space-y-3 rounded-2xl border border-pi-border bg-white p-5">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Order number</label>
            <input value={order} onChange={(e) => setOrder(e.target.value)} placeholder="PI-2026-#####" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Subject address (fallback)</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="If the docs don't state it clearly" className={inputCls} />
          </div>
          <button
            onClick={run}
            disabled={loading || !order}
            className="rounded-lg bg-pi-green-deep px-5 py-2.5 text-sm font-medium text-white hover:bg-pi-navy-soft transition disabled:opacity-50"
          >
            {loading ? "Reading documents…" : "Extract & analyze"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {summary && (
          <div className="mt-5 space-y-3 rounded-2xl border border-pi-border bg-white p-5">
            <h2 className="text-base font-medium text-pi-green-dark">Extracted</h2>
            <p className="text-sm text-pi-slate-mid">
              {summary.compsExtracted} comps from {summary.docs} document{summary.docs === 1 ? "" : "s"} ·{" "}
              {summary.active} active · {summary.sold} sold
            </p>
            {v?.valueRange && (
              <p className="text-sm text-pi-green-dark">
                Indicated value{" "}
                <strong>
                  {v.valueRange.low != null ? "$" + v.valueRange.low.toLocaleString() : "—"} –{" "}
                  {v.valueRange.high != null ? "$" + v.valueRange.high.toLocaleString() : "—"}
                </strong>
                {v.ring ? ` · ${v.ring.totalComps} comps in ${v.ring.radiusReachedMiles} mi` : ""}
              </p>
            )}
            {field && (field.recommendedPrice || field.strategy || field.comments) && (
              <div className="rounded-lg bg-pi-cream p-3 text-xs text-pi-slate-mid">
                <p className="font-semibold text-pi-green-dark">Agent&apos;s read</p>
                {field.recommendedPrice && <p>Recommended: {field.recommendedPrice}</p>}
                {field.strategy && <p>Strategy: {field.strategy}</p>}
                {field.comments && <p>{field.comments}</p>}
              </div>
            )}
            <button
              onClick={downloadPdf}
              className="rounded-lg border-[1.5px] border-pi-green-deep px-5 py-2.5 text-sm font-medium text-pi-green-deep hover:bg-pi-green-pale transition"
            >
              Download report PDF
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
