"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createOrder, generateOrderNumber, type ProductType } from "@/lib/orders";
import { createClient } from "@/lib/supabase/client";
import { priceFor, usd } from "@/lib/pricing";

const PRODUCTS: { key: ProductType; name: string; blurb: string }[] = [
  { key: "desktop", name: "Desktop Report", blurb: "You upload MLS / comps / tax docs. Auto-generated in minutes." },
  { key: "field_lite", name: "Field Report — Lite", blurb: "An agent does an exterior / drive-by inspection." },
  { key: "field_full", name: "Field Report — Full", blurb: "An agent does a full interior + exterior inspection." },
];

export default function OrderPage() {
  const [address, setAddress] = useState("");
  const [product, setProduct] = useState<ProductType>("desktop");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const s = createClient();
    s.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login?next=/order");
        return;
      }
      setEmail(data.user.email ?? null);
    });
  }, [router]);

  async function submit() {
    if (!address.trim()) {
      setErr("Enter the property address.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const orderNumber = generateOrderNumber();
      await createOrder({
        order_number: orderNumber,
        client_name: null,
        property_address: address.trim(),
        product_type: product,
        loan_amount: null,
        notes: notes.trim() || null,
        customer_email: email,
      });
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url; // Stripe Checkout
        return;
      }
      if (res.status === 503) {
        // Payments not wired yet (pre-Stripe) — go to the order to continue.
        window.location.href = `/orders/${orderNumber}?nopay=1`;
        return;
      }
      setErr(data.error || "Couldn't start checkout.");
      setBusy(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const price = priceFor(product);
  const inputCls = "w-full rounded-lg border border-pi-border px-3 py-2.5 text-sm";

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-medium text-pi-green-dark">Order a Property Intelligence Report</h1>
      <p className="mt-2 text-sm text-pi-slate-mid">Enter the property, choose your report, and check out. Desktop reports come back in minutes; field reports are scheduled with an agent.</p>

      <div className="mt-6">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Property address</label>
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, City, ST 00000" className={inputCls} />
      </div>

      <div className="mt-6 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Report type</p>
        {PRODUCTS.map((p) => {
          const pr = priceFor(p.key);
          const active = product === p.key;
          return (
            <button
              key={p.key}
              onClick={() => setProduct(p.key)}
              className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${active ? "border-pi-green-deep bg-pi-green-pale" : "border-pi-border hover:border-pi-green-deep"}`}
            >
              <span>
                <span className="block text-sm font-semibold text-pi-navy">{p.name}</span>
                <span className="block text-xs text-pi-slate-mid">{p.blurb}</span>
              </span>
              <span className="ml-4 shrink-0 text-lg font-bold text-pi-green-deep">{usd(pr.cents)}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Notes (optional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anything we should know about this property." className={inputCls} />
      </div>

      {err && <p className="mt-4 text-sm text-red-600">{err}</p>}

      <button
        onClick={submit}
        disabled={busy}
        className="mt-6 w-full rounded-xl bg-pi-green-deep px-5 py-3 text-sm font-semibold text-white hover:bg-pi-navy-soft transition disabled:opacity-60"
      >
        {busy ? "Starting checkout…" : `Continue to payment — ${usd(price.cents)}`}
      </button>
      <p className="mt-2 text-center text-xs text-pi-slate-mid">Secure checkout via Stripe. You'll upload your documents after payment.</p>
    </main>
  );
}
