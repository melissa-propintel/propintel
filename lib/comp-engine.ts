// The comp engine — PropIntel's differentiator, no AI required.
//
// Given a subject + every comp we could find (active + sold, unfiltered), it:
//   1. Builds the comp ring per the rule: take ALL within ½ mile; if fewer than
//      20, expand the radius until we reach 20–25 — and STATE how far we went.
//   2. Computes a TRUE absorption read (months of supply, active-per-sold ratio).
//   3. Finds which PRICE BANDS are moving vs sitting.
//   4. Derives a defensible value RANGE from the sold comps.
//   5. Frames the result through investor / lender / end-user lenses.

import type {
  SubjectProperty,
  Comp,
  CompRing,
  AbsorptionRead,
  AbsorptionLevel,
  PriceBand,
  ValueRange,
  LensTake,
  MarketIntel,
  DataConfidence,
  ConfidenceLevel,
} from "./market-data";

const HALF_MILE = 0.5;
const TARGET_MAX = 25;
const MIN_COMPS = 20;
const DEFAULT_WINDOW_MONTHS = 6;

// ---- geo ----

/** Haversine distance in miles between two lat/long points. */
export function distanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8; // earth radius, miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function round(n: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Linear-interpolated percentile (0..1) of a numeric array. */
function percentile(nums: number[], p: number): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  if (s.length === 1) return s[0];
  const idx = p * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

// ---- 1. comp ring ----

/**
 * Build the comp ring. All comps within ½ mile are kept (no filtering). If that
 * yields fewer than 20, expand outward (the comps are taken nearest-first) until
 * we have 20–25, and record how far we had to reach.
 */
export function buildRing(
  comps: Comp[],
  windowMonths: number,
): { ring: CompRing; selected: Comp[] } {
  const sorted = [...comps].sort((a, b) => a.distanceMiles - b.distanceMiles);
  const withinHalf = sorted.filter((c) => c.distanceMiles <= HALF_MILE);

  let selected: Comp[];
  let expanded: boolean;
  if (withinHalf.length >= MIN_COMPS) {
    // Rule: at ½ mile take ALL of them, even if more than 25.
    selected = withinHalf;
    expanded = false;
  } else {
    // Expand: nearest comps until we reach the 20–25 target (or run out).
    selected = sorted.slice(0, TARGET_MAX);
    expanded = true;
  }

  const radiusReached = selected.length
    ? round(selected[selected.length - 1].distanceMiles, 2)
    : HALF_MILE;
  const activeCount = selected.filter((c) => c.status === "active").length;
  const pendingCount = selected.filter((c) => c.status === "pending").length;
  const soldCount = selected.filter((c) => c.status === "sold").length;
  const thinMarket = selected.length < MIN_COMPS;

  let note: string;
  if (!expanded) {
    note = `All ${selected.length} comps within ½ mile (active + sold, no filtering).`;
  } else if (thinMarket) {
    note = `Thin market: only ${selected.length} comps exist out to ${radiusReached} mi — fewer than the 20 we target. Treat reads with caution.`;
  } else {
    note = `Fewer than 20 comps within ½ mile, so the search expanded to ${radiusReached} mi to capture ${selected.length} comps.`;
  }

  return {
    ring: {
      radiusReachedMiles: radiusReached,
      expandedBeyondHalfMile: expanded,
      totalComps: selected.length,
      activeCount,
      pendingCount,
      soldCount,
      windowMonths,
      note,
      thinMarket,
    },
    selected,
  };
}

// ---- 2. absorption ----

const LEVEL_LABEL: Record<AbsorptionLevel, string> = {
  TIGHT: "Tight / seller's market",
  BALANCED: "Balanced",
  SOFT: "Soft",
  OVERSUPPLIED: "Oversupplied",
  SEVERE: "Severely oversupplied",
};

function classify(active: number, soldPerMonth: number): {
  monthsOfSupply: number | null;
  level: AbsorptionLevel;
} {
  if (active > 0 && soldPerMonth === 0) {
    return { monthsOfSupply: null, level: "SEVERE" };
  }
  if (soldPerMonth === 0) return { monthsOfSupply: null, level: "BALANCED" };
  const mos = active / soldPerMonth;
  let level: AbsorptionLevel;
  if (mos < 4) level = "TIGHT";
  else if (mos < 6) level = "BALANCED";
  else if (mos < 9) level = "SOFT";
  else if (mos < 15) level = "OVERSUPPLIED";
  else level = "SEVERE";
  return { monthsOfSupply: mos, level };
}

