// Built-in sample so the market-intelligence flow is demoable with no API key.
// Mirrors the Cleveland oversupply story: actives stacked at $125k–$140k that
// aren't clearing, a couple of recent closings down at $105k–$112k.

import type { SubjectProperty, Comp } from "./market-data";

export function sampleSubject(): SubjectProperty {
  return {
    address: "4218 Ridgeline Ave",
    city: "Cleveland",
    state: "OH",
    zip: "44109",
    county: "Cuyahoga",
    latitude: 41.4421,
    longitude: -81.7012,
    propertyType: "Single Family",
    yearBuilt: 1948,
    beds: 3,
    baths: 1,
    sqft: 1180,
    lotSize: 4500,
    lastSaleDate: "2026-03-01",
    lastSalePrice: 74500,
    taxAssessedValue: 121300,
  };
}

// Deterministic pseudo-spread so distances/prices vary without Math.random.
function jitter(seed: number, spread: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * spread;
}

export function sampleComps(): Comp[] {
  const comps: Comp[] = [];
  const baseLat = 41.4421;
  const baseLon = -81.7012;

  let id = 0;
  const add = (
    status: Comp["status"],
    price: number,
    sqft: number,
    dom: number,
    dist: number,
  ) => {
    id += 1;
    const pricePerSqft = Math.round(price / sqft);
    comps.push({
      id: `S-${id}`,
      address: `${4100 + id * 7} Sample St`,
      latitude: baseLat + jitter(id, 0.01),
      longitude: baseLon + jitter(id * 2, 0.01),
      distanceMiles: Math.round(dist * 100) / 100,
      status,
      price,
      soldDate: status === "sold" ? "2026-05-15" : null,
      listedDate: status === "sold" ? null : "2026-02-01",
      daysOnMarket: dom,
      beds: 3,
      baths: 1,
      sqft,
      pricePerSqft,
    });
  };

  // 16 active, stacked high ($125k–$140k), all within ½ mile, long DOM.
  for (let i = 0; i < 16; i++) {
    const price = 125000 + Math.round(jitter(i + 10, 15000)) + i * 800;
    add("active", price, 1150 + Math.round(jitter(i, 120)), 110 + Math.round(jitter(i, 60)), 0.12 + (i % 6) * 0.05);
  }
  // 3 pending in the middle.
  for (let i = 0; i < 3; i++) {
    add("pending", 118000 + i * 2000, 1160, 75, 0.2 + i * 0.04);
  }
  // 2 sold, down at $105k–$112k — the only things actually clearing.
  add("sold", 105000, 1120, 95, 0.18);
  add("sold", 112000, 1200, 88, 0.31);

  return comps;
}
