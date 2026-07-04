// Sends a Stripe invoice (net-30) for one order or a whole batch — for portfolio
// clients (e.g. 500 desktop reports) who bill rather than card-checkout each one.
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { serviceClient } from "@/lib/supabase/service";
import { priceFor, portfolioCentsEach, usd } from "@/lib/pricing";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return NextResponse.json({ error: "Payments aren't configured yet." }, { status: 503 });

  let body: { orderNumbers?: string[]; customerEmail?: string; customerName?: string; daysUntilDue?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const orderNumbers = (body.orderNumbers ?? []).filter(Boolean);
  const customerEmail = (body.customerEmail ?? "").trim();
  if (orderNumbers.length === 0) return NextResponse.json({ error: "No orders selected." }, { status: 400 });
  if (!customerEmail) return NextResponse.json({ error: "Client email is required for an invoice." }, { status: 400 });

  const supabase = serviceClient();
  if (!supabase) return NextResponse.json({ error: "Storage not configured" }, { status: 500 });
  const { data: orders } = await supabase.from("orders").select("*").in("order_number", orderNumbers);
  if (!orders || orders.length === 0) return NextResponse.json({ error: "Orders not found" }, { status: 404 });

  const stripe = new Stripe(key);
  const customer = await stripe.customers.create({ email: customerEmail, name: (body.customerName ?? "").trim() || undefined });

  // Portfolio volume pricing when it's a big all-desktop batch.
  const allDesktop = orders.every((o) => o.product_type === "desktop");
  const usePortfolio = allDesktop && orders.length >= 100;

  for (const o of orders) {
    const cents = usePortfolio ? portfolioCentsEach(orders.length) : priceFor(o.product_type).cents;
    await stripe.invoiceItems.create({
      customer: customer.id,
      currency: "usd",
      amount: cents,
      description: `${priceFor(o.product_type).label} — ${o.property_address} (${o.order_number})`,
    });
  }

  const invoice = await stripe.invoices.create({
    customer: customer.id,
    collection_method: "send_invoice",
    days_until_due: body.daysUntilDue ?? 30,
    metadata: { order_numbers: orderNumbers.join(",") },
    description: `PropIntel — ${orders.length} report${orders.length === 1 ? "" : "s"}${usePortfolio ? " (portfolio rate)" : ""}`,
  });
  await stripe.invoices.finalizeInvoice(invoice.id);
  const sent = await stripe.invoices.sendInvoice(invoice.id);

  // Mark the orders invoiced (they flip to paid on the invoice.paid webhook).
  await supabase
    .from("orders")
    .update({ stripe_session_id: invoice.id, status: "in_progress", customer_email: customerEmail })
    .in("order_number", orderNumbers);

  return NextResponse.json({
    url: sent.hosted_invoice_url,
    total: usd((sent.amount_due ?? 0) as number),
    count: orders.length,
  });
}
