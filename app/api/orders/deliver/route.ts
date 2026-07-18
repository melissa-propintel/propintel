// Manual trigger for desktop auto-delivery (retry / diagnose). Key-protected.
// POST { orderNumber } with header x-api-key: PARTNER_API_KEY -> runs the same
// deliverDesktopOrder the webhook uses and returns exactly what happened.
import { NextResponse } from "next/server";
import { deliverDesktopOrder } from "@/lib/auto-deliver";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const expected = process.env.PARTNER_API_KEY;
  if (!expected || req.headers.get("x-api-key") !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let orderNumber = "";
  try {
    orderNumber = String(((await req.json()) as { orderNumber?: string }).orderNumber ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!orderNumber) return NextResponse.json({ error: "orderNumber required" }, { status: 400 });

  const result = await deliverDesktopOrder(orderNumber);
  return NextResponse.json(result);
}
