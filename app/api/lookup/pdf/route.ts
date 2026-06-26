// POST { intel, meta? } -> the 3-page "middle" Market Intelligence Report PDF.
//   P1 — The Verdict (rating + red flags)
//   P2 — Market Reality
//   P3 — Property & Neighborhood

import { NextRequest } from "next/server";
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, RGB } from "pdf-lib";
import type { MarketIntel } from "@/lib/market-data";
import { buildMarketReport, type RiskRating } from "@/lib/market-report";
import { REQUIRED_SHOTS } from "@/lib/photo-shots";
import { DISCLAIMER, TAGLINE } from "@/lib/report-standard";

export const runtime = "nodejs";

const NAVY = rgb(0.043, 0.122, 0.227);
const SLATE = rgb(0.28, 0.33, 0.4);
const LIGHT = rgb(0.62, 0.66, 0.72);
const RED = rgb(0.73, 0.11, 0.11);
const GREEN = rgb(0.082, 0.502, 0.239);
const WHITE = rgb(1, 1, 1);

const RATING_COLOR: Record<RiskRating, RGB> = {
  LOW: rgb(0.082, 0.502, 0.239),
  MODERATE: rgb(0.71, 0.43, 0.04),
  HIGH: rgb(0.76, 0.36, 0.04),
  CRITICAL: rgb(0.73, 0.11, 0.11),
};
const RATING_WORD: Record<RiskRating, string> = {
  LOW: "LOW RISK",
  MODERATE: "MODERATE RISK",
  HIGH: "HIGH RISK",
  CRITICAL: "CRITICAL — ESCALATE",
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

function wrap(t: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = t.split(/\s+/);
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
  testValue?: number | null;
  testLabel?: string;
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

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { doc, font, bold, page: doc.addPage([PAGE_W, PAGE_H]), y: PAGE_H - MARGIN, address: s.address };

  // ===================== PAGE 1 — THE VERDICT =====================
  ctx.page.drawRectangle({ x: 0, y: PAGE_H - 56, width: PAGE_W, height: 56, color: NAVY });
  ctx.page.drawText("PROPINTEL", { x: MARGIN, y: PAGE_H - 30, size: 16, font: bold, color: WHITE });
  const hdr = "Market Intelligence Report";
  ctx.page.drawText(hdr, {
    x: PAGE_W - MARGIN - font.widthOfTextAtSize(hdr, 9),
    y: PAGE_H - 26,
    size: 9,
    font,
    color: rgb(0.8, 0.85, 0.95),
  });
  ctx.page.drawText(TAGLINE, { x: MARGIN, y: PAGE_H - 46, size: 8, font, color: rgb(0.7, 0.78, 0.92) });
  ctx.y = PAGE_H - 74;

  const metaLine = `${meta.orderNumber ? "Order " + meta.orderNumber + "  ·  " : ""}${reportDate}${
    meta.clientName ? "  ·  Client: " + meta.clientName : ""
  }  ·  Automated market read`;
  text(ctx, metaLine, { size: 8, color: LIGHT });
  text(ctx, s.address, { size: 15, font: bold, color: NAVY });
  text(ctx, [s.city, s.state, s.zip].filter(Boolean).join(", "), { size: 8, color: SLATE, gap: 8 });

  // Rating banner
  ensure(ctx, 46);
  const bTop = ctx.y;
  ctx.page.drawRectangle({ x: MARGIN, y: bTop - 44, width: CONTENT_W, height: 44, color: RATING_COLOR[report.rating] });
  ctx.page.drawText("OVERALL ASSESSMENT", { x: MARGIN + 10, y: bTop - 14, size: 7, font: bold, color: rgb(1, 1, 1) });
  ctx.page.drawText(RATING_WORD[report.rating], { x: MARGIN + 10, y: bTop - 33, size: 17, font: bold, color: WHITE });
  let ry = bTop - 13;
  for (const l of wrap(report.ratingLine, font, 7.5, 230).slice(0, 3)) {
    ctx.page.drawText(l, { x: PAGE_W - MARGIN - 240, y: ry, size: 7.5, font, color: rgb(0.95, 0.97, 1) });
    ry -= 10;
  }
  ctx.y = bTop - 54;

  // Grades row
  const grades: [string, string][] = [
    ["MARKET SUPPORT", report.marketSupport.replace("_", " ")],
    ["CONDITION", "Pending"],
    ["FRAUD SIGNAL", "Pending"],
    ["ABSORPTION", intel.absorption.level],
    ["RED FLAGS", `${report.criticalCount}C · ${report.advisoryCount}A`],
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
  ctx.page.drawText("INDICATED AS-IS VALUE RANGE", { x: MARGIN + 8, y: vTop - 13, size: 6, font: bold, color: LIGHT });
  ctx.page.drawText(`${usd(intel.valueRange.low)} – ${usd(intel.valueRange.high)}`, { x: MARGIN + 8, y: vTop - 31, size: 15, font: bold, color: NAVY });
  for (const l of wrap(intel.valueRange.basis, font, 6, halfW - 16).slice(0, 1)) ctx.page.drawText(l, { x: MARGIN + 8, y: vTop - 41, size: 6, font, color: LIGHT });
  const ax = MARGIN + halfW + 10;
  ctx.page.drawRectangle({ x: ax, y: vTop - 46, width: halfW, height: 46, color: oversupplied ? rgb(0.99, 0.95, 0.95) : undefined, borderColor: oversupplied ? rgb(0.9, 0.7, 0.7) : rgb(0.85, 0.87, 0.9), borderWidth: 0.75 });
  ctx.page.drawText("ABSORPTION", { x: ax + 8, y: vTop - 13, size: 6, font: bold, color: LIGHT });
  const mos = intel.absorption.monthsOfSupply !== null ? `${intel.absorption.monthsOfSupply} mo supply` : "No clearance";
  ctx.page.drawText(mos, { x: ax + 8, y: vTop - 31, size: 15, font: bold, color: oversupplied ? RED : NAVY });
  for (const l of wrap(intel.absorption.ratioLine, font, 6, halfW - 16).slice(0, 1)) ctx.page.drawText(l, { x: ax + 8, y: vTop - 41, size: 6, font, color: SLATE });
  ctx.y = vTop - 56;

  // Red flags
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

  // ===================== PAGE 2 — MARKET REALITY =====================
  newPage(ctx, true);
  sectionTitle(ctx, "Market Reality");
  text(ctx, intel.absorption.headline, { size: 10, font: bold, color: NAVY, gap: 2 });
  text(ctx, intel.absorption.ratioLine, { size: 9, gap: 4 });
  text(ctx, intel.ring.note, { size: 9 });
  text(
    ctx,
    `${intel.ring.activeCount} active · ${intel.ring.pendingCount} pending · ${intel.ring.soldCount} sold in ${intel.ring.windowMonths} mo · radius ${intel.ring.radiusReachedMiles} mi${
      intel.medianDom !== null ? ` · median ${intel.medianDom} DOM` : ""
    }`,
    { size: 8, color: LIGHT, gap: 8 },
  );

  if (intel.priceBands.length > 0) {
    text(ctx, "WHAT'S MOVING VS. SITTING", { size: 9, font: bold, color: NAVY, gap: 3 });
    const c1 = 0, c2 = 230, c3 = 300, c4 = 370;
    const cols = (cells: { x: number; s: string; b?: boolean; col?: RGB; sz?: number }[]) => {
      if (ctx.y - 12 < FOOT_Y + 36) newPage(ctx, true);
      for (const c of cells) ctx.page.drawText(c.s, { x: MARGIN + c.x, y: ctx.y - 8, size: c.sz ?? 8.5, font: c.b ? bold : font, color: c.col ?? SLATE });
      ctx.y -= 12;
    };
    cols([{ x: c1, s: "PRICE BAND", b: true, col: LIGHT, sz: 6.5 }, { x: c2, s: "ACTIVE", b: true, col: LIGHT, sz: 6.5 }, { x: c3, s: "SOLD", b: true, col: LIGHT, sz: 6.5 }, { x: c4, s: "READ", b: true, col: LIGHT, sz: 6.5 }]);
    for (const b of intel.priceBands) {
      const col = b.verdict === "MOVING" ? GREEN : b.verdict === "SITTING" ? RED : SLATE;
      cols([{ x: c1, s: b.label }, { x: c2, s: String(b.active) }, { x: c3, s: String(b.sold) }, { x: c4, s: b.verdict, b: true, col }]);
    }
    ctx.y -= 8;
  }

  text(ctx, "VALUE BASIS", { size: 9, font: bold, color: NAVY, gap: 2 });
  text(ctx, `${usd(intel.valueRange.low)} – ${usd(intel.valueRange.high)}. ${intel.valueRange.basis}`, { size: 9, gap: 8 });

  text(ctx, "THREE LENSES", { size: 9, font: bold, color: NAVY, gap: 3 });
  for (const l of intel.lenses) {
    text(ctx, l.lens.toUpperCase(), { size: 7.5, font: bold, color: LIGHT, gap: 1 });
    text(ctx, l.takeaway, { size: 9, indent: 4, gap: 5 });
  }

  // ===================== PAGE 3 — PROPERTY & NEIGHBORHOOD =====================
  newPage(ctx, true);
  sectionTitle(ctx, "Property & Neighborhood");

  text(ctx, "PROPERTY", { size: 9, font: bold, color: NAVY, gap: 3 });
  for (const f of report.propertyFacts) {
    ensure(ctx, 12);
    ctx.page.drawText(f.label, { x: MARGIN, y: ctx.y - 8, size: 8.5, font, color: LIGHT });
    ctx.page.drawText(f.value, { x: MARGIN + 130, y: ctx.y - 8, size: 8.5, font: bold, color: SLATE });
    ctx.y -= 12;
  }
  ctx.y -= 6;

  text(ctx, "CONDITION", { size: 9, font: bold, color: NAVY, gap: 2 });
  text(ctx, `${report.conditionStatus}. Condition grade and habitability are set from the field agent's photos. Required shot set:`, { size: 9, gap: 2 });
  text(ctx, REQUIRED_SHOTS.map((sh) => sh.label).join(" · ") + " · plus any damaged surrounding homes.", { size: 8, indent: 4, color: LIGHT, gap: 8 });

  text(ctx, "NEIGHBORHOOD", { size: 9, font: bold, color: NAVY, gap: 3 });
  for (const f of report.neighborhood) {
    ensure(ctx, 12);
    ctx.page.drawText(f.label, { x: MARGIN, y: ctx.y - 8, size: 8.5, font, color: LIGHT });
    ctx.page.drawText(f.value, { x: MARGIN + 160, y: ctx.y - 8, size: 8.5, font: bold, color: SLATE });
    ctx.y -= 12;
  }
  ctx.y -= 6;

  text(ctx, "PENDING / DATA NOTES", { size: 9, font: bold, color: NAVY, gap: 2 });
  for (const n of report.pendingNotes) text(ctx, `• ${n}`, { size: 8, indent: 4, color: LIGHT, gap: 1 });

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
