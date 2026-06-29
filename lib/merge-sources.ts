import type { SubjectProperty, Comp } from "./market-data";

function pick<T>(...vals: (T | null | undefined)[]): T | null {
  for (const v of vals) if (v !== null && v !== undefined) return v;
  return null;
}

// Merge the agent's uploaded-doc subject (MLS — current listing detail) with the
// Rentcast public record (owner, tax, sale history, geo). Each source fills the
// other's gaps, so "no public record found" is covered by the docs and a thin
// MLS sheet is enriched by the record. Neither source alone has to be complete.
export function mergeSubject(doc: SubjectProperty, rc: SubjectProperty | null): SubjectProperty {
  if (!rc) return doc;
  return {
    address: pick(doc.address, rc.address) ?? "",
    city: pick(doc.city, rc.city) ?? "",
    state: pick(doc.state, rc.state) ?? "",
    zip: pick(doc.zip, rc.zip) ?? "",
    // Rentcast is authoritative for geo + public record.
    county: pick(rc.county, doc.county),
    latitude: pick(rc.latitude, doc.latitude),
    longitude: pick(rc.longitude, doc.longitude),
    // Listing characteristics — prefer the agent's current MLS doc, record fills gaps.
    propertyType: pick(doc.propertyType, rc.propertyType),
    yearBuilt: pick(doc.yearBuilt, rc.yearBuilt),
    beds: pick(doc.beds, rc.beds),
    baths: pick(doc.baths, rc.baths),
    sqft: pick(doc.sqft, rc.sqft),
    lotSize: pick(doc.lotSize, rc.lotSize),
    // Public record — Rentcast authoritative, doc fills gaps.
    lastSaleDate: pick(rc.lastSaleDate, doc.lastSaleDate),
    lastSalePrice: pick(rc.lastSalePrice, doc.lastSalePrice),
    taxAssessedValue: pick(rc.taxAssessedValue, doc.taxAssessedValue),
    ownerNames: pick(rc.ownerNames, doc.ownerNames),
    ownerOccupied: pick(rc.ownerOccupied, doc.ownerOccupied),
    ownerType: pick(rc.ownerType, doc.ownerType),
    saleHistory: pick(rc.saleHistory, doc.saleHistory),
  };
}

function compKey(c: Comp): string {
  return (c.address || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Combine the agent's doc comps with Rentcast's, deduped by address (the doc's
// wins on a tie — it carries more MLS detail). More comps → stronger market read.
export function mergeComps(docComps: Comp[], rcComps: Comp[]): Comp[] {
  const seen = new Set<string>();
  const out: Comp[] = [];
  for (const c of docComps) {
    const k = compKey(c);
    if (k) seen.add(k);
    out.push(c);
  }
  for (const c of rcComps) {
    const k = compKey(c);
    if (k && seen.has(k)) continue;
    if (k) seen.add(k);
    out.push(c);
  }
  return out;
}
