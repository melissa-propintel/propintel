// Neighborhood intelligence from free government sources — no API key, no cost.
//   FEMA NFHL  -> flood zone / Special Flood Hazard Area
//   FCC Area   -> lat/long -> census tract
//   Census ACS -> vacancy rate, owner-occupancy, median home value & income
//
// Every call degrades gracefully: a failed/absent source yields null, never an
// error that breaks the report.

import type { NeighborhoodData } from "./market-data";

const TIMEOUT_MS = 8000;

async function getJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Census ACS uses large negative sentinels (e.g. -666666666) for "no data". */
function census(v: unknown): number | null {
  const n = num(v);
  return n !== null && n > -1 ? n : null;
}

function round(n: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

interface FloodResult {
  zone: string;
  risk: string;
  sfha: boolean;
}

async function floodZone(lat: number, lon: number): Promise<FloodResult | null> {
  const url =
    "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query" +
    `?geometry=${lon},${lat}&geometryType=esriGeometryPoint&inSR=4326` +
    "&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE&returnGeometry=false&f=json";
  const data = (await getJson(url)) as { features?: { attributes?: { FLD_ZONE?: string } }[] } | null;
  if (data === null) return null;
  const feats = data.features ?? [];
  if (feats.length === 0) {
    return { zone: "X", risk: "Minimal — not in a FEMA-mapped high-risk flood area", sfha: false };
  }
  const zone = feats[0]?.attributes?.FLD_ZONE ?? "X";
  const sfha = /^(A|V)/i.test(zone);
  return {
    zone,
    risk: sfha
      ? "High — Special Flood Hazard Area; flood insurance required"
      : "Minimal / moderate",
    sfha,
  };
}

interface Tract {
  state: string;
  county: string;
  tract: string;
  full: string;
}

async function tractOf(lat: number, lon: number): Promise<Tract | null> {
  const data = (await getJson(`https://geo.fcc.gov/api/census/area?lat=${lat}&lon=${lon}&format=json`)) as
    | { results?: { block_fips?: string }[] }
    | null;
  const fips = data?.results?.[0]?.block_fips;
  if (!fips || fips.length < 11) return null;
  return { state: fips.slice(0, 2), county: fips.slice(2, 5), tract: fips.slice(5, 11), full: fips.slice(0, 11) };
}

interface AcsResult {
  vacancyRatePct: number | null;
  ownerOccupiedPct: number | null;
  medianHomeValue: number | null;
  medianHouseholdIncome: number | null;
}

async function acs(t: Tract): Promise<AcsResult | null> {
  // The Census API requires a free key (sign up: api.census.gov/data/key_signup.html).
  // Without one we skip the census layer and the report flags it as not available.
  const key = process.env.CENSUS_API_KEY;
  if (!key) return null;
  const vars = "B25002_001E,B25002_003E,B25003_001E,B25003_002E,B25077_001E,B19013_001E";
  const url =
    `https://api.census.gov/data/2022/acs/acs5?get=${vars}` +
    `&for=tract:${t.tract}&in=state:${t.state}+county:${t.county}&key=${key}`;
  const data = (await getJson(url)) as string[][] | null;
  if (!data || data.length < 2) return null;
  const header = data[0];
  const row = data[1];
  const g = (key: string): number | null => {
    const i = header.indexOf(key);
    return i >= 0 ? census(row[i]) : null;
  };
  const totalUnits = g("B25002_001E");
  const vacant = g("B25002_003E");
  const occTotal = g("B25003_001E");
  const owner = g("B25003_002E");
  return {
    vacancyRatePct: totalUnits && vacant !== null && totalUnits > 0 ? round((vacant / totalUnits) * 100) : null,
    ownerOccupiedPct: occTotal && owner !== null && occTotal > 0 ? round((owner / occTotal) * 100) : null,
    medianHomeValue: g("B25077_001E"),
    medianHouseholdIncome: g("B19013_001E"),
  };
}

export async function fetchNeighborhood(lat: number, lon: number): Promise<NeighborhoodData> {
  const [fz, tr] = await Promise.all([floodZone(lat, lon), tractOf(lat, lon)]);
  const acsData = tr ? await acs(tr) : null;

  const sources: string[] = [];
  if (fz) sources.push("FEMA NFHL");
  if (acsData) sources.push("U.S. Census ACS 5-year");

  return {
    floodZone: fz?.zone ?? null,
    floodRisk: fz?.risk ?? null,
    inSFHA: fz ? fz.sfha : null,
    vacancyRatePct: acsData?.vacancyRatePct ?? null,
    ownerOccupiedPct: acsData?.ownerOccupiedPct ?? null,
    medianHomeValue: acsData?.medianHomeValue ?? null,
    medianHouseholdIncome: acsData?.medianHouseholdIncome ?? null,
    censusTract: tr?.full ?? null,
    sources,
  };
}

export function sampleNeighborhood(): NeighborhoodData {
  return {
    floodZone: "X",
    floodRisk: "Minimal — not in a FEMA-mapped high-risk flood area",
    inSFHA: false,
    vacancyRatePct: 16.4,
    ownerOccupiedPct: 49,
    medianHomeValue: 96500,
    medianHouseholdIncome: 38200,
    censusTract: "39035104300",
    sources: ["Sample data"],
  };
}
