// Deterministic risk engine. No AI required — this implements the scoring rules
// from the intake form + v1.1 standard so every report has a defensible verdict.
// The AI layer (Sessions 4-5) later enriches narratives; the numbers come from here.

import type {
  PropertyIntake,
  RedFlag,
  RiskGrade,
  MarketSupport,
  Liquidity,
  FraudLevel,
  AbsorptionStat,
  AbsorptionLevel,
} from "./types";

// ---- parsing helpers ----

/** Parse a money / number string ("$1,200,000", "480k", "112") to a number, or null. */
export function num(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const cleaned = String(raw).trim().toLowerCase().replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  let mult = 1;
  let body = cleaned;
  if (body.endsWith("k")) {
    mult = 1_000;
    body = body.slice(0, -1);
  } else if (body.endsWith("m")) {
    mult = 1_000_000;
    body = body.slice(0, -1);
  }
  const n = parseFloat(body);
  return Number.isFinite(n) ? n * mult : null;
}

export function usd(n: number | null): string {
  if (n === null) return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}

// ---- fraud signal score (0-5) ----

export function fraudSignalScore(intake: PropertyIntake): number {
  const f = intake.ownership.fraud;
  return [
    f.taxContradictsField,
    f.rapidEscalatingTransfers,
    f.improvementsNoPermit,
    f.loanExceedsComps,
    f.strippingPlusRecentChange,
  ].filter(Boolean).length;
}

export function fraudLevel(score: number): FraudLevel {
  if (score >= 4) return "HIGH";
  if (score >= 2) return "ELEVATED";
  return "LOW";
}

// ---- market support ----

/**
 * For pre-origination we test the requested loan amount; for disposition we test
 * the list price. Compared against the comp-supported as-is high.
 */
export function marketSupport(intake: PropertyIntake): {
  support: MarketSupport;
  testValue: number | null;
  compLow: number | null;
  compHigh: number | null;
} {
  const compLow = num(intake.market.compSupportedLow);
  const compHigh = num(intake.market.compSupportedHigh);
  const testValue =
    intake.meta.serviceLine === "pre-origination"
      ? num(intake.market.requestedLoanAmount)
      : num(intake.market.listPrice);

  if (testValue === null || compHigh === null) {
    return { support: "ADEQUATE", testValue, compLow, compHigh };
  }
  const ratio = testValue / compHigh;
  let support: MarketSupport;
  if (ratio <= 0.9) support = "STRONG";
  else if (ratio <= 1.0) support = "ADEQUATE";
  else if (ratio <= 1.15) support = "WEAK";
  else support = "NOT_SUPPORTED";
  return { support, testValue, compLow, compHigh };
}

// ---- absorption / months of supply ----
// The core "better than a BPO" metric: we read ALL comps, not just six. A market
// with 16 active and 2 sold in the trailing window is not a $250k market just
// because one comp closed there — it's an oversupplied market that won't clear.

const MONTH_LABEL: Record<AbsorptionLevel, string> = {
  TIGHT: "Tight / seller's market",
  BALANCED: "Balanced",
  SOFT: "Soft",
  OVERSUPPLIED: "Oversupplied",
  SEVERE: "Severely oversupplied",
};

function classifyMonths(active: number | null, soldPerMonth: number | null): {
  monthsOfSupply: number | null;
  level: AbsorptionLevel;
} {
  if (active !== null && active > 0 && (soldPerMonth === null || soldPerMonth === 0)) {
    // Active inventory exists but nothing is clearing.
    return { monthsOfSupply: null, level: "SEVERE" };
  }
  if (active === null || soldPerMonth === null || soldPerMonth === 0) {
    return { monthsOfSupply: null, level: "BALANCED" };
  }
  const mos = active / soldPerMonth;
  let level: AbsorptionLevel;
  if (mos < 4) level = "TIGHT";
  else if (mos < 6) level = "BALANCED";
  else if (mos < 9) level = "SOFT";
  else if (mos < 15) level = "OVERSUPPLIED";
  else level = "SEVERE";
  return { monthsOfSupply: mos, level };
}

function absorptionFor(
  radiusLabel: string,
  activeRaw: string,
  soldRaw: string,
  periodMonths: number,
): AbsorptionStat {
  const active = num(activeRaw);
  const sold = num(soldRaw);
  const soldPerMonth = sold !== null ? sold / periodMonths : null;
  const { monthsOfSupply, level } = classifyMonths(active, soldPerMonth);

  let line: string;
  if (active !== null && sold !== null) {
    const mosText =
      monthsOfSupply !== null
        ? `${monthsOfSupply.toFixed(1)} months of supply`
        : "no measurable clearance";
    line = `${active} active vs. ${sold} sold in ${periodMonths} mo (${radiusLabel}) — ${mosText}. ${MONTH_LABEL[level]}.`;
  } else {
    line = `Absorption not determinable (${radiusLabel}) — active and sold counts required.`;
  }
  return { radiusLabel, active, sold, periodMonths, soldPerMonth, monthsOfSupply, level, line };
}

