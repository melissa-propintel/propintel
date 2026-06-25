import type { PropertyIntake } from "./types";
import { emptyIntake } from "./default-intake";

// A realistic REO disposition case for instant demos. Triggers the signature
// absorption flag (16 active vs. 2 sold) plus a value-gap and title advisory.
export function sampleIntake(): PropertyIntake {
  const i = emptyIntake("disposition");

  i.meta.orderNumber = "PI-2026-0142";
  i.meta.reportDate = "June 24, 2026";
  i.meta.clientName = "Meridian Asset Management";
  i.meta.fieldAgent = "D. Carter";

  i.identifiers.address = "4218 Ridgeline Ave";
  i.identifiers.city = "Cleveland";
  i.identifiers.state = "OH";
  i.identifiers.zip = "44109";
  i.identifiers.county = "Cuyahoga";
  i.identifiers.parcelId = "012-18-094";
  i.identifiers.propertyType = "SFR";
  i.identifiers.yearBuilt = "1948";
  i.identifiers.bedsTax = "3";
  i.identifiers.bedsMls = "3";
  i.identifiers.livingAreaTax = "1,180";
  i.identifiers.femaFloodZone = "X";

  i.discrepancies = [
    {
      item: "Living area",
      taxValue: "1,180 sqft",
      fieldValue: "1,040 sqft (no permitted addition found)",
      severity: "material",
      likelyCause: "Stale assessor record / prior unpermitted enclosure removed",
      implication: "Overstated sqft inflates any per-sqft value pulled from the tax card",
    },
  ];

  i.ownership.currentOwner = "Meridian REO Holdings LLC";
  i.ownership.vesting = "LLC";
  i.ownership.llcOwnership = true;
  i.ownership.acquiredDate = "03/2026";
  i.ownership.acquiredAmount = "$74,500 (foreclosure)";
  i.ownership.taxDelinquent = true;
  i.ownership.openLiens = "County tax lien — 2024–2025, ~$4,200";
  i.ownership.notes = "Title to be cleared of delinquent tax lien before listing.";

  // Market — the oversupply story. 16 active vs 2 sold (½ mi, 90 days).
  i.market.halfMile = {
    soldCount: "2",
    activeCount: "16",
    pendingCount: "3",
    medianDom: "140",
    medianSoldPrice: "$108,000",
    medianPerSqft: "98",
  };
  i.market.fiveMile = {
    soldCount: "31",
    activeCount: "118",
    pendingCount: "22",
    medianDom: "121",
    medianSoldPrice: "$112,500",
    medianPerSqft: "101",
  };
  i.market.rentLow = "$1,150";
  i.market.rentHigh = "$1,350";
  i.market.compSupportedLow = "$95,000";
  i.market.compSupportedHigh = "$118,000";
  i.market.listPrice = "$129,900";
  i.market.taxAppraisal = "$121,300";
  i.market.notes =
    "Active inventory is stacked at $125k–$140k and not clearing; recent closings cluster at $105k–$112k.";

  i.condition.grade = "C4";
  i.condition.habitability = "minor-repairs";
  i.condition.hvacFunctional = "yes";
  i.condition.waterHeaterFunctional = "yes";
  i.condition.electricalFunctional = "yes";
  i.condition.occupancy = "vacant";
  i.condition.deferredMaintenanceLow = "$12,000";
  i.condition.deferredMaintenanceHigh = "$18,000";
  i.condition.waterIntrusion = true;
  i.condition.notes =
    "Roof at end of service life; minor basement moisture staining. Cosmetic throughout, no structural concerns.";

  // Neighborhood
  const flag = (key: string, note: string) => {
    const f = i.neighborhood.flags.find((x) => x.key === key);
    if (f) {
      f.state = "flagged";
      f.note = note;
    }
  };
  flag("left-neighbor", "Boarded windows, debris in side yard");
  flag("boarded-vacant", "Two vacant/boarded homes within three parcels");
  i.neighborhood.blockGrade = "C";
  i.neighborhood.notes = "Block is mixed — maintained owner-occupants alongside two vacancies.";

  i.community.crimeIndex = "148";
  i.community.schoolRating = "4";
  i.community.vacancyRate = "14%";
  i.community.distressedConcentration = "27% of 12-mo sales were REO/short sale";
  i.community.notes =
    "Out-of-state owner should know: this submarket clears slowly and prices on condition, not list ambition.";

  return i;
}
