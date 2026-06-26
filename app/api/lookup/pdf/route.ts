// POST { intel, meta? } -> a Market Intelligence Report PDF (the desktop
// deliverable). Driven entirely by MarketIntel from an address lookup — no field
// inputs required, so it can be produced for any address the data covers.

import { NextRequest } from "next/server";
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, RGB } from "pdf-lib";
import type { MarketIntel, AbsorptionLevel } from "@/lib/market-data";
import { DISCLAIMER, TAGLINE } from "@/lib/report-standard";

export const runtime = "nodejs";

const NAVY = rgb(0.043, 0.122, 0.227);
const SLATE = rgb(0.28, 0.33, 0.4);
const LIGHT = rgb(0.62, 0.66, 0.72);
const RED = rgb(0.73, 0.11, 0.11);
const GREEN = rgb(0.082, 0.502, 0.239);

const LEVEL_COLOR: Record<AbsorptionLevel, RGB> = {
  TIGHT: rgb(0.082, 0.502, 0.239),
  BALANCED: SLATE,
  SOFT: rgb(0.71, 0.43, 0.04),
  OVERSUPPLIED: rgb(0.76, 0.36, 0.04),
  SEVERE: RED,
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
  let fy = FOOT_Y + 12;
  for (const l of wrap(DISCLAIMER, ctx.font, 6.5, CONTENT_W)) {
    ctx.page.drawText(l, { x: MARGIN, y: fy, size: 6.5, font: ctx.font, color: LIGHT });
    fy -= 8;
  }
}

function newPage(ctx: Ctx) {
  drawFooter(ctx);
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - MARGIN;
}

