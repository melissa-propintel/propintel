// Turns MarketIntel (+ optional loan/list price) into the 3-page "middle" report
// model: a page-1 VERDICT with red flags, plus the data for market & property
// pages. Pure + deterministic — usable on server (PDF) and client (display).
//
// Desktop reports run from an address alone, so condition/fraud are marked
// "pending field inspection" until the agent's photos + uploads come in via the
// order. Per the Report Standard: missing data is flagged, never silently omitted.

import type { MarketIntel } from "./market-data";

const UNKNOWN = "Not determinable from available data.";

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
  gradeLetter: "A" | "B" | "C" | "D" | "F"; // v1.1 letter grade
  gradeDescriptor: string;
  confidenceLevel: "HIGH" | "MODERATE" | "LOW";
  confidenceLine: string;
  mlsRequired: boolean;
  confidenceReasons: string[];
  marketSupport: MarketSupport;
  marketSupportLine: string;
  hasTestValue: boolean; // true only when a loan/list price was provided
  saleability: string; // "Strong" | "Healthy" | "Moderate" | "Slow" | "Very slow"
  saleabilityLine: string;
  suggestedListPrice: number | null; // price to list at to sell in a normal window
  // §2 Real Market
  marketStrength: "Thin" | "Moderate" | "Liquid";
  realMarketLine: string; // the one-line characterization (v1.1 page-1 callout)
  buyerPool: string;
  halfMileStory: string;
  // §KEY NUMBERS
  keyNumbers: Fact[];
  // §3 Tax Record vs Reality
  taxVsReality: string[];
  // value methodology
  valueMethodology: string;
  // §8 Community Truth
  communityCharacter: string;
  communityEconomics: Fact[];
  communityImplications: string;
  // §9 Summary
  summary: string[];
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
  LOW: "Strong value support. Comps and absorption back the indicated range.",
  MODERATE: "Solid value with items to weigh — note the advisory flags below.",
  HIGH: "Value is supportable but carries material market risk — see flags.",
  CRITICAL: "Value is at material risk — the market does not support a confident number.",
};

// Saleability + a recommended list price, derived from absorption + value range.
function saleabilityOf(level: string): { label: string; line: string } {
  switch (level) {
    case "TIGHT":
      return { label: "Strong", line: "Seller's market — homes clear quickly at the supported price." };
    case "BALANCED":
      return { label: "Healthy", line: "Balanced market — reasonable absorption at the supported price." };
    case "SOFT":
      return { label: "Moderate", line: "Softening market — price toward the middle and expect a longer window." };
    case "OVERSUPPLIED":
      return { label: "Slow", line: "Oversupplied — price competitively to move it; expect extended marketing time." };
    case "SEVERE":
      return { label: "Very slow", line: "Severely oversupplied — inventory isn't clearing; price aggressively or hold." };
    default:
      return { label: "Moderate", line: "Absorption read pending more sold activity." };
  }
}

function suggestedListOf(low: number | null, high: number | null, level: string): number | null {
  if (low === null || high === null) return null;
  const mid = (low + high) / 2;
  let p: number;
  if (level === "TIGHT") p = high;
  else if (level === "BALANCED") p = (mid + high) / 2;
  else if (level === "SOFT") p = mid;
  else p = (low + mid) / 2; // OVERSUPPLIED / SEVERE — price to move
  return Math.round(p / 1000) * 1000;
}

const GRADE_DESC: Record<string, string> = {
  A: "Low Risk",
  B: "Moderate-Low Risk",
  C: "Moderate Risk",
  D: "Elevated Risk",
  F: "Critical Risk — Do Not Proceed",
};

function ratingToGrade(rating: RiskRating, advisory: number): "A" | "B" | "C" | "D" | "F" {
  if (rating === "CRITICAL") return "F";
  if (rating === "HIGH") return "D";
  if (rating === "MODERATE") return "C";
  return advisory >= 1 ? "B" : "A"; // LOW
}

