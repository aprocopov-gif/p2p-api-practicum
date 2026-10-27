# Invoice total can exceed received value via higher unit_price

**Rule broken:** `overpayment_protection` (Business rules #3)

**Severity:** High — the API can record an invoice above received value; if matched and approved, AP and exposure can include money never backed by goods received.

**Basis:** executed

## Steps to reproduce

Replace `BASE` with `http://localhost:8000` and use a fresh invoice number each run.

```bash
curl -sS -X POST "$BASE/admin/reset"

curl -sS -X POST "$BASE/vendors" -H 'Content-Type: application/json' \
  -d '{"name":"BUG1-repro-vendor"}'

# Use vendor id from response as VID
curl -sS -X POST "$BASE/purchase-orders" -H 'Content-Type: application/json' \
  -d '{"vendor_id":"VID","line_items":[{"sku":"LUM-2X4-8","quantity":2,"unit_price":1.0}]}'

# Use po id as POID
curl -sS -X POST "$BASE/purchase-orders/POID/submit"

curl -sS -X POST "$BASE/purchase-orders/POID/receive" -H 'Content-Type: application/json' \
  -d '{"items":[{"sku":"LUM-2X4-8","quantity":2}]}'

curl -sS -w "\nHTTP:%{http_code}\n" -X POST "$BASE/invoices" -H 'Content-Type: application/json' \
  -d '{"po_id":"POID","invoice_number":"INV-BUG1-unique","line_items":[{"sku":"LUM-2X4-8","quantity":2,"unit_price":1.01}]}'
```

**Executed reproduction (2026-10-27):** received value **2.00**, invoice **2.02**, HTTP **201**.

## Expected

From `docs/API.md` Business rules #3:

> Everything invoiced on a PO never exceeds what was received: not per line quantity, and not in total value. There is no tolerance.

Request should be rejected with **400** and `"rule": "overpayment_protection"`.

## Actual

**HTTP 201** body (excerpt):

```json
{
  "status": "received",
  "total_amount": 2.02,
  "line_items": [{ "sku": "LUM-2X4-8", "quantity": 2, "unit_price": 1.01 }]
}
```

No `rule` field (success response).

## What this proves

Quantity-at-or-below-received is **not** enough for overpayment protection: inflating **unit_price** above the received line value is accepted.

## What this does not prove

That every SKU or rounding combination fails the same way; only that at least one value-over-received path returns 201. Does not show the invoice was matched or approved (extra steps would be needed for end-to-end payment).

## Open question

Whether cumulative value checks across **multiple** invoices on one PO catch all unit_price overruns when each line alone looks small — not re-audited in this report.
