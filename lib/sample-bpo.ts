import type { BpoExtract } from "./audit";

// A deliberately optimistic sample BPO so the audit is demoable without an API
// key — overvalues vs. the Cleveland sample market and ignores the oversupply.
export function sampleBpoExtract(): BpoExtract {
  return {
    reportType: "BPO",
    effectiveDate: "2026-02-10",
    subjectAddress: "4218 Ridgeline Ave, Cleveland, OH 44109",
    opinionOfValue: 138000,
    asRepairedValue: 165000,
    suggestedListPrice: 139900,
    comps: [
      { address: "4191 Sample St", price: 137000, status: "active" },
      { address: "4149 Sample St", price: 136000, status: "active" },
      { address: "4177 Sample St", price: 134900, status: "active" },
      { address: "4128 Sample St", price: 135000, status: "sold" },
      { address: "4212 Sample St", price: 134000, status: "active" },
      { address: "4135 Sample St", price: 133000, status: "active" },
    ],
    conditionRating: "Average",
    marketTrend: "stable",
    mentionsFloodZone: false,
    mentionsOversupply: false,
    notes: "Six comps selected within 0.5 mi; agent opinion of value.",
  };
}