/** Primary absorption read: prefer the ½-mile (90-day) window, fall back to 5-mile. */
export function absorption(intake: PropertyIntake): {
  primary: AbsorptionStat;
  halfMile: AbsorptionStat;
  fiveMile: AbsorptionStat;
} {
  const halfMile = absorptionFor("½ mi", intake.market.halfMile.activeCount, intake.market.halfMile.soldCount, 3);
  const fiveMile = absorptionFor("5 mi", intake.market.fiveMile.activeCount, intake.market.fiveMile.soldCount, 6);
  const primary =
    halfMile.active !== null && halfMile.sold !== null ? halfMile : fiveMile;
  return { primary, halfMile, fiveMile };
}

// ---- liquidity / "real market" ----

export function liquidity(intake: PropertyIntake): {
  level: Liquidity;
  line: string;
} {
  const abs = absorption(intake).primary;
  const sold = num(intake.market.fiveMile.soldCount);
  const dom = num(intake.market.fiveMile.medianDom);

  let level: Liquidity = "MODERATE";
  if (
    abs.level === "OVERSUPPLIED" ||
    abs.level === "SEVERE" ||
    (sold !== null && sold <= 7) ||
    (dom !== null && dom > 110)
  ) {
    level = "THIN";
  } else if (
    abs.level === "TIGHT" ||
    (sold !== null && sold >= 25 && dom !== null && dom < 45)
  ) {
    level = "LIQUID";
  }

  const descriptor =
    level === "THIN"
      ? "Investor-buyer submarket. Thin liquidity — extended hold time likely."
      : level === "LIQUID"
        ? "Liquid retail submarket. Quick absorption at supported price."
        : "Moderate submarket. Reasonable absorption at supported price.";
  const line = `${descriptor} ${abs.line}`;
  return { level, line };
}

// ---- red flag generation ----

