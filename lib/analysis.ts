// The value-engine pass: feed the collected data + the engine spec to Claude and
// get back the RECONCILED verdict — true bed/bath, condition→financing→tier, the
// field-agent override, tiered as-is/repaired ranges, earned flags, and a DERIVED
// risk grade. This is what flips 1031 Alford from "A/$371k/0 flags" to the truth.
import Anthropic from "@anthropic-ai/sdk";
import { ANALYSIS_ENGINE_PROMPT } from "./analysis-engine-spec";

export interface RedFlag {
  severity: string; // CRITICAL | ADVISORY
  category: string;
  finding: string;
}

export interface ReportHeader {
  parcelId: string;
  legal: string; // subdivision / lot
  ownerOfRecord: string; // name + location if shown
  auctionDate: string; // foreclosure auction / sale date
  filingDate: string; // foreclosure filing date
}

export interface TaxRecord {
  yearBuilt: string;
  bedsBaths: string; // as the tax record shows
  sqft: string; // breakdown (main + basement) if shown
  lotSize: string;
  construction: string; // exterior wall / roof / interior, brief
  hvac: string;
  utilities: string;
  zoning: string;
  floodZone: string;
  taxAppraisal: string;
  assessment: string;
  annualTaxes: string;
  paymentHistory: string;
}

export interface ReportAnalysis {
  verdictLine: string;
  riskGrade: string; // A-F
  riskLabel: string;
  bottomLine: string;
  marketRead: string;
  redFlags: RedFlag[];
  conditionToValue: string;
  trueBeds: number | null;
  trueBaths: number | null;
  financeable: boolean | null;
  buyerPool: string;
  subjectTier: string; // distressed | retail
  fieldOverridePrice: string;
  asIsLow: number | null;
  asIsHigh: number | null;
  repairedLow: number | null;
  repairedHigh: number | null;
  spread: number | null;
  dispositionCall: string;
  competition: string;
  biggestObstacle: string;
  biggestRisk: string;
  areaDifference: string;
  header: ReportHeader;
  taxRecord: TaxRecord;
  taxVsReality: string;
  excludedComps: string[];
}

