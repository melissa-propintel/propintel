// ZIP-level market TREND from Rentcast's /markets endpoint. Reuses the same
// RENTCAST_API_KEY as the comp pull — no extra cost, just another call.
//
// The comp engine tells us where value sits TODAY; this tells us which DIRECTION
// the ZIP is moving (median price + days-on-market over the last ~12 months) —
// exactly the "this area is heating up / cooling" read a disposition needs.
// Best-effort: any failure returns null and the brief simply omits the section.

const BASE = "https://api.rentcast.io/v1";

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[$,]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

interface HistoryPoint {
  key: string; // "YYYY-MM"
  medianPrice: number | null;
  medianDom: number | null;
  totalListings: number | null;
}

export interface MarketTrend {
  zip: string;
  latestMonth: string | null;
  medianPrice: number | null;
  medianPricePrior: number | null;
  medianPriceChangePct: number | null;
  medianDom: number | null;
  medianDomPrior: number | null;
  totalListings: number | null;
  monthsCompared: number;
}

interface RawMarket {
  saleData?: {
    medianPrice?: number;
    medianDaysOnMarket?: number;
    totalListings?: number;
    history?: Record<
      string,
      { medianPrice?: number; medianDaysOnMarket?: number; totalListings?: number }
    >;
  };
}

export async function fetchMarketTrend(zip: string): Promise<MarketTrend | null> {
  const key = process.env.RENTCAST_API_KEY;
  const z = (zip || "").trim().slice(0, 5);
  if (!key || z.length !== 5) return null;

  let raw: RawMarket | null = null;
  try {
    const res = await fetch(
      `${BASE}/markets?zipCode=${z}&dataType=Sale&historyRange=12`,
      { headers: { Accept: "application/json", "X-Api-Key": key } },
    );
    if (!res.ok) return null;
    raw = (await res.json()) as RawMarket;
  } catch {
    return null;
  }

  const sale = raw?.saleData;
  if (!sale) return null;

  // Sort the monthly history oldest → newest.
  const hist: HistoryPoint[] = Object.entries(sale.history ?? {})
    .map(([k, v]) => ({
      key: k,
      medianPrice: num(v?.medianPrice),
      medianDom: num(v?.medianDaysOnMarket),
      totalListings: num(v?.totalListings),
    }))
    .filter((h) => /^\d{4}-\d{2}/.test(h.key))
    .sort((a, b) => a.key.localeCompare(b.key));

  const latest = hist.length ? hist[hist.length - 1] : null;
  // Compare to ~6 months earlier (or the earliest we have).
  const priorIdx = Math.max(0, hist.length - 7);
  const prior = hist.length > 1 ? hist[priorIdx] : null;

  const medianPrice = num(sale.medianPrice) ?? latest?.medianPrice ?? null;
  const medianPricePrior = prior?.medianPrice ?? null;
  const changePct =
    medianPrice !== null && medianPricePrior !== null && medianPricePrior > 0
      ? Math.round(((medianPrice - medianPricePrior) / medianPricePrior) * 1000) / 10
      : null;

  return {
    zip: z,
    latestMonth: latest?.key ?? null,
    medianPrice,
    medianPricePrior,
    medianPriceChangePct: changePct,
    medianDom: num(sale.medianDaysOnMarket) ?? latest?.medianDom ?? null,
    medianDomPrior: prior?.medianDom ?? null,
    totalListings: num(sale.totalListings) ?? latest?.totalListings ?? null,
    monthsCompared: latest && prior ? hist.length - 1 - priorIdx : 0,
  };
}

function usd(n: number | null): string {
  return n === null ? "—" : "$" + Math.round(n).toLocaleString("en-US");
}

export function formatMarketTrend(t: MarketTrend): string {
  const parts: string[] = [];
  if (t.medianPrice !== null) {
    let p = `ZIP ${t.zip} median list price ${usd(t.medianPrice)}`;
    if (t.medianPriceChangePct !== null && t.monthsCompared > 0) {
      const dir = t.medianPriceChangePct > 0 ? "up" : t.medianPriceChangePct < 0 ? "down" : "flat";
      p += ` — ${dir} ${Math.abs(t.medianPriceChangePct)}% over ~${t.monthsCompared} mo`;
    }
    parts.push(p + ".");
  }
  if (t.medianDom !== null) {
    let d = `Median days-on-market ${t.medianDom}`;
    if (t.medianDomPrior !== null) {
      const faster = t.medianDom < t.medianDomPrior;
      d += ` (was ${t.medianDomPrior} — homes selling ${faster ? "faster" : "slower"})`;
    }
    parts.push(d + ".");
  }
  if (t.totalListings !== null) parts.push(`${t.totalListings} active listings in the ZIP.`);
  if (!parts.length) return "";
  return `ZIP trend (Rentcast, last ~12 mo): ${parts.join(" ")}`;
}
