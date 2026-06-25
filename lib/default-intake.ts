import type { PropertyIntake, NeighborhoodFlag, ServiceLine } from "./types";

export const NEIGHBORHOOD_FLAG_DEFS: { key: string; label: string }[] = [
  { key: "subject-yard", label: "Subject yard: debris, trash, abandoned vehicles, overgrown" },
  { key: "left-neighbor", label: "Left neighbor: condition, debris, junk vehicles, structures" },
  { key: "right-neighbor", label: "Right neighbor: condition, debris, junk vehicles, structures" },
  { key: "rear-neighbor", label: "Rear neighbor: condition, debris, junk vehicles, structures" },
  { key: "across-neighbor", label: "Across-street neighbor: condition, overall block quality" },
  { key: "trailer-structure", label: "Trailer or non-conforming structure on subject lot" },
  { key: "foreclosure-signs", label: "Foreclosure / bank-owned signs visible on block" },
  { key: "boarded-vacant", label: "Boarded or vacant properties adjacent" },
  { key: "incompatible-use", label: "Commercial, industrial, or incompatible use adjacent" },
  { key: "noise-source", label: "Railroad, highway, or major noise source proximity" },
  { key: "new-construction", label: "New construction visible nearby" },
];

function freshFlags(): NeighborhoodFlag[] {
  return NEIGHBORHOOD_FLAG_DEFS.map((d) => ({
    key: d.key,
    label: d.label,
    state: "clear",
    note: "",
  }));
}

export function emptyIntake(serviceLine: ServiceLine = "pre-origination"): PropertyIntake {
  return {
    meta: {
      serviceLine,
      orderNumber: "",
      clientName: "",
      clientContact: "",
      fieldAgent: "",
      inspectionDate: "",
      reportDate: "",
      rush: false,
    },
    identifiers: {
      address: "",
      city: "",
      state: "",
      zip: "",
      county: "",
      parcelId: "",
      propertyType: "SFR",
      yearBuilt: "",
      stories: "",
      bedsTax: "",
      bathsTax: "",
      bedsMls: "",
      bathsMls: "",
      livingAreaTax: "",
      livingAreaMls: "",
      lotSize: "",
      foundation: "",
      roof: "",
      exterior: "",
      femaFloodZone: "",
      hoa: false,
      hoaNotes: "",
    },
    discrepancies: [],
    ownership: {
      currentOwner: "",
      vesting: "",
      llcOwnership: false,
      acquiredDate: "",
      acquiredAmount: "",
      transfersLast24mo: "",
      foreclosureHistory: false,
      taxDelinquent: false,
      openLiens: "",
      fraud: {
        taxContradictsField: false,
        rapidEscalatingTransfers: false,
        improvementsNoPermit: false,
        loanExceedsComps: false,
        strippingPlusRecentChange: false,
      },
      notes: "",
    },
    market: {
      halfMile: {
        soldCount: "",
        activeCount: "",
        pendingCount: "",
        medianDom: "",
        medianSoldPrice: "",
        medianPerSqft: "",
      },
      fiveMile: {
        soldCount: "",
        activeCount: "",
        pendingCount: "",
        medianDom: "",
        medianSoldPrice: "",
        medianPerSqft: "",
      },
      rentLow: "",
      rentHigh: "",
      requestedLoanAmount: "",
      compSupportedLow: "",
      compSupportedHigh: "",
      listPrice: "",
      taxAppraisal: "",
      notes: "",
    },
    condition: {
      grade: "C3",
      habitability: "rentable-as-is",
      hvacFunctional: "unknown",
      waterHeaterFunctional: "unknown",
      electricalFunctional: "unknown",
      strippingEvidence: false,
      waterIntrusion: false,
      structuralConcerns: false,
      unpermittedAdditions: false,
      occupancy: "unknown",
      deferredMaintenanceLow: "",
      deferredMaintenanceHigh: "",
      notes: "",
    },
    neighborhood: {
      flags: freshFlags(),
      blockGrade: "C",
      notes: "",
    },
    community: {
      crimeIndex: "",
      schoolRating: "",
      floodZone: "",
      vacancyRate: "",
      distressedConcentration: "",
      rentToIncome: "",
      notes: "",
    },
    missing: "",
  };
}

const STORAGE_KEY = "propintel:last-report";
const INTAKE_KEY = "propintel:last-intake";

export function saveReportToSession(report: unknown, intake: unknown) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(report));
  sessionStorage.setItem(INTAKE_KEY, JSON.stringify(intake));
}

export function loadReportFromSession(): unknown | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}
