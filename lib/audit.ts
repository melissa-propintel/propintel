// BPO / Appraisal AUDIT — compare an uploaded valuation against PropIntel's
// independent read and surface WHAT IT MISSED. The extraction (reading the PDF)
// is the LLM's job; this comparison is deterministic.

import type { MarketIntel } from "./market-data";
import type { MarketReport } from "./market-report";

export interface BpoExtract {
  reportType: string | null; // "BPO" | "Appraisal" | "CMA"
  effectiveDate: string | null; // ISO if possible
  subjectAddress: string | null;
  opinionOfValue: number | null; // as-is value
  asRepairedValue: number | null;
  suggestedListPrice: number | null;
  comps: { address: string | null; price: number | null; status: string | null }[];
  conditionRating: string | null;
  marketTrend: string | null; // increasing | stable | declining | null
  mentionsFloodZone: boolean;
  mentionsOversupply: boolean;
  notes: string | null;
}

export type FindingSeverity = "MAJOR" | "MINOR" | "OK";

export interface AuditFinding {
  severity: FindingSeverity;
  category: string;
  finding: string;
}

export type VerdictLevel = "ALIGNED" | "MINOR_GAPS" | "MATERIAL_GAPS";

export interface AuditResult {
  findings: AuditFinding[];
  majorCount: number;
  minorCount: number;
  verdictLevel: VerdictLevel;
  verdict: string;
  valueLine: string;
  ourValueLow: number | null;
  ourValueHigh: number | null;
  bpoValue: number | null;
}

function usd(n: number | null): string {
  return n === null ? "—" : "$" + Math.round(n).toLocaleString("en-US");
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const DAY = 86_400_000;

export function auditBpo(bpo: BpoExtract, intel: MarketIntel, report: MarketReport, nowMs: number): AuditResult {
  const findings: AuditFinding[] = [];
  const low = intel.valueRange.low;
  const high = intel.valueRange.high;
  const bpoVal = bpo.opinionOfValue;
  const abs = intel.absorption;

  // 1. Value vs. our supported range.
  if (bpoVal !== null && high !== null && low !== null) {
    if (bpoVal > high) {
      const overPct = Math.round(((bpoVal - high) / high) * 100);
      findings.push({
        severity: overPct >= 8 ? "MAJOR" : "MINOR",
        category: "Value",
        finding: `BPO value ${usd(bpoVal)} is ${overPct}% above our comp-supported high of ${usd(high)}. The market doesn't support it.`,
      });
    } else if (bpoVal < low) {
      const underPct = Math.round(((low - bpoVal) / low) * 100);
      findings.push({
        severity: "MINOR",
        category: "Value",
        finding: `BPO value ${usd(bpoVal)} is ${underPct}% below our supported low of ${usd(low)} — possibly conservative, or it knows condition we don't.`,
      });
    } else {
      findings.push({
        severity: "OK",
        category: "Value",
        finding: `BPO value ${usd(bpoVal)} falls within our supported range ${usd(low)}–${usd(high)}.`,
      });
    }
  }

  // 2. Comp breadth — we read all of them, they pick a few.
  const bpoCount = bpo.comps.length;
  if (bpoCount > 0 && intel.ring.totalComps >= bpoCount + 6) {
    findings.push({
      severity: bpoCount <= 6 ? "MAJOR" : "MINOR",
      category: "Comp coverage",
      finding: `BPO relies on ${bpoCount} comp${bpoCount === 1 ? "" : "s"}; we read all ${intel.ring.totalComps} active + sold within ${intel.ring.radiusReachedMiles} mi. A handful of comps can be hand-picked to support any number.`,
    });
  }

  // 3. Oversupply blind spot — did the BPO see the absorption problem?
  if ((abs.level === "SEVERE" || abs.level === "OVERSUPPLIED") && !bpo.mentionsOversupply) {
    findings.push({
      severity: abs.level === "SEVERE" ? "MAJOR" : "MINOR",
      category: "Absorption",
      finding: `BPO doesn't account for oversupply: ${abs.active} active vs. ${abs.sold} sold${abs.monthsOfSupply !== null ? ` (${abs.monthsOfSupply} mo supply)` : ""}. The value won't be realized at retail in a normal timeframe.`,
    });
  }

  // 4. Cherry-picked comps — BPO comps skew high vs. the market's actual closings.
  const bpoCompPrices = bpo.comps.map((c) => c.price).filter((p): p is number => p !== null && p > 0);
  const ourSoldPrices = intel.comps.filter((c) => c.status === "sold" && c.price !== null).map((c) => c.price as number);
  const bpoMed = median(bpoCompPrices);
  const ourMed = median(ourSoldPrices);
  if (bpoMed !== null && ourMed !== null && bpoMed > ourMed * 1.1) {
    const skew = Math.round(((bpoMed - ourMed) / ourMed) * 100);
    findings.push({
      severity: "MAJOR",
      category: "Comp selection",
      finding: `BPO's comps skew ${skew}% high — median ${usd(bpoMed)} vs. the market's actual closed median of ${usd(ourMed)}. Selection is propping up the value.`,
    });
  }

  // 5. Flood risk the BPO didn't flag.
  if (intel.neighborhood?.inSFHA && !bpo.mentionsFloodZone) {
    findings.push({
      severity: "MAJOR",
      category: "Flood",
      finding: `Subject is in a FEMA Special Flood Hazard Area (zone ${intel.neighborhood.floodZone}); the BPO doesn't address flood risk or insurance cost.`,
    });
  }

  // 6. Staleness.
  if (bpo.effectiveDate) {
    const t = Date.parse(bpo.effectiveDate);
    if (Number.isFinite(t)) {
      const ageDays = Math.round((nowMs - t) / DAY);
      if (ageDays > 120) {
        findings.push({
          severity: ageDays > 270 ? "MAJOR" : "MINOR",
          category: "Recency",
          finding: `BPO is dated ${bpo.effectiveDate} (${ageDays} days old). Our read uses current market data.`,
        });
      }
    }
  }

  const majorCount = findings.filter((f) => f.severity === "MAJOR").length;
  const minorCount = findings.filter((f) => f.severity === "MINOR").length;

  let verdictLevel: VerdictLevel;
  let verdict: string;
  if (majorCount >= 1) {
    verdictLevel = "MATERIAL_GAPS";
    verdict = `This valuation has ${majorCount} material gap${majorCount === 1 ? "" : "s"}. Independent review recommended before relying on it.`;
  } else if (minorCount >= 1) {
    verdictLevel = "MINOR_GAPS";
    verdict = `Broadly reasonable, with ${minorCount} item${minorCount === 1 ? "" : "s"} worth a second look.`;
  } else {
    verdictLevel = "ALIGNED";
    verdict = "This valuation aligns with our independent read of the market.";
  }

  const valueLine =
    bpoVal !== null && low !== null && high !== null
      ? `BPO ${usd(bpoVal)}  vs.  PropIntel range ${usd(low)}–${usd(high)}`
      : `PropIntel range ${usd(low)}–${usd(high)}`;

  return {
    findings: findings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)),
    majorCount,
    minorCount,
    verdictLevel,
    verdict,
    valueLine,
    ourValueLow: low,
    ourValueHigh: high,
    bpoValue: bpoVal,
  };
}

function severityRank(s: FindingSeverity): number {
  return s === "MAJOR" ? 0 : s === "MINOR" ? 1 : 2;
}
