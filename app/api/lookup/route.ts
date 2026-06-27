// POST { address } -> MarketIntel (market analysis + neighborhood data).
// Uses Rentcast when RENTCAST_API_KEY is set; otherwise returns the built-in
// sample so the flow is demoable with zero setup.

import { NextResponse } from "next/server";
import { analyzeMarket } from "@/lib/comp-engine";
import { sampleSubject, sampleComps } from "@/lib/sample-comps";
import { hasRentcastKey, pullMarketData } from "@/lib/rentcast";
import { fetchNeighborhood, sampleNeighborhood } from "@/lib/neighborhood";

export async function POST(req: Request) {
  let address = "";
  try {
    const body = (await req.json()) as { address?: string };
    address = (body.address ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // No key yet -> sample data, so you can see the engine work immediately.
  if (!hasRentcastKey()) {
    const intel = analyzeMarket(sampleSubject(), sampleComps(), true);
    intel.neighborhood = sampleNeighborhood();
    intel.rent = { estimate: 1250, low: 1150, high: 1350 };
    return NextResponse.json({ intel });
  }

  if (!address) {
    return NextResponse.json({ error: "Address is required." }, { status: 400 });
  }

  try {
    const { subject, comps, rent } = await pullMarketData(address);
    const intel = analyzeMarket(subject, comps, false);
    intel.rent = rent;
    if (subject.latitude !== null && subject.longitude !== null) {
      try {
        intel.neighborhood = await fetchNeighborhood(subject.latitude, subject.longitude);
      } catch {
        // neighborhood is best-effort; leave null on failure
      }
    }
    return NextResponse.json({ intel });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Data pull failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
