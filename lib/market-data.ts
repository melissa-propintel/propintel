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
  propertyType: string | null;
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
  /** Distressed / as-is comp tier (lower $/sqft). */
  asIsLow: number | null;
  asIsHigh: number | null;
  /** Renovated / retail comp tier (upper $/sqft). */
  renovatedLow: number | null;
  renovatedHigh: number | null;
  /** Count of house comps used after filtering land/lots/outliers. */
  compsUsed: number;
  excludedCount: number;
}

export interface LensTake {
  lens: "Investor" | "Lender" | "End user";
  takeaway: string;
}

export interface NeighborhoodData {
  floodZone: string | null;
  floodRisk: string | null;
  inSFHA: boolean | null; // Special Flood Hazard Area (high risk)
  vacancyRatePct: number | null;
  ownerOccupiedPct: number | null;
  medianHomeValue: number | null;
  medianHouseholdIncome: number | null;
  tractPopulation: number | null;
  censusTract: string | null;
  sources: string[];
}

export interface RentRead {
  estimate: number | null;
  low: number | null;
  high: number | null;
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
  /** Long-term rent estimate + range (Rentcast). Null until fetched. */
  rent: RentRead | null;
  /** Auto-pulled neighborhood data (FEMA + Census). Null until fetched. */
  neighborhood: NeighborhoodData | null;
  /** True when the result came from built-in sample data (no API key). */
  usingSampleData: boolean;
}
