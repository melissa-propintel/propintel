"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  listOrders,
  createOrder,
  updateOrder,
  generateOrderNumber,
  ordersConfigured,
  STATUS_FLOW,
  type Order,
  type OrderStatus,
  type ProductType,
} from "@/lib/orders";

const STATUS_COLOR: Record<OrderStatus, string> = {
  new: "bg-slate-100 text-slate-700",
  assigned: "bg-sky-100 text-sky-700",
  in_progress: "bg-amber-100 text-amber-700",
  ready: "bg-emerald-100 text-emerald-700",
  delivered: "bg-pi-navy text-white",
};

export default function OrdersPage() {
  const configured = ordersConfigured();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // new-order form
  const [client, setClient] = useState("");
  const [address, setAddress] = useState("");
  const [product, setProduct] = useState<ProductType>("desktop");
  const [loan, setLoan] = useState("");
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [sendMsg, setSendMsg] = useState<Record<string, string>>({});

  async function refresh() {
    if (!configured) {
      setLoading(false);
      return;
    }
    try {
      setOrders(await listOrders());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load orders.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const loanNum = Number(loan.replace(/[$,\s]/g, ""));
      await createOrder({
        order_number: generateOrderNumber(),
        client_name: client.trim() || null,
        property_address: address.trim(),
        product_type: product,
        loan_amount: Number.isFinite(loanNum) && loanNum > 0 ? loanNum : null,
        notes: null,
      });
      setClient("");
      setAddress("");
      setLoan("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the order.");
    } finally {
      setCreating(false);
    }
  }

  async function patch(o: Order, p: Partial<Order>) {
    setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, ...p } : x)));
    try {
      await updateOrder(o.id, p);
    } catch {
      void refresh();
    }
  }

  function agentLink(o: Order): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/capture?order=${encodeURIComponent(o.order_number)}`;
  }
  function reportLink(o: Order): string {
    const p = new URLSearchParams({ address: o.property_address, order: o.order_number });
    if (o.loan_amount) p.set("price", String(o.loan_amount));
    return `/lookup?${p.toString()}`;
  }
  async function copyAgentLink(o: Order) {
    try {
      await navigator.clipboard.writeText(agentLink(o));
      setCopied(o.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  }

  const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

  // When an agent email is set on a field order, auto-email them the link.
  async function maybeEmailAgent(o: Order, value: string) {
    const email = value.match(EMAIL_RE)?.[0];
    if (!email || o.product_type !== "field") return;
    setSendMsg((m) => ({ ...m, [o.id]: "Sending…" }));
    try {
      const res = await fetch("/api/agent-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber: o.order_number,
          address: o.property_address,
          agentEmail: email,
          agentName: value.replace(EMAIL_RE, "").replace(/[<>]/g, "").trim() || undefined,
        }),
      });
      const data = (await res.json()) as { sent?: boolean; notConfigured?: boolean; error?: string };
      if (data.sent) setSendMsg((m) => ({ ...m, [o.id]: "Link emailed ✓" }));
      else if (data.notConfigured) setSendMsg((m) => ({ ...m, [o.id]: "Email not set up — use Copy link" }));
      else setSendMsg((m) => ({ ...m, [o.id]: data.error || "Send failed" }));
    } catch {
      setSendMsg((m) => ({ ...m, [o.id]: "Send failed — use Copy link" }));
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-xs font-semibold uppercase tracking-wide text-pi-accent">← Home</Link>
        <span className="text-xs text-slate-400">Order management</span>
      </div>

      <h1 className="text-2xl font-black text-pi-navy">Orders</h1>
      <p className="mt-1 text-sm text-slate-600">
        Create an order, assign a field agent (they get a link to just their job), and deliver the report.
      </p>

      {!configured && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Orders need Supabase connected (NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY) and the
          <code className="mx-1">orders</code> table. Once those are set, this page is live.
        </div>
      )}

      {/* new order */}
      {configured && (
        <form onSubmit={submit} className="mt-5 rounded-lg border border-pi-border bg-white p-4">
          <p className="text-sm font-semibold text-pi-navy">New order</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Client (e.g. First Lien Capital)" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Property address" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <select value={product} onChange={(e) => setProduct(e.target.value as ProductType)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="desktop">Desktop value-check (no site visit)</option>
              <option value="field">Field report (agent photos)</option>
            </select>
            <input value={loan} onChange={(e) => setLoan(e.target.value)} placeholder="Loan / list price (optional)" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <button type="submit" disabled={creating} className="mt-3 rounded-md bg-pi-navy px-5 py-2 text-sm font-semibold text-white hover:bg-pi-navy-soft disabled:opacity-60">
            {creating ? "Creating…" : "Create order"}
          </button>
        </form>
      )}

      {error && <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* list */}
      {configured && (
        <div className="mt-5">
          {loading ? (
            <p className="text-sm text-slate-500">Loading orders…</p>
          ) : orders.length === 0 ? (
            <p className="text-sm text-slate-500">No orders yet. Create one above.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {orders.map((o) => (
                <div key={o.id} className="rounded-lg border border-pi-border bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-pi-navy">{o.order_number}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${STATUS_COLOR[o.status]}`}>{o.status.replace("_", " ")}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{o.product_type}</span>
                      </div>
                      <p className="mt-0.5 text-sm text-slate-700">{o.property_address}</p>
                      <p className="text-xs text-slate-500">{o.client_name || "—"}{o.loan_amount ? ` · loan $${o.loan_amount.toLocaleString()}` : ""}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <select
                        value={o.status}
                        onChange={(e) => patch(o, { status: e.target.value as OrderStatus })}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                      >
                        {STATUS_FLOW.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                      </select>
                      <div className="flex items-center gap-3 text-xs">
                        {o.product_type === "field" && (
                          <button onClick={() => copyAgentLink(o)} className="text-pi-accent hover:underline">
                            {copied === o.id ? "Link copied!" : "Copy agent link"}
                          </button>
                        )}
                        <a href={reportLink(o)} className="font-semibold text-pi-accent hover:underline">Open report →</a>
                      </div>
                    </div>
                  </div>
                  {o.product_type === "field" && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] uppercase tracking-wide text-slate-400">Agent</span>
                      <input
                        defaultValue={o.assigned_agent ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          patch(o, { assigned_agent: v || null, status: o.status === "new" && v ? "assigned" : o.status });
                          if (v) void maybeEmailAgent({ ...o, assigned_agent: v }, v);
                        }}
                        placeholder="agent name + email (auto-sends the link)"
                        className="min-w-[200px] flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs"
                      />
                      {sendMsg[o.id] && (
                        <span className={`text-[11px] ${sendMsg[o.id].includes("✓") ? "text-emerald-700" : "text-slate-500"}`}>
                          {sendMsg[o.id]}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
