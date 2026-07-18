import { serviceClient } from "@/lib/supabase/service";

// Auto-generate + deliver a DESKTOP report the instant it's paid. Idempotent and
// desktop-only. Returns a detailed result so failures aren't silent.

const APP = process.env.NEXT_PUBLIC_APP_URL || "https://www.propintelreport.com";
const REPORTS_BUCKET = "reports";

export type DeliverResult = {
  ok: boolean;
  step: string;
  detail?: string;
  deliveryUrl?: string;
};

function makeToken(): string {
  const a = new Uint8Array(9);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 14);
}
function safeName(s: string): string {
  return (s || "report").replace(/[^\w.-]+/g, "_").slice(0, 60);
}

export async function deliverDesktopOrder(orderNumber: string): Promise<DeliverResult> {
  const supabase = serviceClient();
  if (!supabase) return { ok: false, step: "service_client", detail: "not configured" };

  const { data: order, error: loadErr } = await supabase
    .from("orders")
    .select(
      "id, order_number, property_address, client_name, product_type, paid, status, delivery_token, customer_email",
    )
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (loadErr) return { ok: false, step: "load_order", detail: loadErr.message };
  if (!order) return { ok: false, step: "load_order", detail: "order not found" };
  if (order.product_type !== "desktop")
    return { ok: false, step: "guard", detail: `product_type=${order.product_type} (not desktop)` };
  if (!order.paid) return { ok: false, step: "guard", detail: "not paid" };
  if (order.status === "delivered" || order.delivery_token)
    return { ok: true, step: "already_delivered", detail: order.delivery_token ?? "" };

  // 1) Build the report data from the address (same engine as /api/lookup).
  let intel: { valueRange?: { low?: number; high?: number } } | undefined;
  try {
    const r = await fetch(`${APP}/api/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: order.property_address }),
    });
    if (!r.ok) return { ok: false, step: "lookup", detail: `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` };
    intel = (await r.json()).intel;
  } catch (e) {
    return { ok: false, step: "lookup", detail: e instanceof Error ? e.message : String(e) };
  }
  if (!intel) return { ok: false, step: "lookup", detail: "no intel returned" };

  // 2) Build the PDF.
  let pdf: Buffer;
  try {
    const r = await fetch(`${APP}/api/lookup/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intel, meta: { orderNumber, clientName: order.client_name } }),
    });
    if (!r.ok) return { ok: false, step: "pdf", detail: `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` };
    pdf = Buffer.from(await r.arrayBuffer());
  } catch (e) {
    return { ok: false, step: "pdf", detail: e instanceof Error ? e.message : String(e) };
  }

  // 3) Store the PDF + create the delivery bundle.
  const token = makeToken();
  const path = `${token}/001-${safeName(order.property_address)}.pdf`;
  const up = await supabase.storage.from(REPORTS_BUCKET).upload(path, pdf, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (up.error) return { ok: false, step: "upload", detail: up.error.message };
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
  const del = await supabase.from("deliveries").insert({ token, client_name: order.client_name, items: [item] });
  if (del.error) return { ok: false, step: "deliveries_insert", detail: del.error.message };
  const upd = await supabase.from("orders").update({ status: "delivered", delivery_token: token }).eq("id", order.id);
  if (upd.error) return { ok: false, step: "order_update", detail: upd.error.message };

  // 4) Email the client their download link.
  let emailed = "no customer_email";
  if (order.customer_email) {
    try {
      const r = await fetch(`${APP}/api/deliver-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: order.customer_email, token, address: order.property_address, orderNumber }),
      });
      emailed = r.ok ? "sent" : `email HTTP ${r.status}: ${(await r.text()).slice(0, 150)}`;
    } catch (e) {
      emailed = "email error: " + (e instanceof Error ? e.message : String(e));
    }
  }

  return { ok: true, step: "delivered", detail: emailed, deliveryUrl: `${APP}/d/${token}` };
}
