// POST { address, pdfBase64? } -> audit of an uploaded BPO/appraisal vs. our read.
// Uses Claude to read the PDF (when ANTHROPIC_API_KEY is set) and Rentcast for
// our market read (when RENTCAST_API_KEY is set). Falls back to samples so the
// flow is demoable with zero setup.

import { NextResponse } from "next/server";
import { analyzeMarket } from "@/lib/comp-engine";
import { sampleSubject, sampleComps } from "@/lib/sample-comps";
import { sampleNeighborhood } from "@/lib/neighborhood";
import { enrichMarketIntel } from "@/lib/enrich-intel";
import { hasRentcastKey, pullMarketData } from "@/lib/rentcast";
import { buildMarketReport } from "@/lib/market-report";
import { hasAnthropicKey, extractBpo } from "@/lib/bpo-extract";
import { sampleBpoExtract } from "@/lib/sample-bpo";
import { auditBpo, type BpoExtract } from "@/lib/audit";
import type { MarketIntel } from "@/lib/market-data";

export const runtime = "nodejs";
// Headroom for the slower free open-data servers (OpenStreetMap/OSRM, Census).
export const maxDuration = 60;

export async function POST(req: Request) {
  let address = "";
  let pdfBase64 = "";
  try {
    const body = (await req.json()) as { address?: string; pdfBase64?: string };
    address = (body.address ?? "").trim();
    pdfBase64 = body.pdfBase64 ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // 1. Extract the uploaded BPO (Claude) — or sample.
  let bpo: BpoExtract;
  let usingSampleBpo = false;
  if (hasAnthropicKey() && pdfBase64) {
    try {
      bpo = await extractBpo(pdfBase64);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to read the document." },
        { status: 502 },
      );
    }
  } else {
    bpo = sampleBpoExtract();
    usingSampleBpo = true;
  }

  // 2. Our independent market read — live or sample.
  let intel: MarketIntel;
  let usingSampleMarket = false;
  const lookupAddress = address || bpo.subjectAddress || "";
  if (hasRentcastKey() && lookupAddress) {
    try {
      const { subject, comps } = await pullMarketData(lookupAddress);
      intel = analyzeMarket(subject, comps, false);
      // Neighborhood (FEMA + Census) + ZIP trend + drive-times — all free, parallel.
      await enrichMarketIntel(intel, subject);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Market data pull failed." },
        { status: 502 },
      );
    }
  } else {
    intel = analyzeMarket(sampleSubject(), sampleComps(), true);
    intel.neighborhood = sampleNeighborhood();
    usingSampleMarket = true;
  }

  // 3. Compare.
  const report = buildMarketReport(intel);
  const audit = auditBpo(bpo, intel, report, Date.now());

  return NextResponse.json({
    audit,
    bpo,
    subject: intel.subject.address,
    absorption: intel.absorption,
    usingSampleBpo,
    usingSampleMarket,
  });
}
