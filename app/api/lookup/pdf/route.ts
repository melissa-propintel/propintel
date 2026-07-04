// POST { intel, meta? } -> the Property Intelligence Report PDF.
//   P1 — The Verdict (rating + red flags)
//   P2 — Market Reality
//   P3 — Property & Neighborhood

import { NextRequest } from "next/server";
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, RGB } from "pdf-lib";
import type { MarketIntel } from "@/lib/market-data";
import { buildMarketReport, type RiskRating } from "@/lib/market-report";
import { REQUIRED_SHOTS } from "@/lib/photo-shots";
import { fetchOrderPhotos, fetchCondition, saveCondition, fetchOrderDocsText } from "@/lib/order-photos";
import { assessCondition, hasAnthropicKey, type ConditionAssessment } from "@/lib/condition";
import { runAnalysis, hasAnalysisKey, type ReportAnalysis } from "@/lib/analysis";
import { DISCLAIMER, TAGLINE } from "@/lib/report-standard";

export const runtime = "nodejs";
export const maxDuration = 300;

// Brand: forest green to match the site (pi-green-deep #0F6E56).
const NAVY = rgb(0.059, 0.431, 0.337);
const SLATE = rgb(0.28, 0.33, 0.34);
const LIGHT = rgb(0.6, 0.62, 0.58);
const RED = rgb(0.73, 0.11, 0.11);
const GREEN = rgb(0.082, 0.502, 0.239);
const WHITE = rgb(1, 1, 1);

const RATING_COLOR: Record<RiskRating, RGB> = {
  LOW: rgb(0.082, 0.502, 0.239),
  MODERATE: rgb(0.71, 0.43, 0.04),
  HIGH: rgb(0.76, 0.36, 0.04),
  CRITICAL: rgb(0.73, 0.11, 0.11),
};
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOT_Y = 38;

interface Ctx {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  page: PDFPage;
  y: number;
  address: string;
}

function usd(n: number | null): string {
  return n === null ? "—" : "$" + Math.round(n).toLocaleString("en-US");
}

// WinAnsi (Helvetica) can't encode arbitrary Unicode; normalize to a safe set.
function safe(s: string): string {
  if (!s) return "";
  return s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—―]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•◦▪‣]/g, "-")
    .replace(/[     ​]/g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E¡-ÿ]/g, "?");
}

function wrap(t: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = safe(t).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (font.widthOfTextAtSize(test, size) > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function drawFooter(ctx: Ctx) {
  ctx.page.drawLine({
    start: { x: MARGIN, y: FOOT_Y + 22 },
    end: { x: PAGE_W - MARGIN, y: FOOT_Y + 22 },
    thickness: 0.5,
    color: rgb(0.85, 0.87, 0.9),
  });
  let fy = FOOT_Y + 12;
  for (const l of wrap(DISCLAIMER, ctx.font, 6.5, CONTENT_W)) {
    ctx.page.drawText(l, { x: MARGIN, y: fy, size: 6.5, font: ctx.font, color: LIGHT });
    fy -= 8;
  }
}

function newPage(ctx: Ctx, withSlimHeader = false) {
  drawFooter(ctx);
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - MARGIN;
  if (withSlimHeader) {
    ctx.page.drawText("PROPINTEL", { x: MARGIN, y: PAGE_H - 34, size: 9, font: ctx.bold, color: NAVY });
    const a = ctx.address;
    ctx.page.drawText(a, {
      x: PAGE_W - MARGIN - ctx.font.widthOfTextAtSize(a, 8),
      y: PAGE_H - 34,
      size: 8,
      font: ctx.font,
      color: LIGHT,
    });
    ctx.page.drawLine({
      start: { x: MARGIN, y: PAGE_H - 40 },
      end: { x: PAGE_W - MARGIN, y: PAGE_H - 40 },
      thickness: 0.5,
      color: rgb(0.85, 0.87, 0.9),
    });
    ctx.y = PAGE_H - 56;
  }
}

function ensure(ctx: Ctx, needed: number) {
  if (ctx.y - needed < FOOT_Y + 36) newPage(ctx, true);
}

function text(
  ctx: Ctx,
  str: string,
  opts: { size?: number; font?: PDFFont; color?: RGB; indent?: number; gap?: number } = {},
) {
  const size = opts.size ?? 9;
  const font = opts.font ?? ctx.font;
  const color = opts.color ?? SLATE;
  const indent = opts.indent ?? 0;
  const lineH = size + 3;
  for (const l of wrap(str, font, size, CONTENT_W - indent)) {
    ensure(ctx, lineH);
    ctx.page.drawText(l, { x: MARGIN + indent, y: ctx.y - size, size, font, color });
    ctx.y -= lineH;
  }
  if (opts.gap) ctx.y -= opts.gap;
}

function sectionTitle(ctx: Ctx, title: string) {
  ensure(ctx, 22);
  ctx.page.drawText(title, { x: MARGIN, y: ctx.y - 12, size: 12, font: ctx.bold, color: NAVY });
  ctx.y -= 16;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_W - MARGIN, y: ctx.y },
    thickness: 1,
    color: NAVY,
  });
  ctx.y -= 10;
}

interface Meta {
  reportDate?: string;
  clientName?: string;
  orderNumber?: string;
  serviceLine?: string;
  serviceLineLabel?: string;
  testValue?: number | null;
  testLabel?: string;
  agentRead?: {
    recommendedPrice?: string;
    strategy?: string;
    areaComparison?: string;
    comments?: string;
    inspectionType?: string;
    inspectionDate?: string;
    occupancy?: string;
  };
}

