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
import { PHOTO_BUCKET } from "@/lib/photo-shots";
import { analyzeMarket } from "@/lib/comp-engine";
import { hasRentcastKey, pullMarketData, type MarketPull } from "@/lib/rentcast";
import { mergeSubject, mergeComps } from "@/lib/merge-sources";
import type { SubjectProperty, Comp, CompStatus } from "@/lib/market-data";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel — plenty for server-side PDF read + AI call

// Haiku by default — extraction is a fast structured read, and the host caps
// function run time (Opus can run past it and the request 504s). Override with
// ANTHROPIC_EXTRACT_MODEL if you want a heavier model and have the time budget.
const MODEL = process.env.ANTHROPIC_EXTRACT_MODEL || "claude-haiku-4-5-20251001";
const MAX_INPUT_CHARS = 110000; // enough to include the comp grid even with full sheets

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
    // Optional fast path: caller already extracted the text.
    content.push({ type: "text", text: docText.slice(0, MAX_INPUT_CHARS) });
  } else {
    // SERVER-SIDE read (reliable — runs in Node like REO Hub). Densest text first
    // so the compact comp grid always reaches the model, whatever else is uploaded.
    const { data: files } = await supabase.storage.from(PHOTO_BUCKET).list(folder);
    const docs = (files ?? []).filter((f) => f.name && !f.name.startsWith("_") && !f.name.endsWith(".json"));
    if (docs.length === 0) {
      return NextResponse.json({ error: "No documents uploaded for this order yet." }, { status: 404 });
    }
    const { extractText, getDocumentProxy } = await import("unpdf");
    const chunks: { name: string; text: string }[] = [];
    for (const f of docs) {
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
      if (text && text.trim()) chunks.push({ name: f.name, text: text.trim() });
    }
    chunks.sort((a, b) => a.text.length - b.text.length);
    let combined = "";
    for (const c of chunks) combined += `\n--- ${c.name} ---\n${c.text}`;
    if (combined.trim().length < 50) {
      return NextResponse.json({ error: "Couldn't read text from the uploaded documents (no extractable text)." }, { status: 422 });
    }
    content.push({ type: "text", text: combined.slice(0, MAX_INPUT_CHARS) });
  }
  content.push({
    type: "text",
    text:
      "The text above was extracted from MLS / comparable / tax PDFs for one property order. It may be messy — table columns can be jumbled, wrapped, or out of order because it came from a PDF. Do your best to identify EACH property listing in it. Extract the SUBJECT property and EVERY comparable property (active, pending, contingent, and sold) — each address with whatever price, status, beds, baths, sqft, and dates you can associate with it. A row often looks like an address followed by a price and bed/bath/sqft numbers. Capture them ALL; do not filter or drop any. If a field is unclear, omit just that field, not the whole comp. Use the record_extraction tool.",
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

  const docSubject = toSubject(extracted.subject ?? {}, address);
  const docComps = (extracted.comps ?? []).map(toComp);

  // USE BOTH DATA SETS: pull the Rentcast public record and merge it with the
  // agent's docs. The record fills "no public record" / thin-MLS gaps and adds
  // sold comps; the docs supply current listing detail. Best-effort — a Rentcast
  // miss never blocks a doc-based report.
  let rc: MarketPull | null = null;
  const lookupAddress = address || docSubject.address;
  if (hasRentcastKey() && lookupAddress) {
    try {
      rc = await pullMarketData(lookupAddress);
    } catch {
      rc = null;
    }
  }
  const subject = mergeSubject(docSubject, rc?.subject ?? null);
  const comps = mergeComps(docComps, rc?.comps ?? []);

  if (comps.length === 0) {
    const chars = docText.length;
    return NextResponse.json(
      {
        error: `No comparables found (read ${chars.toLocaleString()} characters).`,
        sample: docText.slice(0, 1200),
        subjectSeen: subject.address || null,
      },
      { status: 422 },
    );
  }

  const intel = analyzeMarket(subject, comps, false);
  // Surface Rentcast rent (the "community report" rent) when the docs didn't carry it.
  if (rc?.rent && !intel.rent) intel.rent = rc.rent;

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
      // Both-data-set provenance.
      fromDocs: docComps.length,
      fromRentcast: rc ? rc.comps.length : 0,
      publicRecord: !!(rc && (rc.subject.ownerNames || rc.subject.taxAssessedValue || rc.subject.lastSalePrice)),
    },
  });
}