function ensure(ctx: Ctx, needed: number) {
  if (ctx.y - needed < FOOT_Y + 36) newPage(ctx);
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

/** A single table row of fixed columns, paginating (and re-drawing the column
 *  header) if it would cross the page bottom. */
function tableRow(
  ctx: Ctx,
  cells: { x: number; str: string; bold?: boolean; color?: RGB; size?: number }[],
  header?: () => void,
) {
  if (ctx.y - 11 < FOOT_Y + 36) {
    newPage(ctx);
    if (header) header();
  }
  for (const c of cells) {
    ctx.page.drawText(c.str, {
      x: MARGIN + c.x,
      y: ctx.y - 8,
      size: c.size ?? 8.5,
      font: c.bold ? ctx.bold : ctx.font,
      color: c.color ?? SLATE,
    });
  }
  ctx.y -= c11(cells);
}

function c11(cells: { size?: number }[]): number {
  const max = cells.reduce((m, c) => Math.max(m, c.size ?? 8.5), 0);
  return max <= 7 ? 10 : 12;
}

interface Meta {
  reportDate?: string;
  clientName?: string;
  orderNumber?: string;
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

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { doc, font, bold, page: doc.addPage([PAGE_W, PAGE_H]), y: PAGE_H - MARGIN };

  const s = intel.subject;
  const reportDate = meta.reportDate || new Date().toISOString().slice(0, 10);

  // ---- header band ----
  ctx.page.drawRectangle({ x: 0, y: PAGE_H - 56, width: PAGE_W, height: 56, color: NAVY });
  ctx.page.drawText("PROPINTEL", { x: MARGIN, y: PAGE_H - 30, size: 16, font: bold, color: rgb(1, 1, 1) });
  const hdr = "Market Intelligence Report";
  ctx.page.drawText(hdr, {
    x: PAGE_W - MARGIN - font.widthOfTextAtSize(hdr, 9),
    y: PAGE_H - 26,
    size: 9,
    font,
    color: rgb(0.8, 0.85, 0.95),
  });
  ctx.page.drawText(TAGLINE, { x: MARGIN, y: PAGE_H - 46, size: 8, font, color: rgb(0.7, 0.78, 0.92) });
  ctx.y = PAGE_H - 76;

  // ---- meta + subject ----
  const metaLine = `${meta.orderNumber ? "Order " + meta.orderNumber + "  ·  " : ""}${reportDate}${
    meta.clientName ? "  ·  Client: " + meta.clientName : ""
  }  ·  Automated market read`;
  text(ctx, metaLine, { size: 8, color: LIGHT });
  text(ctx, s.address, { size: 15, font: bold, color: NAVY });
  const sub = [
    [s.city, s.state, s.zip].filter(Boolean).join(", "),
    s.sqft ? `${s.sqft.toLocaleString()} sqft` : "",
    s.beds ? `${s.beds} bd` : "",
    s.baths ? `${s.baths} ba` : "",
    s.yearBuilt ? `built ${s.yearBuilt}` : "",
  ].filter(Boolean).join("  ·  ");
  text(ctx, sub, { size: 8, color: SLATE, gap: 8 });

  // ---- value + absorption hero ----
  ensure(ctx, 52);
  const vbTop = ctx.y;
  const halfW = (CONTENT_W - 10) / 2;
  const oversupplied = intel.absorption.level === "SEVERE" || intel.absorption.level === "OVERSUPPLIED";
  ctx.page.drawRectangle({
    x: MARGIN,
    y: vbTop - 46,
    width: halfW,
    height: 46,
    borderColor: rgb(0.85, 0.87, 0.9),
    borderWidth: 0.75,
  });
  ctx.page.drawText("INDICATED AS-IS VALUE RANGE", { x: MARGIN + 8, y: vbTop - 13, size: 6, font: bold, color: LIGHT });
  ctx.page.drawText(`${usd(intel.valueRange.low)} – ${usd(intel.valueRange.high)}`, {
    x: MARGIN + 8,
    y: vbTop - 31,
    size: 15,
    font: bold,
    color: NAVY,
  });
  for (const l of wrap(intel.valueRange.basis, font, 6, halfW - 16).slice(0, 1)) {
    ctx.page.drawText(l, { x: MARGIN + 8, y: vbTop - 41, size: 6, font, color: LIGHT });
  }
  const ax = MARGIN + halfW + 10;
  ctx.page.drawRectangle({
    x: ax,
    y: vbTop - 46,
    width: halfW,
    height: 46,
    color: oversupplied ? rgb(0.99, 0.95, 0.95) : undefined,
    borderColor: oversupplied ? rgb(0.9, 0.7, 0.7) : rgb(0.85, 0.87, 0.9),
    borderWidth: 0.75,
  });
  ctx.page.drawText("ABSORPTION", { x: ax + 8, y: vbTop - 13, size: 6, font: bold, color: LIGHT });
  const mosLabel =
    intel.absorption.monthsOfSupply !== null ? `${intel.absorption.monthsOfSupply} mo supply` : "No clearance";
  ctx.page.drawText(mosLabel, {
    x: ax + 8,
    y: vbTop - 31,
    size: 15,
    font: bold,
    color: LEVEL_COLOR[intel.absorption.level],
  });
  for (const l of wrap(intel.absorption.ratioLine, font, 6, halfW - 16).slice(0, 1)) {
    ctx.page.drawText(l, { x: ax + 8, y: vbTop - 41, size: 6, font, color: SLATE });
  }
  ctx.y = vbTop - 58;

  // ---- comp ring ----
  text(ctx, "COMP RING", { size: 9, font: bold, color: NAVY, gap: 2 });
  text(ctx, intel.ring.note, { size: 9, gap: 1 });
  text(
    ctx,
    `${intel.ring.activeCount} active · ${intel.ring.pendingCount} pending · ${intel.ring.soldCount} sold in ${intel.ring.windowMonths} mo · radius ${intel.ring.radiusReachedMiles} mi${
      intel.medianDom !== null ? ` · median ${intel.medianDom} DOM` : ""
    }`,
    { size: 8, color: LIGHT, gap: 8 },
  );

  // ---- absorption read ----
  text(ctx, "ABSORPTION READ", { size: 9, font: bold, color: NAVY, gap: 2 });
  text(ctx, intel.absorption.headline, { size: 9, gap: 8 });

  // ---- price bands ----
  if (intel.priceBands.length > 0) {
    text(ctx, "WHAT'S MOVING VS. SITTING", { size: 9, font: bold, color: NAVY, gap: 3 });
    const cBand = 0;
    const cActive = 230;
    const cSold = 300;
    const cRead = 370;
    const bandHeader = () =>
      tableRow(ctx, [
        { x: cBand, str: "PRICE BAND", bold: true, color: LIGHT, size: 6.5 },
        { x: cActive, str: "ACTIVE", bold: true, color: LIGHT, size: 6.5 },
        { x: cSold, str: "SOLD", bold: true, color: LIGHT, size: 6.5 },
        { x: cRead, str: "READ", bold: true, color: LIGHT, size: 6.5 },
      ]);
    bandHeader();
    for (const b of intel.priceBands) {
      const color = b.verdict === "MOVING" ? GREEN : b.verdict === "SITTING" ? RED : SLATE;
      tableRow(
        ctx,
        [
          { x: cBand, str: b.label },
          { x: cActive, str: String(b.active) },
          { x: cSold, str: String(b.sold) },
          { x: cRead, str: b.verdict, bold: true, color },
        ],
        bandHeader,
      );
    }
    ctx.y -= 8;
  }

  // ---- three lenses ----
  text(ctx, "THREE LENSES", { size: 9, font: bold, color: NAVY, gap: 3 });
  for (const l of intel.lenses) {
    text(ctx, l.lens.toUpperCase(), { size: 7.5, font: bold, color: LIGHT, gap: 1 });
    text(ctx, l.takeaway, { size: 9, indent: 4, gap: 5 });
  }
  ctx.y -= 4;

  // ---- comps appendix ----
  text(ctx, `COMPS IN RING (${intel.comps.length})`, { size: 9, font: bold, color: NAVY, gap: 3 });
  const aAddr = 0;
  const aStatus = 200;
  const aPrice = 260;
  const aDist = 330;
  const aDom = 390;
  const aPsf = 450;
  const compHeader = () =>
    tableRow(ctx, [
      { x: aAddr, str: "ADDRESS", bold: true, color: LIGHT, size: 6 },
      { x: aStatus, str: "STATUS", bold: true, color: LIGHT, size: 6 },
      { x: aPrice, str: "PRICE", bold: true, color: LIGHT, size: 6 },
      { x: aDist, str: "DIST", bold: true, color: LIGHT, size: 6 },
      { x: aDom, str: "DOM", bold: true, color: LIGHT, size: 6 },
      { x: aPsf, str: "$/SF", bold: true, color: LIGHT, size: 6 },
    ]);
  compHeader();
  for (const c of intel.comps) {
    const addr = c.address.length > 38 ? c.address.slice(0, 37) + "…" : c.address;
    tableRow(
      ctx,
      [
        { x: aAddr, str: addr, size: 7 },
        { x: aStatus, str: c.status, size: 7 },
        { x: aPrice, str: usd(c.price), size: 7 },
        { x: aDist, str: `${c.distanceMiles}mi`, size: 7 },
        { x: aDom, str: c.daysOnMarket !== null ? String(c.daysOnMarket) : "—", size: 7 },
        { x: aPsf, str: c.pricePerSqft !== null ? "$" + c.pricePerSqft : "—", size: 7 },
      ],
      compHeader,
    );
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
