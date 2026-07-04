// Stripe webhook — marks an order paid when checkout completes.
// Set STRIPE_WEBHOOK_SECRET (from the Stripe dashboard) in the env.
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const key = process.env.STRIPE_SECRET_KEY;
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!key || !whSecret) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const stripe = new Stripe(key);
  const sig = req.headers.get("stripe-signature") || "";
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, whSecret);
  } catch {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderNumber = session.metadata?.order_number;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (orderNumber && url && anon) {
      const supabase = createClient(url, anon);
      await supabase
        .from("orders")
        .update({
          paid: true,
          paid_at: new Date().toISOString(),
          amount_cents: session.amount_total ?? null,
          stripe_session_id: session.id,
          customer_email: session.customer_details?.email ?? null,
          status: "in_progress",
        })
        .eq("order_number", orderNumber);
    }
  }
  return NextResponse.json({ received: true });
}
