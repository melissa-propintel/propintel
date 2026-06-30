// AI condition assessment from field photos. Claude looks at the agent's photos
// and returns a structured condition read (grade C1–C6, habitability, mechanicals,
// observations). Runs server-side; result is cached as _condition.json per order.

import Anthropic from "@anthropic-ai/sdk";
import type { OrderPhoto } from "./order-photos";

export type ConditionGrade = "C1" | "C2" | "C3" | "C4" | "C5" | "C6";

export interface RepairItem {
  item: string;
  severity: string; // minor | moderate | major
  costLow: number | null;
  costHigh: number | null;
}

export interface ConditionAssessment {
  grade: ConditionGrade | null;
  gradeLabel: string;
  habitability: string;
  occupancy: string;
  hvac: string;
  waterHeater: string;
  electrical: string;
  exterior: string;
  interior: string;
  damage: string;
  summary: string;
  /** Itemized repairs the photos show are needed, with rough cost ranges. */
  repairs: RepairItem[];
  repairTotalLow: number | null;
  repairTotalHigh: number | null;
  photoCount: number;
  assessedAt: string;
}

export const GRADE_LABEL: Record<ConditionGrade, string> = {
  C1: "C1 — New / like-new",
  C2: "C2 — Well maintained, no deferred maintenance",
  C3: "C3 — Average, minor deferred maintenance",
  C4: "C4 — Noticeable deferred maintenance",
  C5: "C5 — Significant deferred maintenance",
  C6: "C6 — Major rehab needed / not habitable",
};