// §2 market strength — Thin / Moderate / Liquid, per the v1.1 standard.
function marketStrengthOf(sold: number, medianDom: number | null, activePerSold: number | null): {
  strength: "Thin" | "Moderate" | "Liquid";
} {
  const thin = sold <= 7 || (medianDom !== null && medianDom > 110) || (activePerSold !== null && activePerSold >= 6);
  const liquid = sold >= 25 && (medianDom === null || medianDom < 45) && (activePerSold === null || activePerSold < 2);
  return { strength: thin ? "Thin" : liquid ? "Liquid" : "Moderate" };
}

// Rough US medians for plain-language context (ACS-era).
const US_MEDIAN_INCOME = 75000;
const US_MEDIAN_HOME = 340000;

function compareToUS(v: number | null, us: number): string {
  if (v === null) return "—";
  const pct = Math.round((v / us - 1) * 100);
  if (Math.abs(pct) <= 8) return "near the national median";
  return pct < 0 ? `${Math.abs(pct)}% below the national median` : `${pct}% above the national median`;
}

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

  const sale = saleabilityOf(abs.level);
  const suggestedListPrice = suggestedListOf(value.low, value.high, abs.level);

  const marketSupportLine =
    marketSupport === "NOT_ASSESSED"
      ? `Indicated as-is value ${usd(value.low)}–${usd(value.high)}${
          suggestedListPrice ? `; suggested list ${usd(suggestedListPrice)}` : ""
        }.`
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
    "Condition grade & field photos: from the field agent's inspection (if a field order).",
    hasNbData
      ? `Neighborhood: flood + census data shown${nb && nb.sources.length ? " (" + nb.sources.join(", ") + ")" : ""}. Schools, crime & walk score not yet wired.`
      : "Neighborhood data (flood, vacancy, schools, crime): wiring in progress.",
  ].filter((x): x is string => x !== null);

  // ---- §2 Real Market ----
  const low = value.low;
  const high = value.high;
  const ms = marketStrengthOf(abs.sold, intel.medianDom, abs.activePerSold);
  const realMarketLine =
    `${ms.strength} market — ${ring.totalComps} comps within ${ring.radiusReachedMiles} mi over ${ring.windowMonths} mo` +
    `${intel.medianDom !== null ? `, median ${intel.medianDom} DOM` : ""}` +
    `${abs.activePerSold !== null ? `, ${abs.activePerSold} active per sale` : ""}.`;

  const buyerPool =
    abs.level === "SEVERE" || abs.level === "OVERSUPPLIED"
      ? "Investor-leaning submarket — slow retail absorption favors cash/value buyers over owner-occupants."
      : abs.level === "TIGHT"
        ? "Retail/owner-occupant submarket — tight inventory clears to end users quickly."
        : "Mixed buyer pool — both investors and owner-occupants are active at the supported range.";

  const halfMileStory = ring.expandedBeyondHalfMile
    ? `Inventory inside ½ mile was thin, so the comp set reaches ${ring.radiusReachedMiles} mi to capture ${ring.totalComps} comps. Wider reach means slightly lower precision and, typically, longer marketing time.`
    : `${ring.totalComps} comparable sales/listings exist within ½ mile — a dense, defensible local comp set.`;

  // ---- KEY NUMBERS ----
  const rent = intel.rent;
  const keyNumbers: Fact[] = [
    { label: "Indicated value (blended)", value: low !== null && high !== null ? `${usd(low)} – ${usd(high)}` : UNKNOWN },
    ...(value.asIsLow !== null ? [{ label: "As-is / distressed value", value: `${usd(value.asIsLow)} – ${usd(value.asIsHigh)}` }] : []),
    ...(value.renovatedLow !== null ? [{ label: "Renovated / retail value", value: `${usd(value.renovatedLow)} – ${usd(value.renovatedHigh)}` }] : []),
    { label: "Suggested list price", value: usd(suggestedListPrice) },
    ...(testValue !== null ? [{ label: testLabel, value: usd(testValue) }] : []),
    { label: "Supportable rent (range)", value: rent && (rent.low || rent.high) ? `${usd(rent.low ?? rent.estimate)} – ${usd(rent.high ?? rent.estimate)} /mo` : UNKNOWN },
    { label: "Tax assessed value", value: usd(s.taxAssessedValue) },
    { label: "Beds / baths", value: `${s.beds ?? "—"} / ${s.baths ?? "—"}` },
    { label: "Living area / lot", value: `${s.sqft ? s.sqft.toLocaleString() + " sqft" : "—"}${s.lotSize ? " / " + s.lotSize.toLocaleString() + " sqft lot" : ""}` },
    { label: "Year built", value: s.yearBuilt ? String(s.yearBuilt) : "—" },
    { label: "Last sale", value: s.lastSalePrice ? `${usd(s.lastSalePrice)}${s.lastSaleDate ? " · " + s.lastSaleDate : ""}` : UNKNOWN },
    { label: "Median sold $/sqft", value: value.perSqftLow !== null && value.perSqftHigh !== null ? `$${value.perSqftLow} – $${value.perSqftHigh}` : UNKNOWN },
    { label: "Median days on market", value: intel.medianDom !== null ? `${intel.medianDom} days` : UNKNOWN },
    { label: "FEMA flood zone", value: nb?.floodZone ? `${nb.floodZone}${nb.inSFHA ? " (high risk)" : ""}` : UNKNOWN },
  ];

  // ---- §3 Tax Record vs Reality ----
  const taxVsReality: string[] = [];
  if (s.taxAssessedValue && high) {
    const r = s.taxAssessedValue / ((low ?? high) + high) * 2;
    if (r > 1.1) taxVsReality.push(`Tax assessed value ${usd(s.taxAssessedValue)} sits ABOVE our comp-supported range ${usd(low)}–${usd(high)} — the assessment may be stale or high; don't anchor value to it.`);
    else if (r < 0.6) taxVsReality.push(`Tax assessed value ${usd(s.taxAssessedValue)} is well BELOW market — common in this state; use comps, not the assessment, for value.`);
    else taxVsReality.push(`Tax assessed value ${usd(s.taxAssessedValue)} is broadly consistent with the comp-supported range.`);
  } else {
    taxVsReality.push("Assessor value not available to compare against the comp-supported range.");
  }
  if (s.sqft) taxVsReality.push(`Public-record living area: ${s.sqft.toLocaleString()} sqft. Confirm against MLS on a field order — sqft discrepancies move the value.`);

  // ---- value methodology ----
  const tierLine =
    value.asIsLow !== null && value.renovatedLow !== null
      ? ` Comps split by condition: distressed / as-is homes cluster at ${usd(value.asIsLow)}–${usd(value.asIsHigh)}, renovated / retail homes at ${usd(value.renovatedLow)}–${usd(value.renovatedHigh)}. A property in original condition belongs in the as-is tier; a rehabbed one in the retail tier.`
      : "";
  const valueMethodology =
    `Range built from ${value.compsUsed} sold house comparables${value.excludedCount > 0 ? ` (${value.excludedCount} vacant-land / outlier comps excluded)` : ""} — ${value.basis} ` +
    `We read all comparables (not a hand-picked six), so the range reflects what the market actually supports, not a single opinion.` +
    tierLine;

  // ---- §8 Community Truth (minus crime, pending FBI CDE) ----
  const communityCharacter =
    nb && (nb.ownerOccupiedPct != null || nb.medianHouseholdIncome != null)
      ? `Census tract ${nb.censusTract ?? ""}${nb.tractPopulation ? `, ~${nb.tractPopulation.toLocaleString()} residents` : ""}. ` +
        `${nb.ownerOccupiedPct != null ? `${nb.ownerOccupiedPct}% owner-occupied` : ""}` +
        `${nb.vacancyRatePct != null ? `, ${nb.vacancyRatePct}% vacant` : ""}. ` +
        `Median household income ${usd(nb.medianHouseholdIncome)} (${compareToUS(nb.medianHouseholdIncome, US_MEDIAN_INCOME)}); ` +
        `median home value ${usd(nb.medianHomeValue)} (${compareToUS(nb.medianHomeValue, US_MEDIAN_HOME)}).`
      : "Census-tract economic data not available for this location.";

  const communityEconomics: Fact[] = [];
  if (nb) {
    if (nb.tractPopulation != null) communityEconomics.push({ label: "Tract population", value: nb.tractPopulation.toLocaleString() });
    if (nb.medianHouseholdIncome != null) communityEconomics.push({ label: "Median household income", value: `${usd(nb.medianHouseholdIncome)} (${compareToUS(nb.medianHouseholdIncome, US_MEDIAN_INCOME)})` });
    if (nb.medianHomeValue != null) communityEconomics.push({ label: "Median home value", value: `${usd(nb.medianHomeValue)} (${compareToUS(nb.medianHomeValue, US_MEDIAN_HOME)})` });
    if (nb.ownerOccupiedPct != null) communityEconomics.push({ label: "Owner-occupied", value: `${nb.ownerOccupiedPct}%` });
    if (nb.vacancyRatePct != null) communityEconomics.push({ label: "Vacancy rate", value: `${nb.vacancyRatePct}%` });
  }
  communityEconomics.push({ label: "Crime data", value: "Pending (FBI Crime Data Explorer — wiring in progress)" });

  const highVac = nb?.vacancyRatePct != null && nb.vacancyRatePct >= 15;
  const lowOwner = nb?.ownerOccupiedPct != null && nb.ownerOccupiedPct < 45;
  const communityImplications =
    highVac || lowOwner
      ? "For a lender: a renter-heavy, higher-vacancy tract means thinner owner-occupant demand and a longer exit if the loan defaults — underwrite to the low end and a longer timeline. For a seller: price competitively; the end-user buyer pool here is limited."
      : "For a lender: a stable, owner-occupant-weighted tract supports a normal exit timeline. For a seller: a healthy end-user buyer pool supports listing within the supported range.";

  // ---- §9 Summary & Next Steps ----
  const summary: string[] = [];
  summary.push(
    `Overall: ${ratingToGrade(rating, advisoryCount)} — ${GRADE_DESC[ratingToGrade(rating, advisoryCount)]}. ` +
      `Indicated as-is value ${usd(low)}–${usd(high)}${suggestedListPrice ? `, suggested list ${usd(suggestedListPrice)}` : ""}. ${ms.strength} market.`,
  );
  if (criticalCount > 0) summary.push(`Resolve ${criticalCount} critical flag${criticalCount === 1 ? "" : "s"} before relying on this value.`);
  summary.push(
    abs.level === "SEVERE" || abs.level === "OVERSUPPLIED"
      ? "Recommended path: price to move (toward the low end) or hold; expect extended marketing time given the absorption."
      : ms.strength === "Liquid"
        ? "Recommended path: list within the supported range; this market clears at a normal pace."
        : "Recommended path: list near the middle of the range and allow a normal-to-extended marketing window.",
  );
  summary.push("Field verification (photos + condition) sharpens where in the range this property lands. Add a field order to confirm condition.");

  const gradeLetter = ratingToGrade(rating, advisoryCount);

  return {
    rating,
    ratingLine: RATING_LINE[rating],
    gradeLetter,
    gradeDescriptor: GRADE_DESC[gradeLetter],
    confidenceLevel: intel.confidence.level,
    confidenceLine: intel.confidence.line,
    mlsRequired: intel.confidence.mlsRequired,
    confidenceReasons: intel.confidence.reasons,
    marketSupport,
    marketSupportLine,
    hasTestValue: testValue !== null,
    saleability: sale.label,
    saleabilityLine: sale.line,
    suggestedListPrice,
    marketStrength: ms.strength,
    realMarketLine,
    buyerPool,
    halfMileStory,
    keyNumbers,
    taxVsReality,
    valueMethodology,
    communityCharacter,
    communityEconomics,
    communityImplications,
    summary,
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
