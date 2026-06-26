// POST { grade, rows, meta? } -> a Portfolio Intelligence PDF: a graded cover
// plus every property as a red/yellow/green line item with a short read.

import { NextRequest } from "next/server";
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, RGB } from "pdf-lib";
import type { PortfolioRow, PortfolioGrade, Light } from "@/lib/portfolio";
import { DISCLAIMER, TAGLINE } from "@/lib/report-standard";

export const runtime = "nodejs";

const NAVY = rgb(0.043, 0.122, 0.227);
const SLATE = rgb(0.28, 0.33, 0.4);
const LIGHT = rgb(0.62, 0.66, 0.72);
const WHITE = rgb(1, 1, 1);

const LIGHT_COLOR: Record<Light, RGB> = {
  GREEN: rgb(0.082, 0.502, 0.239),
  YELLOW: rgb(0.85, 0.6, 0.05),
  RED: rgb(0.73, 0.11, 0.11),
};
const GRADE_COLOR: Record<string, RGB> = {
  A: rgb(0.082, 0.502, 0.239),
  B: rgb(0.2, 0.55, 0.2),
  C: rgb(0.71, 0.43, 0.04),
  D: rgb(0.76, 0.36, 0.04),
  F: rgb(0.73, 0.11, 0.11),
  "—": rgb(0.5, 0.55, 0.6),
};

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOT_Y = 38;
const RANK: Record<Light, number> = { RED: 0, YELLOW: 1, GREEN: 2 };

interface Ctx {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  page: PDFPage;
  y: number;
}

// WinAnsi (Helvetica) can't encode arbitrary Unicode. Map smart punctuation to
// ASCII and drop anything outside Latin-1 so real-world data never crashes the PDF.
function safe(s: string): string {
  if (!s) return "";
  return s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—―]/g, "-")
    .replace(/…/g, "...")
    .replace(/[     ​]/g, " ")
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
  ctx.page.drawLine({ start: { x: MARGIN, y: FOOT_Y + 22 }, end: { x: PAGE_W - MARGIN, y: FOOT_Y + 22 }, thickness: 0.5, color: rgb(0.85, 0.87, 0.9) });
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

interface Meta {
  fileName?: string;
  reportDate?: string;
  clientName?: string;
}

