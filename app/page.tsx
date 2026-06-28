import Link from "next/link";
import { SampleButton } from "@/app/components/sample-button";

const primaryBtn =
  "inline-flex items-center justify-center rounded-lg bg-pi-green-deep px-6 py-3 text-sm font-medium text-white hover:bg-pi-navy-soft transition";
const outlineBtn =
  "inline-flex items-center justify-center rounded-lg border-[1.5px] border-pi-green-deep px-6 py-3 text-sm font-medium text-pi-green-deep hover:bg-pi-green-pale transition";

const DECISIONS: [string, string, boolean][] = [
  ["Fund or pass", "Verify value and condition before you lend.", false],
  ["List high or low", "REO and investor values that hold up.", false],
  ["Rent or sell", "The data to pick the path that nets more.", false],
  ["Repair or as-is", "See the real spread, in real numbers.", false],
  ["Settle the BPOs", "Two values, conflicting? We break the tie.", false],
  ["Release the draw", "Walk-throughs verified against scope.", true],
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col bg-pi-cream">
      {/* 1 — HERO */}
      <section className="px-6 py-20 text-center">
        <div className="mx-auto max-w-3xl">
          <span className="inline-block rounded-full bg-pi-green-pale px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-pi-amber-text">
            Property intelligence for lenders · investors · asset managers
          </span>
          <h1 className="mt-6 text-4xl font-medium leading-tight text-pi-green-dark sm:text-5xl">
            Know the property. Make the call.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-pi-slate-mid">
            We turn a property into a confident decision — field-verified condition, market truth,
            ownership history, and a clear value range. Order direct, or through the platforms you
            already use.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login?mode=signup" className={primaryBtn}>
              Order a report
            </Link>
            <SampleButton className={outlineBtn}>Get a sample</SampleButton>
          </div>
          <p className="mt-3 text-xs text-pi-slate-soft">
            See a real report on a real property — delivered to your inbox, no commitment.
          </p>
        </div>
      </section>

      {/* 2 — DECISION GRID */}
      <section className="bg-white px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-medium text-pi-green-dark">
            Whatever the question, the answer is ground truth.
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DECISIONS.map(([t, d, soon]) => (
              <div key={t} className="rounded-xl border border-pi-border bg-pi-cream p-5">
                <div className="flex items-center gap-2">
                  <p className="text-base font-medium text-pi-green-dark">{t}</p>
                  {soon && (
                    <span className="rounded bg-pi-green-pale px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-pi-green-deep">
                      Soon
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-pi-slate-mid">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3 — FRAUD PROOF */}
      <section className="bg-pi-green-dark px-6 py-16 text-white">
        <div className="mx-auto max-w-4xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-pi-amber">
            The fraud a $50 BPO never catches
          </p>
          <h2 className="mt-3 text-2xl font-medium sm:text-3xl">We see it before the money moves.</h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/15 bg-white/5 p-5">
              <p className="text-sm font-semibold text-pi-green-pale">Collateral fraud</p>
              <p className="mt-2 text-sm leading-relaxed text-white/80">
                Tax record shows a complete 14-unit building. The field shows a stripped shell — no
                wiring, no plumbing. The loan funds anyway.
              </p>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/5 p-5">
              <p className="text-sm font-semibold text-pi-green-pale">Short sale fraud</p>
              <p className="mt-2 text-sm leading-relaxed text-white/80">
                A rigged lowball offer, a pre-arranged buyer, a quiet flip days later. The bank eats a
                loss that was manufactured.
              </p>
            </div>
          </div>
          <p className="mt-6 text-sm font-medium text-pi-amber">
            One prevented bad deal pays for years of PropIntel reports.
          </p>
        </div>
      </section>

      {/* 4 — HOW IT WORKS */}
      <section className="bg-white px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-medium text-pi-green-dark">The verdict on page one.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-pi-slate-mid">
            Every report opens with the answer — a clear value range and recommendation. The evidence
            follows. Read page one in 60 seconds.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {[
              ["1", "Place the order", "Direct, or through your platform."],
              ["2", "We go to the field", "Condition, neighbors, comps, ownership."],
              ["3", "You get the call", "A defensible verdict, backed by evidence."],
            ].map(([n, t, d]) => (
              <div key={n}>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-pi-green-pale text-sm font-semibold text-pi-green-deep">
                  {n}
                </div>
                <p className="mt-3 text-base font-medium text-pi-green-dark">{t}</p>
                <p className="mt-1 text-sm leading-relaxed text-pi-slate-mid">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5 — AGENT STRIP */}
      <section className="bg-pi-cream px-6 py-12">
        <div className="mx-auto max-w-4xl rounded-2xl border border-pi-border bg-white p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-pi-amber-text">
              Field agents
            </p>
            <p className="mt-1 text-lg font-medium text-pi-green-dark">Do a better report. Save the hour.</p>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-pi-slate-mid">
              Upload your MLS sheets — we key the data. You bring photos, comments, and a value range.
              Everything finishes in the field. No coming back to the office to type comps for an hour.
            </p>
          </div>
          <a
            href="mailto:melissa@propintelreport.com?subject=Become a PropIntel agent"
            className={`${outlineBtn} mt-4 shrink-0 sm:mt-0`}
          >
            Become an agent
          </a>
        </div>
      </section>

      {/* 6 — CLOSING CTA */}
      <section className="bg-pi-green-dark px-6 py-16 text-center text-white">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-medium sm:text-3xl">Did you get the PropIntel?</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/80">
            Order your first report, or see a finished one on a property we&apos;ve already done.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login?mode=signup" className="inline-flex items-center justify-center rounded-lg bg-pi-green-mid px-6 py-3 text-sm font-medium text-white hover:opacity-90 transition">
              Order a report
            </Link>
            <SampleButton className="inline-flex items-center justify-center rounded-lg border-[1.5px] border-white/60 px-6 py-3 text-sm font-medium text-white hover:bg-white/10 transition">
              Get a sample
            </SampleButton>
          </div>
          <p className="mt-8 text-xs text-white/50">
            propintelreport.com · Property intelligence, field-verified
          </p>
        </div>
      </section>
    </main>
  );
}
