// The value-engine pass: feed the collected data + the engine spec to Claude and
// get back the RECONCILED verdict — true bed/bath, condition→financing→tier, the
// field-agent override, tiered as-is/repaired ranges, earned flags, and a DERIVED
// risk grade. This is what flips 1031 Alford from "A/$371k/0 flags" to the truth.
import Anthropic from "@anthropic-ai/sdk";
import { ANALYSIS_ENGINE_PROMPT } from "./analysis-engine-spec";

export interface ReportAnalysis {
  verdictLine: string;
  riskGrade: string; // A-F
  riskLabel: string;
  marketRead: string;
  redFlags: string[];
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
  excludedComps: string[];
}

const SCHEMA = {
  type: "object",
  properties: {
    verdictLine: { type: "string", description: "One line: '{GRADE} — {label}. As-is {low}-{high} ({buyer pool}). Repaired {low}-{high}.'" },
    riskGrade: { type: "string", enum: ["A", "B", "C", "D", "F"], description: "Derived from reconciled value + flags (Rule 6), NOT absorption. Critical flag or not-financeable or >15% value gap => no better than C." },
    riskLabel: { type: "string", description: "e.g. Low / Moderate / Elevated / High." },
    marketRead: { type: "string", description: "3-6 sentences: market type + proof stat; place THIS reconciled subject in it; the single loudest finding; the directional call + financing reality + tier; where the field override sits. Every sentence does the math and says what it means." },
    redFlags: { type: "array", items: { type: "string" }, description: "Only EARNED flags, each '[CRITICAL|ADVISORY] category — one sentence'. Empty only after the scan genuinely found none." },
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
    dispositionCall: { type: "string", description: "Directional call + paths (as-is / repair-and-list / quick sale) with the math." },
    excludedComps: { type: "array", items: { type: "string" }, description: "Comps excluded as anchors + why (auction, non-arm's-length, condition-mismatch, outlier). Empty if none." },
  },
  required: ["verdictLine", "riskGrade", "riskLabel", "marketRead", "redFlags", "conditionToValue", "buyerPool", "subjectTier", "dispositionCall"],
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
  return {
    verdictLine: d.verdictLine ?? "",
    riskGrade: d.riskGrade ?? "",
    riskLabel: d.riskLabel ?? "",
    marketRead: d.marketRead ?? "",
    redFlags: strs(d.redFlags),
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
    excludedComps: strs(d.excludedComps),
  };
}