export async function POST(req: NextRequest) {
  let grade: PortfolioGrade;
  let rows: PortfolioRow[];
  let meta: Meta = {};
  try {
    const body = (await req.json()) as { grade: PortfolioGrade; rows: PortfolioRow[]; meta?: Meta };
    grade = body.grade;
    rows = body.rows;
    meta = body.meta ?? {};
    if (!grade || !Array.isArray(rows)) throw new Error("bad");
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Sanitize all free-text before it reaches the PDF font.
  rows = rows.map((r) => ({ ...r, address: safe(r.address || ""), topFlag: r.topFlag ? safe(r.topFlag) : null, lines: (r.lines || []).map(safe) }));
  grade = { ...grade, headline: safe(grade.headline || "") };
  meta = { ...meta, fileName: meta.fileName ? safe(meta.fileName) : undefined, clientName: meta.clientName ? safe(meta.clientName) : undefined };

  const sorted = [...rows].sort((a, b) => {
    const ra = a.light ? RANK[a.light] : 3;
    const rb = b.light ? RANK[b.light] : 3;
    return ra - rb;
  });

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { doc, font, bold, page: doc.addPage([PAGE_W, PAGE_H]), y: PAGE_H - MARGIN };
  const reportDate = meta.reportDate || new Date().toISOString().slice(0, 10);

  // header band
  ctx.page.drawRectangle({ x: 0, y: PAGE_H - 56, width: PAGE_W, height: 56, color: NAVY });
  ctx.page.drawText("PROPINTEL", { x: MARGIN, y: PAGE_H - 30, size: 16, font: bold, color: WHITE });
  const hdr = "Portfolio Intelligence Report";
  ctx.page.drawText(hdr, { x: PAGE_W - MARGIN - font.widthOfTextAtSize(hdr, 9), y: PAGE_H - 26, size: 9, font, color: rgb(0.8, 0.85, 0.95) });
  ctx.page.drawText(TAGLINE, { x: MARGIN, y: PAGE_H - 46, size: 8, font, color: rgb(0.7, 0.78, 0.92) });
  ctx.y = PAGE_H - 76;

  ctx.page.drawText(`${reportDate}${meta.clientName ? "  ·  " + meta.clientName : ""}${meta.fileName ? "  ·  " + meta.fileName : ""}  ·  ${grade.total} properties`, { x: MARGIN, y: ctx.y - 8, size: 8, font, color: LIGHT });
  ctx.y -= 22;

  // grade block
  const gTop = ctx.y;
  ctx.page.drawRectangle({ x: MARGIN, y: gTop - 64, width: 64, height: 64, color: GRADE_COLOR[grade.grade] ?? GRADE_COLOR["—"] });
  ctx.page.drawText(grade.grade, { x: MARGIN + 32 - bold.widthOfTextAtSize(grade.grade, 34) / 2, y: gTop - 46, size: 34, font: bold, color: WHITE });
  ctx.page.drawText("PORTFOLIO GRADE", { x: MARGIN + 78, y: gTop - 14, size: 7, font: bold, color: LIGHT });
  ctx.page.drawText(`${grade.scorePct}% healthy`, { x: MARGIN + 78, y: gTop - 34, size: 18, font: bold, color: NAVY });
  ctx.page.drawText(grade.headline, { x: MARGIN + 78, y: gTop - 50, size: 9, font, color: SLATE });
  // light legend
  const legend: [Light, number][] = [["GREEN", grade.green], ["YELLOW", grade.yellow], ["RED", grade.red]];
  let lx = MARGIN + 78;
  for (const [lt, n] of legend) {
    ctx.page.drawCircle({ x: lx + 3, y: gTop - 60, size: 3, color: LIGHT_COLOR[lt] });
    const label = `${n} ${lt === "GREEN" ? "clean" : lt === "YELLOW" ? "watch" : "problem"}`;
    ctx.page.drawText(label, { x: lx + 9, y: gTop - 63, size: 7.5, font, color: SLATE });
    lx += 12 + font.widthOfTextAtSize(label, 7.5) + 12;
  }
  ctx.y = gTop - 78;

  ctx.page.drawText("PROPERTIES — worst first", { x: MARGIN, y: ctx.y - 8, size: 9, font: bold, color: NAVY });
  ctx.y -= 18;

  // line items
  for (const r of sorted) {
    const lineCount = Math.min(r.lines.length, 3);
    ensure(ctx, 16 + lineCount * 9);
    const top = ctx.y;
    // light bar
    if (r.light) ctx.page.drawRectangle({ x: MARGIN, y: top - (10 + lineCount * 9), width: 3, height: 10 + lineCount * 9, color: LIGHT_COLOR[r.light] });
    ctx.page.drawText(r.address || "(no address)", { x: MARGIN + 10, y: top - 8, size: 9, font: bold, color: NAVY });
    const ratingTxt = r.rating ?? (r.error ? "ERROR" : "—");
    ctx.page.drawText(ratingTxt, { x: PAGE_W - MARGIN - bold.widthOfTextAtSize(ratingTxt, 8), y: top - 8, size: 8, font: bold, color: r.light ? LIGHT_COLOR[r.light] : LIGHT });
    let ly = top - 18;
    for (const l of r.lines.slice(0, 3)) {
      for (const w of wrap(l, font, 7.5, CONTENT_W - 14).slice(0, 1)) {
        ctx.page.drawText(w, { x: MARGIN + 10, y: ly, size: 7.5, font, color: SLATE });
      }
      ly -= 9;
    }
    ctx.y = ly - 4;
    ensure(ctx, 1);
  }

  drawFooter(ctx);
  const bytes = await doc.save();
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="propintel-portfolio.pdf"' },
  });
}
