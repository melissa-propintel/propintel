// Browser-side text extraction from an order's uploaded MLS/comp/tax docs.
//
// We pull the PDF text in the BROWSER (no serverless time limit here) and send
// just that text to /api/extract, so the server only runs the quick AI call and
// stays well under the host's function timeout.
import { getSupabase } from "./supabase-browser";
import { PHOTO_BUCKET } from "./photo-shots";

function safeFolder(s: string): string {
  return (s.trim() || "unassigned").replace(/[^\w.-]+/g, "_").slice(0, 60);
}

export async function extractDocText(orderNumber: string): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) return "";
  const folder = `${safeFolder(orderNumber)}/docs`;
  const { data: files } = await supabase.storage.from(PHOTO_BUCKET).list(folder);
  const docs = (files ?? []).filter((f) => f.name && !f.name.startsWith("_"));
  if (docs.length === 0) return "";

  const { extractText, getDocumentProxy } = await import("unpdf");
  const chunks: { name: string; text: string }[] = [];
  for (const f of docs) {
    const name = f.name.toLowerCase();
    const { data: blob } = await supabase.storage.from(PHOTO_BUCKET).download(`${folder}/${f.name}`);
    if (!blob) continue;
    let text = "";
    if (name.endsWith(".pdf")) {
      try {
        const buf = new Uint8Array(await blob.arrayBuffer());
        const pdf = await getDocumentProxy(buf);
        const res = await extractText(pdf, { mergePages: true });
        text = (Array.isArray(res.text) ? res.text.join("\n") : res.text) ?? "";
      } catch {
        /* skip unreadable PDF */
      }
    } else if (name.endsWith(".csv") || name.endsWith(".txt")) {
      try {
        text = await blob.text();
      } catch {
        /* skip */
      }
    }
    if (text && text.trim()) chunks.push({ name: f.name, text: text.trim() });
  }

  // Densest-first: the MLS comp GRID is compact text; verbose full sheets (and the
  // photo pages around them) are big. Feeding the smallest text first guarantees
  // the grid reaches the model even when an agent dumps in everything they have.
  chunks.sort((a, b) => a.text.length - b.text.length);
  let out = "";
  for (const c of chunks) out += `\n--- ${c.name} ---\n${c.text}`;
  return out.slice(0, 150000);
}
