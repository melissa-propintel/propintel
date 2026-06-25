// Assembles a GeneratedReport from PropertyIntake using the deterministic risk
// engine + the v1.1 standard. Produces page-1 verdict + evidence sections.

import type { PropertyIntake, GeneratedReport, ReportSection } from "./types";
import { SERVICE_LINE_LABELS } from "./types";
import {
  RISK_GRADES,
  CONDITION_GRADE_LABELS,
  HABITABILITY_LABELS,
  UNKNOWN,
} from "./report-standard";
import {
  fraudSignalScore,
  fraudLevel,
  marketSupport,
  liquidity,
  absorption,
  buildRedFlags,
  riskGrade,
  num,
  usd,
} from "./risk-engine";

const MARKET_SUPPORT_LABEL: Record<string, string> = {
  STRONG: "Strong",
  ADEQUATE: "Adequate",
  WEAK: "Weak",
  NOT_SUPPORTED: "Not supported",
};

function verdictHeadline(grade: string, serviceLine: string): string {
  const pre = serviceLine === "pre-origination";
  switch (grade) {
    case "A":
      return pre ? "PROCEED — fund per standard underwriting" : "PROCEED — list at supported range";
    case "B":
      return pre ? "PROCEED WITH AWARENESS" : "PROCEED — minor advisory items";
    case "C":
      return pre ? "PROCEED WITH CONDITIONS" : "PROCEED WITH CONDITIONS";
    case "D":
      return pre ? "SENIOR REVIEW REQUIRED BEFORE FUNDING" : "SENIOR REVIEW REQUIRED";
    case "F":
    default:
      return pre ? "DO NOT FUND — escalate / decline" : "DO NOT PROCEED — escalate";
  }
}

