"use server";

import { redirect } from "next/navigation";
import { getViewer } from "@/lib/supabase/server";

const FROM = process.env.AGENT_INVITE_FROM || "PropIntel <orders@propintelreport.com>";
const ORDERS_INBOX = process.env.ORDERS_INBOX || "melissa@propintelreport.com";

// A signed-in client requests a report. We email the request to PropIntel (no
// AI, plain template) so Melissa can enter the order. The client is NOT charged
// or given an instant report — this is a request, not a free run.
export async function requestReport(formData: FormData) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const address = String(formData.get("address") ?? "").trim();
  const product = String(formData.get("product") ?? "Desktop report").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!address) redirect("/portal?error=Address+required");

  const key = process.env.RESEND_API_KEY;
  if (key) {
    const text = `New report request from a client account.

Client: ${viewer.email}
Property: ${address}
Product: ${product}
${notes ? `Notes: ${notes}\n` : ""}
Enter this in PropIntel → Orders.`;
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM,
          to: ORDERS_INBOX,
          reply_to: viewer.email ?? undefined,
          subject: `Report request — ${address}`,
          text,
        }),
      });
    } catch {
      // best-effort; still confirm to the client
    }
  }
  redirect("/portal?sent=1");
}
