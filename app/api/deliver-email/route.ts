// Emails a customer the link to their finished report bundle (/d/[token]).
// Uses Resend when RESEND_API_KEY is set; no-ops (notConfigured) otherwise.
import { NextResponse } from "next/server";

const FROM = process.env.RESEND_FROM || "PropIntel <reports@propintelreport.com>";
const APP = process.env.NEXT_PUBLIC_APP_URL || "https://propintelreport.com";

export async function POST(req: Request) {
  const key = process.env.RESEND_API_KEY;
  let body: { to?: string; token?: string; address?: string; orderNumber?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const to = (body.to ?? "").trim();
  const token = (body.token ?? "").trim();
  if (!to || !token) return NextResponse.json({ error: "Missing recipient or token" }, { status: 400 });
  if (!key) return NextResponse.json({ notConfigured: true });

  const link = `${APP}/d/${token}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;color:#1f2937;max-width:520px">
      <h2 style="color:#14532d">Your Property Intelligence Report is ready</h2>
      <p>Your report for <strong>${body.address || body.orderNumber || "your property"}</strong> is complete.</p>
      <p><a href="${link}" style="display:inline-block;background:#14532d;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Download your report</a></p>
      <p style="font-size:12px;color:#6b7280">Or paste this link: ${link}</p>
      <p style="font-size:12px;color:#6b7280">PropIntel — property intelligence, better than a BPO.</p>
    </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject: `Your report is ready — ${body.address || body.orderNumber || "PropIntel"}`, html }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return NextResponse.json({ error: `Email send failed: ${t.slice(0, 200)}` }, { status: 502 });
    }
    return NextResponse.json({ sent: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "send failed" }, { status: 502 });
  }
}
