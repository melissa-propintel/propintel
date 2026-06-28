// Partner order-intake API.
//
// Any platform (Exceleras first) integrates INTO PropIntel by POSTing orders
// here with a shared API key. This is the "give the partner what they need"
// surface — one stable endpoint, key-authed, that drops an order into the same
// /orders queue Melissa works, tagged with the partner source + their reference.
//
// Set PARTNER_API_KEY in the environment and share it (per partner) with their
// integration team. Real delivery-back (push the finished report to a callback)
// is the next step; for now we accept + queue + acknowledge.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const PRODUCTS = ["desktop", "field_lite", "field_full", "field"];

function genOrderNumber(): string {
  const yr = new Date().getFullYear();
  const tail = Date.now().toString().slice(-5);
  return `PI-${yr}-${tail}`;
}

export async function POST(req: NextRequest) {
  const expected = process.env.PARTNER_API_KEY;
  const key = req.headers.get("x-api-key");
  if (!expected || key !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const address = String(body.property_address ?? body.address ?? "").trim();
  if (!address) {
    return NextResponse.json({ error: "property_address is required" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }
  const supabase = createClient(url, anon);

  const product = PRODUCTS.includes(String(body.product_type)) ? String(body.product_type) : "desktop";
  const order = {
    order_number: genOrderNumber(),
    client_name: body.client_name ? String(body.client_name) : null,
    property_address: address,
    product_type: product,
    loan_amount: body.loan_amount != null ? Number(body.loan_amount) : null,
    notes: body.notes ? String(body.notes) : null,
    source: body.source ? String(body.source) : "exceleras",
    exceleras_number: body.reference_number ? String(body.reference_number) : null,
    status: "new",
  };

  const { data, error } = await supabase
    .from("orders")
    .insert(order)
    .select("order_number, status")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, order_number: data.order_number, status: data.status, property_address: address },
    { status: 201 },
  );
}