export function buildReport(
  intake: PropertyIntake,
  generatedAt: string,
): GeneratedReport {
  const score = fraudSignalScore(intake);
  const fLevel = fraudLevel(score);
  const ms = marketSupport(intake);
  const liq = liquidity(intake);
  const abs = absorption(intake);
  const redFlags = buildRedFlags(intake);

  const valueRangeLabel =
    ms.compLow !== null && ms.compHigh !== null
      ? `${usd(ms.compLow)} – ${usd(ms.compHigh)}`
      : "Range pending comp data";
  const absorptionHeadline =
    abs.primary.monthsOfSupply !== null
      ? `${abs.primary.monthsOfSupply.toFixed(1)} mo supply`
      : abs.primary.level === "SEVERE"
        ? "No clearance"
        : "—";
  const grade = riskGrade(redFlags, fLevel, ms.support);
  const gradeDef = RISK_GRADES[grade];

  const criticalCount = redFlags.filter((x) => x.severity === "CRITICAL").length;
  const advisoryCount = redFlags.filter((x) => x.severity === "ADVISORY").length;

  const id = intake.identifiers;
  const addr = [id.address, [id.city, id.state].filter(Boolean).join(", "), id.zip]
    .filter(Boolean)
    .join(" ")
    .trim();

  const sections: ReportSection[] = [];

  // §2 Real Market
  sections.push({
    heading: "2. Real Market",
    body: [
      `Liquidity: ${liq.level}.`,
      liq.line,
      `Absorption (½ mi): ${abs.halfMile.line}`,
      `Absorption (5 mi): ${abs.fiveMile.line}`,
      ms.compLow !== null && ms.compHigh !== null
        ? `Indicated as-is value range (all comps): ${usd(ms.compLow)} – ${usd(ms.compHigh)}.`
        : `Indicated as-is value range: ${UNKNOWN}`,
      intake.market.notes ? `Field note: ${intake.market.notes}` : "",
    ].filter(Boolean),
  });

  // §3 Tax Record vs. Reality
  const taxBody: string[] = [];
  if (intake.discrepancies.length === 0) {
    taxBody.push("No material discrepancies recorded between the tax/assessor record and field reality.");
  } else {
    for (const d of intake.discrepancies) {
      taxBody.push(
        `${d.item} — record: "${d.taxValue}" vs. field: "${d.fieldValue}" [${d.severity.toUpperCase()}].` +
          (d.likelyCause ? ` Likely cause: ${d.likelyCause}.` : "") +
          (d.implication ? ` Implication: ${d.implication}.` : ""),
      );
    }
  }
  sections.push({ heading: "3. Tax Record vs. Reality", body: taxBody });

  // §4 Ownership / Title
  const ownBody: string[] = [];
  ownBody.push(`Current owner of record: ${intake.ownership.currentOwner || UNKNOWN}`);
  ownBody.push(`Vesting: ${intake.ownership.vesting || UNKNOWN}`);
  if (intake.ownership.acquiredDate || intake.ownership.acquiredAmount) {
    ownBody.push(
      `Acquired: ${intake.ownership.acquiredDate || "—"} for ${
        intake.ownership.acquiredAmount || "—"
      }.`,
    );
  }
  if (intake.meta.serviceLine === "pre-origination") {
    ownBody.push(`Transfers in last 24 months: ${intake.ownership.transfersLast24mo || "0"}.`);
    ownBody.push(`Fraud signal score: ${score} / 5 (${fLevel}).`);
    const f = intake.ownership.fraud;
    const present = [
      f.taxContradictsField && "tax record contradicts field condition",
      f.rapidEscalatingTransfers && "rapid escalating transfers w/o permits",
      f.improvementsNoPermit && "improvements without permits",
      f.loanExceedsComps && "loan amount exceeds comp range >15%",
      f.strippingPlusRecentChange && "stripping + recent ownership change",
    ].filter(Boolean) as string[];
    ownBody.push(
      present.length ? `Indicators present: ${present.join("; ")}.` : "No fraud indicators flagged.",
    );
  }
  if (intake.ownership.openLiens) ownBody.push(`Open liens: ${intake.ownership.openLiens}`);
  if (intake.ownership.taxDelinquent) ownBody.push("Property tax delinquency on record.");
  if (intake.ownership.foreclosureHistory) ownBody.push("Prior foreclosure activity on record.");
  if (intake.ownership.notes) ownBody.push(`Note: ${intake.ownership.notes}`);
  sections.push({ heading: "4. Ownership / Title", body: ownBody });

  // §5 Market Intelligence
  const half = intake.market.halfMile;
  const five = intake.market.fiveMile;
  const mktBody: string[] = [
    `Half-mile (90 days): ${half.soldCount || "—"} sold, ${half.activeCount || "—"} active, ${
      half.pendingCount || "—"
    } pending. Median DOM ${half.medianDom || "—"}, median sold ${
      half.medianSoldPrice || "—"
    } (${half.medianPerSqft ? "$" + half.medianPerSqft + "/sqft" : "—"}).`,
    `Five-mile (180 days): ${five.soldCount || "—"} sold, ${five.activeCount || "—"} active, ${
      five.pendingCount || "—"
    } pending. Median DOM ${five.medianDom || "—"}, median sold ${
      five.medianSoldPrice || "—"
    } (${five.medianPerSqft ? "$" + five.medianPerSqft + "/sqft" : "—"}).`,
    intake.market.rentLow || intake.market.rentHigh
      ? `Market rent range: ${intake.market.rentLow || "—"} – ${intake.market.rentHigh || "—"}.`
      : `Market rent range: ${UNKNOWN}`,
    `Absorption: ${abs.primary.line} (We read all comps in the window, not a hand-picked six.)`,
    `Market support for ${
      intake.meta.serviceLine === "pre-origination" ? "requested loan" : "list price"
    }: ${MARKET_SUPPORT_LABEL[ms.support]}` +
      (ms.testValue && ms.compHigh
        ? ` (test ${usd(ms.testValue)} vs. comp high ${usd(ms.compHigh)}).`
        : "."),
    intake.market.taxAppraisal ? `Tax appraisal: ${intake.market.taxAppraisal}.` : "",
  ].filter(Boolean);
  sections.push({ heading: "5. Market Intelligence", body: mktBody });

  // §6 Condition
  const c = intake.condition;
  const condBody: string[] = [
    `Condition grade: ${CONDITION_GRADE_LABELS[c.grade]}.`,
    `Habitability: ${HABITABILITY_LABELS[c.habitability]}.`,
    `Mechanicals — HVAC: ${c.hvacFunctional}, water heater: ${c.waterHeaterFunctional}, electrical: ${c.electricalFunctional}.`,
    `Occupancy: ${c.occupancy.replace("-", " ")}.`,
    c.deferredMaintenanceLow || c.deferredMaintenanceHigh
      ? `Deferred maintenance range: ${c.deferredMaintenanceLow || "—"} – ${c.deferredMaintenanceHigh || "—"}.`
      : "",
    c.strippingEvidence ? "Stripping evidence: YES." : "",
    c.waterIntrusion ? "Water intrusion: YES." : "",
    c.structuralConcerns ? "Structural concerns: YES." : "",
    c.unpermittedAdditions ? "Unpermitted additions observed." : "",
    c.notes ? `Field note: ${c.notes}` : "",
  ].filter(Boolean);
  sections.push({ heading: "6. Condition", body: condBody });

  // §7 Disposition Alternatives (disposition only)
  if (intake.meta.serviceLine === "disposition") {
    const low = ms.compLow;
    const high = ms.compHigh;
    const dispBody: string[] = [];
    if (low !== null && high !== null) {
      const dmLow = num(c.deferredMaintenanceLow) ?? 0;
      const dmHigh = num(c.deferredMaintenanceHigh) ?? 0;
      dispBody.push(`Sell as-is: expected ${usd(low)} – ${usd(high)} at current condition (${c.grade}).`);
      dispBody.push(
        `Repair & list: invest ${usd(dmLow)} – ${usd(dmHigh)} to reach retail; expected uplift requires repair-cost discipline.`,
      );
      dispBody.push(
        `Auction / wholesale: faster exit, expect a discount to the as-is low (${usd(low * 0.85)} – ${usd(low)}).`,
      );
    } else {
      dispBody.push(`Disposition ranges: ${UNKNOWN} — comp-supported range required.`);
    }
    sections.push({ heading: "7. Disposition Alternatives", body: dispBody });
  }

  // §8 Community Truth
  const cm = intake.community;
  const commBody: string[] = [
    cm.crimeIndex ? `Crime index (100 = national avg): ${cm.crimeIndex}.` : "",
    cm.schoolRating ? `School rating: ${cm.schoolRating} / 10.` : "",
    cm.floodZone || id.femaFloodZone ? `FEMA flood zone: ${cm.floodZone || id.femaFloodZone}.` : "",
    cm.vacancyRate ? `Census-tract vacancy: ${cm.vacancyRate}.` : "",
    cm.distressedConcentration ? `Distressed-sale concentration (12 mo): ${cm.distressedConcentration}.` : "",
    cm.rentToIncome ? `Rent-to-income ratio for the tract: ${cm.rentToIncome}.` : "",
    cm.notes ? cm.notes : "",
  ].filter(Boolean);
  if (commBody.length === 0) {
    commBody.push("Community data not yet populated. Auto-generation from address is scoped for the intelligence layer (Session 6).");
  }
  sections.push({ heading: "8. Community Truth", body: commBody });

  // §9 Summary & Next Steps
  const summaryBody: string[] = [
    verdictHeadline(grade, intake.meta.serviceLine),
    gradeDef.meaning,
  ];
  if (criticalCount > 0) {
    summaryBody.push(
      `Resolve ${criticalCount} critical flag${criticalCount === 1 ? "" : "s"} before any decision.`,
    );
  }
  if (intake.missing.trim()) {
    summaryBody.push(`Data gaps flagged at intake: ${intake.missing.trim()}`);
  }
  sections.push({ heading: "9. Summary & Next Steps", body: summaryBody });

  return {
    orderNumber: intake.meta.orderNumber || "PI-UNASSIGNED",
    serviceLine: intake.meta.serviceLine,
    serviceLineLabel: SERVICE_LINE_LABELS[intake.meta.serviceLine],
    address: addr || "(address not provided)",
    reportDate: intake.meta.reportDate || "",
    fieldAgent: intake.meta.fieldAgent || "",
    clientName: intake.meta.clientName || "",

    riskGrade: grade,
    riskDescriptor: gradeDef.descriptor,
    verdictHeadline: verdictHeadline(grade, intake.meta.serviceLine),
    verdictRationale: gradeDef.meaning,

    conditionGrade: c.grade,
    habitabilityLabel: HABITABILITY_LABELS[c.habitability],
    marketSupport: ms.support,
    fraudSignalScore: score,
    fraudLevel: fLevel,

    liquidity: liq.level,
    realMarketLine: liq.line,

    indicatedValueLow: ms.compLow,
    indicatedValueHigh: ms.compHigh,
    valueRangeLabel,
    absorption: abs.primary,
    absorptionHeadline,

    redFlags,
    criticalCount,
    advisoryCount,

    sections,
    missingNotice: intake.missing.trim(),
    generatedAt,
  };
}
