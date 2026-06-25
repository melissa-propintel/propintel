// PropIntel domain types.
// These mirror the PropIntel_Property_Data_Intake form and the v1.1 Report Standard.

export type ServiceLine =
  | "pre-origination"
  | "disposition"
  | "short-sale"
  | "pre-foreclosure"
  | "draw-verification"
  | "loan-monitoring";

export const SERVICE_LINE_LABELS: Record<ServiceLine, string> = {
  "pre-origination": "Pre-Origination Field Report",
  disposition: "REO Disposition Report",
  "short-sale": "Short Sale Review",
  "pre-foreclosure": "Pre-Foreclosure Triage",
  "draw-verification": "Construction Draw Verification",
  "loan-monitoring": "Loan Monitoring Visit",
};

// v1.1 ships Pre-Origination + Disposition. The rest are scoped for later versions.
export const SUPPORTED_SERVICE_LINES: ServiceLine[] = [
  "pre-origination",
  "disposition",
];

export type Severity = "match" | "minor" | "material" | "critical";
export type ConditionGrade = "C1" | "C2" | "C3" | "C4" | "C5" | "C6";
export type Habitability = "rentable-as-is" | "minor-repairs" | "not-rentable";
export type Tri = "yes" | "no" | "unknown";
export type Occupancy =
  | "owner-occupied"
  | "tenant-occupied"
  | "vacant"
  | "abandoned"
  | "unknown";
export type BlockGrade = "A" | "B" | "C" | "D" | "F";
export type FlagState = "clear" | "flagged";

export interface IntakeMeta {
  serviceLine: ServiceLine;
  orderNumber: string; // PI-YYYY-####
  clientName: string;
  clientContact: string;
  fieldAgent: string;
  inspectionDate: string;
  reportDate: string;
  rush: boolean;
}

export interface PropertyIdentifiers {
  address: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  parcelId: string;
  propertyType: string; // SFR / 2-4 / condo / multifamily 5+ / other
  yearBuilt: string;
  stories: string;
  bedsTax: string;
  bathsTax: string;
  bedsMls: string;
  bathsMls: string;
  livingAreaTax: string; // sqft
  livingAreaMls: string; // sqft
  lotSize: string;
  foundation: string;
  roof: string;
  exterior: string;
  femaFloodZone: string;
  hoa: boolean;
  hoaNotes: string;
}

export interface Discrepancy {
  item: string;
  taxValue: string;
  fieldValue: string;
  severity: Severity;
  likelyCause: string;
  implication: string;
}

// The five fraud-signal indicators from the intake form (1 point each, max 5).
export interface FraudIndicators {
  taxContradictsField: boolean; // tax record condition contradicts field photos
  rapidEscalatingTransfers: boolean; // 2+ transfers in 24 months at escalating prices, no permits
  improvementsNoPermit: boolean; // major improvements visible, no permit pulled
  loanExceedsComps: boolean; // loan amount materially exceeds comp range (>15%)
  strippingPlusRecentChange: boolean; // stripping indicators + recent ownership change
}

export interface Ownership {
  currentOwner: string;
  vesting: string; // individual / LLC / trust / joint
  llcOwnership: boolean;
  acquiredDate: string;
  acquiredAmount: string;
  transfersLast24mo: string; // count
  foreclosureHistory: boolean;
  taxDelinquent: boolean;
  openLiens: string;
  fraud: FraudIndicators;
  notes: string;
}

export interface MarketRadius {
  soldCount: string;
  activeCount: string;
  pendingCount: string;
  medianDom: string;
  medianSoldPrice: string;
  medianPerSqft: string;
}

export interface Market {
  halfMile: MarketRadius;
  fiveMile: MarketRadius;
  rentLow: string;
  rentHigh: string;
  // pre-origination
  requestedLoanAmount: string;
  // both: comp-supported as-is range
  compSupportedLow: string;
  compSupportedHigh: string;
  listPrice: string;
  taxAppraisal: string;
  notes: string;
}

export interface Condition {
  grade: ConditionGrade;
  habitability: Habitability;
  hvacFunctional: Tri;
  waterHeaterFunctional: Tri;
  electricalFunctional: Tri;
  strippingEvidence: boolean;
  waterIntrusion: boolean;
  structuralConcerns: boolean;
  unpermittedAdditions: boolean;
  occupancy: Occupancy;
  deferredMaintenanceLow: string;
  deferredMaintenanceHigh: string;
  notes: string;
}

export interface NeighborhoodFlag {
  key: string;
  label: string;
  state: FlagState;
  note: string;
}

export interface Neighborhood {
  flags: NeighborhoodFlag[];
  blockGrade: BlockGrade;
  notes: string;
}

export interface Community {
  crimeIndex: string; // indexed to national avg (100 = national)
  schoolRating: string; // 1-10
  floodZone: string;
  vacancyRate: string; // %
  distressedConcentration: string; // % REO/short sale last 12mo
  rentToIncome: string;
  notes: string;
}

export interface PropertyIntake {
  meta: IntakeMeta;
  identifiers: PropertyIdentifiers;
  discrepancies: Discrepancy[];
  ownership: Ownership;
  market: Market;
  condition: Condition;
  neighborhood: Neighborhood;
  community: Community;
  missing: string; // free text: "MISSING: ... flag on page 1"
}

// ---- Generated report ----

export type RiskGrade = "A" | "B" | "C" | "D" | "F";
export type MarketSupport = "STRONG" | "ADEQUATE" | "WEAK" | "NOT_SUPPORTED";
export type Liquidity = "THIN" | "MODERATE" | "LIQUID";
export type FraudLevel = "LOW" | "ELEVATED" | "HIGH";
export type AbsorptionLevel =
  | "TIGHT" // seller's market, clears fast
  | "BALANCED"
  | "SOFT"
  | "OVERSUPPLIED"
  | "SEVERE"; // active inventory with little/no clearance

export interface AbsorptionStat {
  radiusLabel: string;
  active: number | null;
  sold: number | null;
  periodMonths: number;
  soldPerMonth: number | null;
  monthsOfSupply: number | null;
  level: AbsorptionLevel;
  line: string;
}

export interface RedFlag {
  severity: "CRITICAL" | "ADVISORY";
  category: string;
  description: string;
}

export interface ReportSection {
  heading: string;
  body: string[]; // paragraphs / bullet lines
}

export interface GeneratedReport {
  orderNumber: string;
  serviceLine: ServiceLine;
  serviceLineLabel: string;
  address: string;
  reportDate: string;
  fieldAgent: string;
  clientName: string;

  riskGrade: RiskGrade;
  riskDescriptor: string;
  verdictHeadline: string;
  verdictRationale: string;

  conditionGrade: ConditionGrade;
  habitabilityLabel: string;
  marketSupport: MarketSupport;
  fraudSignalScore: number; // 0-5
  fraudLevel: FraudLevel;

  liquidity: Liquidity;
  realMarketLine: string;

  // Value & absorption — the "better than a BPO" headline numbers.
  indicatedValueLow: number | null;
  indicatedValueHigh: number | null;
  valueRangeLabel: string;
  absorption: AbsorptionStat; // primary (tightest meaningful radius)
  absorptionHeadline: string;

  redFlags: RedFlag[];
  criticalCount: number;
  advisoryCount: number;

  sections: ReportSection[];
  missingNotice: string;
  generatedAt: string; // ISO, stamped by caller
}
