// Server-side: pull a field order's captured photos (and their notes) from the
// Supabase `field-photos/<order>` folder so the report can embed them.
// Best-effort: returns [] when storage isn't configured or the folder is empty.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PHOTO_BUCKET } from "./photo-shots";
import type { ConditionAssessment } from "./condition";

export interface OrderPhoto {
  label: string;
  comment: string;
  bytes: Uint8Array;
  kind: "jpg" | "png";
}

// Must match the folder slug the capture page writes to.
function safeFolder(s: string): string {
  return (s.trim() || "unassigned").replace(/[^\w.-]+/g, "_").slice(0, 60);
}

function client(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/** Read a cached condition assessment for an order, if one exists. */
export async function fetchCondition(orderId: string): Promise<ConditionAssessment | null> {
  const supabase = client();
  if (!supabase || !orderId) return null;
  try {
    const { data } = await supabase.storage.from(PHOTO_BUCKET).download(`${safeFolder(orderId)}/_condition.json`);
    if (!data) return null;
    return JSON.parse(await data.text()) as ConditionAssessment;
  } catch {
    return null;
  }
}

/** Persist a condition assessment so it isn't re-run on every report. */
export async function saveCondition(orderId: string, assessment: ConditionAssessment): Promise<void> {
  const supabase = client();
  if (!supabase || !orderId) return;
  await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(`${safeFolder(orderId)}/_condition.json`, new Blob([JSON.stringify(assessment)], { type: "application/json" }), { upsert: true });
}

/** Read the order's uploaded MLS / CRS / tax docs as text so the value engine can
 *  scan for distress signals (foreclosure, redemption, As-Is, room-list bed count). */
export async function fetchOrderDocsText(orderId: string, maxChars = 50000, maxFiles = 12): Promise<string> {
  const supabase = client();
  if (!supabase || !orderId) return "";
  const folder = `${safeFolder(orderId)}/docs`;
  try {
    const { data: files } = await supabase.storage
      .from(PHOTO_BUCKET)
      .list(folder, { limit: 60, sortBy: { column: "created_at", order: "desc" } });
    const docs = (files ?? [])
      .filter((f) => f.name && !f.name.startsWith("_") && !f.name.endsWith(".json"))
      .slice(0, maxFiles); // bound work — a folder can have many re-uploads of the same docs
    if (docs.length === 0) return "";
    const { extractText, getDocumentProxy } = await import("unpdf");
    let combined = "";
    for (const f of docs) {
      if (combined.length >= maxChars) break; // stop early once we have enough
      const { data: blob } = await supabase.storage.from(PHOTO_BUCKET).download(`${folder}/${f.name}`);
      if (!blob) continue;
      const lower = f.name.toLowerCase();
      let text = "";
      if (lower.endsWith(".pdf")) {
        try {
          const buf = new Uint8Array(await blob.arrayBuffer());
          const pdf = await getDocumentProxy(buf);
          const res = await extractText(pdf, { mergePages: true });
          text = (Array.isArray(res.text) ? res.text.join("\n") : res.text) ?? "";
        } catch {
          text = "";
        }
      } else if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
        try {
          text = await blob.text();
        } catch {
          text = "";
        }
      }
      if (text && text.trim()) combined += `\n--- ${f.name} ---\n${text.trim()}`;
    }
    return combined.slice(0, maxChars);
  } catch {
    return "";
  }
}

export async function fetchOrderPhotos(orderId: string): Promise<OrderPhoto[]> {
  const supabase = client();
  if (!supabase || !orderId) return [];

  const folder = safeFolder(orderId);

  const { data: list, error } = await supabase.storage.from(PHOTO_BUCKET).list(folder, { limit: 60 });
  if (error || !list) return [];

  // Sidecar JSON notes, keyed by base filename.
  const metaByBase: Record<string, { label?: string; comment?: string }> = {};
  for (const f of list.filter((x) => x.name.endsWith(".json"))) {
    try {
      const { data } = await supabase.storage.from(PHOTO_BUCKET).download(`${folder}/${f.name}`);
      if (data) metaByBase[f.name.replace(/\.json$/i, "")] = JSON.parse(await data.text());
    } catch {
      /* ignore a bad sidecar */
    }
  }

  const photos: OrderPhoto[] = [];
  for (const f of list.filter((x) => /\.(jpe?g|png)$/i.test(x.name))) {
    try {
      const { data } = await supabase.storage.from(PHOTO_BUCKET).download(`${folder}/${f.name}`);
      if (!data) continue;
      const bytes = new Uint8Array(await data.arrayBuffer());
      const base = f.name.replace(/\.(jpe?g|png)$/i, "");
      const meta = metaByBase[base] ?? {};
      photos.push({
        label: meta.label || base,
        comment: meta.comment || "",
        bytes,
        kind: /\.png$/i.test(f.name) ? "png" : "jpg",
      });
    } catch {
      /* skip an unreadable image */
    }
  }
  return photos;
}