export function readAbsorption(
  selected: Comp[],
  windowMonths: number,
): AbsorptionRead {
  const active = selected.filter((c) => c.status === "active").length;
  const sold = selected.filter((c) => c.status === "sold").length;
  const soldPerMonth = sold / windowMonths;
  const { monthsOfSupply, level } = classify(active, soldPerMonth);

  const absorptionRatePctPerMonth =
    active > 0 ? round((soldPerMonth / active) * 100, 1) : null;
  const activePerSold = sold > 0 ? round(active / sold, 1) : null;

  const mosText =
    monthsOfSupply !== null
      ? `${round(monthsOfSupply, 1)} months of supply`
      : "no measurable clearance";
  const headline = `${active} active vs. ${sold} sold in ${windowMonths} mo — ${mosText}. ${LEVEL_LABEL[level]}.`;

  let ratioLine: string;
  if (sold === 0) {
    ratioLine =
      active > 0
        ? `${active} active listings and nothing closed in ${windowMonths} months — inventory is not clearing.`
        : "Not enough activity to compute a ratio.";
  } else {
    ratioLine = `${activePerSold} active listings for every 1 sale.`;
  }

  return {
    active,
    sold,
    windowMonths,
    soldPerMonth: round(soldPerMonth, 2),
    monthsOfSupply: monthsOfSupply !== null ? round(monthsOfSupply, 1) : null,
    absorptionRatePctPerMonth,
    activePerSold,
    level,
    headline,
    ratioLine,
  };
}

// ---- 3. price bands ----

function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

function fmtK(n: number): string {
  return "$" + Math.round(n / 1000) + "k";
}

/**
 * Bucket comps into price bands across the observed range and decide which
 * bands are MOVING (sales outweigh listings) vs SITTING (listings stacked with
 * little clearance).
 */
export function buildPriceBands(selected: Comp[]): PriceBand[] {
  const priced = selected.filter(
    (c) => c.price !== null && (c.status === "active" || c.status === "sold"),
  );
  if (priced.length < 4) return [];

  const prices = priced.map((c) => c.price as number);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  if (hi <= lo) return [];

  // Aim for ~5 bands, rounded to a clean step for readability.
  const span = hi - lo;
  const rawStep = span / 5;
  const step = Math.max(5000, roundTo(rawStep, 5000));
  const start = Math.floor(lo / step) * step;

  const bands: PriceBand[] = [];
  for (let band = start; band < hi; band += step) {
    const bLow = band;
    const bHigh = band + step;
    const inBand = priced.filter(
      (c) => (c.price as number) >= bLow && (c.price as number) < bHigh,
    );
    if (inBand.length === 0) continue;
    const active = inBand.filter((c) => c.status === "active").length;
    const sold = inBand.filter((c) => c.status === "sold").length;

    let verdict: PriceBand["verdict"];
    if (sold >= active && sold > 0) verdict = "MOVING";
    else if (active > sold * 2 || (active > 0 && sold === 0)) verdict = "SITTING";
    else verdict = "BALANCED";

    const line = `${fmtK(bLow)}–${fmtK(bHigh)}: ${active} active / ${sold} sold — ${verdict}.`;
    bands.push({ label: `${fmtK(bLow)}–${fmtK(bHigh)}`, low: bLow, high: bHigh, active, sold, verdict, line });
  }
  return bands;
}

// ---- 4. value range ----

/**
 * Defensible as-is range. We read ALL comps for the market story, but the value
 * RANGE is built from the SOLD comps most similar in size to the subject —
 * appraiser-style per-sqft on size-matched comps — so heterogeneous markets
 * don't blow the range out. A range, never a single number.
 */
