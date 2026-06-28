# PropIntel — Partner Integration Guide (v1)

For platform partners (e.g. Exceleras) integrating order placement into PropIntel.
This is the v1 surface: **you push orders to us, key-authenticated.** Delivery-back
of finished reports is the next phase (see "Roadmap").

## How it works

PropIntel exposes a single HTTPS endpoint. Your system POSTs a property order to
it; we drop it into the PropIntel order queue and return our order number. You can
send one order per request.

- **Base URL:** `https://app.propintelreport.com`
- **Auth:** every request must include the header `x-api-key: <YOUR_KEY>`
  (PropIntel issues one key per partner — keep it secret; rotate on request).
- **Content type:** `application/json`

## Place an order

`POST /api/partner/orders`

### Request body

| Field              | Type    | Required | Notes                                                        |
|--------------------|---------|----------|--------------------------------------------------------------|
| `property_address` | string  | **yes**  | Full street address (city/state/zip in the string is fine).  |
| `client_name`      | string  | no       | The ordering client / lender name.                           |
| `product_type`     | string  | no       | `desktop` (default), `field_lite`, or `field_full`.          |
| `loan_amount`      | number  | no       | Loan/UPB amount if relevant.                                 |
| `reference_number` | string  | no       | **Your** order/loan number — we store it for reconciliation. |
| `notes`            | string  | no       | Deadline, access, special instructions.                      |
| `source`           | string  | no       | Defaults to your partner name (e.g. `exceleras`).            |

### Example

```bash
curl -X POST https://app.propintelreport.com/api/partner/orders \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "property_address": "420 S Highland Ave, Birmingham, AL 35205",
    "client_name": "First Lien Capital",
    "product_type": "field_full",
    "reference_number": "EXC-100482",
    "loan_amount": 95000,
    "notes": "Hold-harmless property; cash buyer; 5-day diligence"
  }'
```

### Response — `201 Created`

```json
{
  "ok": true,
  "order_number": "PI-2026-48213",
  "status": "new",
  "property_address": "420 S Highland Ave, Birmingham, AL 35205"
}
```

Store `order_number` — it's how you'll reference the order with us.

### Errors

| Status | Meaning                                  |
|--------|------------------------------------------|
| `401`  | Missing/invalid `x-api-key`.             |
| `400`  | Invalid JSON, or `property_address` missing. |
| `500`  | Server/configuration error.              |

## Roadmap (next phase — needs a short call)

1. **Status + delivery-back.** Two options, partner's choice:
   - **Webhook:** you give us a `callback_url`; we POST `{ order_number, status, report_url }` when the report is ready.
   - **Polling:** `GET /api/partner/orders/{order_number}` returns current status + the report link when delivered.
2. **Document intake.** Attach MLS sheets / CRS tax PDFs to an order so we key the data.
3. **Per-partner keys + a sandbox** order number for testing.

## Contact

PropIntel — melissajusticebroker@gmail.com · propintelreport.com
