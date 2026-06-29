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
  // Smallest files first — the MLS search/grid export (the comp list) is small and
  // must not get squeezed out by the huge photo-laden full sheets.
  const docs = (files ?? [])
    .filter((f) => f.name && !f.name.startsWith("_"))
    .sort((a, b) => {
      const sa = (a.metadata?.size as number | undefined) ?? 0;
      const sb = (b.metadata?.size as number | undefined) ?? 0;
      return sa - sb;
    });
  if (docs.length === 0) return "";

  const { extractText, getDocumentProxy } = await import("unpdf");
  let out = "";
  for (const f of docs) {
    const name = f.name.toLowerCase();
    const { data: blob } = await supabase.storage.from(PHOTO_BUCKET).download(`${folder}/${f.name}`);
    if (!blob) continue;
    if (name.endsWith(".pdf")) {
      try {
        const buf = new Uint8Array(await blob.arrayBuffer());
        const pdf = await getDocumentProxy(buf);
        const res = await extractText(pdf, { mergePages: true });
        const t = Array.isArray(res.text) ? res.text.join("\n") : res.text;
        if (t && t.trim()) out += `\n--- ${f.name} ---\n${t}`;
      } catch {
        /* skip unreadable PDF */
      }
    } else if (name.endsWith(".csv") || name.endsWith(".txt")) {
      try {
        out += `\n--- ${f.name} ---\n${await blob.text()}`;
      } catch {
        /* skip */
      }
    }
  }
  return out.slice(0, 150000);
}