/** A comp is house-like (not vacant land / a lot / an acreage parcel). */
export function isHouseComp(c: Comp): boolean {
  const pt = (c.propertyType ?? "").toLowerCase();
  if (pt.includes("land") || pt.includes("lot") || pt.includes("vacant")) return false;
  const addr = c.address.toLowerCase();
  if (/\blot\b|\bacre|\bparcel\b/.test(addr)) return false; // "White St, Lot 0", "3.02 Acres Hwy"
  // Needs a house signal — beds or a real floor area.
  if ((c.beds === null || c.beds < 1) && (c.sqft === null || c.sqft < 400)) return false;
  return true;
}

/** Drop extreme price outliers (lots/mansions/acreage that slipped through). */
function rejectOutliers(comps: Comp[]): { kept: Comp[]; dropped: number } {
  const prices = comps.map((c) => c.price as number).filter((p) => Number.isFinite(p)).sort((a, b) => a - b);
  if (prices.length < 6) return { kept: comps, dropped: 0 };
  const q1 = percentile(prices, 0.25) as number;
  const q3 = percentile(prices, 0.75) as number;
  const med = percentile(prices, 0.5) as number;
  const iqr = q3 - q1;
  const lo = Math.max(q1 - 1.5 * iqr, med * 0.3); // Tukey fence + a hard 0.3x–3.5x band vs median
  const hi = Math.min(q3 + 1.5 * iqr, med * 3.5);
  const kept = comps.filter((c) => (c.price as number) >= lo && (c.price as number) <= hi);
  return { kept: kept.length >= 3 ? kept : comps, dropped: comps.length - (kept.length >= 3 ? kept.length : comps.length) };
}

function rangeOf(values: number[], round = 1000): { low: number; high: number } | null {
  if (values.length === 0) return null;
  const low = percentile(values, 0.25) as number;
  const high = percentile(values, 0.75) as number;
  return { low: Math.round(low / round) * round, high: Math.round(high / round) * round };
}

export function computeValueRange(
  subject: SubjectProperty,
  selected: Comp[],
): ValueRange {
  const empty = (basis: string): ValueRange => ({
    low: null, high: null, perSqftLow: null, perSqftHigh: null, basis,
    asIsLow: null, asIsHigh: null, renovatedLow: null, renovatedHigh: null, compsUsed: 0, excludedCount: 0,
  });

  const allSolds = selected.filter((c) => c.status === "sold" && c.price !== null && (c.price as number) > 5000);
  if (allSolds.length === 0) return empty("No sold comps in the window — value range not yet supportable.");

  // 1. House-only (drop land / lots / acreage), then reject price outliers.
  const houseSolds = allSolds.filter(isHouseComp);
  const basePool = houseSolds.length >= 3 ? houseSolds : allSolds;
  const { kept: pool0, dropped } = rejectOutliers(basePool);
  const excludedCount = allSolds.length - pool0.length;

  // 2. Size-match to the subject when we know its size.
  let pool = pool0;
  let sizeMatched = false;
  if (subject.sqft && subject.sqft > 0) {
    const lo = subject.sqft * 0.7;
    const hi = subject.sqft * 1.3;
    const similar = pool0.filter((c) => c.sqft !== null && c.sqft >= lo && c.sqft <= hi);
    if (similar.length >= 4) { pool = similar; sizeMatched = true; }
  }

  // 3. As-is vs renovated tiers — split the pool by $/sqft (proxy for condition).
  let asIs: { low: number; high: number } | null = null;
  let renovated: { low: number; high: number } | null = null;
  const withPsf = pool.filter((c) => c.pricePerSqft !== null).sort((a, b) => (a.pricePerSqft as number) - (b.pricePerSqft as number));
  if (withPsf.length >= 4) {
    const mid = Math.floor(withPsf.length / 2);
    asIs = rangeOf(withPsf.slice(0, mid).map((c) => c.price as number));
    renovated = rangeOf(withPsf.slice(mid).map((c) => c.price as number));
  }

  // 4. Headline range — per-sqft applied to subject size when known, else IQR of prices.
  const perSqfts = pool.map((c) => c.pricePerSqft).filter((x): x is number => x !== null && Number.isFinite(x));
  const exclNote = excludedCount > 0 ? ` (${excludedCount} land/outlier comp${excludedCount === 1 ? "" : "s"} excluded)` : "";
  if (subject.sqft && subject.sqft > 0 && perSqfts.length >= 4) {
    const psLow = percentile(perSqfts, 0.25) as number;
    const psHigh = percentile(perSqfts, 0.75) as number;
    return {
      low: Math.round((psLow * subject.sqft) / 1000) * 1000,
      high: Math.round((psHigh * subject.sqft) / 1000) * 1000,
      perSqftLow: Math.round(psLow),
      perSqftHigh: Math.round(psHigh),
      basis: `$${Math.round(psLow)}–$${Math.round(psHigh)}/sqft from ${pool.length} ${sizeMatched ? "size-matched " : ""}house comps applied to ${subject.sqft.toLocaleString()} sqft${exclNote}.`,
      asIsLow: asIs?.low ?? null, asIsHigh: asIs?.high ?? null,
      renovatedLow: renovated?.low ?? null, renovatedHigh: renovated?.high ?? null,
      compsUsed: pool.length, excludedCount,
    };
  }

  const prices = pool.map((c) => c.price as number);
  const pLow = percentile(prices, 0.25);
  const pHigh = percentile(prices, 0.75);
  return {
    low: pLow !== null ? Math.round(pLow / 1000) * 1000 : null,
    high: pHigh !== null ? Math.round(pHigh / 1000) * 1000 : null,
    perSqftLow: null,
    perSqftHigh: null,
    basis: `Interquartile range of ${pool.length} house comp${pool.length === 1 ? "" : "s"}${subject.sqft ? "" : " (subject size unknown — no per-sqft normalization)"}${exclNote}.`,
    asIsLow: asIs?.low ?? null, asIsHigh: asIs?.high ?? null,
    renovatedLow: renovated?.low ?? null, renovatedHigh: renovated?.high ?? null,
    compsUsed: pool.length, excludedCount,
  };
}

