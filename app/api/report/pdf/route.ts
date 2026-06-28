import { NextRequest } from "next/server";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFPage,
  PDFFont,
  RGB,
} from "pdf-lib";
import type { GeneratedReport, RiskGrade } from "@/lib/types";
import { DISCLAIMER, TAGLINE } from "@/lib/report-standard";

export const runtime = "nodejs";

const NAVY = rgb(0.059, 0.431, 0.337);
const SLATE = rgb(0.28, 0.33, 0.4);
const LIGHT = rgb(0.62, 0.66, 0.72);
const RED = rgb(0.73, 0.11, 0.11);
const AMBER = rgb(0.71, 0.43, 0.04);

const GRADE_COLOR: Record<RiskGrade, RGB> = {
  A: rgb(0.082, 0.502, 0.239),
  B: rgb(0.302, 0.486, 0.059),
  C: rgb(0.706, 0.325, 0.035),
  D: rgb(0.761, 0.255, 0.047),
  F: rgb(0.725, 0.11, 0.11),
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
  report: GeneratedReport;
}

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (font.widthOfTextAtSize(test, size) > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
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
  const lines = wrap(DISCLAIMER, ctx.font, 6.5, CONTENT_W);
  let fy = FOOT_Y + 12;
  for (const l of lines) {
    ctx.page.drawText(l, { x: MARGIN, y: fy, size: 6.5, font: ctx.font, color: LIGHT });
    fy -= 8;
  }
}

function newPage(ctx: Ctx) {
  drawFooter(ctx);
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - MARGIN;
}

/** Ensure room for `needed` vertical points; paginate if not. */
function ensure(ctx: Ctx, needed: number) {
  if (ctx.y - needed < FOOT_Y + 36) {
    newPage(ctx);
  }
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
  const lines = wrap(str, font, size, CONTENT_W - indent);
  for (const l of lines) {
    ensure(ctx, lineH);
    ctx.page.drawText(l, { x: MARGIN + indent, y: ctx.y - size, size, font, color });
    ctx.y -= lineH;
  }
  if (opts.gap) ctx.y -= opts.gap;
}

