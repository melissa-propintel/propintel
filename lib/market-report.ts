// Turns MarketIntel (+ optional loan/list price) into the 3-page "middle" report
// model: a page-1 VERDICT with red flags, plus the data for market & property
// pages. Pure + deterministic — usable on server (PDF) and client (display).
//
// Desktop reports run from an address alone, so condition/fraud are marked
// "pending field inspection" until the agent's photos + uploads come in via the
// order. Per the Report Standard: missing data is flagged, never silently omitted.

import type { MarketIntel } from "./market-data";

export type RiskRating = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
export type MarketSupport = "STRONG" | "ADEQUATE" | "WEAK" | "NOT_SUPPORTED" | "NOT_ASSESSED";

export interface ReportFlag {
  severity: "CRITICAL" | "ADVISORY";
  category: string;
  line: string;
}

export interface Fact {
  label: string;
  value: string;
}

export interface MarketReport {
  rating: RiskRating;
  ratingLine: string;
  marketSupport: MarketSupport;
  marketSupportLine: string;
  conditionStatus: string;
  fraudStatus: string;
  flags: ReportFlag[];
  criticalCount: number;
  advisoryCount: number;
  propertyFacts: Fact[];
  neighborhood: Fact[];
  pendingNotes: string[];
}

export interface ReportOptions {
  testValue?: number | null;
  testLabel?: string; // "Requested loan" | "List price"
}

function usd(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : "$" + Math.round(n).toLocaleString("en-US");
}

function supportOf(testValue: number | null, high: number | null): MarketSupport {
  if (testValue === null || high === null || high <= 0) return "NOT_ASSESSED";
  const r = testValue / high;
  if (r <= 0.9) return "STRONG";
  if (r <= 1.0) return "ADEQUATE";
  if (r <= 1.15) return "WEAK";
  return "NOT_SUPPORTED";
}

const RATING_LINE: Record<RiskRating, string> = {
  LOW: "Market evidence supports proceeding. No critical market issues found.",
  MODERATE: "Workable, with advisory items to weigh before proceeding.",
  HIGH: "Material market issues present — senior review warranted before funding/listing.",
  CRITICAL: "Market evidence does not support the assumption. Do not proceed without escalation.",
};

