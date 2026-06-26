// Portfolio roll-up: turn each property's full analysis into a traffic-light
// grade + a 3–5 line read, then grade the whole portfolio.

import type { MarketIntel } from "./market-data";
import type { MarketReport, RiskRating } from "./market-report";

export type Light = "GREEN" | "YELLOW" | "RED";

export interface PortfolioRow {
  address: string;
  ok: boolean;
  error: string | null;
  rating: RiskRating | null;
  light: Light | null;
  valueLow: number | null;
  valueHigh: number | null;
  monthsOfSupply: number | null;
  absorptionLevel: string;
  activePerSold: number | null;
  criticalFlags: number;
  advisoryFlags: number;
  topFlag: string | null;
  floodZone: string | null;
  vacancyPct: number | null;
  lines: string[];
}

export interface PortfolioGrade {
  grade: string; // A–F
  scorePct: number; // 0–100
  total: number;
  green: number;
  yellow: number;
  red: number;
  errors: number;
  headline: string;
}

function usd(n: number | null): string {
  return n === null ? "—" : "$" + Math.round(n).toLocaleString("en-US");
}

export function ratingToLight(rating: RiskRating): Light {
  if (rating === "LOW") return "GREEN";
  if (rating === "MODERATE") return "YELLOW";
  return "RED"; // HIGH or CRITICAL
}

export function buildPortfolioRow(address: string, intel: MarketIntel, report: MarketReport): PortfolioRow {
  const abs = intel.absorption;
  const v = intel.valueRange;
  const nb = intel.neighborhood;
  const topFlag = report.flags.find((f) => f.severity === "CRITICAL")?.line ?? report.flags[0]?.line ?? null;

  const lines: string[] = [];
  lines.push(`Value ${usd(v.low)}–${usd(v.high)} · ${abs.level}${abs.monthsOfSupply !== null ? `, ${abs.monthsOfSupply} mo supply` : ""}`);
  lines.push(
    `${intel.ring.totalComps} comps (${intel.ring.radiusReachedMiles} mi)${abs.activePerSold !== null ? ` · ${abs.activePerSold}:1 active:sold` : ""}${intel.medianDom !== null ? ` · ${intel.medianDom} DOM` : ""}`,
  );
  lines.push(`${report.criticalCount} critical / ${report.advisoryCount} advisory flags${topFlag ? ` — ${topFlag}` : ""}`);
  if (nb && (nb.floodZone || nb.vacancyRatePct != null)) {
    lines.push(
      `Flood ${nb.floodZone ?? "—"}${nb.inSFHA ? " (high risk)" : ""}${nb.vacancyRatePct != null ? ` · vacancy ${nb.vacancyRatePct}%` : ""}`,
    );
  }
  if (report.marketSupport !== "NOT_ASSESSED") lines.push(report.marketSupportLine);

  return {
    address,
    ok: true,
    error: null,
    rating: report.rating,
    light: ratingToLight(report.rating),
    valueLow: v.low,
    valueHigh: v.high,
    monthsOfSupply: abs.monthsOfSupply,
    absorptionLevel: abs.level,
    activePerSold: abs.activePerSold,
    criticalFlags: report.criticalCount,
    advisoryFlags: report.advisoryCount,
    topFlag,
    floodZone: nb?.floodZone ?? null,
    vacancyPct: nb?.vacancyRatePct ?? null,
    lines,
  };
}

export function errorRow(address: string, error: string): PortfolioRow {
  return {
    address,
    ok: false,
    error,
    rating: null,
    light: null,
    valueLow: null,
    valueHigh: null,
    monthsOfSupply: null,
    absorptionLevel: "—",
    activePerSold: null,
    criticalFlags: 0,
    advisoryFlags: 0,
    topFlag: null,
    floodZone: null,
    vacancyPct: null,
    lines: [error],
  };
}

export function gradePortfolio(rows: PortfolioRow[]): PortfolioGrade {
  const ok = rows.filter((r) => r.ok);
  const green = ok.filter((r) => r.light === "GREEN").length;
  const yellow = ok.filter((r) => r.light === "YELLOW").length;
  const red = ok.filter((r) => r.light === "RED").length;
  const errors = rows.length - ok.length;
  const total = ok.length;

  const scorePct = total ? Math.round(((green * 1 + yellow * 0.5) / total) * 100) : 0;
  let grade = "—";
  if (total) {
    if (scorePct >= 85) grade = "A";
    else if (scorePct >= 70) grade = "B";
    else if (scorePct >= 55) grade = "C";
    else if (scorePct >= 40) grade = "D";
    else grade = "F";
  }

  const headline = total
    ? `${green} clean · ${yellow} watch · ${red} problem${red === 1 ? "" : "s"}${errors ? ` · ${errors} not found` : ""}`
    : "No properties analyzed yet.";

  return { grade, scorePct, total, green, yellow, red, errors, headline };
}