const CONDITION_SCHEMA = {
  type: "object",
  properties: {
    grade: { type: ["string", "null"], enum: ["C1", "C2", "C3", "C4", "C5", "C6", null], description: "Overall condition grade. C1 new, C3 average, C6 major rehab/not habitable. Base only on what the photos show." },
    habitability: { type: "string", description: "Rentable/livable as-is, minor repairs needed, or not habitable as-is." },
    occupancy: { type: "string", description: "Occupied, vacant, or unknown from photos." },
    hvac: { type: "string", description: "HVAC condition if shown (present/age/condition), else 'Not pictured'." },
    waterHeater: { type: "string", description: "Water heater condition if shown, else 'Not pictured'." },
    electrical: { type: "string", description: "Electrical/breaker panel condition if shown, else 'Not pictured'." },
    exterior: { type: "string", description: "Brief exterior condition note (roof, siding, foundation, yard)." },
    interior: { type: "string", description: "Brief interior condition note, or 'No interior photos' if none." },
    damage: { type: "string", description: "Any visible damage, or 'None visible'." },
    summary: { type: "string", description: "2-3 plain-English sentences a lender/seller can act on." },
    repairs: {
      type: "array",
      description:
        "Itemized repairs the photos show are needed (roof, foundation/basement, decks/porches, siding, systems, flooring, kitchen/bath, cosmetic/dated, etc.). Estimate rough cost ranges in dollars like a field adjuster — order-of-magnitude is fine. If the home is in good shape, return an empty array.",
      items: {
        type: "object",
        properties: {
          item: { type: "string", description: "What needs repair, e.g. 'Roof — active leak, likely full replacement'." },
          severity: { type: "string", enum: ["minor", "moderate", "major"], description: "minor / moderate / major." },
          costLow: { type: "number", description: "Low end of the rough repair cost, dollars." },
          costHigh: { type: "number", description: "High end of the rough repair cost, dollars." },
        },
        required: ["item"],
      },
    },
    repairTotalLow: { type: "number", description: "Sum (low end) of all repair costs, dollars." },
    repairTotalHigh: { type: "number", description: "Sum (high end) of all repair costs, dollars." },
  },
  required: ["grade", "habitability", "exterior", "summary"],
} as const;

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function assessCondition(photos: OrderPhoto[]): Promise<ConditionAssessment> {
  const client = new Anthropic();
  // Bound cost + latency: at most 8 photos, prefer required exterior/mechanical shots.
  const ordered = [...photos].sort((a, b) => rank(a.label) - rank(b.label)).slice(0, 8);

  const content: Anthropic.ContentBlockParam[] = [];
  for (const p of ordered) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: p.kind === "png" ? "image/png" : "image/jpeg", data: Buffer.from(p.bytes).toString("base64") },
    });
    content.push({ type: "text", text: `^ ${p.label}${p.comment ? ` — agent note: ${p.comment}` : ""}` });
  }
  content.push({
    type: "text",
    text:
      "You are a property field reviewer. From ONLY these photos, assess the property's condition with the " +
      "record_condition tool. Use the C1–C6 grade scale (C1 new, C3 average minor wear, C5 significant " +
      "deferred maintenance, C6 major rehab / not habitable). If something isn't pictured, say 'Not pictured' " +
      "rather than guessing. Be specific and factual — no 'appears' or 'seems'. ALSO itemize the repairs the photos " +
      "show are needed, each with a rough dollar cost range (estimate like a field adjuster — order-of-magnitude is " +
      "fine), and the report will total them. If the home is in good shape, say so plainly and return an empty " +
      "repairs list. Also note the SURROUNDINGS/street if the photos show them — a neighbor's inoperable/junk " +
      "vehicles, debris, or boarded/distressed adjacent homes, OR a well-kept block — in the exterior/damage " +
      "fields, since they affect marketability.",
  });

  const res = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    tools: [{ name: "record_condition", description: "Record the structured condition assessment.", input_schema: CONDITION_SCHEMA as unknown as Anthropic.Tool.InputSchema }],
    tool_choice: { type: "tool", name: "record_condition" },
    messages: [{ role: "user", content }],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("Condition assessment failed.");
  const d = toolUse.input as Partial<ConditionAssessment> & { grade?: ConditionGrade | null };
  const grade = d.grade && GRADE_LABEL[d.grade as ConditionGrade] ? (d.grade as ConditionGrade) : null;

  const num = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);
  const rawRepairs: unknown[] = Array.isArray(d.repairs) ? (d.repairs as unknown[]) : [];
  const repairs: RepairItem[] = rawRepairs
    .map((r) => (r ?? {}) as Partial<RepairItem>)
    .filter((r) => typeof r.item === "string" && r.item.trim() !== "")
    .map((r) => ({
      item: String(r.item),
      severity: String(r.severity ?? "moderate"),
      costLow: num(r.costLow),
      costHigh: num(r.costHigh) ?? num(r.costLow),
    }));
  const sumLow = repairs.reduce((s, r) => s + (r.costLow ?? 0), 0);
  const sumHigh = repairs.reduce((s, r) => s + (r.costHigh ?? r.costLow ?? 0), 0);

  return {
    grade,
    gradeLabel: grade ? GRADE_LABEL[grade] : "Not determinable from photos",
    habitability: d.habitability ?? "—",
    occupancy: d.occupancy ?? "Unknown",
    hvac: d.hvac ?? "Not pictured",
    waterHeater: d.waterHeater ?? "Not pictured",
    electrical: d.electrical ?? "Not pictured",
    exterior: d.exterior ?? "—",
    interior: d.interior ?? "No interior photos",
    damage: d.damage ?? "None visible",
    summary: d.summary ?? "",
    repairs,
    repairTotalLow: num(d.repairTotalLow) ?? (repairs.length ? sumLow : null),
    repairTotalHigh: num(d.repairTotalHigh) ?? (repairs.length ? sumHigh : null),
    photoCount: ordered.length,
    assessedAt: new Date().toISOString(),
  };
}

// Prefer exterior + mechanicals first when trimming to 12 photos.
function rank(label: string): number {
  const l = label.toLowerCase();
  if (l.includes("front")) return 0;
  if (l.includes("side") || l.includes("rear") || l.includes("roof")) return 1;
  if (l.includes("breaker") || l.includes("electric") || l.includes("hvac") || l.includes("water")) return 2;
  if (l.includes("damage")) return 3;
  if (l.includes("neighbor") || l.includes("street")) return 5;
  return 4;
}
