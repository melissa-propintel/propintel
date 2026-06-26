// Normalized property-data types for the automated data layer (Phase 1).
//
// These are deliberately decoupled from any one vendor's response shape: the
// Rentcast client (or an Exceleras feed, or an agent upload) maps INTO these
// types, and the comp engine analyzes them. Swap the data source without
// touching the analysis.

export type CompStatus = "active" | "pending" | "sold";

export interface SubjectProperty {
  address: string;
  city: string;
  state: string;
  zip: string;
  county: string | null;
  latitude: number | null;
  longitude: number | null;
  propertyType: string | null;
  yearBuilt: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lotSize: number | null;
  lastSaleDate: string | null;
  lastSalePrice: number | null;
  taxAssessedValue: number | null;
}

export interface Comp {
  id: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  /** Straight-line miles from the subject. */
  distanceMiles: number;
  status: CompStatus;
  /** Sold price if sold; otherwise current list price. */
  price: number | null;
  soldDate: string | null;
  listedDate: string | null;
  daysOnMarket: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  pricePerSqft: number | null;
}

// ---- analysis result ----

export type AbsorptionLevel =
  | "TIGHT"
  | "BALANCED"
  | "SOFT"
  | "OVERSUPPLIED"
  | "SEVERE";

export interface CompRing {
  /** How far out we had to search to satisfy the comp rule. */
  radiusReachedMiles: number;
  /** True when ½-mile had < 20 comps and we expanded. */
  expandedBeyondHalfMile: boolean;
  totalComps: number;
  activeCount: number;
  pendingCount: number;
  soldCount: number;
  windowMonths: number;
  /** Plain-language statement of how the comp set was built. */
  note: string;
  /** True when fewer than 20 comps exist even after expansion. */
  thinMarket: boolean;
}

export interface AbsorptionRead {
  active: number;
  sold: number;
  windowMonths: number;
  soldPerMonth: number;
  monthsOfSupply: number | null;
  /** Share of standing inventory absorbed per month, as a %. */
  absorptionRatePctPerMonth: number | null;
  /** "N active for every 1 sold." */
  activePerSold: number | null;
  level: AbsorptionLevel;
  headline: string;
  ratioLine: string;
}

export interface PriceBand {
  label: string;
  low: number;
  high: number;
  active: number;
  sold: number;
  verdict: "MOVING" | "BALANCED" | "SITTING";
  line: string;
}

export interface ValueRange {
  low: number | null;
  high: number | null;
  perSqftLow: number | null;
  perSqftHigh: number | null;
  basis: string;
}

export interface LensTake {
  lens: "Investor" | "Lender" | "End user";
  takeaway: string;
}

export interface MarketIntel {
  subject: SubjectProperty;
  ring: CompRing;
  absorption: AbsorptionRead;
  priceBands: PriceBand[];
  movingBands: string[];
  sittingBands: string[];
  valueRange: ValueRange;
  medianDom: number | null;
  lenses: LensTake[];
  comps: Comp[];
  /** True when the result came from built-in sample data (no API key). */
  usingSampleData: boolean;
}
