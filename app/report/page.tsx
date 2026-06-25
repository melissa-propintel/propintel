"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { GeneratedReport, RiskGrade } from "@/lib/types";
import { loadReportFromSession } from "@/lib/default-intake";
import { DISCLAIMER, TAGLINE } from "@/lib/report-standard";

const GRADE_BG: Record<RiskGrade, string> = {
  A: "var(--risk-a)",
  B: "var(--risk-b)",
  C: "var(--risk-c)",
  D: "var(--risk-d)",
  F: "var(--risk-f)",
};

export default function ReportPage() {
  const [report, setReport] = useState<GeneratedReport | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setReport(loadReportFromSession() as GeneratedReport | null);
    setLoaded(true);
  }, []);

  async function downloadPdf() {
    if (!report) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/report/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
      });
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.orderNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(String(e));
    } finally {
      setDownloading(false);
    }
  }

  if (!loaded) {
    return <div className="p-8 text-sm text-slate-500">Loading report…</div>;
  }

  if (!report) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <p className="text-slate-600">No report in this session.</p>
        <Link href="/intake" className="mt-3 inline-block text-pi-accent hover:underline">
          Start a new intake →
        </Link>
      </div>
    );
  }

  const gradeColor = GRADE_BG[report.riskGrade];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      {/* toolbar */}
      <div className="no-print mb-6 flex items-center justify-between">
        <Link href="/intake" className="text-xs font-semibold uppercase tracking-wide text-pi-accent">
          ← Edit intake
        </Link>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Print
          </button>
          <button onClick={downloadPdf} disabled={downloading} className="rounded-md bg-pi-navy px-4 py-1.5 text-sm font-semibold text-white hover:bg-pi-navy-soft disabled:opacity-60">
            {downloading ? "Generating…" : "Download PDF"}
          </button>
        </div>
      </div>

      {/* ===== PAGE 1 ===== */}
      <article className="rounded-xl border border-pi-border bg-white shadow-sm">
        {/* header band */}
        <div className="rounded-t-xl bg-pi-navy px-6 py-4 text-white">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold tracking-wide">PROPINTEL</span>
            <span className="text-xs opacity-80">{report.serviceLineLabel}</span>
          </div>
          <p className="mt-0.5 text-[11px] italic opacity-70">{TAGLINE}</p>
        </div>

        <div className="px-6 py-5">
          <p className="text-xs text-slate-500">
            Order {report.orderNumber} · {report.reportDate || "—"} · Agent: {report.fieldAgent || "—"}
            {report.clientName ? ` · Client: ${report.clientName}` : ""}
          </p>
          <h1 className="mt-1 text-xl font-bold text-pi-navy">{report.address}</h1>

          {/* verdict band */}
          <div className="mt-4 flex items-stretch gap-4 rounded-lg border border-slate-200 p-4">
            <div
              className="flex w-24 flex-col items-center justify-center rounded-lg text-white"
              style={{ backgroundColor: gradeColor }}
            >
              <span className="text-4xl font-black leading-none">{report.riskGrade}</span>
              <span className="mt-1 px-1 text-center text-[10px] font-semibold uppercase leading-tight">
                {report.riskDescriptor}
              </span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-pi-navy">{report.verdictHeadline}</p>
              <p className="mt-1 text-xs text-slate-600">{report.verdictRationale}</p>
            </div>
          </div>

          {/* value + absorption hero — the "better than a BPO" headline */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-pi-border bg-gradient-to-br from-slate-50 to-white p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Indicated as-is value range
              </p>
              <p className="mt-1 text-2xl font-black text-pi-navy">{report.valueRangeLabel}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Derived from all comps in the window — not a hand-picked six.
              </p>
            </div>
            <div
              className={`rounded-lg border p-4 ${
                report.absorption.level === "SEVERE" || report.absorption.level === "OVERSUPPLIED"
                  ? "border-red-200 bg-red-50"
                  : "border-pi-border bg-gradient-to-br from-slate-50 to-white"
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Absorption
              </p>
              <p className="mt-1 text-2xl font-black text-pi-navy">{report.absorptionHeadline}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">{report.absorption.line}</p>
            </div>
          </div>

          {/* dashboard */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Condition" value={report.conditionGrade} />
            <Stat label="Habitability" value={report.habitabilityLabel} />
            <Stat label="Market support" value={report.marketSupport.replace("_", " ")} />
            <Stat label="Fraud signal" value={`${report.fraudSignalScore}/5 · ${report.fraudLevel}`} />
            <Stat label="Red flags" value={`${report.criticalCount} crit · ${report.advisoryCount} adv`} />
          </div>

          {/* real market */}
          <div className="mt-4 rounded-lg bg-slate-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Real Market · {report.liquidity}
            </p>
            <p className="mt-1 text-sm text-slate-700">{report.realMarketLine}</p>
          </div>

          {report.missingNotice && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              <strong>Data gaps:</strong> {report.missingNotice}
            </div>
          )}

          {/* red flag list */}
          <div className="mt-5">
            <p className="mb-2 text-sm font-semibold text-pi-navy">
              Red Flags ({report.criticalCount} critical · {report.advisoryCount} advisory)
            </p>
            {report.redFlags.length === 0 ? (
              <p className="text-sm text-slate-500">No red flags identified from submitted data.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {report.redFlags.map((f, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span
                      className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        f.severity === "CRITICAL" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {f.severity}
                    </span>
                    <span className="text-slate-700">
                      <strong className="text-slate-900">{f.category}:</strong> {f.description}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ===== EVIDENCE SECTIONS ===== */}
        <div className="border-t border-slate-200 px-6 py-5">
          {report.sections.map((s) => (
            <div key={s.heading} className="mb-5 last:mb-0">
              <h2 className="mb-1.5 text-sm font-semibold text-pi-navy">{s.heading}</h2>
              <div className="flex flex-col gap-1">
                {s.body.map((line, i) => (
                  <p key={i} className="text-sm leading-relaxed text-slate-700">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* disclaimer footer */}
        <div className="rounded-b-xl border-t border-slate-200 bg-slate-50 px-6 py-3">
          <p className="text-[10px] leading-snug text-slate-400">{DISCLAIMER}</p>
        </div>
      </article>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-2 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-pi-navy">{value}</p>
    </div>
  );
}
