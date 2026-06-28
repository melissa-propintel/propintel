import { getViewer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requestReport } from "./actions";
import { logout } from "@/app/login/actions";

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

        {/* Your reports (delivered work will surface here in the next step) */}
        <section className="mt-5 rounded-2xl border border-pi-border bg-white p-6">
          <h2 className="text-base font-medium text-pi-green-dark">Your reports</h2>
          <p className="mt-2 text-sm text-pi-slate-mid">
            Finished reports will appear here. For now we deliver them by secure link — watch your
            inbox.
          </p>
        </section>
      </div>
    </main>
  );
}
