// Creates a Stripe Checkout Session for an order and returns the redirect URL.
// Works in Stripe TEST mode until the live keys are set.
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { priceFor } from "@/lib/pricing";

export const runtime = "nodejs";
const APP = process.env.NEXT_PUBLIC_APP_URL || "https://propintelreport.com";

export async function POST(req: Request) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return NextResponse.json({ error: "Payments aren't configured yet." }, { status: 503 });

  let orderNumber = "";
  try {
    const body = (await req.json()) as { orderNumber?: string };
    orderNumber = body.orderNumber ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!orderNumber) return NextResponse.json({ error: "Missing order" }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Storage not configured" }, { status: 500 });
  const supabase = createClient(url, anon);
  const { data: order } = await supabase.from("orders").select("*").eq("order_number", orderNumber).maybeSingle();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.paid) return NextResponse.json({ error: "This order is already paid." }, { status: 400 });

  const price = priceFor(order.product_type);
  const stripe = new Stripe(key);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: price.cents,
          product_data: { name: `${price.label} — ${order.property_address}`, description: `Order ${orderNumber}` },
        },
      },
    ],
    metadata: { order_number: orderNumber },
    success_url: `${APP}/orders/${orderNumber}?paid=1`,
    cancel_url: `${APP}/orders/${orderNumber}?canceled=1`,
  });
  return NextResponse.json({ url: session.url });
}
