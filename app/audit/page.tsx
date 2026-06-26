"use client";

import { useState } from "react";
import Link from "next/link";
import type { AuditResult, BpoExtract, VerdictLevel } from "@/lib/audit";

interface AuditResponse {
  audit: AuditResult;
  bpo: BpoExtract;
  subject: string;
  usingSampleBpo: boolean;
  usingSampleMarket: boolean;
}

const VERDICT_BG: Record<VerdictLevel, string> = {
  ALIGNED: "bg-emerald-600",
  MINOR_GAPS: "bg-amber-500",
  MATERIAL_GAPS: "bg-red-600",
};
const VERDICT_WORD: Record<VerdictLevel, string> = {
  ALIGNED: "ALIGNED",
  MINOR_GAPS: "MINOR GAPS",
  MATERIAL_GAPS: "MATERIAL GAPS",
};
const SEV_TAG: Record<string, string> = {
  MAJOR: "bg-red-100 text-red-700",
  MINOR: "bg-amber-100 text-amber-700",
  OK: "bg-emerald-100 text-emerald-700",
};

function usd(n: number | null): string {
  return n === null ? "—" : "$" + Math.round(n).toLocaleString("en-US");
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result ?? "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

export default function AuditPage() {
  const [address, setAddress] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setRes(null);
    try {
      const pdfBase64 = file ? await fileToBase64(file) : "";
      const r = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, pdfBase64 }),
      });
      const data = (await r.json()) as AuditResponse & { error?: string };
      if (!r.ok || !data.audit) throw new Error(data.error || "Audit failed.");
      setRes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audit failed.");
    } finally {
      setLoading(false);
    }
  }

  const a = res?.audit;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-xs font-semibold uppercase tracking-wide text-pi-accent">← Home</Link>
        <span className="text-xs text-slate-400">BPO / Appraisal audit</span>
      </div>

      <h1 className="text-2xl font-black text-pi-navy">Audit a BPO or Appraisal</h1>
      <p className="mt-1 text-sm text-slate-600">
        Upload a BPO, CMA, or appraisal and the property address. We read all the comps independently and show
        you <strong>what it missed</strong> — overstated value, cherry-picked comps, ignored oversupply, flood risk.
      </p>

      <form onSubmit={run} className="mt-5 flex flex-col gap-3">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Property address (e.g. 123 Main St, Cleveland, OH 44109)"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-pi-accent"
        />
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">BPO / appraisal PDF</label>
          <input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block text-sm" />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="self-start rounded-md bg-pi-navy px-5 py-2 text-sm font-semibold text-white hover:bg-pi-navy-soft disabled:opacity-60"
        >
          {loading ? "Auditing…" : "Run audit"}
        </button>
      </form>

      {error && <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {res && a && (
        <div className="mt-6 flex flex-col gap-4">
          {(res.usingSampleBpo || res.usingSampleMarket) && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              <strong>Demo mode.</strong>{" "}
              {res.usingSampleBpo && "No ANTHROPIC_API_KEY set — showing a sample BPO instead of reading your upload. "}
              {res.usingSampleMarket && "No RENTCAST_API_KEY / address — using the sample market. "}
              Add the keys to audit real documents against live data.
            </div>
          )}

          {/* verdict */}
          <div className="overflow-hidden rounded-lg border border-pi-border bg-white">
            <div className={`flex items-center justify-between px-4 py-3 text-white ${VERDICT_BG[a.verdictLevel]}`}>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">Verdict</p>
                <p className="text-xl font-black">{VERDICT_WORD[a.verdictLevel]}</p>
              </div>
              <p className="ml-4 max-w-[55%] text-right text-[11px] leading-snug opacity-95">{a.verdict}</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-sm font-semibold text-pi-navy">{a.valueLine}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {a.majorCount} major · {a.minorCount} minor finding{a.majorCount + a.minorCount === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          {/* findings */}
          <div className="rounded-lg border border-pi-border bg-white p-4">
            <p className="mb-2 text-sm font-semibold text-pi-navy">What we found</p>
            <ul className="flex flex-col gap-2">
              {a.findings.map((f, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${SEV_TAG[f.severity]}`}>{f.severity}</span>
                  <span className="text-slate-700">
                    <strong className="text-slate-900">{f.category}:</strong> {f.finding}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* what the BPO said */}
          <div className="rounded-lg border border-pi-border bg-white p-4">
            <p className="mb-2 text-sm font-semibold text-pi-navy">What the {res.bpo.reportType || "BPO"} said</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
              <Fact label="Opinion of value" value={usd(res.bpo.opinionOfValue)} />
              <Fact label="As-repaired" value={usd(res.bpo.asRepairedValue)} />
              <Fact label="Suggested list" value={usd(res.bpo.suggestedListPrice)} />
              <Fact label="Comps used" value={String(res.bpo.comps.length)} />
              <Fact label="Effective date" value={res.bpo.effectiveDate || "—"} />
              <Fact label="Market trend" value={res.bpo.marketTrend || "—"} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-slate-50 py-0.5">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}
