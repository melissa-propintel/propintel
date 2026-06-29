"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getOrderByNumber,
  updateOrder,
  STATUS_FLOW,
  type Order,
  type OrderStatus,
} from "@/lib/orders";

const APP = "https://propintelreport.com";

const STATUS_COLOR: Record<OrderStatus, string> = {
  new: "bg-slate-100 text-slate-700",
  assigned: "bg-sky-100 text-sky-700",
  in_progress: "bg-amber-100 text-amber-700",
  ready: "bg-emerald-100 text-emerald-700",
  delivered: "bg-pi-green-deep text-white",
};

type Summary = { compsExtracted: number; active: number; sold: number; docs: number };
type FieldData = { recommendedPrice?: string; strategy?: string; areaComparison?: string; comments?: string };

export default function WorkOrderPage() {
  const params = useParams();
  const orderNumber = decodeURIComponent(String(params.order ?? ""));

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const [extracting, setExtracting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [intel, setIntel] = useState<unknown | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [field, setField] = useState<FieldData | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setOrder(await getOrderByNumber(orderNumber));
      } catch {
        /* show "not found" */
      } finally {
        setLoading(false);
      }
    })();
  }, [orderNumber]);

  const captureLink = `${APP}/capture?order=${encodeURIComponent(orderNumber)}`;

  async function setStatus(s: OrderStatus) {
    if (!order) return;
    await updateOrder(order.id, { status: s });
    setOrder({ ...order, status: s });
  }

  async function buildReport() {
    setExtracting(true);
    setErr(null);
    setIntel(null);
    setSummary(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: orderNumber, address: order?.property_address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      setIntel(data.intel);
      setSummary(data.summary);
      setField(data.fieldData);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setExtracting(false);
    }
  }

  async function downloadPdf() {
    if (!intel) return;
    const res = await fetch("/api/lookup/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intel, meta: { orderNumber, clientName: order?.client_name, agentRead: field ?? undefined } }),
    });
    if (!res.ok) {
      setErr("PDF build failed");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PropIntel-${orderNumber}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const v = intel as { valueRange?: { low: number | null; high: number | null }; ring?: { totalComps: number; radiusReachedMiles: number } } | null;
  const card = "rounded-2xl border border-pi-border bg-white p-5";

  if (loading) return <main className="flex flex-1 bg-pi-cream px-4 py-10"><p className="mx-auto text-sm text-pi-slate-mid">Loading…</p></main>;

  return (
    <main className="flex flex-1 flex-col bg-pi-cream px-4 py-8">
      <div className="mx-auto w-full max-w-2xl">
        <Link href="/orders" className="text-xs font-medium text-pi-green-deep hover:underline">← All orders</Link>

        {/* Header */}
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-pi-green-dark">{orderNumber}</h1>
              {order && <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${STATUS_COLOR[order.status]}`}>{order.status.replace("_", " ")}</span>}
            </div>
            <p className="mt-0.5 text-sm text-slate-700">{order?.property_address ?? "(order not found)"}</p>
            <p className="text-xs text-pi-slate-mid">{order?.client_name || "—"}{order?.product_type ? ` · ${order.product_type}` : ""}</p>
          </div>
          {order && (
            <select
              value={order.status}
              onChange={(e) => setStatus(e.target.value as OrderStatus)}
              className="rounded-md border border-pi-border bg-white px-2 py-1 text-xs"
            >
              {STATUS_FLOW.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          )}
        </div>

        {/* Step 1 — Upload */}
        <section className={`mt-5 ${card}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-pi-amber-text">Step 1 · Field data &amp; photos</p>
          <p className="mt-1 text-sm text-pi-slate-mid">
            Send this link to the agent — or, if the agent can&apos;t, <strong>your office can open it and upload</strong> whatever
            they emailed (photos + MLS). The client never waits on a flaky agent.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a href={captureLink} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-pi-green-deep px-4 py-2 text-sm font-medium text-white hover:bg-pi-navy-soft transition">
              Open upload page
            </a>
            <button
              onClick={() => { void navigator.clipboard.writeText(captureLink); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="rounded-lg border-[1.5px] border-pi-green-deep px-4 py-2 text-sm font-medium text-pi-green-deep hover:bg-pi-green-pale transition"
            >
              {copied ? "Copied ✓" : "Copy agent link"}
            </button>
          </div>
        </section>

        {/* Step 2 — Build report */}
        <section className={`mt-4 ${card}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-pi-amber-text">Step 2 · Build the report</p>
          <p className="mt-1 text-sm text-pi-slate-mid">
            Reads the uploaded MLS / comps / tax docs, extracts the data, and builds the report. No order number to type.
          </p>
          <button
            onClick={buildReport}
            disabled={extracting}
            className="mt-3 rounded-lg bg-pi-green-deep px-5 py-2.5 text-sm font-medium text-white hover:bg-pi-navy-soft transition disabled:opacity-50"
          >
            {extracting ? "Reading documents…" : "Build report from uploaded data"}
          </button>
          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}

          {summary && (
            <div className="mt-4 space-y-2 border-t border-pi-border pt-4">
              <p className="text-sm text-pi-slate-mid">
                {summary.compsExtracted} comps from {summary.docs} document{summary.docs === 1 ? "" : "s"} · {summary.active} active · {summary.sold} sold
              </p>
              {v?.valueRange && (
                <p className="text-sm text-pi-green-dark">
                  Indicated value{" "}
                  <strong>
                    {v.valueRange.low != null ? "$" + v.valueRange.low.toLocaleString() : "—"} – {v.valueRange.high != null ? "$" + v.valueRange.high.toLocaleString() : "—"}
                  </strong>
                  {v.ring ? ` · ${v.ring.totalComps} comps in ${v.ring.radiusReachedMiles} mi` : ""}
                </p>
              )}
              {field && (field.recommendedPrice || field.strategy || field.comments) && (
                <div className="rounded-lg bg-pi-cream p-3 text-xs text-pi-slate-mid">
                  <p className="font-semibold text-pi-green-dark">Agent&apos;s read</p>
                  {field.recommendedPrice && <p>Recommended: {field.recommendedPrice}</p>}
                  {field.strategy && <p>Strategy: {field.strategy}</p>}
                  {field.areaComparison && <p>Area: {field.areaComparison}</p>}
                  {field.comments && <p>{field.comments}</p>}
                </div>
              )}
              <button onClick={downloadPdf} className="rounded-lg border-[1.5px] border-pi-green-deep px-5 py-2.5 text-sm font-medium text-pi-green-deep hover:bg-pi-green-pale transition">
                Download report PDF
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
