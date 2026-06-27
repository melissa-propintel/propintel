// POST { orderNumber, address, agentEmail, agentName?, productType?, dueDate? }
// -> emails the agent their scoped capture link + the photo requirements.
// Uses Resend when RESEND_API_KEY is set; otherwise returns notConfigured so the
// dashboard can fall back to "copy link".

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const FROM = process.env.AGENT_INVITE_FROM || "PropIntel <orders@propintelreport.com>";

function captureUrl(origin: string, orderNumber: string, level: string): string {
  const lvl = level === "lite" ? "lite" : "full";
  return `${origin}/capture?order=${encodeURIComponent(orderNumber)}&level=${lvl}`;
}

function emailHtml(opts: { link: string; address: string; orderNumber: string; agentName?: string; dueDate?: string }): string {
  const greeting = opts.agentName ? `Hi ${opts.agentName},` : "Hi,";
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:560px;margin:0 auto">
    <div style="background:#0b1f3a;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">
      <div style="font-weight:800;font-size:18px">PROPINTEL</div>
      <div style="font-size:12px;color:#9db8e0">Field photo assignment</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px">
      <p>${greeting}</p>
      <p>You have a new property to photograph for PropIntel.</p>
      <p style="margin:14px 0;padding:12px;background:#f1f5f9;border-radius:6px">
        <strong>Property:</strong> ${opts.address || "(see link)"}<br/>
        <strong>Order:</strong> ${opts.orderNumber}${opts.dueDate ? `<br/><strong>Due:</strong> ${opts.dueDate}` : ""}
      </p>
      <p style="text-align:center;margin:22px 0">
        <a href="${opts.link}" style="background:#0b1f3a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;display:inline-block">
          Open your assignment &rarr;
        </a>
      </p>
      <p style="font-size:13px;color:#374151"><strong>Open the link on your phone</strong> (Safari on iPhone, Chrome on Android). Tap <strong>Allow</strong> when it asks for the camera. Photos upload automatically as you take them.</p>
      <p style="font-size:13px;color:#b91c1c;background:#fef2f2;padding:10px;border-radius:6px">
        <strong>Photos we MUST have:</strong> front of the house and all 4 sides; the roof (from the ground);
        the home on the left, the right, and across the street; the electrical / breaker box; the HVAC unit;
        the hot water heater. If you can get inside: every room and any damage. Add anything else you think we should see.
      </p>
      <p style="font-size:12px;color:#9ca3af">PropIntel — we stop fraud before the money moves.</p>
    </div>
  </div>`;
}

export async function POST(req: Request) {
  let body: { orderNumber?: string; address?: string; agentEmail?: string; agentName?: string; dueDate?: string; level?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const orderNumber = (body.orderNumber ?? "").trim();
  // Accept a bare email or pull it out of a "Name <email>" string; strip brackets.
  const raw = (body.agentEmail ?? "").trim();
  const agentEmail = (raw.match(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/)?.[0] ?? raw).replace(/[<>]/g, "");
  if (!orderNumber || !agentEmail) {
    return NextResponse.json({ error: "orderNumber and agentEmail are required." }, { status: 400 });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return NextResponse.json({ notConfigured: true });
  }

  const origin = new URL(req.url).origin;
  const link = captureUrl(origin, orderNumber, body.level ?? "full");
  const html = emailHtml({
    link,
    address: body.address ?? "",
    orderNumber,
    agentName: body.agentName,
    dueDate: body.dueDate,
  });

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [agentEmail],
        subject: `PropIntel assignment — ${body.address || orderNumber}`,
        html,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return NextResponse.json({ error: `Email send failed: ${t.slice(0, 200)}` }, { status: 502 });
    }
    return NextResponse.json({ sent: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Email send failed." }, { status: 502 });
  }
}
