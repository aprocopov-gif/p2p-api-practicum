# Match reports full receipt when only the second PO line is short

**Rule broken:** `partial_receipt_flag` (Business rules #5)

**Severity:** Medium — match can show `partial_receipt: false` while a PO line is still short-received, so downstream review may treat delivery as complete before it is.

**Basis:** executed

## Steps to reproduce

Replace `BASE` with `http://localhost:8000` and use fresh ids/invoice numbers from each response.

```bash
curl -sS -X POST "$BASE/admin/reset"

curl -sS -X POST "$BASE/vendors" -H 'Content-Type: application/json' \
  -d '{"name":"BUG2-repro-vendor"}'

curl -sS -X POST "$BASE/purchase-orders" -H 'Content-Type: application/json' \
  -d '{"vendor_id":"VID","line_items":[{"sku":"LUM-2X4-8","quantity":10,"unit_price":4.75},{"sku":"CEM-30KG","quantity":4,"unit_price":11.9}]}'

curl -sS -X POST "$BASE/purchase-orders/POID/submit"

curl -sS -X POST "$BASE/purchase-orders/POID/receive" -H 'Content-Type: application/json' \
  -d '{"items":[{"sku":"LUM-2X4-8","quantity":10},{"sku":"CEM-30KG","quantity":2}]}'

curl -sS -X POST "$BASE/invoices" -H 'Content-Type: application/json' \
  -d '{"po_id":"POID","invoice_number":"INV-BUG2-unique","line_items":[{"sku":"LUM-2X4-8","quantity":10,"unit_price":4.75},{"sku":"CEM-30KG","quantity":2,"unit_price":11.9}]}'

curl -sS -w "\nHTTP:%{http_code}\n" -X POST "$BASE/invoices/INVID/match"
```

**Executed reproduction (2026-10-27):** first line fully received, second line 2 of 4; match HTTP **200**, `partial_receipt` **false**, `received_value` **71.3** vs `ordered_value` **95.1**.

## Expected

From `docs/API.md` Business rules #5:

> The match result sets `partial_receipt` to `true` when any line of the PO is not fully received.

**200** match with `"partial_receipt": true`.

## Actual

**HTTP 200** body (excerpt):

```json
{
  "status": "matched",
  "matched": true,
  "partial_receipt": false,
  "ordered_value": 95.1,
  "received_value": 71.3,
  "invoice_total": 71.3,
  "message": "3-way match passed."
}
```

## What this proves

When the **first** line is fully received and a **later** line is partial, the match flag can stay `false` even though `received_value` < `ordered_value`.

## What this does not prove

Behavior when only the **first** line is partial (that path is covered elsewhere and may behave correctly). Does not prove wrong exposure or GL after approve for this scenario.

## Open question

None for this specific scenario; docs are explicit that **any** not-fully-received line should set the flag.