// ---- 5. three lenses ----

function usd(n: number | null): string {
  return n === null ? "—" : "$" + Math.round(n).toLocaleString("en-US");
}

export function buildLenses(
  abs: AbsorptionRead,
  value: ValueRange,
  bands: PriceBand[],
  medianDom: number | null,
): LensTake[] {
  const moving = bands.filter((b) => b.verdict === "MOVING").map((b) => b.label);
  const sitting = bands.filter((b) => b.verdict === "SITTING").map((b) => b.label);
  const oversupplied = abs.level === "OVERSUPPLIED" || abs.level === "SEVERE";
  const range = value.low !== null && value.high !== null ? `${usd(value.low)}–${usd(value.high)}` : "not yet supportable";

  const investor =
    oversupplied
      ? `Buy for the hold, not the flip. With ${abs.active} active vs. ${abs.sold} sold${
          abs.monthsOfSupply !== null ? ` (${abs.monthsOfSupply} mo supply)` : ""
        }, resale is slow${
          sitting.length ? ` and the ${sitting.join(", ")} band is stacked` : ""
        }. Underwrite to the low end (${usd(value.low)}) and a longer marketing window${
          medianDom ? ` — median ${medianDom} DOM` : ""
        }.`
      : `Workable exit. Absorption is ${abs.level.toLowerCase()}${
          moving.length ? ` and the ${moving.join(", ")} band is moving` : ""
        }. A buy near ${usd(value.low)} with a resale toward ${usd(value.high)} pencils if condition holds.`;

  const lender =
    oversupplied
      ? `Collateral is realizable but not quickly. ${abs.ratioLine} The supported as-is range is ${range}; lend to the low end and expect extended time-to-liquidation if you take it back.`
      : `Collateral support is adequate. ${abs.ratioLine} As-is range ${range}; a value within that band is defensible against current comps.`;

  const endUser =
    moving.length
      ? `If you're buying to live here, the ${moving.join(", ")} band is where homes actually sell — price there and you'll transact. Homes above that range are sitting${
          medianDom ? `; median time on market is ${medianDom} days` : ""
        }.`
      : `Homes here move slowly${
          medianDom ? ` (median ${medianDom} DOM)` : ""
        }. Don't overpay versus the ${range} band the data supports; you'll have leverage and time.`;

  return [
    { lens: "Investor", takeaway: investor },
    { lens: "Lender", takeaway: lender },
    { lens: "End user", takeaway: endUser },
  ];
}

