import { getViewer, createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requestReport } from "./actions";
import { logout } from "@/app/login/actions";
import { priceFor, usd } from "@/lib/pricing";

interface PortalOrder {
  id: string;
  order_number: string;
  property_address: string;
  product_type: string;
  status: string;
  paid: boolean | null;
  created_at: string;
  delivery_token: string | null;
}

const inputCls =
  "w-full rounded-md border border-pi-border bg-white px-3 py-2 text-sm focus:border-pi-green-deep focus:outline-none";

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/portal");
  const { sent, error } = await searchParams;

  const supabase = await createClient();
  const { data: orderRows } = viewer.email
    ? await supabase
        .from("orders")
        .select("id, order_number, property_address, product_type, status, paid, created_at, delivery_token")
        .eq("customer_email", viewer.email)
        .order("created_at", { ascending: false })
    : { data: [] };
  const orders = (orderRows ?? []) as PortalOrder[];

  return (
    <main className="flex flex-1 flex-col bg-pi-cream px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-medium text-pi-green-dark">Your PropIntel</h1>
            <p className="text-sm text-pi-slate-mid">{viewer.email}</p>
          </div>
          <form action={logout}>
            <button className="text-xs font-medium text-pi-green-deep hover:underline">Sign out</button>
          </form>
        </div>

        {sent && (
          <p className="mb-4 rounded-md bg-pi-green-pale px-3 py-2 text-sm text-pi-green-dark">
            Request received — we&apos;ll be in touch and your finished report will appear here.
          </p>
        )}
        {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {/* Request a report */}
        <section className="rounded-2xl border border-pi-border bg-white p-6">
          <h2 className="text-base font-medium text-pi-green-dark">Request a report</h2>
          <p className="mt-1 text-xs text-pi-slate-mid">
            Tell us the property — we field-verify it and deliver a defensible report. You can also
            order through the platforms you already use.
          </p>
          <form action={requestReport} className="mt-4 space-y-3">
            <input name="address" required placeholder="Property address" className={inputCls} />
            <select name="product" className={inputCls} defaultValue="Desktop report">
              <option>Desktop report</option>
              <option>Field report (photos + condition)</option>
              <option>BPO audit / value check</option>
              <option>Not sure — recommend one</option>
            </select>
            <textarea name="notes" rows={3} placeholder="Anything we should know (loan #, deadline, access, etc.)" className={inputCls} />
            <button
              type="submit"
              className="rounded-lg bg-pi-green-deep px-5 py-2.5 text-sm font-medium text-white hover:bg-pi-navy-soft transition"
            >
              Send request
            </button>
          </form>
        </section>

        {/* Your orders + reports */}
        <section className="mt-5 rounded-2xl border border-pi-border bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium text-pi-green-dark">Your orders &amp; reports</h2>
            <a href="/order" className="text-xs font-semibold text-pi-green-deep hover:underline">+ Order a report</a>
          </div>
          {orders.length === 0 ? (
            <p className="mt-2 text-sm text-pi-slate-mid">
              No orders yet. <a href="/order" className="font-semibold text-pi-green-deep underline">Order your first report.</a>
            </p>
          ) : (
            <div className="mt-3 divide-y divide-pi-border">
              {orders.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-pi-navy">{o.property_address}</p>
                    <p className="text-xs text-pi-slate-mid">
                      {o.order_number} · {o.product_type} · {new Date(o.created_at).toLocaleDateString()} ·{" "}
                      {o.paid ? <span className="font-semibold text-emerald-700">Paid</span> : <span className="font-semibold text-amber-700">Awaiting payment</span>}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {o.delivery_token ? (
                      <a href={`/d/${o.delivery_token}`} className="rounded-md bg-pi-green-deep px-3 py-1.5 text-xs font-semibold text-white hover:bg-pi-navy-soft">
                        Download report
                      </a>
                    ) : o.paid ? (
                      <span className="text-xs font-medium text-amber-700">In progress</span>
                    ) : (
                      <span className="text-xs text-pi-slate-mid">{usd(priceFor(o.product_type).cents)} due</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