const SCHEMA = {
  type: "object",
  properties: {
    verdictLine: { type: "string", description: "One line: '{GRADE} — {label}. As-is {low}-{high} ({buyer pool}). Repaired {low}-{high}.'" },
    riskGrade: { type: "string", enum: ["A", "B", "C", "D", "F"], description: "Derived from reconciled value + flags (Rule 6), NOT absorption. Critical flag or not-financeable or >15% value gap => no better than C." },
    riskLabel: { type: "string", description: "e.g. Low / Moderate / Elevated / High." },
    bottomLine: { type: "string", description: "BOTTOM LINE FOR THE CLIENT — a single plain-English paragraph (3-5 sentences) a lender/asset-manager reads first: what this asset IS, the one thing that matters most, the financing/buyer reality, and the disposition path with the number. Decisive, specific, no hedging. Like 'This is an occupied post-foreclosure 2/1 that won't pass financing as-is; the real buyer is a cash investor at ~$235k, and the $375k retail only exists after a full rehab. Resolve the redemption right and dispose to the investor lane.'" },
    marketRead: { type: "string", description: "3-6 sentences: market type + proof stat; place THIS reconciled subject in it; the single loudest finding; the directional call + financing reality + tier; where the field override sits. Every sentence does the math and says what it means." },
    redFlags: {
      type: "array",
      description: "Only EARNED flags. Empty only after the scan genuinely found none.",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["CRITICAL", "ADVISORY"], description: "CRITICAL or ADVISORY." },
          category: { type: "string", description: "Short category, e.g. 'Foreclosure / redemption', 'Condition / financing', 'Bed/bath', 'Value gap'." },
          finding: { type: "string", description: "One specific sentence with the so-what." },
        },
        required: ["severity", "category", "finding"],
      },
    },
    conditionToValue: { type: "string", description: "The condition → financing → buyer pool → tier chain for THIS property, with numbers." },
    trueBeds: { type: "number", description: "Reconciled bed count (field/room-list wins over tax header)." },
    trueBaths: { type: "number", description: "Reconciled bath count." },
    financeable: { type: "boolean", description: "FHA/conventional financeable as-is? False if any disqualifying condition." },
    buyerPool: { type: "string", description: "e.g. 'cash / hard-money investor' or 'full (FHA/conv/cash)'." },
    subjectTier: { type: "string", enum: ["distressed", "retail"], description: "Which tier the subject belongs in." },
    fieldOverridePrice: { type: "string", description: "The field agent's recommended as-is price if provided, else empty." },
    asIsLow: { type: "number", description: "As-is range low (the subject's tier; centered on the field override if present)." },
    asIsHigh: { type: "number" },
    repairedLow: { type: "number", description: "Repaired / retail range low." },
    repairedHigh: { type: "number" },
    spread: { type: "number", description: "Repaired center − as-is center, dollars (the rehab opportunity/risk)." },
    dispositionCall: { type: "string", description: "The value paths as FACTUAL ECONOMICS with numbers — NO directives, no 'list at'/'do not list'. As-is cash-investor range; repair-and-list (repaired ceiling, rehab budget, net-to-retail math); wholesale floor. Present each path's economics; the client decides." },
    competition: { type: "string", description: "Whether competing inventory makes the subject HARD TO SELL — the COUNT of comparable competing listings and especially how many are REO/distressed/as-is (a glut of distressed/REO competition pressures price + slows the sale; thin competition helps). Counts + character, e.g. '13 active competitors, 4 REO/as-is — heavy distressed field' or 'only 2 competing as-is listings'." },
    biggestObstacle: { type: "string", description: "The single biggest obstacle, as a FACT (e.g. the active redemption right / title path)." },
    biggestRisk: { type: "string", description: "The single biggest risk, as a FACT (e.g. unknown basement scope drives the rehab budget)." },
    areaDifference: { type: "string", description: "What makes THIS home / area different, factually — the submarket's character, demand, price tier, absorption (why buyers pay here). Not people." },
    header: {
      type: "object",
      description: "Public-record header facts pulled from the CRS / tax / MLS docs. Use '—' for anything not shown.",
      properties: {
        parcelId: { type: "string", description: "Parcel / tax ID." },
        legal: { type: "string", description: "Subdivision + lot (legal description)." },
        ownerOfRecord: { type: "string", description: "Owner of record + location if shown (e.g. 'Wilmington Savings Fund Society FSB Tr')." },
        auctionDate: { type: "string", description: "Foreclosure auction / sale date." },
        filingDate: { type: "string", description: "Foreclosure filing date, if shown." },
      },
      required: ["parcelId", "legal", "ownerOfRecord", "auctionDate", "filingDate"],
    },
    taxRecord: {
      type: "object",
      description: "The tax / CRS record summary, extracted from the docs. Use '—' for anything not in the docs; do NOT invent.",
      properties: {
        yearBuilt: { type: "string" },
        bedsBaths: { type: "string", description: "Beds/baths AS THE TAX RECORD shows (may differ from field-verified)." },
        sqft: { type: "string", description: "Square footage with breakdown (main + basement) if shown." },
        lotSize: { type: "string" },
        construction: { type: "string", description: "Exterior wall / roof / interior, brief." },
        hvac: { type: "string" },
        utilities: { type: "string" },
        zoning: { type: "string" },
        floodZone: { type: "string" },
        taxAppraisal: { type: "string" },
        assessment: { type: "string" },
        annualTaxes: { type: "string" },
        paymentHistory: { type: "string", description: "Tax payment history / delinquency, if shown." },
      },
      required: ["yearBuilt", "bedsBaths", "sqft", "lotSize", "taxAppraisal"],
    },
    taxVsReality: { type: "string", description: "The comparison narrative: where the tax/public record MATCHES vs. CONTRADICTS what the field agent + MLS found (beds/baths, sqft, condition), and what that means for value. Cite the specific conflicts (e.g. tax says 3/2, field confirms 2/1; tax finished-basement sqft unverified)." },
    excludedComps: { type: "array", items: { type: "string" }, description: "Comps excluded as anchors + why (auction, non-arm's-length, condition-mismatch, outlier). Empty if none." },
  },
  required: ["verdictLine", "riskGrade", "riskLabel", "bottomLine", "marketRead", "redFlags", "conditionToValue", "trueBeds", "trueBaths", "buyerPool", "subjectTier", "asIsLow", "asIsHigh", "repairedLow", "repairedHigh", "spread", "dispositionCall", "competition", "biggestObstacle", "biggestRisk", "areaDifference", "header", "taxRecord", "taxVsReality"],
} as const;

