"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getDelivery, type Delivery } from "@/lib/deliveries";
import { makeZip } from "@/lib/zip";

function usd(n: number | null): string {
  return n === null ? "—" : "$" + Math.round(n).toLocaleString("en-US");
}

const LIGHT_DOT: Record<string, string> = {
  GREEN: "bg-emerald-500",
  YELLOW: "bg-amber-400",
  RED: "bg-red-500",
};

export default function DeliveryPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [zipping, setZipping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const d = await getDelivery(token);
        if (!d) setError("This delivery link wasn't found. Check the link or ask your contact to resend it.");
        else setDelivery(d);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load this delivery.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function downloadAll() {
    if (!delivery) return;
    setZipping(true);
    try {
      const files: { name: string; data: Uint8Array }[] = [];
      for (const item of delivery.items) {
        const res = await fetch(item.url);
        if (!res.ok) continue;
        const buf = new Uint8Array(await res.arrayBuffer());
        files.push({ name: item.path.split("/").pop() || "report.pdf", data: buf });
      }
      const blob = makeZip(files);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(delivery.client_name || "PropIntel").replace(/[^\w.-]+/g, "_")}-reports.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="rounded-lg bg-pi-navy px-5 py-4 text-white">
        <p className="text-sm font-black tracking-tight">PROPINTEL</p>
        <p className="text-xs text-blue-200">Property intelligence reports</p>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-slate-500">Loading…</p>
      ) : error ? (
        <div className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : delivery ? (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-black text-pi-navy">
                {delivery.client_name ? `Reports for ${delivery.client_name}` : "Your reports"}
              </h1>
              <p className="text-sm text-slate-500">{delivery.items.length} report{delivery.items.length === 1 ? "" : "s"}</p>
            </div>
            <button
              onClick={downloadAll}
              disabled={zipping}
              className="rounded-md bg-pi-navy px-5 py-2 text-sm font-semibold text-white hover:bg-pi-navy-soft disabled:opacity-60"
            >
              {zipping ? "Preparing ZIP…" : "Download all (ZIP)"}
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {delivery.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-pi-border bg-white p-3">
                <div className="flex items-center gap-2">
                  {item.light && <span className={`h-3 w-3 shrink-0 rounded-full ${LIGHT_DOT[item.light] ?? "bg-slate-300"}`} />}
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{item.address}</p>
                    {(item.valueLow !== null || item.valueHigh !== null) && (
                      <p className="text-xs text-slate-500">Indicated value {usd(item.valueLow)} – {usd(item.valueHigh)}</p>
                    )}
                  </div>
                </div>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-pi-navy hover:bg-slate-50"
                >
                  Download PDF
                </a>
              </div>
            ))}
          </div>

          <p className="mt-6 text-center text-[11px] text-slate-400">
            Delivered by PropIntel · Property intelligence — better than a BPO
          </p>
        </div>
      ) : null}
    </div>
  );
}