export function buildMarketReport(intel: MarketIntel, opts: ReportOptions = {}): MarketReport {
  const abs = intel.absorption;
  const ring = intel.ring;
  const value = intel.valueRange;
  const testValue = opts.testValue ?? null;
  const testLabel = opts.testLabel ?? "Test value";

  const marketSupport = supportOf(testValue, value.high);
  const gap = testValue !== null && value.high !== null ? testValue - value.high : null;
  const gapPct = gap !== null && value.high ? gap / value.high : null;

  const flags: ReportFlag[] = [];

  // Absorption / oversupply — the signature flag.
  if (abs.level === "SEVERE") {
    flags.push({
      severity: "CRITICAL",
      category: "Absorption",
      line: `${abs.active} active vs. ${abs.sold} sold in ${abs.windowMonths} mo${
        abs.monthsOfSupply !== null ? ` — ${abs.monthsOfSupply} months of supply` : ""
      }. Inventory is not clearing; value is not realizable at retail in a reasonable timeframe.`,
    });
  } else if (abs.level === "OVERSUPPLIED") {
    flags.push({
      severity: "ADVISORY",
      category: "Absorption",
      line: `Oversupplied — ${abs.active} active vs. ${abs.sold} sold (${abs.monthsOfSupply ?? "high"} mo supply). Expect extended marketing time and price pressure.`,
    });
  }

  // Value gap vs. loan/list.
  if (marketSupport === "NOT_SUPPORTED" && gap !== null) {
    flags.push({
      severity: "CRITICAL",
      category: "Value gap",
      line: `${testLabel} ${usd(testValue)} exceeds the comp-supported high of ${usd(value.high)} by ${usd(gap)}${
        gapPct !== null ? ` (${Math.round(gapPct * 100)}%)` : ""
      }. Not supportable by current comps.`,
    });
  } else if (marketSupport === "WEAK" && gap !== null) {
    flags.push({
      severity: "ADVISORY",
      category: "Market support",
      line: `${testLabel} ${usd(testValue)} sits above the comp-supported high of ${usd(value.high)}. Support is weak.`,
    });
  }

  // Thin comp set.
  if (ring.thinMarket) {
    flags.push({
      severity: "ADVISORY",
      category: "Comp set",
      line: `Only ${ring.totalComps} comps within ${ring.radiusReachedMiles} mi — reads are directional. Treat the value range as a guide, not a precise number.`,
    });
  }

  // Wide value dispersion.
  if (value.low && value.high && value.high / value.low > 1.6) {
    flags.push({
      severity: "ADVISORY",
      category: "Value dispersion",
      line: `Wide comp spread (${usd(value.low)}–${usd(value.high)}). Condition and exact location will drive where in the range this lands — field photos matter here.`,
    });
  }

  // Neighborhood signals.
  const nb = intel.neighborhood;
  if (nb?.inSFHA) {
    flags.push({
      severity: "ADVISORY",
      category: "Flood",
      line: `In a FEMA Special Flood Hazard Area (zone ${nb.floodZone}). Flood insurance is required — factor the premium into carrying cost and net value.`,
    });
  }
  if (nb?.vacancyRatePct != null && nb.vacancyRatePct >= 15) {
    flags.push({
      severity: "ADVISORY",
      category: "Neighborhood",
      line: `Census-tract vacancy ${nb.vacancyRatePct}% — elevated. A distressed-area signal that reinforces the absorption read.`,
    });
  }

  const criticalCount = flags.filter((f) => f.severity === "CRITICAL").length;
  const advisoryCount = flags.filter((f) => f.severity === "ADVISORY").length;

  // Overall rating from the market evidence we have.
  let rating: RiskRating;
  if (
    (marketSupport === "NOT_SUPPORTED" && gapPct !== null && gapPct > 0.2) ||
    (abs.level === "SEVERE" && (marketSupport === "WEAK" || marketSupport === "NOT_SUPPORTED"))
  ) {
    rating = "CRITICAL";
  } else if (criticalCount >= 1) {
    rating = "HIGH";
  } else if (advisoryCount >= 1) {
    rating = "MODERATE";
  } else {
    rating = "LOW";
  }

  const marketSupportLine =
    marketSupport === "NOT_ASSESSED"
      ? "Add a loan amount or list price to assess support and value gap."
      : `${testLabel} ${usd(testValue)} vs. comp-supported high ${usd(value.high)} — ${marketSupport.replace("_", " ").toLowerCase()}.`;

  const s = intel.subject;
  const propertyFacts: Fact[] = [
    { label: "Type", value: s.propertyType ?? "—" },
    { label: "Year built", value: s.yearBuilt ? String(s.yearBuilt) : "—" },
    { label: "Beds / baths", value: `${s.beds ?? "—"} / ${s.baths ?? "—"}` },
    { label: "Living area", value: s.sqft ? `${s.sqft.toLocaleString()} sqft` : "—" },
    { label: "Lot size", value: s.lotSize ? `${s.lotSize.toLocaleString()} sqft` : "—" },
    { label: "Last sale", value: s.lastSalePrice ? `${usd(s.lastSalePrice)}${s.lastSaleDate ? " · " + s.lastSaleDate : ""}` : "—" },
    { label: "Tax assessed", value: usd(s.taxAssessedValue) },
  ];

  const neighborhood: Fact[] = [{ label: "County", value: s.county ?? "—" }];
  if (nb) {
    if (nb.floodZone) neighborhood.push({ label: "FEMA flood zone", value: `${nb.floodZone}${nb.inSFHA ? " — high risk" : ""}` });
    if (nb.floodRisk) neighborhood.push({ label: "Flood risk", value: nb.floodRisk });
    if (nb.vacancyRatePct != null) neighborhood.push({ label: "Tract vacancy rate", value: `${nb.vacancyRatePct}%` });
    if (nb.ownerOccupiedPct != null) neighborhood.push({ label: "Owner-occupied", value: `${nb.ownerOccupiedPct}%` });
    if (nb.medianHomeValue != null) neighborhood.push({ label: "Tract median home value", value: usd(nb.medianHomeValue) });
    if (nb.medianHouseholdIncome != null) neighborhood.push({ label: "Tract median income", value: usd(nb.medianHouseholdIncome) });
  }
  neighborhood.push({ label: "Median days on market", value: intel.medianDom !== null ? `${intel.medianDom} DOM` : "—" });
  neighborhood.push({ label: "Active : sold ratio", value: abs.activePerSold !== null ? `${abs.activePerSold} : 1` : "—" });

  const hasNbData = !!(nb && (nb.floodZone || nb.vacancyRatePct != null || nb.medianHomeValue != null));
  const pendingNotes = [
    "Condition grade, habitability & field photos: pending field inspection.",
    hasNbData
      ? `Neighborhood: flood + census data shown${nb && nb.sources.length ? " (" + nb.sources.join(", ") + ")" : ""}. Schools, crime & walk score not yet wired.`
      : "Neighborhood data (flood, vacancy, schools, crime): wiring in progress.",
    testValue === null ? "No loan/list price provided — market support not assessed." : null,
  ].filter((x): x is string => x !== null);

  return {
    rating,
    ratingLine: RATING_LINE[rating],
    marketSupport,
    marketSupportLine,
    conditionStatus: "Pending field inspection",
    fraudStatus: "Pending document review",
    flags,
    criticalCount,
    advisoryCount,
    propertyFacts,
    neighborhood,
    pendingNotes,
  };
}
