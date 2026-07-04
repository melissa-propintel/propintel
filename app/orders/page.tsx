"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  listOrders,
  createOrder,
  updateOrder,
  generateOrderNumber,
  ordersConfigured,
  isFieldProduct,
  photoLevel,
  STATUS_FLOW,
  type Order,
  type OrderStatus,
  type ProductType,
} from "@/lib/orders";
import { listAgents, rankByCoverage, stateFromAddress, type Agent } from "@/lib/agents";

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
  const [condMsg, setCondMsg] = useState<Record<string, string>>({});
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [invEmail, setInvEmail] = useState("");
  const [invMsg, setInvMsg] = useState<string | null>(null);

  function toggleSel(num: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(num)) n.delete(num);
      else n.add(num);
      return n;
    });
  }

  async function bulkInvoice() {
    const nums = [...selected];
    if (nums.length === 0) return setInvMsg("Select orders first.");
    if (!invEmail.trim()) return setInvMsg("Enter the client email.");
    setInvMsg("Sending invoice…");
    const res = await fetch("/api/invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNumbers: nums, customerEmail: invEmail.trim() }),
    });
    const data = await res.json();
    if (data.url) {
      window.open(data.url, "_blank");
      setInvMsg(`Invoice sent — ${data.count} report${data.count === 1 ? "" : "s"}, ${data.total}. Marks paid when they pay.`);
      setSelected(new Set());
      return;
    }
    setInvMsg(data.error || "Couldn't create the invoice.");
  }

  async function refresh() {
    if (!configured) {
      setLoading(false);
      return;
    }
    try {
      const [o, a] = await Promise.all([listOrders(), listAgents().catch(() => [])]);
      setOrders(o);
      setAgents(a);
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
    return `${origin}/capture?order=${encodeURIComponent(o.order_number)}&level=${photoLevel(o.product_type)}`;
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

  const EMAIL_RE = /[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/;

  // When an agent email is set on a field order, auto-email them the link.
  async function assessCondition(o: Order) {
    setCondMsg((m) => ({ ...m, [o.id]: "Reviewing photos…" }));
    try {
      const res = await fetch("/api/condition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber: o.order_number }),
      });
      const data = (await res.json()) as { condition?: { grade: string | null; gradeLabel: string }; error?: string };
      if (data.condition) setCondMsg((m) => ({ ...m, [o.id]: `Condition: ${data.condition!.grade ?? "—"} — ${data.condition!.gradeLabel}` }));
      else setCondMsg((m) => ({ ...m, [o.id]: data.error || "Assessment failed" }));
    } catch (e) {
      setCondMsg((m) => ({ ...m, [o.id]: e instanceof Error ? e.message : "Assessment failed" }));
    }
  }

  async function maybeEmailAgent(o: Order, value: string) {
    const email = value.match(EMAIL_RE)?.[0];
    if (!email || !isFieldProduct(o.product_type)) return;
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
          level: photoLevel(o.product_type),
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
              <option value="field_lite">Field — Lite (drive-by: front + neighbors, 4 shots)</option>
              <option value="field_full">Field — Full inspection (sides, roof, mechanicals, interior)</option>
            </select>
            <input value={loan} onChange={(e) => setLoan(e.target.value)} placeholder="Loan / list price (optional)" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <button type="submit" disabled={creating} className="mt-3 rounded-md bg-pi-navy px-5 py-2 text-sm font-semibold text-white hover:bg-pi-navy-soft disabled:opacity-60">
            {creating ? "Creating…" : "Create order"}
          </button>
        </form>
      )}

      {error && <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* who ordered what — counter by client */}
      {configured && orders.length > 0 && (
        <div className="mt-5 rounded-lg border border-pi-border bg-white p-4">
          <h2 className="text-sm font-semibold text-pi-navy">Reports by client</h2>
          <div className="mt-2 flex flex-col gap-1">
            {Object.entries(
              orders.reduce(
                (acc, o) => {
                  const k = o.client_name?.trim() || "—";
                  if (!acc[k]) acc[k] = { total: 0, delivered: 0 };
                  acc[k].total++;
                  if (o.status === "delivered") acc[k].delivered++;
                  return acc;
                },
                {} as Record<string, { total: number; delivered: number }>,
              ),
            )
              .sort((a, b) => b[1].total - a[1].total)
              .map(([client, c]) => (
                <div key={client} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">{client}</span>
                  <span className="text-slate-500">
                    {c.total} report{c.total === 1 ? "" : "s"}
                    {c.delivered ? ` · ${c.delivered} delivered` : ""}
                  </span>
                </div>
              ))}
          </div>
          <p className="mt-2 border-t border-pi-border pt-2 text-xs text-slate-400">
            {orders.length} total orders · {new Set(orders.map((o) => o.client_name?.trim() || "—")).size} clients
          </p>
        </div>
      )}

      {/* list */}
      {configured && (
        <div className="mt-5">
          {loading ? (
            <p className="text-sm text-slate-500">Loading orders…</p>
          ) : orders.length === 0 ? (
            <p className="text-sm text-slate-500">No orders yet. Create one above.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {selected.size > 0 && (
                <div className="mb-1 flex flex-wrap items-center gap-2 rounded-lg border border-pi-green-deep bg-pi-green-pale p-3">
                  <span className="text-sm font-semibold text-pi-green-dark">{selected.size} selected</span>
                  <input value={invEmail} onChange={(e) => setInvEmail(e.target.value)} placeholder="Client email for the invoice" className="min-w-[200px] flex-1 rounded border border-pi-border px-2 py-1.5 text-sm" />
                  <button onClick={bulkInvoice} className="rounded-lg bg-pi-green-deep px-4 py-1.5 text-sm font-semibold text-white hover:bg-pi-navy-soft">Send invoice (net-30)</button>
                  <button onClick={() => setSelected(new Set())} className="text-xs text-pi-slate-mid hover:underline">clear</button>
                  {invMsg && <span className="w-full text-xs text-pi-slate-mid">{invMsg}</span>}
                </div>
              )}
              {orders.map((o) => (
                <div key={o.id} className="rounded-lg border border-pi-border bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={selected.has(o.order_number)} onChange={() => toggleSel(o.order_number)} title="Select for invoicing" />
                        <Link href={`/orders/${encodeURIComponent(o.order_number)}`} className="text-sm font-bold text-pi-navy hover:underline">{o.order_number}</Link>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${STATUS_COLOR[o.status]}`}>{o.status.replace("_", " ")}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{o.product_type}</span>
                        {o.paid && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">PAID</span>}
                      </div>
                      <Link href={`/orders/${encodeURIComponent(o.order_number)}`} className="mt-0.5 block text-sm text-slate-700 hover:underline">{o.property_address}</Link>
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
                        {isFieldProduct(o.product_type) && (
                          <button onClick={() => copyAgentLink(o)} className="text-pi-accent hover:underline">
                            {copied === o.id ? "Link copied!" : "Copy agent link"}
                          </button>
                        )}
                        <a href={reportLink(o)} className="font-semibold text-pi-accent hover:underline">Open report →</a>
                      </div>
                    </div>
                  </div>
                  {isFieldProduct(o.product_type) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] uppercase tracking-wide text-slate-400">Agent</span>
                      {agents.length > 0 ? (
                        <select
                          value=""
                          onChange={(e) => {
                            const a = agents.find((x) => x.id === e.target.value);
                            if (!a) return;
                            const v = a.email ? `${a.name} <${a.email}>` : a.name;
                            patch(o, { assigned_agent: v, status: o.status === "new" ? "assigned" : o.status });
                            void maybeEmailAgent({ ...o, assigned_agent: v }, v);
                          }}
                          className="min-w-[200px] flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs"
                        >
                          <option value="">
                            {o.assigned_agent ? `Assigned: ${o.assigned_agent}` : `Choose agent${
                              stateFromAddress(o.property_address) ? ` (${stateFromAddress(o.property_address)} first)` : ""
                            }…`}
                          </option>
                          {rankByCoverage(
                            agents.filter((a) => a.active),
                            stateFromAddress(o.property_address),
                          ).map((a) => {
                            const st = stateFromAddress(o.property_address);
                            const covers = st && (a.coverage_states ?? "").toUpperCase().includes(st);
                            return (
                              <option key={a.id} value={a.id}>
                                {a.name}
                                {a.coverage_states ? ` — ${a.coverage_states}` : ""}
                                {covers ? " ✓" : ""}
                              </option>
                            );
                          })}
                        </select>
                      ) : (
                        <input
                          defaultValue={o.assigned_agent ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            patch(o, { assigned_agent: v || null, status: o.status === "new" && v ? "assigned" : o.status });
                            if (v) void maybeEmailAgent({ ...o, assigned_agent: v }, v);
                          }}
                          placeholder="agent name + email (add agents on the Agents page)"
                          className="min-w-[200px] flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs"
                        />
                      )}
                      {sendMsg[o.id] && (
                        <span className={`text-[11px] ${sendMsg[o.id].includes("✓") ? "text-emerald-700" : "text-slate-500"}`}>
                          {sendMsg[o.id]}
                        </span>
                      )}
                      <button onClick={() => assessCondition(o)} className="text-[11px] text-pi-accent hover:underline">
                        Assess condition from photos
                      </button>
                      {condMsg[o.id] && (
                        <span className={`text-[11px] ${condMsg[o.id].startsWith("Condition:") ? "text-emerald-700" : "text-slate-500"}`}>
                          {condMsg[o.id]}
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
