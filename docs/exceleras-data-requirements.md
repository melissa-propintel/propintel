# PropIntel — Data Requirements for Exceleras Orders

What we need Exceleras to pass us **with each order** so we can produce a PropIntel
report. The more of the "nice to have" data they already pass, the lower our data
cost and the faster the turnaround.

## 1. Order identifiers (required)
- Exceleras order ID
- Client / lender name
- Product ordered (which report type — desktop vs. exterior/field)
- Order date and **due date / SLA**
- Rush flag (yes/no)

## 2. Subject property (required)
- Full street address — street, city, state, ZIP (each as its own field if possible)
- APN / parcel number (if available)
- Property type (SFR, condo, 2–4, multifamily, land)
- County

## 3. Property characteristics (nice to have — saves us a data pull)
- Beds / baths / square footage / lot size / year built
- Most recent sale date and price
- Tax assessed value

## 4. Decision context (required where applicable)
- Loan amount (origination orders) **or** current list price (disposition)
- Any prior valuation on file (BPO, AVM, appraisal) + date

## 5. Data Exceleras can pass to reduce our cost (nice to have — important)
- Comps (active + sold) — any format
- MLS sheet for the subject (with listing history)
- Tax record / public record export
- Any area / community report the MLS provides

## 6. Field / photo logistics (required for exterior/field orders)
- Who captures photos — their assigned agent, or do we source one?
- Occupant contact, gate/lockbox codes, access notes
- Required photo set confirmation (we need: subject, neighbor each side, home
  across the street, plus any damaged surrounding homes)

## 7. Delivery back to Exceleras (we need their spec)
- Format they accept — finished PDF, structured data fields, or an API push to their portal
- Their required field schema / report template (send us a sample)
- File naming convention
- Where/how we submit (portal upload, SFTP, API endpoint + credentials)

## 8. Volume & cadence (so we can size capacity)
- Expected order volume per week/month
- Batch (e.g., a 500-property tape) or steady trickle?
- Any geographic concentration or is it nationwide?

---

### What PropIntel delivers back
- A branded report PDF (page-1 verdict + market intelligence: true absorption,
  what price bands are moving vs. sitting, defensible value range, red flags)
- Key data fields extractable for their portal (value range low/high, absorption
  / months-of-supply, active vs. sold counts, condition grade, flag count)
