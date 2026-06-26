// Extract structured data from an uploaded BPO / appraisal PDF using Claude.
// The PDF is handed to the model directly (no separate text extraction); a
// forced tool call returns clean structured output.

import Anthropic from "@anthropic-ai/sdk";
import type { BpoExtract } from "./audit";

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const BPO_SCHEMA = {
  type: "object",
  properties: {
    reportType: { type: ["string", "null"], description: "BPO, Appraisal, CMA, or null" },
    effectiveDate: { type: ["string", "null"], description: "Effective/inspection date, ISO YYYY-MM-DD if determinable" },
    subjectAddress: { type: ["string", "null"] },
    opinionOfValue: { type: ["number", "null"], description: "As-is opinion of value / market value (number, no $ or commas)" },
    asRepairedValue: { type: ["number", "null"] },
    suggestedListPrice: { type: ["number", "null"] },
    comps: {
      type: "array",
      description: "Each comparable used",
      items: {
        type: "object",
        properties: {
          address: { type: ["string", "null"] },
          price: { type: ["number", "null"], description: "Sale price if sold, else list price" },
          status: { type: ["string", "null"], description: "sold, active, pending, etc." },
        },
      },
    },
    conditionRating: { type: ["string", "null"] },
    marketTrend: { type: ["string", "null"], description: "increasing, stable, or declining" },
    mentionsFloodZone: { type: "boolean", description: "true only if the report explicitly discusses flood zone/risk" },
    mentionsOversupply: { type: "boolean", description: "true only if it explicitly discusses oversupply / months of supply / absorption" },
    notes: { type: ["string", "null"], description: "anything notable about its methodology" },
  },
  required: ["opinionOfValue", "comps", "mentionsFloodZone", "mentionsOversupply"],
} as const;

export async function extractBpo(pdfBase64: string): Promise<BpoExtract> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const res = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4096,
    tools: [
      {
        name: "record_bpo",
        description: "Record the structured data extracted from this BPO / appraisal / CMA.",
        input_schema: BPO_SCHEMA as unknown as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: "record_bpo" },
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          {
            type: "text",
            text:
              "Extract this valuation's data with the record_bpo tool. opinionOfValue is the as-is value. " +
              "List every comparable with its sale price (if sold) or list price and its status. " +
              "Set mentionsFloodZone / mentionsOversupply true ONLY if the document explicitly discusses them.",
          },
        ],
      },
    ],
  });
  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Could not extract data from the document.");
  }
  return toolUse.input as BpoExtract;
}