export async function POST(req: NextRequest) {
  let intel: MarketIntel;
  let meta: Meta = {};
  try {
    const body = (await req.json()) as { intel: MarketIntel; meta?: Meta };
    intel = body.intel;
    meta = body.meta ?? {};
    if (!intel || !intel.subject) throw new Error("missing intel");
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const report = buildMarketReport(intel, { testValue: meta.testValue ?? null, testLabel: meta.testLabel });
  const s = intel.subject;
  const reportDate = meta.reportDate || new Date().toISOString().slice(0, 10);

  // Field photos + cached AI condition (only when an order with photos exists).
  // The condition assessment is generated separately (/api/condition) and cached,
  // so this PDF route stays fast and never blocks on an AI call.
  const orderPhotos = meta.orderNumber ? await fetchOrderPhotos(meta.orderNumber) : [];
  let condition: ConditionAssessment | null = meta.orderNumber ? await fetchCondition(meta.orderNumber) : null;
  // If there are field photos but no condition yet (or an older cache without the
  // repair breakdown), assess + cache now so the report ALWAYS reflects condition
  // (As-Is vs Repaired), not just the comps.
  const needsAssess = !condition || !Array.isArray(condition.repairs);
  if (meta.orderNumber && needsAssess && orderPhotos.length > 0 && hasAnthropicKey()) {
    try {
      condition = await assessCondition(orderPhotos);
      await saveCondition(meta.orderNumber, condition);
    } catch {
      condition = null;
    }
  }

  // CompanyCam-style value: Repaired (ARV) from comps − estimated repairs = As-Is.
  const repairLow = condition?.repairTotalLow ?? null;
  const repairHigh = condition?.repairTotalHigh ?? null;
  const hasRepairs = (repairLow ?? 0) > 0 || (repairHigh ?? 0) > 0;
  const arvLow = intel.valueRange.low;
  const arvHigh = intel.valueRange.high;
  const asIsLow =
    arvLow != null && repairHigh != null ? Math.max(0, arvLow - repairHigh)
    : arvLow != null && repairLow != null ? Math.max(0, arvLow - repairLow)
    : arvLow;
  const asIsHigh =
    arvHigh != null && repairLow != null ? Math.max(0, arvHigh - repairLow) : arvHigh;

  // ANALYSIS ENGINE — interpret everything (red flags, market read, condition->value,
  // a defensible as-is/repaired call that reflects the real buyer pool).
  let analysis: ReportAnalysis | null = null;
  if (hasAnalysisKey()) {
    const sourceDocs = meta.orderNumber ? await fetchOrderDocsText(meta.orderNumber) : "";
    try {
      analysis = await runAnalysis({
        sourceDocsText: sourceDocs || undefined,
        subject: {
          address: s.address, city: s.city, state: s.state, zip: s.zip, county: s.county,
          propertyType: s.propertyType, yearBuilt: s.yearBuilt, beds: s.beds, baths: s.baths, sqft: s.sqft, lotSize: s.lotSize,
          ownerNames: s.ownerNames, ownerType: s.ownerType, ownerOccupied: s.ownerOccupied,
          lastSaleDate: s.lastSaleDate, lastSalePrice: s.lastSalePrice, taxAssessedValue: s.taxAssessedValue,
          saleHistory: s.saleHistory,
        },
        comps: (intel.comps ?? []).slice(0, 30).map((c) => ({
          address: c.address, status: c.status, price: c.price, soldDate: c.soldDate, listedDate: c.listedDate,
          daysOnMarket: c.daysOnMarket, beds: c.beds, baths: c.baths, sqft: c.sqft, distanceMiles: c.distanceMiles,
        })),
        absorption: intel.absorption,
        compValueRange: intel.valueRange,
        compAsIs: { low: intel.valueRange.asIsLow, high: intel.valueRange.asIsHigh },
        compRepaired: { low: intel.valueRange.renovatedLow, high: intel.valueRange.renovatedHigh },
        rent: intel.rent,
        condition: condition
          ? { grade: condition.grade, gradeLabel: condition.gradeLabel, habitability: condition.habitability,
              exterior: condition.exterior, interior: condition.interior, damage: condition.damage, summary: condition.summary,
              repairs: condition.repairs, repairTotalLow: condition.repairTotalLow, repairTotalHigh: condition.repairTotalHigh }
          : null,
        fieldAgentRead: meta.agentRead
          ? {
              recommendedPrice: meta.agentRead.recommendedPrice ?? null,
              strategy: meta.agentRead.strategy ?? null,
              areaComparison: meta.agentRead.areaComparison ?? null,
              comments: meta.agentRead.comments ?? null,
            }
          : null,
      });
    } catch {
      analysis = null;
    }
  }

  // Prefer the engine's value call (it applies the condition->buyer-pool discount);
  // fall back to the ARV-minus-repairs arithmetic.
  const vAsIsLow = analysis?.asIsLow ?? asIsLow;
  const vAsIsHigh = analysis?.asIsHigh ?? asIsHigh;
  const vRepLow = analysis?.repairedLow ?? arvLow;
  const vRepHigh = analysis?.repairedHigh ?? arvHigh;
  const showAsIs = hasRepairs || analysis?.asIsLow != null;

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { doc, font, bold, page: doc.addPage([PAGE_W, PAGE_H]), y: PAGE_H - MARGIN, address: safe(s.address) };

  // ===================== PAGE 1 — THE VERDICT =====================
  ctx.page.drawRectangle({ x: 0, y: PAGE_H - 56, width: PAGE_W, height: 56, color: NAVY });
  ctx.page.drawText("PROPINTEL", { x: MARGIN, y: PAGE_H - 30, size: 16, font: bold, color: WHITE });
  const hdr = meta.serviceLineLabel || "Property Intelligence Report";
  ctx.page.drawText(hdr, {
    x: PAGE_W - MARGIN - font.widthOfTextAtSize(hdr, 9),
    y: PAGE_H - 26,
    size: 9,
    font,
    color: rgb(0.85, 0.94, 0.91),
  });
  ctx.page.drawText(TAGLINE, { x: MARGIN, y: PAGE_H - 46, size: 8, font, color: rgb(0.72, 0.86, 0.80) });
  ctx.y = PAGE_H - 74;

  const metaLine = `${meta.orderNumber ? "Order " + meta.orderNumber + "  ·  " : ""}${reportDate}${
    meta.clientName ? "  ·  Client: " + meta.clientName : ""
  }  ·  Automated market read`;
  text(ctx, metaLine, { size: 8, color: LIGHT });
  text(ctx, s.address, { size: 15, font: bold, color: NAVY });
  text(ctx, [s.city, s.state, s.zip].filter(Boolean).join(", "), { size: 8, color: SLATE, gap: 4 });

  // Rich public-record header (reference-report style)
  if (analysis?.header) {
    const h = analysis.header;
    const forec = [h.auctionDate !== "—" ? `auction ${h.auctionDate}` : "", h.filingDate !== "—" ? `filing ${h.filingDate}` : ""].filter(Boolean).join("  ·  ");
    const ar = meta.agentRead;
    const insp = ar
      ? [ar.inspectionDate, ar.inspectionType, ar.occupancy && ar.occupancy !== "Unknown" ? `${ar.occupancy}` : ""].filter(Boolean).join("  ·  ")
      : "";
    const hrowsAll: [string, string][] = [
      ["Parcel ID", h.parcelId],
      ["Legal", h.legal],
      ["Owner of record", s.ownerNames && s.ownerNames.length ? s.ownerNames.join("; ") : h.ownerOfRecord],
      ["Foreclosure", forec || "—"],
      ["Inspection", insp || "—"],
      ["Report · Field agent", `${reportDate}  ·  Alabama Realty Servicing`],
    ];
    const hrows = hrowsAll.filter(([, v]) => v && v !== "—");
    for (const [k, v] of hrows) {
      ensure(ctx, 9);
      ctx.page.drawText(`${k}:`, { x: MARGIN, y: ctx.y - 6, size: 7.5, font: bold, color: LIGHT });
      for (const [i, l] of wrap(v, font, 7.5, CONTENT_W - 112).entries()) {
        if (i > 0) ensure(ctx, 9);
        ctx.page.drawText(l, { x: MARGIN + 108, y: ctx.y - 6, size: 7.5, font, color: SLATE });
        ctx.y -= 9;
      }
    }
    ctx.y -= report.mlsRequired ? 2 : 4;
  } else {
    ctx.y -= report.mlsRequired ? 2 : 4;
  }

  // Data-confidence banner — thin/rural or no-record data that needs agent comps.
  if (report.mlsRequired) {
    const isLow = report.confidenceLevel === "LOW";
    ensure(ctx, 40);
    const pTop = ctx.y;
    const bg = isLow ? rgb(0.99, 0.9, 0.9) : rgb(0.99, 0.93, 0.86);
    const bd = isLow ? RED : rgb(0.71, 0.43, 0.04);
    ctx.page.drawRectangle({ x: MARGIN, y: pTop - 36, width: CONTENT_W, height: 36, color: bg, borderColor: bd, borderWidth: 1 });
    ctx.page.drawText(isLow ? "PRELIMINARY — AGENT COMPS / MLS REQUIRED" : "VERIFY — SUBJECT UNCONFIRMED · AGENT COMPS RECOMMENDED", { x: MARGIN + 8, y: pTop - 13, size: 8.5, font: bold, color: bd });
    for (const [i, l] of wrap(report.confidenceReasons[0] ?? report.confidenceLine, font, 7.5, CONTENT_W - 16).slice(0, 2).entries()) {
      ctx.page.drawText(l, { x: MARGIN + 8, y: pTop - 24 - i * 9, size: 7.5, font, color: SLATE });
    }
    ctx.y = pTop - 44;
  }

  // Verdict overrides from the value engine (Rule 6: grade DERIVED from value+flags).
  const gradeColor = (g: string) => (g === "A" || g === "B" ? rgb(0.13, 0.5, 0.33) : g === "C" ? rgb(0.72, 0.45, 0.05) : rgb(0.6, 0.15, 0.15));
  const vGrade = analysis?.riskGrade || report.gradeLetter;
  const vGradeDesc = analysis?.riskLabel || report.gradeDescriptor;
  const vRatingLine = analysis?.verdictLine || report.ratingLine;
  const vRatingColor = analysis?.riskGrade ? gradeColor(analysis.riskGrade) : RATING_COLOR[report.rating];
  const vCrit = analysis ? analysis.redFlags.filter((f) => f.severity === "CRITICAL").length : report.criticalCount;
  const vAdv = analysis ? analysis.redFlags.filter((f) => f.severity !== "CRITICAL").length : report.advisoryCount;
  // Suggested list must match the engine's tier — a distressed/not-financeable
  // subject lists in its as-is range, NOT at the retail ARV top.
  const vSuggestedList = analysis
    ? analysis.financeable === false || analysis.subjectTier === "distressed"
      ? analysis.asIsHigh ?? report.suggestedListPrice
      : analysis.repairedHigh ?? report.suggestedListPrice
    : report.suggestedListPrice;

  // Rating banner — letter grade + descriptor (v1.1)
  ensure(ctx, 46);
  const bTop = ctx.y;
  ctx.page.drawRectangle({ x: MARGIN, y: bTop - 44, width: CONTENT_W, height: 44, color: vRatingColor });
  ctx.page.drawText("OVERALL RISK", { x: MARGIN + 10, y: bTop - 14, size: 7, font: bold, color: rgb(1, 1, 1) });
  ctx.page.drawText(`${vGrade} — ${vGradeDesc}`, { x: MARGIN + 10, y: bTop - 33, size: 17, font: bold, color: WHITE });
  let ry = bTop - 13;
  for (const l of wrap(vRatingLine, font, 7.5, 230).slice(0, 3)) {
    ctx.page.drawText(l, { x: PAGE_W - MARGIN - 240, y: ry, size: 7.5, font, color: rgb(0.92, 0.97, 0.95) });
    ry -= 10;
  }
  ctx.y = bTop - 54;

  // Grades row — value-first when there's no loan/list price to test.
  const grades: [string, string][] = report.hasTestValue
    ? [
        ["MARKET SUPPORT", report.marketSupport.replace("_", " ")],
        ["SALEABILITY", report.saleability],
        ["CONDITION", condition?.grade ?? "Field"],
        ["ABSORPTION", intel.absorption.level],
        ["RED FLAGS", `${vCrit}C · ${vAdv}A`],
      ]
    : [
        ["SALEABILITY", report.saleability],
        ["SUGGESTED LIST", usd(vSuggestedList)],
        ["CONDITION", condition?.grade ?? "Field"],
        ["ABSORPTION", intel.absorption.level],
        ["RED FLAGS", `${vCrit}C · ${vAdv}A`],
      ];
  ensure(ctx, 34);
  const cellW = CONTENT_W / grades.length;
  const gTop = ctx.y;
  grades.forEach(([label, val], i) => {
    const cx = MARGIN + i * cellW;
    ctx.page.drawRectangle({ x: cx, y: gTop - 30, width: cellW - 4, height: 30, borderColor: rgb(0.88, 0.9, 0.93), borderWidth: 0.75 });
    ctx.page.drawText(label, { x: cx + 4, y: gTop - 11, size: 5.5, font: bold, color: LIGHT });
    for (const l of wrap(val, bold, 8, cellW - 8).slice(0, 2)) {
      ctx.page.drawText(l, { x: cx + 4, y: gTop - 22, size: 8, font: bold, color: NAVY });
    }
  });
  ctx.y = gTop - 42;

  // Value + absorption hero
  ensure(ctx, 48);
  const vTop = ctx.y;
  const halfW = (CONTENT_W - 10) / 2;
  const oversupplied = intel.absorption.level === "SEVERE" || intel.absorption.level === "OVERSUPPLIED";
  ctx.page.drawRectangle({ x: MARGIN, y: vTop - 46, width: halfW, height: 46, borderColor: rgb(0.85, 0.87, 0.9), borderWidth: 0.75 });
  if (showAsIs) {
    // Condition-adjusted: lead with As-Is, show Repaired/ARV underneath.
    ctx.page.drawText("AS-IS VALUE (CONDITION-ADJUSTED)", { x: MARGIN + 8, y: vTop - 13, size: 6, font: bold, color: rgb(0.55, 0.32, 0.02) });
    ctx.page.drawText(`${usd(vAsIsLow)} – ${usd(vAsIsHigh)}`, { x: MARGIN + 8, y: vTop - 31, size: 15, font: bold, color: NAVY });
    ctx.page.drawText(`Repaired / ARV ${usd(vRepLow)} – ${usd(vRepHigh)}${hasRepairs ? `  ·  repairs ~${usd(repairLow)}–${usd(repairHigh)}` : ""}`, { x: MARGIN + 8, y: vTop - 41, size: 6, font, color: LIGHT });
  } else {
    ctx.page.drawText(report.mlsRequired ? "PRELIMINARY VALUE (UNVERIFIED)" : "INDICATED AS-IS VALUE RANGE", { x: MARGIN + 8, y: vTop - 13, size: 6, font: bold, color: report.mlsRequired ? rgb(0.55, 0.32, 0.02) : LIGHT });
    ctx.page.drawText(`${usd(intel.valueRange.low)} – ${usd(intel.valueRange.high)}`, { x: MARGIN + 8, y: vTop - 31, size: 15, font: bold, color: NAVY });
    for (const l of wrap(intel.valueRange.basis, font, 6, halfW - 16).slice(0, 1)) ctx.page.drawText(l, { x: MARGIN + 8, y: vTop - 41, size: 6, font, color: LIGHT });
  }
  const ax = MARGIN + halfW + 10;
  ctx.page.drawRectangle({ x: ax, y: vTop - 46, width: halfW, height: 46, color: oversupplied ? rgb(0.99, 0.95, 0.95) : undefined, borderColor: oversupplied ? rgb(0.9, 0.7, 0.7) : rgb(0.85, 0.87, 0.9), borderWidth: 0.75 });
  ctx.page.drawText("ABSORPTION", { x: ax + 8, y: vTop - 13, size: 6, font: bold, color: LIGHT });
  const mos = intel.absorption.monthsOfSupply !== null ? `${intel.absorption.monthsOfSupply} mo supply` : "No clearance";
  ctx.page.drawText(mos, { x: ax + 8, y: vTop - 31, size: 15, font: bold, color: oversupplied ? RED : NAVY });
  for (const l of wrap(intel.absorption.ratioLine, font, 6, halfW - 16).slice(0, 1)) ctx.page.drawText(l, { x: ax + 8, y: vTop - 41, size: 6, font, color: SLATE });
  ctx.y = vTop - 56;

  // BOTTOM LINE — the plain-English wrap the lender reads first
  if (analysis?.bottomLine) {
    ensure(ctx, 22);
    const blTop = ctx.y;
    const blLines = wrap(analysis.bottomLine, font, 8.5, CONTENT_W - 16);
    const blH = 16 + blLines.length * 11;
    ctx.page.drawRectangle({ x: MARGIN, y: blTop - blH, width: CONTENT_W, height: blH, color: rgb(0.96, 0.97, 0.99), borderColor: NAVY, borderWidth: 0.75 });
    ctx.page.drawText("BOTTOM LINE", { x: MARGIN + 8, y: blTop - 11, size: 8, font: bold, color: NAVY });
    let by = blTop - 24;
    for (const l of blLines) {
      ctx.page.drawText(l, { x: MARGIN + 8, y: by, size: 8.5, font, color: rgb(0.15, 0.18, 0.25) });
      by -= 11;
    }
    ctx.y = blTop - blH - 8;
  }

  // RED FLAGS — SEV · CATEGORY · FINDING table, surfaced prominently
  if (analysis && analysis.redFlags.length > 0) {
    ensure(ctx, 16);
    text(ctx, `RED FLAGS — ${vCrit} critical · ${vAdv} advisory`, { size: 9, font: bold, color: RED, gap: 3 });
    const sevW = 40;
    const catW = 118;
    const findX = MARGIN + sevW + catW;
    for (const f of analysis.redFlags) {
      const catLines = wrap(f.category, bold, 8, catW - 6);
      const findLines = wrap(f.finding, font, 8, CONTENT_W - sevW - catW);
      const rowH = Math.max(catLines.length, findLines.length, 1) * 10 + 4;
      ensure(ctx, rowH);
      const rowTop = ctx.y;
      const sevColor = f.severity === "CRITICAL" ? RED : rgb(0.72, 0.45, 0.05);
      ctx.page.drawText(f.severity === "CRITICAL" ? "CRIT" : "ADV", { x: MARGIN, y: rowTop - 8, size: 7, font: bold, color: sevColor });
      catLines.forEach((l, i) => ctx.page.drawText(l, { x: MARGIN + sevW, y: rowTop - 8 - i * 10, size: 8, font: bold, color: SLATE }));
      findLines.forEach((l, i) => ctx.page.drawText(l, { x: findX, y: rowTop - 8 - i * 10, size: 8, font, color: rgb(0.3, 0.3, 0.3) }));
      ctx.y = rowTop - rowH;
    }
    ctx.y -= 6;
  }

  // MARKET READ — the market synthesis
  if (analysis?.marketRead) {
    ensure(ctx, 14);
    text(ctx, "MARKET READ", { size: 9, font: bold, color: NAVY, gap: 2 });
    text(ctx, analysis.marketRead, { size: 8.5, gap: 5 });
  }

  // THE PATHS & ECONOMICS — factual, not a recommendation
  if (analysis?.dispositionCall) {
    ensure(ctx, 14);
    text(ctx, "THE PATHS & ECONOMICS", { size: 9, font: bold, color: rgb(0.07, 0.4, 0.3), gap: 2 });
    text(ctx, analysis.dispositionCall, { size: 8.5, color: rgb(0.1, 0.3, 0.22), gap: 6 });
  }

  // FOR YOUR DECISION — the facts a buyer/owner needs, on page 1 (data, not advice).
  // Fall back to the always-filled red flags so the section can never come up empty.
  if (analysis) {
    const crit = analysis.redFlags.filter((f) => f.severity === "CRITICAL");
    const adv = analysis.redFlags.filter((f) => f.severity === "ADVISORY");
    const obstacle = analysis.biggestObstacle || (crit[0] ? `${crit[0].category}: ${crit[0].finding}` : "");
    const risk = analysis.biggestRisk || (adv[0] ? `${adv[0].category}: ${adv[0].finding}` : crit[1] ? `${crit[1].category}: ${crit[1].finding}` : "");
    const area = analysis.areaDifference || analysis.marketRead;
    const facts: [string, string][] = [
      ["What makes this area different", area],
      ["Biggest competition", analysis.competition],
      ["Biggest obstacle", obstacle],
      ["Biggest risk", risk],
    ];
    ensure(ctx, 14);
    text(ctx, "FOR YOUR DECISION", { size: 9, font: bold, color: NAVY, gap: 2 });
    for (const [k, v] of facts) {
      if (!v) continue;
      ensure(ctx, 11);
      ctx.page.drawText(`${k}:`, { x: MARGIN, y: ctx.y - 8, size: 8, font: bold, color: SLATE });
      for (const [i, l] of wrap(v, font, 8, CONTENT_W - 150).entries()) {
        if (i > 0) ensure(ctx, 10);
        ctx.page.drawText(l, { x: MARGIN + 150, y: ctx.y - 8, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
        ctx.y -= 10;
      }
      ctx.y -= 1;
    }
    ctx.y -= 5;
  }

  // REAL MARKET callout (v1.1 page-1 differentiator)
  ensure(ctx, 30);
  const rmTop = ctx.y;
  ctx.page.drawRectangle({ x: MARGIN, y: rmTop - 28, width: CONTENT_W, height: 28, color: rgb(0.93, 0.96, 0.94), borderColor: GREEN, borderWidth: 0.75 });
  ctx.page.drawText(`REAL MARKET: ${report.marketStrength.toUpperCase()}`, { x: MARGIN + 8, y: rmTop - 12, size: 8, font: bold, color: rgb(0.07, 0.4, 0.3) });
  for (const l of wrap(report.realMarketLine, font, 7.5, CONTENT_W - 16).slice(0, 1)) {
    ctx.page.drawText(l, { x: MARGIN + 8, y: rmTop - 23, size: 7.5, font, color: SLATE });
  }
  ctx.y = rmTop - 38;

  // KEY NUMBERS — dense two-column block
  text(ctx, "KEY NUMBERS", { size: 9, font: bold, color: NAVY, gap: 3 });
  {
    // Replace the comp engine's wide/blended value lines with the value engine's
    // TIGHT as-is + ARV (a value, not the 200-home spread); fix beds/baths to the
    // reconciled count; align suggested list to the tier.
    let keyNumbers = report.keyNumbers;
    if (analysis) {
      const ov: Record<string, string> = {};
      if (vAsIsLow != null) ov["As-is / distressed value"] = `${usd(vAsIsLow)} – ${usd(vAsIsHigh)}`;
      if (vRepLow != null) ov["Renovated / retail value"] = `${usd(vRepLow)} – ${usd(vRepHigh)}`;
      ov["Suggested list price"] = usd(vSuggestedList);
      if (analysis.trueBeds != null || analysis.trueBaths != null)
        ov["Beds / baths"] = `${analysis.trueBeds ?? "—"} / ${analysis.trueBaths ?? "—"}`;
      keyNumbers = report.keyNumbers
        .filter((f) => f.label !== "Indicated value (blended)")
        .map((f) => (ov[f.label] != null ? { ...f, value: ov[f.label] } : f));
    }
    const colGap = 12;
    const colW2 = (CONTENT_W - colGap) / 2;
    const rows = Math.ceil(keyNumbers.length / 2);
    const kTop = ctx.y;
    keyNumbers.forEach((f, i) => {
      const col = Math.floor(i / rows);
      const rowi = i % rows;
      const x = MARGIN + col * (colW2 + colGap);
      const yy = kTop - rowi * 12 - 8;
      ctx.page.drawText(f.label, { x, y: yy, size: 7.5, font, color: LIGHT });
      const val = f.value.length > 34 ? f.value.slice(0, 33) + "…" : f.value;
      ctx.page.drawText(val, { x: x + colW2 - bold.widthOfTextAtSize(val, 7.5), y: yy, size: 7.5, font: bold, color: SLATE });
    });
    ctx.y = kTop - rows * 12 - 8;
  }

  // Red flags + value summary — SKIP when the value engine ran (it renders its own
  // authoritative flag table + one value on page 1; these old lines would contradict).
  if (!analysis) {
  text(ctx, `RED FLAGS — ${report.criticalCount} critical · ${report.advisoryCount} advisory`, { size: 10, font: bold, color: NAVY, gap: 3 });
  if (report.flags.length === 0) {
    text(ctx, "No critical or advisory market flags from available data.", { size: 9, gap: 4 });
  } else {
    for (const f of report.flags) {
      ensure(ctx, 14);
      const tagColor = f.severity === "CRITICAL" ? RED : rgb(0.71, 0.43, 0.04);
      ctx.page.drawText(f.severity, { x: MARGIN, y: ctx.y - 8, size: 7, font: bold, color: tagColor });
      const fx = MARGIN + 52;
      const lines = wrap(`${f.category}: ${f.line}`, font, 8.5, CONTENT_W - 52);
      lines.forEach((l, idx) => {
        if (idx > 0) ensure(ctx, 11);
        ctx.page.drawText(l, { x: fx, y: ctx.y - 8, size: 8.5, font, color: SLATE });
        ctx.y -= 11;
      });
      ctx.y -= 3;
    }
  }
  ctx.y -= 2;
  text(ctx, report.marketSupportLine, { size: 8, color: LIGHT });
  }

  // ===================== PAGE 2 — REAL MARKET (§2) =====================
  newPage(ctx, true);
  sectionTitle(ctx, "Real Market");
  text(ctx, `${report.marketStrength} market.`, { size: 11, font: bold, color: NAVY, gap: 1 });
  text(ctx, report.realMarketLine, { size: 9, gap: 5 });
  text(ctx, "BUYER POOL", { size: 8, font: bold, color: LIGHT, gap: 1 });
  text(ctx, analysis?.buyerPool ? `${analysis.buyerPool}. ${report.buyerPool}` : report.buyerPool, { size: 9, gap: 5 });
  text(ctx, "HALF-MILE RADIUS", { size: 8, font: bold, color: LIGHT, gap: 1 });
  text(ctx, report.halfMileStory, { size: 9, gap: 6 });
  text(ctx, "ABSORPTION", { size: 8, font: bold, color: LIGHT, gap: 1 });
  text(ctx, intel.absorption.headline, { size: 10, font: bold, color: NAVY, gap: 2 });
  text(ctx, intel.absorption.ratioLine, { size: 9 });
  text(
    ctx,
    `${intel.ring.activeCount} active · ${intel.ring.pendingCount} pending · ${intel.ring.soldCount} sold in ${intel.ring.windowMonths} mo · radius ${intel.ring.radiusReachedMiles} mi${
      intel.medianDom !== null ? ` · median ${intel.medianDom} DOM` : ""
    }`,
    { size: 8, color: LIGHT, gap: 8 },
  );

  if (intel.priceBands.length > 0) {
    text(ctx, "WHAT'S MOVING VS. SITTING", { size: 9, font: bold, color: NAVY, gap: 4 });
    // legend
    const GRAY = rgb(0.74, 0.76, 0.72);
    ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 4, width: 12, height: 4, color: GRAY });
    ctx.page.drawText("active (sitting)", { x: MARGIN + 16, y: ctx.y - 4, size: 6.5, font, color: LIGHT });
    ctx.page.drawRectangle({ x: MARGIN + 92, y: ctx.y - 4, width: 12, height: 4, color: GREEN });
    ctx.page.drawText("sold (moving)", { x: MARGIN + 108, y: ctx.y - 4, size: 6.5, font, color: LIGHT });
    ctx.y -= 14;
    const barX = MARGIN + 92;
    const BAR_W = 250;
    const maxCount = Math.max(1, ...intel.priceBands.map((b) => Math.max(b.active, b.sold)));
    for (const b of intel.priceBands) {
      ensure(ctx, 20);
      const col = b.verdict === "MOVING" ? GREEN : b.verdict === "SITTING" ? RED : SLATE;
      ctx.page.drawText(b.label, { x: MARGIN, y: ctx.y - 9, size: 7.5, font, color: SLATE });
      const aw = (b.active / maxCount) * BAR_W;
      ctx.page.drawRectangle({ x: barX, y: ctx.y - 6, width: b.active > 0 ? Math.max(aw, 1.5) : 0, height: 4, color: GRAY });
      ctx.page.drawText(String(b.active), { x: barX + aw + 4, y: ctx.y - 7, size: 6.5, font, color: LIGHT });
      const sw = (b.sold / maxCount) * BAR_W;
      ctx.page.drawRectangle({ x: barX, y: ctx.y - 13, width: b.sold > 0 ? Math.max(sw, 1.5) : 0, height: 4, color: GREEN });
      ctx.page.drawText(String(b.sold), { x: barX + sw + 4, y: ctx.y - 14, size: 6.5, font, color: LIGHT });
      ctx.page.drawText(b.verdict, { x: MARGIN + CONTENT_W - 42, y: ctx.y - 10, size: 7, font: bold, color: col });
      ctx.y -= 20;
    }
    ctx.y -= 6;
  }

  // ===================== MARKET INTELLIGENCE (§5) =====================
  newPage(ctx, true);
  sectionTitle(ctx, "Market Analysis");
  text(ctx, "VALUE & METHODOLOGY", { size: 9, font: bold, color: NAVY, gap: 2 });
  if (analysis) {
    text(ctx, `As-is value ${usd(vAsIsLow)} – ${usd(vAsIsHigh)}   ·   Repaired / ARV ${usd(vRepLow)} – ${usd(vRepHigh)}   ·   spread ~${usd(analysis.spread)}.`, { size: 10, font: bold, color: NAVY, gap: 1 });
  } else {
    text(ctx, `Indicated as-is value range: ${usd(intel.valueRange.low)} – ${usd(intel.valueRange.high)}.`, { size: 10, font: bold, color: NAVY, gap: 1 });
  }
  text(ctx, report.valueMethodology, { size: 9, gap: 2 });
  if (analysis && (analysis.financeable === false || analysis.subjectTier === "distressed")) {
    text(ctx, `Suggested list (as-is / investor): ${usd(vSuggestedList)} — price to the distressed tier; the retail ${usd(vRepLow)}–${usd(vRepHigh)} requires the full rehab and is not achievable as-is.`, { size: 9, gap: 6 });
  } else if (report.suggestedListPrice) {
    text(ctx, `Suggested list price (normal window): ${usd(vSuggestedList)} — ${report.saleabilityLine}`, { size: 9, gap: 6 });
  } else {
    ctx.y -= 4;
  }

  // Rent analysis (v1.1 KEY NUMBERS requirement)
  text(ctx, "RENT ANALYSIS", { size: 9, font: bold, color: NAVY, gap: 2 });
  if (intel.rent && (intel.rent.estimate || intel.rent.low || intel.rent.high)) {
    const r = intel.rent;
    text(ctx, `Supportable long-term rent: ${usd(r.low ?? r.estimate)} – ${usd(r.high ?? r.estimate)} / month${r.estimate ? ` (estimate ${usd(r.estimate)})` : ""}.`, { size: 9, gap: 1 });
    const grm = r.estimate && intel.valueRange.high ? (intel.valueRange.high / (r.estimate * 12)).toFixed(1) : null;
    if (grm) text(ctx, `Gross rent multiplier ~${grm}x at the high end of value — a quick yield check for investor buyers.`, { size: 8, color: LIGHT, gap: 6 });
    else ctx.y -= 4;
  } else {
    text(ctx, "Rent estimate not available for this property.", { size: 8, color: LIGHT, gap: 6 });
  }

  // Field agent's read — the licensed agent's on-the-ground opinion (if provided).
  const ar = meta.agentRead;
  if (ar && (ar.recommendedPrice || ar.strategy || ar.areaComparison || ar.comments)) {
    text(ctx, "FIELD AGENT'S READ", { size: 9, font: bold, color: NAVY, gap: 2 });
    if (ar.recommendedPrice) text(ctx, `Recommended price: ${ar.recommendedPrice}`, { size: 10, font: bold, color: NAVY, gap: 1 });
    if (ar.strategy) text(ctx, `Strategy: ${ar.strategy}`, { size: 9, gap: 1 });
    if (ar.areaComparison) text(ctx, `Vs. the area: ${ar.areaComparison}`, { size: 9, gap: 1 });
    if (ar.comments) text(ctx, ar.comments, { size: 9, gap: 1 });
    text(ctx, "The licensed agent's on-the-ground opinion — context the comps can't capture.", { size: 7.5, color: LIGHT, gap: 6 });
  }

  // ===================== COMPARABLES — Set B (best matches the value is built on) =====================
  const allSold = intel.comps.filter((c) => c.status === "sold").length;
  const allActive = intel.comps.filter((c) => c.status === "active").length;
  const solds = intel.bestComps.sold;
  const actives = intel.bestComps.active;
  const compRow = (c: { address: string; price: number | null; distanceMiles: number; beds: number | null; baths: number | null; sqft: number | null; pricePerSqft: number | null; daysOnMarket: number | null; soldDate: string | null }, header: () => void) => {
    if (ctx.y - 11 < FOOT_Y + 36) { newPage(ctx, true); header(); }
    const addr = c.address.length > 30 ? c.address.slice(0, 29) + "…" : c.address;
    ctx.page.drawText(addr, { x: MARGIN, y: ctx.y - 8, size: 7.5, font, color: SLATE });
    ctx.page.drawText(usd(c.price), { x: MARGIN + 175, y: ctx.y - 8, size: 7.5, font, color: SLATE });
    ctx.page.drawText(`${c.beds ?? "—"}/${c.baths ?? "—"}`, { x: MARGIN + 235, y: ctx.y - 8, size: 7.5, font, color: SLATE });
    ctx.page.drawText(c.sqft ? c.sqft.toLocaleString() : "—", { x: MARGIN + 280, y: ctx.y - 8, size: 7.5, font, color: SLATE });
    ctx.page.drawText(c.pricePerSqft ? "$" + c.pricePerSqft : "—", { x: MARGIN + 335, y: ctx.y - 8, size: 7.5, font, color: SLATE });
    ctx.page.drawText(`${c.distanceMiles}mi`, { x: MARGIN + 385, y: ctx.y - 8, size: 7.5, font, color: SLATE });
    ctx.page.drawText(c.daysOnMarket != null ? String(c.daysOnMarket) : "—", { x: MARGIN + 435, y: ctx.y - 8, size: 7.5, font, color: SLATE });
    ctx.y -= 11;
  };
  const compHeader = () => {
    if (ctx.y - 12 < FOOT_Y + 36) newPage(ctx, true);
    const h: [number, string][] = [[0, "ADDRESS"], [175, "PRICE"], [235, "BD/BA"], [280, "SQFT"], [335, "$/SF"], [385, "DIST"], [435, "DOM"]];
    for (const [x, s] of h) ctx.page.drawText(s, { x: MARGIN + x, y: ctx.y - 8, size: 6, font: bold, color: LIGHT });
    ctx.y -= 12;
  };

  text(ctx, "The best-matched comparables, ranked by similarity to the subject. The value is built from the best SOLD comps; the full set in competition drives the market read.", { size: 8, color: LIGHT, gap: 5 });

  text(ctx, `BEST SOLD COMPS — VALUE (${solds.length}${allSold > solds.length ? ` of ${allSold} sold in competition` : ""})`, { size: 9, font: bold, color: NAVY, gap: 3 });
  if (solds.length) { compHeader(); for (const c of solds) compRow(c, compHeader); ctx.y -= 6; }
  else text(ctx, "No sold comps in the window.", { size: 8, color: LIGHT, gap: 6 });

  text(ctx, `BEST ACTIVE — COMPETITION (${actives.length}${allActive > actives.length ? ` of ${allActive} active in competition` : ""})`, { size: 9, font: bold, color: NAVY, gap: 3 });
  if (actives.length) { compHeader(); for (const c of actives) compRow(c, compHeader); ctx.y -= 6; }
  else text(ctx, "No active listings in the window.", { size: 8, color: LIGHT, gap: 6 });

  text(ctx, "THREE LENSES", { size: 9, font: bold, color: NAVY, gap: 3 });
  if (analysis) {
    const lenses: [string, string][] = [
      ["INVESTOR", `As-is (cash) ${usd(vAsIsLow)}–${usd(vAsIsHigh)}; repaired ceiling ${usd(vRepLow)}–${usd(vRepHigh)}; spread ~${usd(analysis.spread)}.${analysis.competition ? " Competition: " + analysis.competition : ""}`],
      ["LENDER", `As-is collateral ${usd(vAsIsLow)}–${usd(vAsIsHigh)}. Financeable as-is: ${analysis.financeable === false ? "no — buyer pool is " + (analysis.buyerPool || "cash/hard-money") : "yes"}.${analysis.biggestObstacle ? " Title: " + analysis.biggestObstacle : ""}`],
      ["END USER", analysis.financeable === false ? `Not an owner-occupant purchase as-is (fails FHA/conventional); the finished product sells in the ${usd(vRepLow)}–${usd(vRepHigh)} retail band.` : `Financeable; comparable homes clear in the ${usd(vRepLow)}–${usd(vRepHigh)} band.`],
    ];
    for (const [k, v] of lenses) {
      text(ctx, k, { size: 7.5, font: bold, color: LIGHT, gap: 1 });
      text(ctx, v, { size: 9, indent: 4, gap: 5 });
    }
  } else {
    for (const l of intel.lenses) {
      text(ctx, l.lens.toUpperCase(), { size: 7.5, font: bold, color: LIGHT, gap: 1 });
      text(ctx, l.takeaway, { size: 9, indent: 4, gap: 5 });
    }
  }

  // ===================== TAX RECORD vs REALITY (§3) + PROPERTY + CONDITION =====================
  newPage(ctx, true);
  sectionTitle(ctx, "Tax Record vs. Reality");
  if (analysis) {
    const tr = analysis.taxRecord;
    text(ctx, "TAX / PUBLIC RECORD SUMMARY", { size: 9, font: bold, color: NAVY, gap: 2 });
    // Public-record basics fill deterministically from the Rentcast subject data;
    // the CRS-only fields come from the docs via the engine (— until a CRS is uploaded).
    const pick2 = (a: string, b: string) => (a && a !== "—" ? a : b);
    const trRowsAll: [string, string][] = [
      ["Year built", pick2(tr.yearBuilt, s.yearBuilt ? String(s.yearBuilt) : "—")],
      ["Beds / baths (record)", tr.bedsBaths],
      ["Square footage", pick2(tr.sqft, s.sqft ? `${s.sqft.toLocaleString()} sqft` : "—")],
      ["Lot size", pick2(tr.lotSize, s.lotSize ? (s.lotSize < 100 ? `${s.lotSize} ac` : `${s.lotSize.toLocaleString()} sqft`) : "—")],
      ["Construction", tr.construction],
      ["HVAC", tr.hvac],
      ["Utilities", tr.utilities],
      ["Zoning", tr.zoning],
      ["FEMA flood zone", tr.floodZone],
      ["Tax appraisal", pick2(tr.taxAppraisal, s.taxAssessedValue != null ? usd(s.taxAssessedValue) : "—")],
      ["Assessment", tr.assessment],
      ["Annual taxes", tr.annualTaxes],
      ["Payment history", tr.paymentHistory],
      ["Last sale", s.lastSalePrice != null ? `${usd(s.lastSalePrice)}${s.lastSaleDate ? " · " + s.lastSaleDate : ""}` : "—"],
    ];
    const trRows = trRowsAll.filter(([, v]) => v && v !== "—");
    for (const [k, v] of trRows) {
      ensure(ctx, 11);
      ctx.page.drawText(k, { x: MARGIN, y: ctx.y - 8, size: 8, font, color: LIGHT });
      for (const [i, l] of wrap(v, font, 8, CONTENT_W - 150).entries()) {
        if (i > 0) ensure(ctx, 10);
        ctx.page.drawText(l, { x: MARGIN + 150, y: ctx.y - 8, size: 8, font, color: SLATE });
        ctx.y -= 10;
      }
    }
    ctx.y -= 4;
    if (analysis.taxVsReality) {
      text(ctx, "RECORD vs. REALITY", { size: 9, font: bold, color: NAVY, gap: 2 });
      text(ctx, analysis.taxVsReality, { size: 9, gap: 4 });
    }
  } else {
    for (const t of report.taxVsReality) text(ctx, t, { size: 9, gap: 3 });
  }
  ctx.y -= 2;

  // §4 OWNERSHIP
  text(ctx, "OWNERSHIP", { size: 9, font: bold, color: NAVY, gap: 3 });
  for (const f of report.ownership) {
    ensure(ctx, 12);
    ctx.page.drawText(f.label, { x: MARGIN, y: ctx.y - 8, size: 8.5, font, color: LIGHT });
    for (const [i, l] of wrap(f.value, font, 8.5, CONTENT_W - 160).entries()) {
      if (i > 0) ensure(ctx, 11);
      ctx.page.drawText(l, { x: MARGIN + 130, y: ctx.y - 8, size: 8.5, font: bold, color: SLATE });
      ctx.y -= 11;
    }
  }
  if (report.ownershipNote) text(ctx, report.ownershipNote, { size: 8, color: LIGHT, gap: 2 });
  text(ctx, "Note: ownership is from the public property record. Liens, judgments, and the full chain of title require a title search — not included.", { size: 7, color: LIGHT, gap: 8 });

  text(ctx, "PROPERTY", { size: 9, font: bold, color: NAVY, gap: 3 });
  for (const f of report.propertyFacts) {
    ensure(ctx, 12);
    const val =
      analysis && f.label === "Beds / baths" && (analysis.trueBeds != null || analysis.trueBaths != null)
        ? `${analysis.trueBeds ?? "—"} / ${analysis.trueBaths ?? "—"} (field-verified)`
        : f.value;
    ctx.page.drawText(f.label, { x: MARGIN, y: ctx.y - 8, size: 8.5, font, color: LIGHT });
    ctx.page.drawText(val, { x: MARGIN + 130, y: ctx.y - 8, size: 8.5, font: bold, color: SLATE });
    ctx.y -= 12;
  }
  ctx.y -= 6;

  text(ctx, "CONDITION", { size: 9, font: bold, color: NAVY, gap: 2 });
  if (condition) {
    text(ctx, condition.gradeLabel, { size: 10, font: bold, color: NAVY, gap: 1 });
    if (condition.summary) text(ctx, condition.summary, { size: 9, gap: 3 });
    const cfacts: [string, string][] = [
      ["Habitability", condition.habitability],
      ["Occupancy", condition.occupancy],
      ["Exterior", condition.exterior],
      ["Interior", condition.interior],
      ["HVAC", condition.hvac],
      ["Water heater", condition.waterHeater],
      ["Electrical", condition.electrical],
      ["Damage", condition.damage],
    ];
    for (const [k, v] of cfacts) {
      ensure(ctx, 11);
      ctx.page.drawText(k, { x: MARGIN, y: ctx.y - 8, size: 8, font, color: LIGHT });
      for (const [i, l] of wrap(v, font, 8, CONTENT_W - 110).entries()) {
        if (i > 0) ensure(ctx, 10);
        ctx.page.drawText(l, { x: MARGIN + 110, y: ctx.y - 8, size: 8, font, color: SLATE });
        ctx.y -= 10;
      }
    }
    const repairList = condition.repairs ?? [];
    if (repairList.length > 0) {
      ctx.y -= 2;
      text(ctx, "REPAIRS NEEDED (from photos)", { size: 8, font: bold, color: NAVY, gap: 2 });
      for (const r of repairList) {
        ensure(ctx, 11);
        const cost = r.costLow != null || r.costHigh != null ? `  ${usd(r.costLow)}–${usd(r.costHigh ?? r.costLow)}` : "";
        for (const [i, l] of wrap(`• ${r.item}${cost}`, font, 8, CONTENT_W).entries()) {
          if (i > 0) ensure(ctx, 10);
          ctx.page.drawText(l, { x: MARGIN, y: ctx.y - 8, size: 8, font, color: SLATE });
          ctx.y -= 10;
        }
      }
      ensure(ctx, 22);
      text(ctx, `Estimated repairs: ${usd(repairLow)} – ${usd(repairHigh)}`, { size: 8.5, font: bold, color: rgb(0.55, 0.32, 0.02), gap: 1 });
      text(ctx, `As-is value ${usd(vAsIsLow)} – ${usd(vAsIsHigh)}   ·   repaired / ARV ${usd(vRepLow)} – ${usd(vRepHigh)}`, { size: 8.5, font: bold, color: NAVY, gap: 3 });
    }
    if (analysis?.conditionToValue) {
      ctx.y -= 2;
      text(ctx, analysis.conditionToValue, { size: 8.5, gap: 3 });
    }
    text(ctx, `Assessed from ${condition.photoCount} field photo${condition.photoCount === 1 ? "" : "s"} by PropIntel's vision review.`, { size: 7, color: LIGHT, gap: 8 });
  } else {
    text(ctx, `${report.conditionStatus}. Condition grade and habitability are set from the field agent's photos. Required shot set:`, { size: 9, gap: 2 });
    text(ctx, REQUIRED_SHOTS.map((sh) => sh.label).join(" · ") + " · plus any damaged surrounding homes.", { size: 8, indent: 4, color: LIGHT, gap: 8 });
  }

  // ===================== COMMUNITY TRUTH (§8) =====================
  newPage(ctx, true);
  sectionTitle(ctx, "Community Truth");
  text(ctx, "What a BPO won't tell you about this submarket — sourced from public data, stated factually.", { size: 8, color: LIGHT, gap: 4 });
  text(ctx, "SUBMARKET CHARACTER", { size: 9, font: bold, color: NAVY, gap: 1 });
  text(ctx, report.communityCharacter, { size: 9, gap: 5 });
  text(ctx, "ECONOMICS & DEMOGRAPHICS", { size: 9, font: bold, color: NAVY, gap: 3 });
  for (const f of report.communityEconomics) {
    ensure(ctx, 12);
    ctx.page.drawText(f.label, { x: MARGIN, y: ctx.y - 8, size: 8.5, font, color: LIGHT });
    for (const [i, l] of wrap(f.value, font, 8.5, CONTENT_W - 175).entries()) {
      if (i > 0) ensure(ctx, 11);
      ctx.page.drawText(l, { x: MARGIN + 175, y: ctx.y - 8, size: 8.5, font: bold, color: SLATE });
      ctx.y -= 11;
    }
  }
  ctx.y -= 4;
  text(ctx, "WHAT IT MEANS", { size: 9, font: bold, color: NAVY, gap: 1 });
  text(ctx, report.communityImplications, { size: 9, gap: 6 });

  // ===================== SUMMARY & NEXT STEPS (§9) =====================
  newPage(ctx, true);
  sectionTitle(ctx, "Summary & Next Steps");
  if (analysis?.bottomLine) {
    text(ctx, "BOTTOM LINE", { size: 9, font: bold, color: NAVY, gap: 1 });
    text(ctx, analysis.bottomLine, { size: 9.5, gap: 4 });
    if (analysis.dispositionCall) {
      text(ctx, "DISPOSITION", { size: 9, font: bold, color: rgb(0.07, 0.4, 0.3), gap: 1 });
      text(ctx, analysis.dispositionCall, { size: 9.5, color: rgb(0.1, 0.3, 0.22), gap: 4 });
    }
  } else {
    for (const sline of report.summary) text(ctx, sline, { size: 9.5, gap: 4 });
  }
  ctx.y -= 4;
  text(ctx, "DATA NOTES", { size: 9, font: bold, color: NAVY, gap: 2 });
  for (const n of report.pendingNotes) text(ctx, `- ${n}`, { size: 8, indent: 4, color: LIGHT, gap: 1 });

  // ===================== FIELD PHOTOS (from the order's folder) =====================
  {
    const photos = orderPhotos;
    if (photos.length > 0) {
      newPage(ctx, true);
      sectionTitle(ctx, "Field Photos");
      const colW = (CONTENT_W - 14) / 2;
      const maxImgH = 150;
      const cellH = maxImgH + 28;
      for (let i = 0; i < photos.length; i += 2) {
        if (ctx.y - cellH < FOOT_Y + 40) {
          newPage(ctx, true);
          sectionTitle(ctx, "Field Photos (cont.)");
        }
        const rowTop = ctx.y;
        for (let c = 0; c < 2; c++) {
          const p = photos[i + c];
          if (!p) break;
          const x = MARGIN + c * (colW + 14);
          try {
            const img = p.kind === "png" ? await doc.embedPng(p.bytes) : await doc.embedJpg(p.bytes);
            const scale = Math.min(colW / img.width, maxImgH / img.height);
            const w = img.width * scale;
            const h = img.height * scale;
            ctx.page.drawImage(img, { x, y: rowTop - h, width: w, height: h });
          } catch {
            ctx.page.drawText("(image unavailable)", { x, y: rowTop - 20, size: 7, font, color: LIGHT });
          }
          ctx.page.drawText(p.label, { x, y: rowTop - maxImgH - 11, size: 7.5, font: bold, color: NAVY });
          if (p.comment) {
            for (const l of wrap(p.comment, font, 7, colW).slice(0, 1)) {
              ctx.page.drawText(l, { x, y: rowTop - maxImgH - 20, size: 7, font, color: SLATE });
            }
          }
        }
        ctx.y = rowTop - cellH;
      }
    }
  }

  drawFooter(ctx);

  const bytes = await doc.save();
  const filename = (meta.orderNumber || s.address || "market-intelligence").replace(/[^\w.-]+/g, "_");
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}.pdf"`,
    },
  });
}
