// AI extraction — read an order's uploaded MLS/comp/tax documents and turn them
// into structured subject + comps, then run the SAME comp engine the address-
// lookup uses (analyzeMarket picks the comps + builds value/absorption/bands).
//
// The agent uploads the full set "in competition"; the platform extracts and
// selects — the agent never sees or controls which comps are used.
//
// AI reads documents INTERNALLY only (allowed). It never composes or sends email.
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { extractText, getDocumentProxy } from "unpdf";
import { PHOTO_BUCKET } from "@/lib/photo-shots";
import { analyzeMarket } from "@/lib/comp-engine";
import type { SubjectProperty, Comp, CompStatus } from "@/lib/market-data";

export const runtime = "nodejs";
export const maxDuration = 26; // Netlify's max synchronous function time

// Haiku by default — extraction is a fast structured read, and the host caps
// function run time (Opus can run past it and the request 504s). Override with
// ANTHROPIC_EXTRACT_MODEL if you want a heavier model and have the time budget.
const MODEL = process.env.ANTHROPIC_EXTRACT_MODEL || "claude-haiku-4-5-20251001";
const MAX_INPUT_CHARS = 45000; // keep the request small + the call fast (avoid 504)

function safeFolder(s: string): string {
  return (s.trim() || "unassigned").replace(/[^\w.-]+/g, "_").slice(0, 60);
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[$,]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function mediaType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "pdf") return "application/pdf";
  return "text/plain";
}

const EXTRACTION_TOOL = {
  name: "record_extraction",
  description:
    "Record the subject property and ALL comparable properties found in the uploaded MLS / comp documents.",
  input_schema: {
    type: "object" as const,
    properties: {
      subject: {
        type: "object",
        properties: {
          address: { type: "string" },
          city: { type: "string" },
          state: { type: "string" },
          zip: { type: "string" },
          propertyType: { type: "string" },
          yearBuilt: { type: "number" },
          beds: { type: "number" },
          baths: { type: "number" },
          sqft: { type: "number" },
          lotSize: { type: "number" },
          lastSaleDate: { type: "string" },
          lastSalePrice: { type: "number" },
          taxAssessedValue: { type: "number" },
          ownerNames: { type: "array", items: { type: "string" } },
          ownerType: { type: "string" },
        },
      },
      comps: {
        type: "array",
        description: "Every comparable in the documents — do not filter or pre-select.",
        items: {
          type: "object",
          properties: {
            address: { type: "string" },
            status: { type: "string", enum: ["active", "pending", "contingent", "sold"] },
            price: { type: "number", description: "Sold price if sold, else current list price." },
            beds: { type: "number" },
            baths: { type: "number" },
            sqft: { type: "number" },
            soldDate: { type: "string" },
            listedDate: { type: "string" },
            daysOnMarket: { type: "number" },
            distanceMiles: { type: "number", description: "Distance from subject if shown." },
            propertyType: { type: "string" },
          },
          required: ["address", "status"],
        },
      },
    },
    required: ["subject", "comps"],
  },
};

type RawSubject = Record<string, unknown>;
type RawComp = Record<string, unknown>;

function toSubject(s: RawSubject, fallbackAddress: string): SubjectProperty {
  return {
    address: (s.address as string) || fallbackAddress,
    city: (s.city as string) || "",
    state: (s.state as string) || "",
    zip: (s.zip as string) || "",
    county: null,
    latitude: null,
    longitude: null,
    propertyType: (s.propertyType as string) ?? null,
    yearBuilt: num(s.yearBuilt),
    beds: num(s.beds),
    baths: num(s.baths),
    sqft: num(s.sqft),
    lotSize: num(s.lotSize),
    lastSaleDate: (s.lastSaleDate as string) ?? null,
    lastSalePrice: num(s.lastSalePrice),
    taxAssessedValue: num(s.taxAssessedValue),
    ownerNames: Array.isArray(s.ownerNames) && s.ownerNames.length ? (s.ownerNames as string[]) : null,
    ownerOccupied: null,
    ownerType: (s.ownerType as string) ?? null,
    saleHistory: null,
  };
}

