# PropIntel

Lender protection & property intelligence platform. _We stop fraud before the money moves._

This repo is the **report spine** — the first slice of the [Master Plan v2](https://docs.google.com)
build sequence: a property intake that produces a field-documented intelligence report
(page-1 verdict + red-flag list + evidence sections) per the v1.1 Report Standard.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · pdf-lib. Mirrors the REO Hub stack.
Supabase + Anthropic SDK are installed for later phases but **not required to run v1**.

## Run

```bash
npm install
npm run dev
# http://localhost:3000
```

## Flow

1. `/intake` — agent fills the field data (service line, identifiers, tax-vs-field discrepancies,
   ownership + fraud indicators, market data, condition, neighborhood flag grid, community).
2. **Generate Report** runs the deterministic risk engine and routes to `/report`.
3. `/report` — page-1 verdict (risk grade A–F, dashboard, real market, red flags) + the 8–9
   evidence sections. **Download PDF** posts the report to `/api/report/pdf` (pdf-lib).

## What's deterministic vs. what's next

The risk engine (`lib/risk-engine.ts`) is pure logic — fraud signal score (0–5), market support,
liquidity, red-flag generation, and the A–F grade all compute from intake with no AI. That keeps
every verdict defensible and the app runnable offline.

Scoped next (per Master Plan build sequence):

- **Sessions 4–5** — AI doc parser: read uploaded MLS/tax/permit PDFs (`unpdf` + Anthropic) and
  auto-fill intake + write narratives.
- **Session 6** — community report auto-generation from address (crime/schools/flood/vacancy).
- **Session 2** — owner dashboard + Supabase persistence (orders, queue, QC).
- **Session 7** — shareable report links.

## Key files

| File | Role |
| --- | --- |
| `lib/types.ts` | Intake + report types |
| `lib/report-standard.ts` | The v1.1 standard encoded (grades, sections, disclaimer) |
| `lib/risk-engine.ts` | Deterministic scoring + red flags |
| `lib/report-builder.ts` | Assembles the report object |
| `app/intake/page.tsx` | Field intake form |
| `app/report/page.tsx` | Report web view |
| `app/api/report/pdf/route.ts` | PDF deliverable |
