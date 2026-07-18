import { serviceClient } from "@/lib/supabase/service";

// Auto-generate + deliver a DESKTOP report the instant it's paid. Idempotent:
// it only acts on a paid, not-yet-delivered DESKTOP order, so Stripe retries or
// double-fires can't deliver twice. Field reports are skipped (an agent has to
// inspect first). Runs in the background (after the webhook responds to Stripe).

const APP = process.env.NEXT_PUBLIC_APP_URL || "https://www.propintelreport.com";
const REPORTS_BUCKET = "reports";

function makeToken(): string {
  const a = new Uint8Array(9);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 14);
}
function safeName(s: string): string {
  return (s || "report").replace(/[^\w.-]+/g, "_").slice(0, 60);
}

export async function deliverDesktopOrder(orderNumber: string): Promise<void> {
  const supabase = serviceClient();
  if (!supabase) return;

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, order_number, property_address, client_name, product_type, paid, status, delivery_token, customer_email",
    )
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (!order) return;
  if (order.product_type !== "desktop") return; // field reports need an inspection first
  if (!order.paid) return;
  if (order.status === "delivered" || order.delivery_token) return; // already delivered

  // 1) Build the report data from the address (same engine as /api/lookup).
  const intelRes = await fetch(`${APP}/api/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: order.property_address }),
  });
  if (!intelRes.ok) return;
  const { intel } = (await intelRes.json()) as { intel?: { valueRange?: { low?: number; high?: number } } };
  if (!intel) return;

  // 2) Build the PDF.
  const pdfRes = await fetch(`${APP}/api/lookup/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intel, meta: { orderNumber, clientName: order.client_name } }),
  });
  if (!pdfRes.ok) return;
  const pdf = Buffer.from(await pdfRes.arrayBuffer());

  // 3) Store the PDF + create the delivery bundle.
  const token = makeToken();
  const path = `${token}/001-${safeName(order.property_address)}.pdf`;
  const up = await supabase.storage.from(REPORTS_BUCKET).upload(path, pdf, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (up.error) return;
  const { data: pub } = supabase.storage.from(REPORTS_BUCKET).getPublicUrl(path);
  const item = {
    address: order.property_address,
    path,
    url: pub.publicUrl,
    light: null,
    valueLow: intel?.valueRange?.low ?? null,
    valueHigh: intel?.valueRange?.high ?? null,
    highlights: [] as string[],
  };
  await supabase.from("deliveries").insert({ token, client_name: order.client_name, items: [item] });
  await supabase.from("orders").update({ status: "delivered", delivery_token: token }).eq("id", order.id);

  // 4) Email the client their download link.
  if (order.customer_email) {
    await fetch(`${APP}/api/deliver-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: order.customer_email,
        token,
        address: order.property_address,
        orderNumber,
      }),
    }).catch(() => {});
  }
}
