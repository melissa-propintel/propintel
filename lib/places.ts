// Drive-times & nearby points of interest from free, keyless open data:
//   OpenStreetMap / Overpass -> nearest grocery, school, hospital, highway ramp
//   OSRM (public router)      -> real driving time + distance to each
//
// This is the location narrative a disposition needs — "18 min to a grocery
// store, 9 min to I-59" — with no API key and no billing. Every step degrades
// gracefully: a slow/absent source yields null, never an error that breaks the
// pull. This is deliberately best-effort; if OSM/OSRM are busy we just omit it.

const OVERPASS = "https://overpass-api.de/api/interpreter";
const OSRM = "https://router.project-osrm.org/route/v1/driving";
const TIMEOUT_MS = 12000;

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface OverElement {
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface Poi {
  name: string;
  lat: number;
  lon: number;
  straightMiles: number;
}

function coordOf(el: OverElement): { lat: number; lon: number } | null {
  if (typeof el.lat === "number" && typeof el.lon === "number") return { lat: el.lat, lon: el.lon };
  if (el.center) return { lat: el.center.lat, lon: el.center.lon };
  return null;
}

// Nearest element (by straight-line distance) matching a tag predicate.
function nearest(
  els: OverElement[],
  lat: number,
  lon: number,
  match: (tags: Record<string, string>) => boolean,
  fallbackName: string,
): Poi | null {
  let best: Poi | null = null;
  for (const el of els) {
    const tags = el.tags ?? {};
    if (!match(tags)) continue;
    const c = coordOf(el);
    if (!c) continue;
    const d = haversineMiles(lat, lon, c.lat, c.lon);
    if (!best || d < best.straightMiles)
      best = { name: tags.name || fallbackName, lat: c.lat, lon: c.lon, straightMiles: d };
  }
  return best;
}

export interface DriveHit {
  name: string;
  minutes: number | null;
  miles: number | null;
}

export interface PlacesData {
  grocery: DriveHit | null;
  school: DriveHit | null;
  hospital: DriveHit | null;
  highway: DriveHit | null;
}

// Real driving time/distance from subject to a POI via OSRM.
async function driveTo(
  lat: number,
  lon: number,
  poi: Poi | null,
): Promise<DriveHit | null> {
  if (!poi) return null;
  const url = `${OSRM}/${lon},${lat};${poi.lon},${poi.lat}?overview=false`;
  const data = (await getJson(url)) as
    | { routes?: { duration?: number; distance?: number }[] }
    | null;
  const route = data?.routes?.[0];
  if (!route) {
    // OSRM unavailable — fall back to straight-line distance only.
    return { name: poi.name, minutes: null, miles: Math.round(poi.straightMiles * 10) / 10 };
  }
  return {
    name: poi.name,
    minutes: route.duration != null ? Math.round(route.duration / 60) : null,
    miles: route.distance != null ? Math.round((route.distance / 1609.34) * 10) / 10 : null,
  };
}

export async function fetchDriveTimes(lat: number, lon: number): Promise<PlacesData | null> {
  // One Overpass query covers every category we need (fewer round-trips).
  const q = `[out:json][timeout:25];
(
  node["shop"="supermarket"](around:16000,${lat},${lon});
  way["shop"="supermarket"](around:16000,${lat},${lon});
  node["amenity"="school"](around:12000,${lat},${lon});
  way["amenity"="school"](around:12000,${lat},${lon});
  node["amenity"="hospital"](around:24000,${lat},${lon});
  way["amenity"="hospital"](around:24000,${lat},${lon});
  node["highway"="motorway_junction"](around:24000,${lat},${lon});
);
out center 200;`;

  const data = (await getJson(OVERPASS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(q),
  })) as { elements?: OverElement[] } | null;
  if (!data || !Array.isArray(data.elements)) return null;
  const els = data.elements;

  const groceryPoi = nearest(els, lat, lon, (t) => t.shop === "supermarket", "grocery store");
  const schoolPoi = nearest(els, lat, lon, (t) => t.amenity === "school", "school");
  const hospitalPoi = nearest(els, lat, lon, (t) => t.amenity === "hospital", "hospital");
  const highwayPoi = nearest(
    els,
    lat,
    lon,
    (t) => t.highway === "motorway_junction",
    "highway on-ramp",
  );

  // Compute drive times in parallel (up to 4 OSRM calls).
  const [grocery, school, hospital, highway] = await Promise.all([
    driveTo(lat, lon, groceryPoi),
    driveTo(lat, lon, schoolPoi),
    driveTo(lat, lon, hospitalPoi),
    driveTo(lat, lon, highwayPoi),
  ]);

  if (!grocery && !school && !hospital && !highway) return null;
  return { grocery, school, hospital, highway };
}

function hitLine(label: string, h: DriveHit | null): string | null {
  if (!h) return null;
  const time = h.minutes !== null ? `${h.minutes} min` : h.miles !== null ? `${h.miles} mi` : null;
  if (!time) return null;
  const dist = h.minutes !== null && h.miles !== null ? ` (${h.miles} mi)` : "";
  return `${label}: ${time}${dist} — ${h.name}`;
}

export function formatPlaces(p: PlacesData): string {
  const lines = [
    hitLine("Nearest grocery", p.grocery),
    hitLine("Nearest school", p.school),
    hitLine("Nearest hospital", p.hospital),
    hitLine("Highway access", p.highway ? { ...p.highway, name: "on-ramp" } : null),
  ].filter(Boolean);
  if (!lines.length) return "";
  return "Location / drive-times (OpenStreetMap):\n" + lines.map((l) => `  • ${l}`).join("\n");
}
