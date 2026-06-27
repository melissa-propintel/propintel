// Rentcast data client — the national auto-pull (Phase 1).
//
// Strategy: request a WIDE radius for both active listings and recent sold
// comps, normalize everything into our Comp[] type, and let the comp engine
// build the ½-mile → expand-to-20-25 ring. "Pull wide, narrow in the engine."
//
// Set the key in an env var named RENTCAST_API_KEY (Netlify → Site settings →
// Environment variables, and a local .env.local for dev). No key → callers fall
// back to the built-in sample.
//
// NOTE: the active/sold split is the one spot to tune once we see live
// responses — Rentcast surfaces active listings via /listings/sale and recent
// comparable sales via the AVM /avm/value `comparables` array. Both map into the
// same normalized Comp; the engine treats them identically downstream.

import type { SubjectProperty, Comp, CompStatus, RentRead } from "./market-data";
import { distanceMiles } from "./comp-engine";

const BASE = "https://api.rentcast.io/v1";
const WIDE_RADIUS_MI = 3; // pull wide; the engine trims to ½ mi unless it must expand
const SOLD_WINDOW_DAYS = 270; // ~9 months of recent sales to choose a 6-mo set from

export function hasRentcastKey(): boolean {
  return Boolean(process.env.RENTCAST_API_KEY);
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[$,]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

async function get(path: string, params: Record<string, string | number>): Promise<unknown> {
  const key = process.env.RENTCAST_API_KEY;
  if (!key) throw new Error("RENTCAST_API_KEY is not set");
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString();
  const res = await fetch(`${BASE}${path}?${qs}`, {
    headers: { Accept: "application/json", "X-Api-Key": key },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Rentcast ${path} returned ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

// ---- raw shapes (partial, optional-safe) ----

interface RawRecord {
  id?: string;
  formattedAddress?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  county?: string;
  latitude?: number;
  longitude?: number;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  lotSize?: number;
  yearBuilt?: number;
  price?: number;
  status?: string;
  listedDate?: string;
  removedDate?: string;
  lastSaleDate?: string;
  lastSalePrice?: number;
  daysOnMarket?: number;
  distance?: number;
  taxAssessments?: Record<string, { value?: number }>;
}

interface RawAvm {
  price?: number;
  priceRangeLow?: number;
  priceRangeHigh?: number;
  latitude?: number;
  longitude?: number;
  comparables?: RawRecord[];
}

function latestTaxAssessment(rec: RawRecord): number | null {
  const t = rec.taxAssessments;
  if (!t) return null;
  const years = Object.keys(t).sort();
  for (let i = years.length - 1; i >= 0; i--) {
    const v = num(t[years[i]]?.value);
    if (v !== null) return v;
  }
  return null;
}

function toSubject(rec: RawRecord, addressFallback: string): SubjectProperty {
  return {
    address: str(rec.formattedAddress) ?? str(rec.addressLine1) ?? addressFallback,
    city: str(rec.city) ?? "",
    state: str(rec.state) ?? "",
    zip: str(rec.zipCode) ?? "",
    county: str(rec.county),
    latitude: num(rec.latitude),
    longitude: num(rec.longitude),
    propertyType: str(rec.propertyType),
    yearBuilt: num(rec.yearBuilt),
    beds: num(rec.bedrooms),
    baths: num(rec.bathrooms),
    sqft: num(rec.squareFootage),
    lotSize: num(rec.lotSize),
    lastSaleDate: str(rec.lastSaleDate),
    lastSalePrice: num(rec.lastSalePrice),
    taxAssessedValue: latestTaxAssessment(rec),
  };
}

function toComp(
  rec: RawRecord,
  status: CompStatus,
  subjectLat: number | null,
  subjectLon: number | null,
): Comp | null {
  const price = num(rec.price);
  const sqft = num(rec.squareFootage);
  const lat = num(rec.latitude);
  const lon = num(rec.longitude);
  let dist = num(rec.distance);
  if (dist === null && lat !== null && lon !== null && subjectLat !== null && subjectLon !== null) {
    dist = distanceMiles(subjectLat, subjectLon, lat, lon);
  }
  if (dist === null) return null; // can't place it on the ring
  return {
    id: str(rec.id) ?? `${status}-${str(rec.formattedAddress) ?? Math.round((lat ?? 0) * 1e4)}`,
    address: str(rec.formattedAddress) ?? str(rec.addressLine1) ?? "(address unavailable)",
    latitude: lat,
    longitude: lon,
    distanceMiles: Math.round(dist * 100) / 100,
    status,
    price,
    soldDate: status === "sold" ? str(rec.removedDate) ?? str(rec.lastSaleDate) : null,
    listedDate: str(rec.listedDate),
    daysOnMarket: num(rec.daysOnMarket),
    beds: num(rec.bedrooms),
    baths: num(rec.bathrooms),
    sqft,
    pricePerSqft: price !== null && sqft !== null && sqft > 0 ? Math.round(price / sqft) : null,
  };
}

interface RawRent {
  rent?: number;
  rentRangeLow?: number;
  rentRangeHigh?: number;
}

export interface MarketPull {
  subject: SubjectProperty;
  comps: Comp[];
  rent: RentRead | null;
}

async function tryGet(path: string, params: Record<string, string | number>): Promise<unknown> {
  try {
    return await get(path, params);
  } catch {
    return null; // tolerate a 404/no-match on one source; we fall back to others
  }
}

/** Pull subject + active listings + recent sold comps for an address.
 *  Robust to addresses Rentcast has no property record for: falls back to the
 *  AVM endpoint (which geocodes the address itself) for lat/long + sold comps. */
export async function pullMarketData(address: string): Promise<MarketPull> {
  // 1. Subject record (best source — full characteristics + authoritative lat/long).
  const recs = (await tryGet("/properties", { address, limit: 1 })) as RawRecord[] | null;
  const rec0 = Array.isArray(recs) ? recs[0] : undefined;
  let subject = rec0 ? toSubject(rec0, address) : null;

  // 2. AVM — sold comps, and a lat/long + value fallback if there was no record.
  const avm = (await tryGet("/avm/value", {
    address,
    maxRadius: WIDE_RADIUS_MI,
    daysOld: SOLD_WINDOW_DAYS,
    compCount: 50,
  })) as RawAvm | null;

  // Build a subject from the AVM response when the property record was missing.
  if (!subject) {
    const lat = num(avm?.latitude);
    const lon = num(avm?.longitude);
    if (lat === null || lon === null) {
      throw new Error(`No data found for "${address}". Verify the address (street, city, state, zip) — it may not be in coverage.`);
    }
    subject = {
      address,
      city: "",
      state: "",
      zip: "",
      county: null,
      latitude: lat,
      longitude: lon,
      propertyType: null,
      yearBuilt: null,
      beds: null,
      baths: null,
      sqft: null,
      lotSize: null,
      lastSaleDate: null,
      lastSalePrice: null,
      taxAssessedValue: null,
    };
  }

  const { latitude: lat, longitude: lon } = subject;
  const comps: Comp[] = [];

  // 3. Active listings within a wide radius (needs lat/long).
  if (lat !== null && lon !== null) {
    const actives = (await tryGet("/listings/sale", {
      latitude: lat,
      longitude: lon,
      radius: WIDE_RADIUS_MI,
      status: "Active",
      limit: 200,
    })) as RawRecord[] | null;
    if (Array.isArray(actives)) {
      for (const r of actives) {
        const c = toComp(r, "active", lat, lon);
        if (c) comps.push(c);
      }
    }
  }

  // 4. Recent sold comps from the AVM comparables set.
  if (avm && Array.isArray(avm.comparables)) {
    for (const r of avm.comparables) {
      const c = toComp(r, "sold", lat, lon);
      if (c) comps.push(c);
    }
  }

  // 5. Long-term rent estimate (best-effort).
  let rent: RentRead | null = null;
  const rentRaw = (await tryGet("/avm/rent/long-term", { address, compCount: 20 })) as RawRent | null;
  if (rentRaw) {
    rent = {
      estimate: num(rentRaw.rent),
      low: num(rentRaw.rentRangeLow),
      high: num(rentRaw.rentRangeHigh),
    };
  }

  return { subject, comps, rent };
}
