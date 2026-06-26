import { TAGLINE } from "@/lib/report-standard";
import { SampleButton } from "@/app/components/sample-button";
import { AddressBar } from "@/app/components/address-bar";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      {/* hero */}
      <div className="bg-pi-navy px-6 py-16 text-white">
        <div className="mx-auto max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">
            Property Intelligence · Better than a BPO
          </p>
          <h1 className="mt-3 text-4xl font-black sm:text-5xl">PropIntel</h1>
          <p className="mt-3 text-lg italic text-blue-100">{TAGLINE}</p>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-blue-50/90">
            A $50 BPO gives you six hand-picked comps and one agent&apos;s opinion. PropIntel reads{" "}
            <strong className="text-white">every comp in the market</strong>, measures whether it
            actually clears, surfaces the title and neighborhood red flags, and hands you a
            defensible value range — so asset managers, portfolio buyers, and lenders decide with
            evidence, not a guess.
          </p>
          <div className="mt-7">
            <p className="mb-2 text-sm font-semibold text-white">
              Start a report — just enter the address. We pull the comps, the market, and the data.
            </p>
            <AddressBar />
            <div className="mt-3">
              <SampleButton className="text-sm font-semibold text-blue-200 underline underline-offset-2 hover:text-white">
                Or view a sample report →
              </SampleButton>
            </div>
          </div>
        </div>
      </div>

      {/* who it's for */}
      <div className="border-b border-pi-border bg-white px-6 py-12">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-lg font-bold text-pi-navy">Who it&apos;s for</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              ["REO asset managers", "Decide sell-as-is vs. repair-and-list vs. auction with real absorption and net-proceeds math — not a single number."],
              ["Bulk & portfolio buyers", "Screen large portfolios fast: which markets actually clear, which assets carry title or condition risk, where the value is real."],
              ["Hard money & DSCR lenders", "Verify collateral before the money moves — condition, value gap, ownership chain, and a 0–5 fraud signal score."],
            ].map(([t, d]) => (
              <div key={t} className="rounded-xl border border-pi-border bg-slate-50 p-4">
                <p className="text-sm font-semibold text-pi-navy">{t}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* the difference */}
      <div className="mx-auto max-w-4xl px-6 py-12">
        <h2 className="text-lg font-bold text-pi-navy">Why it beats a BPO</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            ["All the comps, not six", "We read every active, sold, and pending in the window. Six comps can be cherry-picked to support any number."],
            ["Absorption truth", "16 active and only 2 sold in two months? That's a 24-month supply — we flag it. A BPO calls it a $250k market and moves on."],
            ["Defensible value range", "An evidence-backed as-is range, not a single opinion that nobody is accountable for."],
            ["Red flags surfaced", "Title liens and delinquency, ownership anomalies, fraud signals, stripping, and neighborhoods that aren't selling."],
            ["Neighborhood intelligence", "Vacancy, distressed-sale concentration, crime, schools, flood — the area blind spots a drive-by misses."],
            ["One-page verdict", "Risk grade A–F, value range, absorption, and the flag list on page one. Read it in 60 seconds."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-xl border border-pi-border bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-pi-navy">{t}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{d}</p>
            </div>
          ))}
        </div>

        <p className="mt-8 text-xs leading-relaxed text-slate-400">
          PropIntel is a data and documentation company. Reports do not constitute an appraisal,
          licensed opinion of value, or investment advice. The client makes all decisions
          independently based on their own criteria.
        </p>
      </div>
    </main>
  );
}