export function buildRedFlags(intake: PropertyIntake): RedFlag[] {
  const flags: RedFlag[] = [];
  const f = intake.ownership.fraud;
  const ms = marketSupport(intake);

  // Fraud indicators
  if (f.taxContradictsField) {
    flags.push({
      severity: "CRITICAL",
      category: "Collateral fraud",
      description:
        "Tax record condition materially contradicts field photos. Stated asset may not exist as recorded.",
    });
  }
  if (f.strippingPlusRecentChange) {
    flags.push({
      severity: "CRITICAL",
      category: "Collateral fraud",
      description:
        "Stripping indicators present alongside a recent ownership change. Pattern consistent with asset-stripping fraud.",
    });
  }
  if (f.rapidEscalatingTransfers) {
    flags.push({
      severity: "CRITICAL",
      category: "Ownership chain",
      description:
        "Two or more transfers in 24 months at escalating prices with no permits pulled. Pattern consistent with a loan-fraud scheme.",
    });
  }
  if (f.improvementsNoPermit) {
    flags.push({
      severity: "ADVISORY",
      category: "Permit gap",
      description:
        "Major improvements visible in the field with no corresponding permit on record.",
    });
  }

  // Value gap
  if (ms.support === "NOT_SUPPORTED" && ms.testValue && ms.compHigh) {
    const gap = ms.testValue - ms.compHigh;
    const label =
      intake.meta.serviceLine === "pre-origination"
        ? "Requested loan"
        : "List price";
    flags.push({
      severity: "CRITICAL",
      category: "Value gap",
      description: `${label} ${usd(ms.testValue)} exceeds the comp-supported as-is high of ${usd(
        ms.compHigh,
      )} by ${usd(gap)}. Gap is not supportable by current collateral.`,
    });
  } else if (ms.support === "WEAK" && ms.testValue && ms.compHigh) {
    flags.push({
      severity: "ADVISORY",
      category: "Market",
      description: `Test value ${usd(ms.testValue)} sits above the comp-supported high of ${usd(
        ms.compHigh,
      )}. Market support is weak.`,
    });
  }

  // Absorption / oversupply — the signature PropIntel flag.
  const abs = absorption(intake).primary;
  if (abs.level === "SEVERE") {
    flags.push({
      severity: "CRITICAL",
      category: "Absorption",
      description:
        abs.active !== null && abs.sold !== null
          ? `${abs.active} active listings vs. ${abs.sold} sold in ${abs.periodMonths} months (${abs.radiusLabel}). Inventory is not clearing — value is not realizable at retail in a reasonable timeframe.`
          : "Active inventory present with little or no clearance. Value is not realizable at retail in a reasonable timeframe.",
    });
  } else if (abs.level === "OVERSUPPLIED") {
    flags.push({
      severity: "ADVISORY",
      category: "Absorption",
      description: `${abs.active} active vs. ${abs.sold} sold in ${abs.periodMonths} months (${abs.radiusLabel}) — ${
        abs.monthsOfSupply !== null ? abs.monthsOfSupply.toFixed(1) + " months of supply" : "high supply"
      }. Oversupplied; expect extended marketing time and price pressure.`,
    });
  }

  // Condition
  if (intake.condition.strippingEvidence) {
    flags.push({
      severity: "CRITICAL",
      category: "Condition",
      description:
        "Evidence of stripping — missing fixtures, mechanicals, or wiring. Collateral value impaired.",
    });
  }
  if (intake.condition.grade === "C6" || intake.condition.habitability === "not-rentable") {
    flags.push({
      severity: "CRITICAL",
      category: "Condition",
      description:
        "Property is not habitable as-is. Underwritten rents are not currently achievable.",
    });
  } else if (intake.condition.grade === "C5") {
    flags.push({
      severity: "ADVISORY",
      category: "Condition",
      description: "Significant deferred maintenance (C5). Repair reserve warranted.",
    });
  }
  if (intake.condition.structuralConcerns) {
    flags.push({
      severity: "ADVISORY",
      category: "Condition",
      description: "Visible structural concerns documented in the field. Engineer review recommended.",
    });
  }
  if (intake.condition.waterIntrusion) {
    flags.push({
      severity: "ADVISORY",
      category: "Condition",
      description: "Active water intrusion or staining documented. Mold and ongoing damage risk.",
    });
  }

  // Tax-vs-reality discrepancies
  for (const d of intake.discrepancies) {
    if (d.severity === "critical") {
      flags.push({
        severity: "CRITICAL",
        category: "Tax record",
        description: `${d.item}: record says "${d.taxValue}", field shows "${d.fieldValue}". ${d.implication || "Material discrepancy."}`,
      });
    } else if (d.severity === "material") {
      flags.push({
        severity: "ADVISORY",
        category: "Tax record",
        description: `${d.item}: record says "${d.taxValue}", field shows "${d.fieldValue}". ${d.implication || "Material discrepancy."}`,
      });
    }
  }

  // Ownership extras
  if (intake.ownership.taxDelinquent) {
    flags.push({
      severity: "ADVISORY",
      category: "Title",
      description: "Property tax delinquency on record. Confirm payoff before proceeding.",
    });
  }
  if (intake.ownership.foreclosureHistory) {
    flags.push({
      severity: "ADVISORY",
      category: "Title",
      description: "Prior foreclosure activity in the ownership history.",
    });
  }

  // Neighborhood
  const flaggedNbrs = intake.neighborhood.flags.filter((x) => x.state === "flagged");
  if (flaggedNbrs.length > 0) {
    flags.push({
      severity: "ADVISORY",
      category: "Neighborhood",
      description: `${flaggedNbrs.length} neighborhood flag${
        flaggedNbrs.length === 1 ? "" : "s"
      }: ${flaggedNbrs.map((x) => x.label).join("; ")}.`,
    });
  }
  if (intake.neighborhood.blockGrade === "D" || intake.neighborhood.blockGrade === "F") {
    flags.push({
      severity: "ADVISORY",
      category: "Neighborhood",
      description: `Block grade ${intake.neighborhood.blockGrade} — distressed block context.`,
    });
  }

  // Sort: critical first, preserve insertion order within tier.
  return flags.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "CRITICAL" ? -1 : 1));
}

// ---- overall risk grade ----

export function riskGrade(
  flags: RedFlag[],
  fraud: FraudLevel,
  support: MarketSupport,
): RiskGrade {
  const critical = flags.filter((x) => x.severity === "CRITICAL").length;
  const advisory = flags.filter((x) => x.severity === "ADVISORY").length;

  // Hard fails.
  if (fraud === "HIGH" || support === "NOT_SUPPORTED" || critical >= 2) {
    return "F";
  }
  if (critical === 1) {
    return "D";
  }
  // Material-but-not-critical territory.
  if (fraud === "ELEVATED" || support === "WEAK" || advisory >= 2) {
    return "C";
  }
  if (advisory === 1) {
    return "B";
  }
  return "A";
}
