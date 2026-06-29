"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase-browser";
import { PHOTO_BUCKET } from "@/lib/photo-shots";

// What the agent uploads — exact, bounded work. The agent supplies RAW data; the
// platform picks the comps and does the value math (agents don't pre-filter to a
// number). Radius/status rules are spelled out so there's no guessing.
type DocKey = "comps" | "subject_mls" | "tax_crs" | "community";
const DOCS: { key: DocKey; label: string; hint: string; optional?: boolean }[] = [
  {
    key: "comps",
    label: "Comparables — all in competition",
    hint: "Everything in competition: Active, Pending, Contingent, and Sold in the last 6 months, within the radius for the area — ½ mi urban · 1 mi suburban · 5 mi rural. If there aren't enough in competition at that radius, INCREASE the distance until you have a solid set. The MLS search page covers the market; include your agent/full report so the closest comps have detail. Upload the full set, as pulled.",
  },
  {
    key: "subject_mls",
    label: "Subject MLS sheet + listing history",
    hint: "The subject's MLS sheet and its listing history — required only IF the subject has been listed at all in the last 2 years.",
  },
  { key: "tax_crs", label: "Tax / CRS sheet", hint: "Optional if your MLS sheet already includes tax data.", optional: true },
  { key: "community", label: "Community report", hint: "Optional if your MLS already includes one.", optional: true },
];

type St = "empty" | "uploading" | "saved" | "error";

export function FieldDocs({ folder }: { folder: string }) {
  const [status, setStatus] = useState<Record<string, St>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [price, setPrice] = useState("");
  const [strategy, setStrategy] = useState("");
  const [comments, setComments] = useState("");
  const [saved, setSaved] = useState(false);

  async function onPick(key: DocKey, file?: File) {
    if (!file) return;
    setStatus((s) => ({ ...s, [key]: "uploading" }));
    setNames((n) => ({ ...n, [key]: file.name }));
    const supabase = getSupabase();
    if (!supabase) {
      setStatus((s) => ({ ...s, [key]: "saved" }));
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
    const path = `${folder}/docs/${key}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || "application/pdf" });
    setStatus((s) => ({ ...s, [key]: error ? "error" : "saved" }));
  }

  async function saveNotes() {
    const supabase = getSupabase();
    setSaved(false);
    if (supabase) {
      const meta = JSON.stringify({
        recommendedPrice: price,
        strategy,
        comments,
        updatedAt: new Date().toISOString(),
      });
      await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(`${folder}/docs/_fielddata.json`, new Blob([meta], { type: "application/json" }), {
          upsert: true,
        });
    }
    setSaved(true);
  }

  const inputCls =
    "w-full rounded-md border border-pi-border bg-white px-3 py-2 text-sm focus:border-pi-green-deep focus:outline-none";

  return (
    <section className="mt-8 rounded-xl border border-pi-border bg-white p-5">
      <h2 className="text-base font-semibold text-pi-navy">MLS &amp; field data</h2>
      <p className="mt-1 text-xs text-slate-500">
        Upload the documents below exactly as pulled — the full set, no pre-filtering. Your job is the
        data and a quick read.
      </p>

      <div className="mt-4 space-y-3">
        {DOCS.map((d) => {
          const st = status[d.key] ?? "empty";
          return (
            <div key={d.key} className="rounded-lg border border-pi-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-pi-navy">
                    {d.label}
                    {d.optional && <span className="ml-2 text-[10px] font-normal uppercase tracking-wide text-slate-400">optional</span>}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{d.hint}</p>
                  {names[d.key] && <p className="mt-1 text-xs text-pi-green-deep">{names[d.key]}</p>}
                </div>
                <label className="shrink-0 cursor-pointer rounded-md border border-pi-green-deep px-3 py-1.5 text-xs font-medium text-pi-green-deep hover:bg-pi-green-pale">
                  {st === "saved" ? "Replace" : st === "uploading" ? "Uploading…" : "Upload"}
                  <input
                    type="file"
                    accept=".pdf,.csv,.xlsx,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={(e) => onPick(d.key, e.target.files?.[0])}
                  />
                </label>
              </div>
              {st === "saved" && <p className="mt-1 text-xs text-pi-green-deep">✓ Uploaded</p>}
              {st === "error" && <p className="mt-1 text-xs text-red-600">Upload failed — try again.</p>}
            </div>
          );
        })}
      </div>

      <div className="mt-5 space-y-3 border-t border-pi-border pt-4">
        <p className="text-sm font-medium text-pi-navy">
          Your read <span className="font-normal text-slate-400">(optional — we can complete the report without it)</span>
        </p>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended price</label>
          <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Strategy</label>
          <input value={strategy} onChange={(e) => setStrategy(e.target.value)} placeholder="e.g. price aggressively / hold / list as-is" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Comments</label>
          <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={3} placeholder="Condition, location notes, anything the comps don't show." className={inputCls} />
        </div>
        <button
          onClick={saveNotes}
          className="rounded-lg bg-pi-green-deep px-4 py-2 text-sm font-medium text-white hover:bg-pi-navy-soft transition"
        >
          Save my read
        </button>
        {saved && <span className="ml-3 text-xs text-pi-green-deep">✓ Saved</span>}
      </div>
    </section>
  );
}
