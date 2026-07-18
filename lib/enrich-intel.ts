// Populate the FREE extra data layers on a MarketIntel — neighborhood (FEMA +
// Census), ZIP-level price/DOM trend (Rentcast /markets), and drive-times
// (OpenStreetMap/OSRM). All best-effort and run in parallel: any source that is
// slow or down degrades to null and never breaks the report.
//
// Kept in one helper so every entry point (lookup, audit, extract) enriches the
// same way. Mirrors REO Hub's lib/market/brief.ts — per the "every free source
// goes into both apps" rule.

import type { MarketIntel, SubjectProperty } from "./market-data";
import { fetchNeighborhood } from "./neighborhood";
import { fetchMarketTrend } from "./market-trend";
import { fetchDriveTimes } from "./places";

export async function enrichMarketIntel(
  intel: MarketIntel,
  subject: SubjectProperty,
): Promise<void> {
  const { latitude, longitude } = subject;
  const zip = (subject.zip || "").trim();

  const [nb, trend, places] = await Promise.all([
    latitude !== null && longitude !== null
      ? fetchNeighborhood(latitude, longitude).catch(() => null)
      : Promise.resolve(null),
    zip ? fetchMarketTrend(zip).catch(() => null) : Promise.resolve(null),
    latitude !== null && longitude !== null
      ? fetchDriveTimes(latitude, longitude).catch(() => null)
      : Promise.resolve(null),
  ]);

  if (nb) intel.neighborhood = nb;
  intel.trend = trend;
  intel.places = places;
}