export async function POST(req: NextRequest) {
  let report: GeneratedReport;
  try {
    report = (await req.json()) as GeneratedReport;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const ctx: Ctx = { doc, font, bold, page, y: PAGE_H - MARGIN, report };

  // ---- header band ----
  page.drawRectangle({ x: 0, y: PAGE_H - 56, width: PAGE_W, height: 56, color: NAVY });
  page.drawText("PROPINTEL", { x: MARGIN, y: PAGE_H - 30, size: 16, font: bold, color: rgb(1, 1, 1) });
  page.drawText(report.serviceLineLabel, {
    x: PAGE_W - MARGIN - font.widthOfTextAtSize(report.serviceLineLabel, 9),
    y: PAGE_H - 26,
    size: 9,
    font,
    color: rgb(0.85, 0.94, 0.91),
  });
  page.drawText(TAGLINE, { x: MARGIN, y: PAGE_H - 46, size: 8, font, color: rgb(0.72, 0.86, 0.80) });
  ctx.y = PAGE_H - 76;

  // ---- order meta ----
  const metaLine = `Order ${report.orderNumber}  ·  ${report.reportDate || "—"}  ·  Agent: ${
    report.fieldAgent || "—"
  }${report.clientName ? `  ·  Client: ${report.clientName}` : ""}`;
  text(ctx, metaLine, { size: 8, color: LIGHT });
  text(ctx, report.address, { size: 15, font: bold, color: NAVY, gap: 6 });

  // ---- verdict box ----
  const boxH = 60;
  ensure(ctx, boxH + 8);
  const boxTop = ctx.y;
  // grade chip
  const chipW = 64;
  page.drawRectangle({
    x: MARGIN,
    y: boxTop - boxH,
    width: chipW,
    height: boxH,
    color: GRADE_COLOR[report.riskGrade],
  });
  page.drawText(report.riskGrade, {
    x: MARGIN + chipW / 2 - bold.widthOfTextAtSize(report.riskGrade, 30) / 2,
    y: boxTop - boxH / 2 - 2,
    size: 30,
    font: bold,
    color: rgb(1, 1, 1),
  });
  // verdict text
  const vx = MARGIN + chipW + 12;
  const vw = CONTENT_W - chipW - 12;
  page.drawText(report.verdictHeadline, { x: vx, y: boxTop - 16, size: 11, font: bold, color: NAVY });
  let ry = boxTop - 30;
  for (const l of wrap(report.riskDescriptor + ". " + report.verdictRationale, font, 8, vw)) {
    page.drawText(l, { x: vx, y: ry, size: 8, font, color: SLATE });
    ry -= 11;
  }
  // border
  page.drawRectangle({
    x: MARGIN,
    y: boxTop - boxH,
    width: CONTENT_W,
    height: boxH,
    borderColor: rgb(0.85, 0.87, 0.9),
    borderWidth: 0.75,
  });
  ctx.y = boxTop - boxH - 14;

  // ---- value + absorption band ----
  ensure(ctx, 50);
  const vbTop = ctx.y;
  const halfW = (CONTENT_W - 10) / 2;
  const oversupplied =
    report.absorption.level === "SEVERE" || report.absorption.level === "OVERSUPPLIED";
  // value box
  page.drawRectangle({
    x: MARGIN,
    y: vbTop - 44,
    width: halfW,
    height: 44,
    borderColor: rgb(0.85, 0.87, 0.9),
    borderWidth: 0.75,
  });
  page.drawText("INDICATED AS-IS VALUE RANGE", { x: MARGIN + 8, y: vbTop - 13, size: 6, font: bold, color: LIGHT });
  page.drawText(report.valueRangeLabel, { x: MARGIN + 8, y: vbTop - 30, size: 15, font: bold, color: NAVY });
  page.drawText("Derived from all comps in the window.", { x: MARGIN + 8, y: vbTop - 40, size: 6, font, color: LIGHT });
  // absorption box
  const ax = MARGIN + halfW + 10;
  page.drawRectangle({
    x: ax,
    y: vbTop - 44,
    width: halfW,
    height: 44,
    color: oversupplied ? rgb(0.99, 0.95, 0.95) : undefined,
    borderColor: oversupplied ? rgb(0.9, 0.7, 0.7) : rgb(0.85, 0.87, 0.9),
    borderWidth: 0.75,
  });
  page.drawText("ABSORPTION", { x: ax + 8, y: vbTop - 13, size: 6, font: bold, color: LIGHT });
  page.drawText(report.absorptionHeadline, { x: ax + 8, y: vbTop - 30, size: 15, font: bold, color: oversupplied ? RED : NAVY });
  for (const l of wrap(report.absorption.line, font, 6, halfW - 16).slice(0, 1)) {
    page.drawText(l, { x: ax + 8, y: vbTop - 40, size: 6, font, color: SLATE });
  }
  ctx.y = vbTop - 56;

  // ---- dashboard row ----
  const stats: [string, string][] = [
    ["CONDITION", report.conditionGrade],
    ["HABITABILITY", report.habitabilityLabel],
    ["MARKET SUPPORT", report.marketSupport.replace("_", " ")],
    ["FRAUD SIGNAL", `${report.fraudSignalScore}/5 ${report.fraudLevel}`],
    ["RED FLAGS", `${report.criticalCount}C ${report.advisoryCount}A`],
  ];
  ensure(ctx, 34);
  const cellW = CONTENT_W / stats.length;
  const dTop = ctx.y;
  stats.forEach(([label, value], i) => {
    const cx = MARGIN + i * cellW;
    page.drawRectangle({
      x: cx,
      y: dTop - 30,
      width: cellW - 4,
      height: 30,
      borderColor: rgb(0.88, 0.9, 0.93),
      borderWidth: 0.75,
    });
    page.drawText(label, { x: cx + 4, y: dTop - 11, size: 5.5, font: bold, color: LIGHT });
    for (const l of wrap(value, bold, 8, cellW - 8).slice(0, 2)) {
      page.drawText(l, { x: cx + 4, y: dTop - 22, size: 8, font: bold, color: NAVY });
    }
  });
  ctx.y = dTop - 44;

  // ---- real market ----
  text(ctx, `REAL MARKET · ${report.liquidity}`, { size: 8, font: bold, color: LIGHT });
  text(ctx, report.realMarketLine, { size: 9, gap: 6 });

  if (report.missingNotice) {
    text(ctx, `Data gaps: ${report.missingNotice}`, { size: 8, color: AMBER, gap: 4 });
  }

  // ---- red flags ----
  text(ctx, `RED FLAGS — ${report.criticalCount} critical · ${report.advisoryCount} advisory`, {
    size: 10,
    font: bold,
    color: NAVY,
    gap: 3,
  });
  if (report.redFlags.length === 0) {
    text(ctx, "No red flags identified from submitted data.", { size: 9, gap: 6 });
  } else {
    for (const f of report.redFlags) {
      ensure(ctx, 14);
      const tag = f.severity === "CRITICAL" ? "CRITICAL" : "ADVISORY";
      const tagColor = f.severity === "CRITICAL" ? RED : AMBER;
      page.drawText(tag, { x: MARGIN, y: ctx.y - 8, size: 7, font: bold, color: tagColor });
      const fx = MARGIN + 52;
      const lines = wrap(`${f.category}: ${f.description}`, font, 8.5, CONTENT_W - 52);
      lines.forEach((l, idx) => {
        if (idx > 0) ensure(ctx, 11);
        ctx.page.drawText(l, { x: fx, y: ctx.y - 8, size: 8.5, font, color: SLATE });
        ctx.y -= 11;
      });
      ctx.y -= 3;
    }
    ctx.y -= 4;
  }

  // ---- evidence sections ----
  for (const s of report.sections) {
    if (s.heading.startsWith("2.")) {
      // keep page-1 dense; start evidence on a fresh page after the page-1 block
    }
    ensure(ctx, 24);
    text(ctx, s.heading, { size: 10, font: bold, color: NAVY, gap: 2 });
    for (const line of s.body) {
      text(ctx, line, { size: 9, indent: 8, gap: 1 });
    }
    ctx.y -= 6;
  }

  drawFooter(ctx);

  const bytes = await doc.save();
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${report.orderNumber || "propintel-report"}.pdf"`,
    },
  });
}
