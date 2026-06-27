// POST { orderNumber } -> assess the order's field photos into a condition read
// (Claude vision), cache it as _condition.json, and return it. Run explicitly
// from the dashboard so the slow AI call is decoupled from report generation.

import { NextResponse } from "next/server";
import { fetchOrderPhotos, fetchCondition, saveCondition } from "@/lib/order-photos";
import { assessCondition, hasAnthropicKey } from "@/lib/condition";

export const runtime = "nodejs";
export const maxDuration = 60; // give the vision call room (Netlify Pro)

export async function POST(req: Request) {
  let orderNumber = "";
  try {
    const body = (await req.json()) as { orderNumber?: string; force?: boolean };
    orderNumber = (body.orderNumber ?? "").trim();
    if (!orderNumber) return NextResponse.json({ error: "orderNumber is required." }, { status: 400 });

    // Return the cached read unless a re-assessment is forced.
    if (!body.force) {
      const cached = await fetchCondition(orderNumber);
      if (cached) return NextResponse.json({ condition: cached, cached: true });
    }

    if (!hasAnthropicKey()) {
      return NextResponse.json({ error: "Condition assessment isn't set up (no ANTHROPIC_API_KEY)." }, { status: 400 });
    }

    const photos = await fetchOrderPhotos(orderNumber);
    if (photos.length === 0) {
      return NextResponse.json({ error: "No field photos found for this order yet." }, { status: 404 });
    }

    const condition = await assessCondition(photos);
    await saveCondition(orderNumber, condition);
    return NextResponse.json({ condition, cached: false });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Assessment failed." }, { status: 502 });
  }
}
