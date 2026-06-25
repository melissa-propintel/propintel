"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PropertyIntake, ServiceLine, Discrepancy } from "@/lib/types";
import { SUPPORTED_SERVICE_LINES, SERVICE_LINE_LABELS } from "@/lib/types";
import { emptyIntake, saveReportToSession } from "@/lib/default-intake";
import { buildReport } from "@/lib/report-builder";
import { Section, Text, TextArea, Select, Check } from "@/app/components/fields";

export default function IntakePage() {
  const router = useRouter();
  const [intake, setIntake] = useState<PropertyIntake>(() => emptyIntake());

  function patch(updater: (draft: PropertyIntake) => void) {
    setIntake((prev) => {
      const d = structuredClone(prev);
      updater(d);
      return d;
    });
  }

  const isPreOrig = intake.meta.serviceLine === "pre-origination";

  function addDiscrepancy() {
    patch((d) =>
      d.discrepancies.push({
        item: "",
        taxValue: "",
        fieldValue: "",
        severity: "minor",
        likelyCause: "",
        implication: "",
      } as Discrepancy),
    );
  }

  function generate() {
    const report = buildReport(intake, new Date().toISOString());
    saveReportToSession(report, intake);
    router.push("/report");
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/" className="text-xs font-semibold uppercase tracking-wide text-pi-accent">
            ← PropIntel
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-pi-navy">Property Intake</h1>
          <p className="text-sm text-slate-500">
            Field-collected data feeds the report. Fill what applies — the report flags what is missing.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-5">
        {/* Section 0 — meta */}
        <Section title="0 · Report Meta">
          <Select
            label="Service line"
            value={intake.meta.serviceLine}
            onChange={(v) => patch((d) => (d.meta.serviceLine = v as ServiceLine))}
            options={SUPPORTED_SERVICE_LINES.map((s) => ({
              value: s,
              label: SERVICE_LINE_LABELS[s],
            }))}
            full
          />
          <Text
            label="Order number"
            value={intake.meta.orderNumber}
            onChange={(v) => patch((d) => (d.meta.orderNumber = v))}
            placeholder="PI-2026-0001"
          />
          <Text
            label="Report date"
            value={intake.meta.reportDate}
            onChange={(v) => patch((d) => (d.meta.reportDate = v))}
            placeholder="MM/DD/YYYY"
          />
          <Text
            label="Client / lender"
            value={intake.meta.clientName}
            onChange={(v) => patch((d) => (d.meta.clientName = v))}
          />
          <Text
            label="Field agent"
            value={intake.meta.fieldAgent}
            onChange={(v) => patch((d) => (d.meta.fieldAgent = v))}
          />
          <Check
            label="Rush order"
            checked={intake.meta.rush}
            onChange={(v) => patch((d) => (d.meta.rush = v))}
          />
        </Section>

        {/* Section 1 — identifiers */}
        <Section title="1 · Property Identifiers">
          <Text label="Street address" value={intake.identifiers.address} onChange={(v) => patch((d) => (d.identifiers.address = v))} full />
          <Text label="City" value={intake.identifiers.city} onChange={(v) => patch((d) => (d.identifiers.city = v))} />
          <Text label="State" value={intake.identifiers.state} onChange={(v) => patch((d) => (d.identifiers.state = v))} />
          <Text label="ZIP" value={intake.identifiers.zip} onChange={(v) => patch((d) => (d.identifiers.zip = v))} />
          <Text label="County" value={intake.identifiers.county} onChange={(v) => patch((d) => (d.identifiers.county = v))} />
          <Text label="Parcel ID" value={intake.identifiers.parcelId} onChange={(v) => patch((d) => (d.identifiers.parcelId = v))} />
          <Select
            label="Property type"
            value={intake.identifiers.propertyType}
            onChange={(v) => patch((d) => (d.identifiers.propertyType = v))}
            options={[
              { value: "SFR", label: "Single family (SFR)" },
              { value: "2-4", label: "2–4 unit" },
              { value: "condo", label: "Condo" },
              { value: "townhouse", label: "Townhouse" },
              { value: "multifamily-5+", label: "Multifamily 5+" },
              { value: "other", label: "Other" },
            ]}
          />
          <Text label="Year built" value={intake.identifiers.yearBuilt} onChange={(v) => patch((d) => (d.identifiers.yearBuilt = v))} />
          <Text label="Beds (per tax)" value={intake.identifiers.bedsTax} onChange={(v) => patch((d) => (d.identifiers.bedsTax = v))} />
          <Text label="Beds (per MLS)" value={intake.identifiers.bedsMls} onChange={(v) => patch((d) => (d.identifiers.bedsMls = v))} />
          <Text label="Living area / tax (sqft)" value={intake.identifiers.livingAreaTax} onChange={(v) => patch((d) => (d.identifiers.livingAreaTax = v))} />
          <Text label="Living area / MLS (sqft)" value={intake.identifiers.livingAreaMls} onChange={(v) => patch((d) => (d.identifiers.livingAreaMls = v))} />
          <Text label="FEMA flood zone" value={intake.identifiers.femaFloodZone} onChange={(v) => patch((d) => (d.identifiers.femaFloodZone = v))} />
          <Check label="HOA present" checked={intake.identifiers.hoa} onChange={(v) => patch((d) => (d.identifiers.hoa = v))} />
        </Section>

        {/* Section 2 — discrepancies */}
        <Section title="2 · Tax Record vs. Field" subtitle="Log each item where the record does not match field reality.">
          <div className="sm:col-span-2 flex flex-col gap-3">
            {intake.discrepancies.length === 0 && (
              <p className="text-xs text-slate-400">No discrepancies added yet.</p>
            )}
            {intake.discrepancies.map((d, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" placeholder="Item (e.g. bedrooms)" value={d.item} onChange={(e) => patch((x) => (x.discrepancies[i].item = e.target.value))} />
                  <select className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={d.severity} onChange={(e) => patch((x) => (x.discrepancies[i].severity = e.target.value as Discrepancy["severity"]))}>
                    <option value="match">Match</option>
                    <option value="minor">Minor</option>
                    <option value="material">Material</option>
                    <option value="critical">Critical</option>
                  </select>
                  <input className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" placeholder="Tax record value" value={d.taxValue} onChange={(e) => patch((x) => (x.discrepancies[i].taxValue = e.target.value))} />
                  <input className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" placeholder="Field / MLS value" value={d.fieldValue} onChange={(e) => patch((x) => (x.discrepancies[i].fieldValue = e.target.value))} />
                  <input className="rounded-md border border-slate-300 px-2 py-1.5 text-sm sm:col-span-2" placeholder="Implication" value={d.implication} onChange={(e) => patch((x) => (x.discrepancies[i].implication = e.target.value))} />
                </div>
                <button type="button" onClick={() => patch((x) => x.discrepancies.splice(i, 1))} className="mt-2 text-xs text-red-600 hover:underline">
                  Remove
                </button>
              </div>
            ))}
            <button type="button" onClick={addDiscrepancy} className="self-start rounded-md border border-pi-accent px-3 py-1.5 text-xs font-medium text-pi-accent hover:bg-blue-50">
              + Add discrepancy
            </button>
          </div>
        </Section>

        {/* Section 3 — ownership */}
        <Section title="3 · Ownership / Title">
          <Text label="Current owner" value={intake.ownership.currentOwner} onChange={(v) => patch((d) => (d.ownership.currentOwner = v))} />
          <Text label="Vesting (LLC / individual / trust)" value={intake.ownership.vesting} onChange={(v) => patch((d) => (d.ownership.vesting = v))} />
          <Text label="Acquired date" value={intake.ownership.acquiredDate} onChange={(v) => patch((d) => (d.ownership.acquiredDate = v))} />
          <Text label="Acquired amount" value={intake.ownership.acquiredAmount} onChange={(v) => patch((d) => (d.ownership.acquiredAmount = v))} />
          {isPreOrig && (
            <Text label="Transfers in last 24 months" value={intake.ownership.transfersLast24mo} onChange={(v) => patch((d) => (d.ownership.transfersLast24mo = v))} />
          )}
          <Text label="Open liens" value={intake.ownership.openLiens} onChange={(v) => patch((d) => (d.ownership.openLiens = v))} />
          <Check label="Property tax delinquency on record" checked={intake.ownership.taxDelinquent} onChange={(v) => patch((d) => (d.ownership.taxDelinquent = v))} />
          <Check label="Prior foreclosure activity" checked={intake.ownership.foreclosureHistory} onChange={(v) => patch((d) => (d.ownership.foreclosureHistory = v))} />

          {isPreOrig && (
            <div className="sm:col-span-2 mt-2 rounded-lg bg-amber-50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800">
                Fraud signal indicators (1 pt each, max 5)
              </p>
              <div className="flex flex-col gap-2">
                <Check label="Tax record condition significantly contradicts field photos" checked={intake.ownership.fraud.taxContradictsField} onChange={(v) => patch((d) => (d.ownership.fraud.taxContradictsField = v))} />
                <Check label="2+ ownership transfers in 24 months at escalating prices, no permits" checked={intake.ownership.fraud.rapidEscalatingTransfers} onChange={(v) => patch((d) => (d.ownership.fraud.rapidEscalatingTransfers = v))} />
                <Check label="Major improvements visible in field with no permit pulled" checked={intake.ownership.fraud.improvementsNoPermit} onChange={(v) => patch((d) => (d.ownership.fraud.improvementsNoPermit = v))} />
                <Check label="Loan amount materially exceeds comp range (>15% gap)" checked={intake.ownership.fraud.loanExceedsComps} onChange={(v) => patch((d) => (d.ownership.fraud.loanExceedsComps = v))} />
                <Check label="Stripping indicators + recent ownership change" checked={intake.ownership.fraud.strippingPlusRecentChange} onChange={(v) => patch((d) => (d.ownership.fraud.strippingPlusRecentChange = v))} />
              </div>
            </div>
          )}
          <TextArea label="Ownership notes" value={intake.ownership.notes} onChange={(v) => patch((d) => (d.ownership.notes = v))} />
        </Section>

        {/* Section 4 — market */}
        <Section title="4 · Market Data">
          {isPreOrig ? (
            <Text label="Requested loan amount" value={intake.market.requestedLoanAmount} onChange={(v) => patch((d) => (d.market.requestedLoanAmount = v))} placeholder="$1,200,000" />
          ) : (
            <Text label="List price" value={intake.market.listPrice} onChange={(v) => patch((d) => (d.market.listPrice = v))} placeholder="$250,000" />
          )}
          <Text label="Tax appraisal" value={intake.market.taxAppraisal} onChange={(v) => patch((d) => (d.market.taxAppraisal = v))} />
          <Text label="Comp-supported as-is LOW" value={intake.market.compSupportedLow} onChange={(v) => patch((d) => (d.market.compSupportedLow = v))} placeholder="$480,000" />
          <Text label="Comp-supported as-is HIGH" value={intake.market.compSupportedHigh} onChange={(v) => patch((d) => (d.market.compSupportedHigh = v))} placeholder="$560,000" />
          <Text label="Rent range LOW" value={intake.market.rentLow} onChange={(v) => patch((d) => (d.market.rentLow = v))} />
          <Text label="Rent range HIGH" value={intake.market.rentHigh} onChange={(v) => patch((d) => (d.market.rentHigh = v))} />

          <div className="sm:col-span-2 mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-xs font-semibold text-slate-600">½-mile · 90 days</p>
              <div className="grid grid-cols-2 gap-2">
                <input className="rounded border border-slate-300 px-2 py-1 text-sm" placeholder="Sold #" value={intake.market.halfMile.soldCount} onChange={(e) => patch((d) => (d.market.halfMile.soldCount = e.target.value))} />
                <input className="rounded border border-slate-300 px-2 py-1 text-sm" placeholder="Active #" value={intake.market.halfMile.activeCount} onChange={(e) => patch((d) => (d.market.halfMile.activeCount = e.target.value))} />
                <input className="rounded border border-slate-300 px-2 py-1 text-sm" placeholder="Median DOM" value={intake.market.halfMile.medianDom} onChange={(e) => patch((d) => (d.market.halfMile.medianDom = e.target.value))} />
                <input className="rounded border border-slate-300 px-2 py-1 text-sm" placeholder="Median $" value={intake.market.halfMile.medianSoldPrice} onChange={(e) => patch((d) => (d.market.halfMile.medianSoldPrice = e.target.value))} />
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-xs font-semibold text-slate-600">5-mile · 180 days</p>
              <div className="grid grid-cols-2 gap-2">
                <input className="rounded border border-slate-300 px-2 py-1 text-sm" placeholder="Sold #" value={intake.market.fiveMile.soldCount} onChange={(e) => patch((d) => (d.market.fiveMile.soldCount = e.target.value))} />
                <input className="rounded border border-slate-300 px-2 py-1 text-sm" placeholder="Active #" value={intake.market.fiveMile.activeCount} onChange={(e) => patch((d) => (d.market.fiveMile.activeCount = e.target.value))} />
                <input className="rounded border border-slate-300 px-2 py-1 text-sm" placeholder="Median DOM" value={intake.market.fiveMile.medianDom} onChange={(e) => patch((d) => (d.market.fiveMile.medianDom = e.target.value))} />
                <input className="rounded border border-slate-300 px-2 py-1 text-sm" placeholder="Median $" value={intake.market.fiveMile.medianSoldPrice} onChange={(e) => patch((d) => (d.market.fiveMile.medianSoldPrice = e.target.value))} />
              </div>
            </div>
          </div>
          <TextArea label="Market notes" value={intake.market.notes} onChange={(v) => patch((d) => (d.market.notes = v))} />
        </Section>

        {/* Section 5 — condition */}
        <Section title="5 · Condition">
          <Select
            label="Condition grade"
            value={intake.condition.grade}
            onChange={(v) => patch((d) => (d.condition.grade = v as PropertyIntake["condition"]["grade"]))}
            options={["C1", "C2", "C3", "C4", "C5", "C6"].map((g) => ({ value: g, label: g }))}
          />
          <Select
            label="Habitability"
            value={intake.condition.habitability}
            onChange={(v) => patch((d) => (d.condition.habitability = v as PropertyIntake["condition"]["habitability"]))}
            options={[
              { value: "rentable-as-is", label: "Rentable as-is" },
              { value: "minor-repairs", label: "Minor repairs" },
              { value: "not-rentable", label: "Not rentable" },
            ]}
          />
          <Select
            label="Occupancy"
            value={intake.condition.occupancy}
            onChange={(v) => patch((d) => (d.condition.occupancy = v as PropertyIntake["condition"]["occupancy"]))}
            options={[
              { value: "owner-occupied", label: "Owner-occupied" },
              { value: "tenant-occupied", label: "Tenant-occupied" },
              { value: "vacant", label: "Vacant" },
              { value: "abandoned", label: "Abandoned" },
              { value: "unknown", label: "Unknown" },
            ]}
          />
          <Select
            label="HVAC functional"
            value={intake.condition.hvacFunctional}
            onChange={(v) => patch((d) => (d.condition.hvacFunctional = v as PropertyIntake["condition"]["hvacFunctional"]))}
            options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unknown", label: "Unknown" }]}
          />
          <Text label="Deferred maintenance LOW" value={intake.condition.deferredMaintenanceLow} onChange={(v) => patch((d) => (d.condition.deferredMaintenanceLow = v))} />
          <Text label="Deferred maintenance HIGH" value={intake.condition.deferredMaintenanceHigh} onChange={(v) => patch((d) => (d.condition.deferredMaintenanceHigh = v))} />
          <Check label="Evidence of stripping (missing fixtures / mechanicals / wiring)" checked={intake.condition.strippingEvidence} onChange={(v) => patch((d) => (d.condition.strippingEvidence = v))} />
          <Check label="Water intrusion / staining" checked={intake.condition.waterIntrusion} onChange={(v) => patch((d) => (d.condition.waterIntrusion = v))} />
          <Check label="Structural concerns" checked={intake.condition.structuralConcerns} onChange={(v) => patch((d) => (d.condition.structuralConcerns = v))} />
          <Check label="Unpermitted additions observed" checked={intake.condition.unpermittedAdditions} onChange={(v) => patch((d) => (d.condition.unpermittedAdditions = v))} />
          <TextArea label="Condition notes" value={intake.condition.notes} onChange={(v) => patch((d) => (d.condition.notes = v))} />
        </Section>

        {/* Section 6 — neighborhood */}
        <Section title="6 · Neighborhood Flag Grid" subtitle="Tap each item Clear or Flagged. Flagged items add an advisory red flag.">
          <div className="sm:col-span-2 flex flex-col gap-2">
            {intake.neighborhood.flags.map((f, i) => (
              <div key={f.key} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
                <span className="text-sm text-slate-700">{f.label}</span>
                <button
                  type="button"
                  onClick={() => patch((d) => (d.neighborhood.flags[i].state = f.state === "clear" ? "flagged" : "clear"))}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                    f.state === "flagged" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                  }`}
                >
                  {f.state === "flagged" ? "Flagged" : "Clear"}
                </button>
              </div>
            ))}
            <Select
              label="Overall block grade"
              value={intake.neighborhood.blockGrade}
              onChange={(v) => patch((d) => (d.neighborhood.blockGrade = v as PropertyIntake["neighborhood"]["blockGrade"]))}
              options={["A", "B", "C", "D", "F"].map((g) => ({ value: g, label: `${g} block` }))}
              full
            />
          </div>
        </Section>

        {/* Section 7 — community + missing */}
        <Section title="7 · Community & Gaps" subtitle="Community auto-generation is scoped for the intelligence layer; enter what you have.">
          <Text label="Crime index (100 = national)" value={intake.community.crimeIndex} onChange={(v) => patch((d) => (d.community.crimeIndex = v))} />
          <Text label="School rating (1–10)" value={intake.community.schoolRating} onChange={(v) => patch((d) => (d.community.schoolRating = v))} />
          <Text label="Vacancy rate" value={intake.community.vacancyRate} onChange={(v) => patch((d) => (d.community.vacancyRate = v))} />
          <Text label="Distressed-sale concentration" value={intake.community.distressedConcentration} onChange={(v) => patch((d) => (d.community.distressedConcentration = v))} />
          <TextArea label="MISSING data (flagged on page 1)" value={intake.missing} onChange={(v) => patch((d) => (d.missing = v))} placeholder="e.g. Permit history pull pending — flag on page 1" />
        </Section>

        <div className="sticky bottom-4 z-10 flex justify-end gap-3">
          <button
            onClick={generate}
            className="rounded-lg bg-pi-navy px-6 py-3 text-sm font-semibold text-white shadow-lg hover:bg-pi-navy-soft"
          >
            Generate Report →
          </button>
        </div>
      </div>
    </div>
  );
}
