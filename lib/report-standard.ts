// The PropIntel Report Standard v1.1, encoded.
// "The constitution for every PropIntel report." Source: PropIntel_Report_Standard_v1.1.

import type {
  RiskGrade,
  ServiceLine,
  ConditionGrade,
  Habitability,
} from "./types";

// Core positioning — appears as a footer on every page.
export const DISCLAIMER =
  "PropIntel is a data and documentation company. This report does not constitute an appraisal or a " +
  "licensed opinion of value. The indicated range is supported by current market comparables; the " +
  "client makes all decisions independently based on their own criteria.";

export const TAGLINE = "Property intelligence — better than a BPO.";

export interface RiskGradeDef {
  grade: RiskGrade;
  descriptor: string;
  meaning: string;
}

// Five buckets: A, B, C, D, F. There is no E — deliberate gap to prevent
// "C+/B-/B" indecision.
export const RISK_GRADES: Record<RiskGrade, RiskGradeDef> = {
  A: {
    grade: "A",
    descriptor: "Low Risk",
    meaning:
      "Asset matches public record, market supports the lending or disposition assumption, " +
      "no material defects, no fraud signals. Proceed.",
  },
  B: {
    grade: "B",
    descriptor: "Moderate-Low Risk",
    meaning:
      "Minor advisory items present. None affect the core decision. Proceed with awareness.",
  },
  C: {
    grade: "C",
    descriptor: "Moderate Risk",
    meaning:
      "One or more material items require attention before proceeding. Solvable. " +
      "Proceed with conditions.",
  },
  D: {
    grade: "D",
    descriptor: "Elevated Risk",
    meaning:
      "Multiple material issues or one severe issue. Decision requires senior review.",
  },
  F: {
    grade: "F",
    descriptor: "Critical Risk — Do Not Proceed",
    meaning:
      "Fraud signals present, value gap unrecoverable, or asset condition fails the use case. " +
      "Decline / escalate.",
  },
};

export const RISK_ORDER: RiskGrade[] = ["A", "B", "C", "D", "F"];

// Section structure — both service lines. Section 7 (Disposition Alternatives)
// is disposition-only; Ownership depth differs by service line.
export interface SectionDef {
  num: number;
  key: string;
  title: string;
  appliesTo: ServiceLine[] | "all";
}

export const SECTIONS: SectionDef[] = [
  { num: 1, key: "verdict", title: "Page-1 Verdict", appliesTo: "all" },
  { num: 2, key: "real-market", title: "Real Market", appliesTo: "all" },
  {
    num: 3,
    key: "tax-vs-reality",
    title: "Tax Record vs. Reality",
    appliesTo: "all",
  },
  { num: 4, key: "ownership", title: "Ownership / Title", appliesTo: "all" },
  {
    num: 5,
    key: "market-intel",
    title: "Market Intelligence",
    appliesTo: "all",
  },
  { num: 6, key: "condition", title: "Condition", appliesTo: "all" },
  {
    num: 7,
    key: "disposition-alternatives",
    title: "Disposition Alternatives",
    appliesTo: ["disposition"],
  },
  {
    num: 8,
    key: "community-truth",
    title: "Community Truth",
    appliesTo: "all",
  },
  {
    num: 9,
    key: "summary",
    title: "Summary & Next Steps",
    appliesTo: "all",
  },
];

export const CONDITION_GRADE_LABELS: Record<ConditionGrade, string> = {
  C1: "C1 — New / like-new",
  C2: "C2 — Well maintained, no deferred maintenance",
  C3: "C3 — Average, minor deferred maintenance",
  C4: "C4 — Noticeable deferred maintenance",
  C5: "C5 — Significant deferred maintenance",
  C6: "C6 — Major rehab needed / not habitable",
};

export const HABITABILITY_LABELS: Record<Habitability, string> = {
  "rentable-as-is": "Yes — rentable as-is",
  "minor-repairs": "Rentable with minor repairs",
  "not-rentable": "No — not rentable as-is",
};

// Tone & language rules (enforced by convention in narrative generation):
// - Plain business English, readable in under 10 minutes.
// - Lead with the verdict.
// - Use specific numbers, never "below market".
// - Never say "seems" or "appears." State what the evidence shows.
// - If unknown, say "Not determinable from available data."
export const UNKNOWN = "Not determinable from available data.";