// ---- data confidence: can we stand behind a value, or do we need agent comps/MLS? ----

export function scoreConfidence(
  subject: SubjectProperty,
  ring: CompRing,
  value: ValueRange,
): DataConfidence {
  const sizeKnown = !!(subject.sqft && subject.sqft > 0);
  const soldHouses = value.compsUsed; // cleaned sold house pool used for value
  const radius = ring.radiusReachedMiles;
  const disp = value.low && value.high && value.low > 0 ? value.high / value.low : null;
  const reasons: string[] = [];

  let level: ConfidenceLevel;
  if (soldHouses < 4) {
    level = "LOW";
    reasons.push(`Only ${soldHouses} usable sold house comp${soldHouses === 1 ? "" : "s"} — too few to support a defensible value.`);
  } else if (!sizeKnown && (soldHouses < 8 || radius > 1.2)) {
    level = "LOW";
    reasons.push("No public property record (size/beds unknown) and a thin/wide comp set — value can't be normalized to the subject. Rural/limited-data property.");
  } else if (!sizeKnown || soldHouses < 6 || radius > 1.5 || (disp !== null && disp > 2.2)) {
    level = "MODERATE";
    if (!sizeKnown) reasons.push("No public property record for the subject (size/beds unknown) — the range is directional from area comps, not normalized to this home.");
    if (soldHouses < 6) reasons.push(`Thin sold comp set (${soldHouses}).`);
    if (radius > 1.5) reasons.push(`Comps reach ${radius} mi — local inventory is limited.`);
    if (disp !== null && disp > 2.2) reasons.push("Wide value spread between comps — condition will drive where it lands.");
  } else {
    level = "HIGH";
    reasons.push(`${soldHouses} size-relevant sold house comps within ${radius} mi — a defensible local data set.`);
  }

  // Agent comps / MLS are required whenever we lack the subject's own record
  // (size/beds unknown) or the comp set is too thin to value on its own.
  const mlsRequired = !sizeKnown || soldHouses < 4;
  const line =
    level === "LOW"
      ? "Low confidence — PRELIMINARY. This property needs agent comps / MLS before relying on a value."
      : mlsRequired
        ? "Verify — no public record for this property (size/beds unknown). The range is directional from area comps; confirm with agent comps / MLS."
        : level === "MODERATE"
          ? "Moderate confidence — value is directional; field verification will tighten it."
          : "High confidence — the comp data supports a defensible value.";

  return { level, mlsRequired, line, reasons };
}

// ---- orchestrator ----

export function analyzeMarket(
  subject: SubjectProperty,
  comps: Comp[],
  usingSampleData: boolean,
  windowMonths: number = DEFAULT_WINDOW_MONTHS,
): MarketIntel {
  // Exclude vacant land / lots / acreage parcels — they aren't comps for a house,
  // and they badly distort value in thin rural markets. Keep all if too few remain.
  const houses = comps.filter(isHouseComp);
  const compsForRing = houses.length >= 5 ? houses : comps;
  const { ring, selected } = buildRing(compsForRing, windowMonths);
  const absorption = readAbsorption(selected, windowMonths);
  const priceBands = buildPriceBands(selected);
  const valueRange = computeValueRange(subject, selected);
  const doms = selected
    .map((c) => c.daysOnMarket)
    .filter((x): x is number => x !== null && Number.isFinite(x));
  const medianDom = median(doms);
  const lenses = buildLenses(absorption, valueRange, priceBands, medianDom !== null ? Math.round(medianDom) : null);

  return {
    subject,
    ring,
    absorption,
    priceBands,
    movingBands: priceBands.filter((b) => b.verdict === "MOVING").map((b) => b.label),
    sittingBands: priceBands.filter((b) => b.verdict === "SITTING").map((b) => b.label),
    valueRange,
    medianDom: medianDom !== null ? Math.round(medianDom) : null,
    lenses,
    comps: selected,
    confidence: scoreConfidence(subject, ring, valueRange),
    rent: null, // populated by the route from the data pull
    neighborhood: null, // populated by the route after the market analysis
    usingSampleData,
  };
}
