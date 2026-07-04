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
import { priceFor, usd } from "@/lib/pricing";

const APP = "https://propintelreport.com";

const STATUS_COLOR: Record<OrderStatus, string> = {
  new: "bg-slate-100 text-slate-700",
  assigned: "bg-sky-100 text-sky-700",
  in_progress: "bg-amber-100 text-amber-700",
  ready: "bg-emerald-100 text-emerald-700",
  delivered: "bg-pi-green-deep text-white",
};

type Summary = { compsExtracted: number; active: number; sold: number; docs: number };
type FieldData = { recommendedPrice?: string; strategy?: string; areaComparison?: string; comments?: string; inspectionType?: string; inspectionDate?: string; occupancy?: string };

const REPORT_TYPES = [
  "Property Intelligence Report",
  "REO Initial Report",
  "REO Disposition Report",
  "BPO / Valuation",
  "Pre-Origination Field Report",
];

export default function WorkOrderPage() {
  const params = useParams();
  const orderNumber = decodeURIComponent(String(params.order ?? ""));

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const [extracting, setExtracting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [reportType, setReportType] = useState(REPORT_TYPES[0]);
  const [err, setErr] = useState<string | null>(null);
  const [intel, setIntel] = useState<unknown | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [field, setField] = useState<FieldData | null>(null);
  const [sample, setSample] = useState<string | null>(null);

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
    setSample(null);
    try {
      // The SERVER reads the PDFs (reliable). We just kick it off.
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: orderNumber, address: order?.property_address }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.sample) setSample(`Subject seen: ${data.subjectSeen ?? "—"}. Text the AI received (first 1,200 chars):\n\n${data.sample}`);
        throw new Error(data.error || "Extraction failed");
      }
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
    if (!intel || downloading) return;
    setDownloading(true);
    setDownloaded(false);
    setErr(null);
    try {
      const res = await fetch("/api/lookup/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intel, meta: { orderNumber, clientName: order?.client_name, serviceLineLabel: reportType, agentRead: field ?? undefined } }),
      });
      if (!res.ok) {
        setErr("PDF build failed — try again in a moment.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PropIntel-${orderNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 6000);
    } catch {
      setErr("PDF build failed — try again in a moment.");
    } finally {
      setDownloading(false);
    }
  }

  async function payNow() {
    if (!order) return;
    setErr(null);
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNumber }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
      return;
    }
    setErr(data.error || "Payments aren't set up yet — the order is saved; you can invoice it.");
  }

  async function sendInvoice() {
    if (!order) return;
    const email = window.prompt("Client email to send the invoice to (net-30):", order.customer_email || "");
    if (!email) return;
    setErr(null);
    const res = await fetch("/api/invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNumbers: [orderNumber], customerEmail: email, customerName: order.client_name || undefined }),
    });
    const data = await res.json();
    if (data.url) {
      window.open(data.url, "_blank");
      window.alert(`Invoice sent to ${email} — ${data.total}. It'll mark paid automatically when they pay.`);
      return;
    }
    setErr(data.error || "Couldn't create the invoice.");
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
            {order && (
              order.paid ? (
                <p className="mt-1 text-xs font-semibold text-emerald-700">Paid ✓ {order.amount_cents ? usd(order.amount_cents) : ""}{order.paid_at ? ` · ${new Date(order.paid_at).toLocaleDateString()}` : ""}</p>
              ) : (
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-xs font-medium text-amber-700">Unpaid — {usd(priceFor(order.product_type).cents)}</span>
                  <button onClick={payNow} className="rounded-md bg-pi-green-deep px-3 py-1 text-xs font-semibold text-white hover:bg-pi-navy-soft">Pay now</button>
                  <button onClick={sendInvoice} className="rounded-md border border-pi-green-deep px-3 py-1 text-xs font-semibold text-pi-green-deep hover:bg-pi-green-pale">Invoice</button>
                </div>
              )
            )}
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
          {sample && (
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-pi-border bg-pi-cream p-3 text-[11px] text-pi-slate-mid">{sample}</pre>
          )}

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
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="mr-3 rounded-lg border border-pi-border px-3 py-2.5 text-sm text-pi-slate"
                title="Report type / service line"
              >
                {REPORT_TYPES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <button
                onClick={downloadPdf}
                disabled={downloading}
                className="rounded-lg border-[1.5px] border-pi-green-deep px-5 py-2.5 text-sm font-medium text-pi-green-deep hover:bg-pi-green-pale transition disabled:opacity-60 disabled:cursor-wait"
              >
                {downloading ? "Building report… (10–30s)" : downloaded ? "Downloaded ✓ — check your Downloads" : "Download report PDF"}
              </button>
              {downloading && <span className="ml-3 text-sm text-pi-green-deep">Running condition + value engine…</span>}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
