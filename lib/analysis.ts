// The analysis pass: feed the collected data + the engine spec to Claude and get
// back the INTERPRETATION — market read, red flags, the condition->buyer-pool->value
// chain, and a defensible as-is / repaired call. This is what turns a data dump into
// a report that says "hey, look at this."
import Anthropic from "@anthropic-ai/sdk";
import { ANALYSIS_ENGINE_PROMPT } from "./analysis-engine-spec";

export interface ReportAnalysis {
  marketRead: string;
  redFlags: string[];
  conditionToValue: string;
  asIsLow: number | null;
  asIsHigh: number | null;
  repairedLow: number | null;
  repairedHigh: number | null;
  dispositionCall: string;
  excludedComps: string[];
}

const SCHEMA = {
  type: "object",
  properties: {
    marketRead: { type: "string", description: "3-6 sentence synthesis: market type in plain words, where THIS property sits in it, the single most important 'look at this', and the directional call." },
    redFlags: { type: "array", items: { type: "string" }, description: "Each a sharp 'hey, look at this' finding WITH the so-what (recent auction, recent investor/LLC/hedge-fund purchase / flip, tax-vs-field contradiction, no proven solds, condition fails financing, as-is and repaired too close, outdated vs area). Empty only if genuinely none." },
    conditionToValue: { type: "string", description: "The condition -> financing -> buyer pool -> value chain for THIS property, with the numbers." },
    asIsLow: { type: "number", description: "Recommended AS-IS value range low, dollars — reflect the real buyer pool the condition allows (cash/hard-money discount when condition fails financing)." },
    asIsHigh: { type: "number", description: "As-is high, dollars." },
    repairedLow: { type: "number", description: "Repaired / ARV low, dollars." },
    repairedHigh: { type: "number", description: "Repaired / ARV high, dollars." },
    dispositionCall: { type: "string", description: "Directional call + disposition paths (as-is / repair-and-list / quick sale) with the math." },
    excludedComps: { type: "array", items: { type: "string" }, description: "Comps excluded and why (auction, non-arm's-length, pending-not-closed, distressed). Empty if none." },
  },
  required: ["marketRead", "redFlags", "conditionToValue", "dispositionCall"],
} as const;

export function hasAnalysisKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function runAnalysis(payload: Record<string, unknown>): Promise<ReportAnalysis> {
  const client = new Anthropic();
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2200,
    system: ANALYSIS_ENGINE_PROMPT,
    tools: [{ name: "write_analysis", description: "Write the interpreted analysis.", input_schema: SCHEMA as unknown as Anthropic.Tool.InputSchema }],
    tool_choice: { type: "tool", name: "write_analysis" },
    messages: [
      {
        role: "user",
        content:
          "Here is ALL the collected data for one property order (subject with ownership + sale history + tax, comps with status, absorption math, condition with itemized repairs, rent if available, and the field agent's notes). Interpret it per your rules. Use the FIELD truth over tax records where they conflict, and flag the conflict. Treat any pending/active listing as NOT a closed sale. Recommend a defensible as-is and repaired value range that reflects the buyer pool the condition actually allows.\n\n" +
          JSON.stringify(payload, null, 2),
      },
    ],
  });
  const tool = res.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use") throw new Error("Analysis failed.");
  const d = tool.input as Partial<ReportAnalysis>;
  const num = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);
  return {
    marketRead: d.marketRead ?? "",
    redFlags: Array.isArray(d.redFlags) ? d.redFlags.filter((x) => typeof x === "string" && x.trim()) : [],
    conditionToValue: d.conditionToValue ?? "",
    asIsLow: num(d.asIsLow),
    asIsHigh: num(d.asIsHigh),
    repairedLow: num(d.repairedLow),
    repairedHigh: num(d.repairedHigh),
    dispositionCall: d.dispositionCall ?? "",
    excludedComps: Array.isArray(d.excludedComps) ? d.excludedComps.filter((x) => typeof x === "string" && x.trim()) : [],
  };
}