export function hasAnalysisKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function runAnalysis(payload: Record<string, unknown>): Promise<ReportAnalysis> {
  const client = new Anthropic();
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2600,
    system: ANALYSIS_ENGINE_PROMPT,
    tools: [{ name: "write_verdict", description: "Write the reconciled verdict.", input_schema: SCHEMA as unknown as Anthropic.Tool.InputSchema }],
    tool_choice: { type: "tool", name: "write_verdict" },
    messages: [
      {
        role: "user",
        content:
          "Here is ALL the collected data for one property order. RECONCILE it per your rules before printing any value or grade. The FIELD AGENT'S recommended price (if present) OVERRIDES the comp math for the headline. Use FIELD/room-list truth over tax records and flag conflicts. Treat pending/active as NOT closed sales. Split comps into distressed vs retail and headline the subject's tier — never a blend. Scan for distress (foreclosure, REO/entity owner, recent investor purchase, As-Is, redemption, stale-high assessment) — '0 flags' must be earned. Derive the grade from value + flags, not absorption.\n\n" +
          JSON.stringify(payload, null, 2),
      },
    ],
  });
  const tool = res.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use") throw new Error("Analysis failed.");
  const d = tool.input as Partial<ReportAnalysis>;
  const num = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);
  const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : []);
  const s1 = (v: unknown): string => (typeof v === "string" && v.trim() ? v.trim() : "—");
  const hd = (d.header ?? {}) as Partial<ReportHeader>;
  const tx = (d.taxRecord ?? {}) as Partial<TaxRecord>;
  const flags: RedFlag[] = Array.isArray(d.redFlags)
    ? (d.redFlags as unknown[])
        .map((f) => (f ?? {}) as Partial<RedFlag>)
        .filter((f) => typeof f.finding === "string" && f.finding.trim())
        .map((f) => ({
          severity: /crit/i.test(String(f.severity)) ? "CRITICAL" : "ADVISORY",
          category: String(f.category ?? "").trim() || "Finding",
          finding: String(f.finding).trim(),
        }))
    : [];
  return {
    verdictLine: d.verdictLine ?? "",
    riskGrade: d.riskGrade ?? "",
    riskLabel: d.riskLabel ?? "",
    bottomLine: d.bottomLine ?? "",
    marketRead: d.marketRead ?? "",
    redFlags: flags,
    conditionToValue: d.conditionToValue ?? "",
    trueBeds: num(d.trueBeds),
    trueBaths: num(d.trueBaths),
    financeable: typeof d.financeable === "boolean" ? d.financeable : null,
    buyerPool: d.buyerPool ?? "",
    subjectTier: d.subjectTier ?? "",
    fieldOverridePrice: d.fieldOverridePrice ?? "",
    asIsLow: num(d.asIsLow),
    asIsHigh: num(d.asIsHigh),
    repairedLow: num(d.repairedLow),
    repairedHigh: num(d.repairedHigh),
    spread: num(d.spread),
    dispositionCall: d.dispositionCall ?? "",
    competition: d.competition ?? "",
    biggestObstacle: d.biggestObstacle ?? "",
    biggestRisk: d.biggestRisk ?? "",
    areaDifference: d.areaDifference ?? "",
    header: {
      parcelId: s1(hd.parcelId), legal: s1(hd.legal), ownerOfRecord: s1(hd.ownerOfRecord),
      auctionDate: s1(hd.auctionDate), filingDate: s1(hd.filingDate),
    },
    taxRecord: {
      yearBuilt: s1(tx.yearBuilt), bedsBaths: s1(tx.bedsBaths), sqft: s1(tx.sqft), lotSize: s1(tx.lotSize),
      construction: s1(tx.construction), hvac: s1(tx.hvac), utilities: s1(tx.utilities), zoning: s1(tx.zoning),
      floodZone: s1(tx.floodZone), taxAppraisal: s1(tx.taxAppraisal), assessment: s1(tx.assessment),
      annualTaxes: s1(tx.annualTaxes), paymentHistory: s1(tx.paymentHistory),
    },
    taxVsReality: d.taxVsReality ?? "",
    excludedComps: strs(d.excludedComps),
  };
}