function toComp(c: RawComp, i: number): Comp {
  const raw = String(c.status ?? "active").toLowerCase();
  const status: CompStatus = raw === "sold" ? "sold" : raw === "active" ? "active" : "pending"; // contingent/pending -> pending
  const price = num(c.price);
  const sqft = num(c.sqft);
  return {
    id: `agent-${i}`,
    address: (c.address as string) || `Comp ${i + 1}`,
    latitude: null,
    longitude: null,
    distanceMiles: num(c.distanceMiles) ?? 0.25, // all uploaded comps are within the pulled radius
    status,
    price,
    soldDate: (c.soldDate as string) ?? null,
    listedDate: (c.listedDate as string) ?? null,
    daysOnMarket: num(c.daysOnMarket),
    beds: num(c.beds),
    baths: num(c.baths),
    sqft,
    pricePerSqft: price !== null && sqft ? Math.round(price / sqft) : null,
    propertyType: (c.propertyType as string) ?? null,
  };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI not configured" }, { status: 500 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Storage not configured" }, { status: 500 });

  let order = "";
  let address = "";
  let docText = "";
  try {
    const body = (await req.json()) as { order?: string; address?: string; docText?: string };
    order = (body.order ?? "").trim();
    address = (body.address ?? "").trim();
    docText = (body.docText ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!order) return NextResponse.json({ error: "order is required" }, { status: 400 });

  const supabase = createClient(url, anon);
  const folder = `${safeFolder(order)}/docs`;
  const content: Anthropic.ContentBlockParam[] = [];

  if (docText.length >= 50) {
    // FAST PATH: the browser already extracted the PDF text and sent it. The
    // server only runs the (quick) AI call — no PDF parsing here, so it fits the
    // host's function time limit.
    content.push({ type: "text", text: docText.slice(0, MAX_INPUT_CHARS) });
  } else {
    // FALLBACK: parse the docs server-side (heavier; can hit the time limit).
    const { data: files, error: listErr } = await supabase.storage.from(PHOTO_BUCKET).list(folder);
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
    const docs = (files ?? []).filter((f) => f.name && !f.name.startsWith("_") && !f.name.endsWith(".json"));
    if (docs.length === 0) {
      return NextResponse.json({ error: "No documents uploaded for this order yet." }, { status: 404 });
    }
    let imgCount = 0;
    let used = 0;
    const pushText = (label: string, body: string) => {
      if (used >= MAX_INPUT_CHARS) return;
      const slice = body.slice(0, MAX_INPUT_CHARS - used);
      used += slice.length;
      content.push({ type: "text", text: `--- ${label} ---\n${slice}` });
    };
    for (const f of docs) {
      const { data: blob } = await supabase.storage.from(PHOTO_BUCKET).download(`${folder}/${f.name}`);
      if (!blob) continue;
      const mt = mediaType(f.name);
      const buf = Buffer.from(await blob.arrayBuffer());
      if (mt === "application/pdf") {
        let txt = "";
        try {
          const pdf = await getDocumentProxy(new Uint8Array(buf));
          const res = await extractText(pdf, { mergePages: true });
          txt = (Array.isArray(res.text) ? res.text.join("\n") : res.text) ?? "";
        } catch {
          txt = "";
        }
        if (txt.trim().length >= 200) pushText(`${f.name} (MLS PDF)`, txt);
        else if (buf.length < 3_000_000 && imgCount < 2) {
          imgCount++;
          content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } });
        }
      } else if (mt.startsWith("image/") && imgCount < 3 && buf.length < 3_000_000) {
        imgCount++;
        content.push({ type: "image", source: { type: "base64", media_type: mt as "image/png" | "image/jpeg", data: buf.toString("base64") } });
      } else if (mt === "text/plain") {
        pushText(f.name, buf.toString("utf-8"));
      }
    }
  }
  if (content.length === 0) {
    return NextResponse.json({ error: "Couldn't read the uploaded documents (no extractable text). Re-export the MLS as a text-based PDF or CSV." }, { status: 422 });
  }
  content.push({
    type: "text",
    text:
      "These are the MLS / comparable / tax documents for one property order. Extract the SUBJECT property and EVERY comparable property shown (active, pending, contingent, and sold). Do not filter, rank, or drop any comp — capture them all exactly as shown. Use the record_extraction tool.",
  });

  const client = new Anthropic({ apiKey });
  let extracted: { subject: RawSubject; comps: RawComp[] };
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: "record_extraction" },
      messages: [{ role: "user", content }],
    });
    const tool = msg.content.find((b) => b.type === "tool_use");
    if (!tool || tool.type !== "tool_use") throw new Error("No extraction returned");
    extracted = tool.input as { subject: RawSubject; comps: RawComp[] };
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Extraction failed" }, { status: 502 });
  }

  const subject = toSubject(extracted.subject ?? {}, address);
  const comps = (extracted.comps ?? []).map(toComp);
  if (comps.length === 0) {
    return NextResponse.json({ error: "No comparables found in the uploaded documents." }, { status: 422 });
  }

  const intel = analyzeMarket(subject, comps, false);

  // The agent's read (recommended price / strategy / comments), if saved.
  let fieldData: Record<string, unknown> | null = null;
  try {
    const { data: fd } = await supabase.storage.from(PHOTO_BUCKET).download(`${safeFolder(order)}/docs/_fielddata.json`);
    if (fd) fieldData = JSON.parse(await fd.text());
  } catch {
    /* optional */
  }

  return NextResponse.json({
    intel,
    fieldData,
    summary: {
      compsExtracted: comps.length,
      active: comps.filter((c) => c.status === "active").length,
      sold: comps.filter((c) => c.status === "sold").length,
      docs: content.length - 1, // content blocks minus the instruction
    },
  });
}
