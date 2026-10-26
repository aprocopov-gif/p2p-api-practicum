# Test design — invoices

Oracle: `docs/API.md` (Invoices, Purchase orders, Business rules, Errors) and OpenAPI paths `/invoices`, `/invoices/{invoiceId}`, `/invoices/{invoiceId}/match` (schemas `InvoiceCreate`, `InvoiceLine`, `Invoice`, `MatchResult`, `Error`). Assumed gaps from `docs/QUESTIONS.md` are called out below.

**Area scope:** these three invoice paths. `POST /invoices/{invoiceId}/approve` lives in `docs/test-design/approval-and-exposure.md` (coverage rollup splits approve there).

Precondition: seed state via `tests/api/reset.setup.ts`. Each test creates its own PO (and vendor when duplicate-number cases need isolation), submits, receives as needed, then invoices. Use a unique `invoice_number` with `Date.now()` unless the row is duplicate detection.

**Local setup:** `POST /purchase-orders` → `POST .../submit` → `POST .../receive` (full or partial per row) → invoice or match step under test.

---

## POST /invoices

| ID | type | what we send | expected status | expected body (rule, key values) | source | technique |
| --- | --- | --- | --- | --- | --- | --- |
| INV-POST-01 | positive | Submitted PO with one line fully received (LUM 10 @ 4.75); `POST /invoices` `{ "po_id", "invoice_number": "INV-<unique>", "line_items": [{ "sku": "LUM-2X4-8", "quantity": 10, "unit_price": 4.75 }] }` | 201 | Body matches `Invoice`: `status` `received`; `matched` false; `partial_receipt` null; `total_amount` 47.5; `po_id` and `vendor_id` `vnd-001` | API.md Invoices; OpenAPI `Invoice` | happy path |
| INV-POST-02 | positive | PO with two lines fully received (API.md 95.1 example); invoice all lines | 201 | `total_amount` 95.1; `status` `received` | API.md Invoices example | documented option — multi-line invoice |
| INV-POST-03 | positive | PO fully received until `status` `closed`; then invoice | 201 | Invoice created (workflow allows submitted **or** closed) | API.md Business rules #10 | state — closed PO |
| INV-POST-04 | positive | PO partially received (one line 4 of 10); invoice only qty 4 @ 4.75 | 201 | `total_amount` 19.0 | API.md + overpayment (within received) | documented option — partial receipt invoicing |
| INV-POST-05 | positive | Two POs for **different** vendors (`vnd-001` and a new active vendor), each fully received; both use the same `invoice_number` string | 201 | Both invoices created; duplicate rule is **per vendor** (rule 6) | API.md Business rules #6 | documented option — same number, different vendors |
| INV-POST-N01 | negative | `POST /invoices` body `{}` | 400 | `rule` `validation_error`; body matches `Error` | OpenAPI `InvoiceCreate` | equivalence class — missing required |
| INV-POST-N02 | negative | `"po_id": "po-does-not-exist"` with valid lines | 404 | Body matches `Error`; no `rule` | OpenAPI `/invoices` 404 | unknown PO id |
| INV-POST-N03 | negative | Invoice against **draft** PO (created but not submitted) | 400 | `rule` `workflow_gate` | API.md Business rules #10 | state — wrong workflow |
| INV-POST-N04 | negative | Two invoices same vendor with same `invoice_number` (second uses exact duplicate of first) | 400 | Second: `rule` `duplicate_invoice_detection` | API.md Business rules #6 | state — duplicate number |
| INV-POST-N05 | negative | First invoice `INV-7`, second `inv-7` (same vendor) | 400 | Second: `rule` `duplicate_invoice_detection` | API.md Business rules #6 (case) | equivalence class — case |
| INV-POST-N06 | negative | Line SKU `PLY-12-4X8` not on PO | 400 | `rule` `invoice_line_validation` | API.md Business rules #8 | equivalence class — SKU not on PO |
| INV-POST-N07 | negative | Two invoice lines with same `sku` on one invoice | 400 | `rule` `invoice_line_validation` | API.md Business rules #8 (each SKU once) | equivalence class — duplicate SKU on invoice |
| INV-POST-N08 | negative | Received 10 units; invoice line `quantity` 11 (same price) | 400 | `rule` `overpayment_protection` | API.md Business rules #3 | boundary — one unit over received |
| INV-POST-N09 | negative | Received qty OK but `unit_price` high enough that line total exceeds received **value** for that line | 400 | `rule` `overpayment_protection` | API.md Business rules #3 (no tolerance on value) | boundary — value over received |
| INV-POST-N10 | negative | `"invoice_number": ""` | 400 | `rule` `validation_error` | OpenAPI `InvoiceCreate` `minLength` 1 | boundary — empty string |
| INV-POST-N11 | negative | Line `quantity` 0 | 400 | `rule` `validation_error` | OpenAPI `InvoiceLine` | boundary — one under minimum |
| INV-POST-N12 | negative | First invoice `INV-7`; second `" INV-7 "` (same vendor, surrounding spaces) | 400 | Second: `rule` `duplicate_invoice_detection` | API.md Business rules #6 (surrounding spaces) | equivalence class — surrounding spaces |
| INV-POST-N13 | negative | PO fully received; first invoice qty 6 @ 4.75 on LUM line (received 10); second invoice on **same PO** qty 5 @ 4.75 for same SKU | 400 | Second: `rule` `overpayment_protection` (cumulative qty on PO) | API.md Business rules #3 (everything invoiced on a PO) | state — second invoice over cumulative received |
| INV-POST-N14 | negative | Body `{ "po_id": "<valid>", "invoice_number": "INV-x", "line_items": [] }` | 400 | `rule` `validation_error` | OpenAPI `line_items` `minItems` 1 | boundary — empty array |
| INV-POST-N15 | negative | Body missing `po_id`; otherwise valid | 400 | `rule` `validation_error` | OpenAPI `InvoiceCreate` required | equivalence class — missing field |
| INV-POST-N16 | negative | `"po_id": ""` with otherwise valid body | 400 | `rule` `validation_error` | OpenAPI `InvoiceCreate` `po_id` `minLength` 1 | boundary — empty string |
| INV-POST-N17 | negative | Line `quantity` 10001 | 400 | `rule` `validation_error` | OpenAPI `InvoiceLine` `maximum` 10000 | boundary — one over maximum |
| INV-POST-N18 | negative | Line `quantity` -1 | 400 | `rule` `validation_error` | OpenAPI `InvoiceLine` | equivalence class — negative |
| INV-POST-N19 | negative | Line `unit_price` -0.01 | 400 | `rule` `validation_error` | OpenAPI `InvoiceLine` `minimum` 0 | equivalence class — negative price |
| INV-POST-N20 | negative | Line `unit_price` 100001 | 400 | `rule` `validation_error` | OpenAPI `InvoiceLine` `maximum` 100000 | boundary — one over maximum price |
| INV-POST-N21 | negative | Line missing `sku` | 400 | `rule` `validation_error` | OpenAPI `InvoiceLine` required | equivalence class — missing field |
| INV-POST-N22 | negative | Line `"sku": ""` | 400 | `rule` `validation_error` | OpenAPI `InvoiceLine` `sku` `minLength` 1 | boundary — empty string |
| INV-POST-N23 | negative | Line `"quantity": "ten"` (string) | 400 | `rule` `validation_error` | OpenAPI `InvoiceLine` types | equivalence class — wrong type |
| INV-POST-E01 | error | `POST /invoices/extra` with valid body | 404 | JSON `detail`; no `rule` | API.md Errors | unknown route |
| INV-POST-A01 | assumed — ask | Invoice line `unit_price` differs from PO line price for same SKU | — | — | QUESTIONS.md §4 (invoice vs PO price) | — |
| INV-POST-A02 | assumed — ask | `invoice_number` differing only by **internal** spaces (not surrounding) | — | — | QUESTIONS.md §4 (spaces inside number) | — |
| INV-POST-A03 | assumed — ask | Decimal `quantity` on invoice line | — | — | QUESTIONS.md §4 (decimal quantities) | — |

---

## GET /invoices/{invoiceId}

| ID | type | what we send | expected status | expected body (rule, key values) | source | technique |
| --- | --- | --- | --- | --- | --- | --- |
| INV-GET-01 | positive | After create flow in the same test, `GET /invoices/{invoiceId}` | 200 | Same `id`, `status` `received`, `matched` false, `partial_receipt` null | API.md Invoices; OpenAPI `Invoice` | create-then-get |
| INV-GET-02 | positive | `GET` on invoice created in test | 200 | Body matches OpenAPI schema `Invoice` | OpenAPI path | schema validation (`expectSchema`) |
| INV-GET-E01 | error | `GET /invoices/inv-does-not-exist` | 404 | Body matches `Error`; no `rule` | OpenAPI 404 | unknown id |

---

## POST /invoices/{invoiceId}/match

| ID | type | what we send | expected status | expected body (rule, key values) | source | technique |
| --- | --- | --- | --- | --- | --- | --- |
| INV-MATCH-01 | positive | After full receive + single-line invoice (47.5), `POST /invoices/{invoiceId}/match` (no body) | 200 | Body matches `MatchResult`: `status` `matched`; `matched` true; `partial_receipt` false; `ordered_value`, `received_value`, `invoice_total` 47.5; `message` non-empty | API.md Invoices; OpenAPI `MatchResult` | happy path — full match |
| INV-MATCH-02 | positive | PO partially received (4 of 10); invoice qty 4; match | 200 | `partial_receipt` true (PO line not fully received) | API.md Business rules #5 | partial_receipt_flag |
| INV-MATCH-03 | positive | After INV-MATCH-01 in the same test, `GET /invoices/{invoiceId}` | 200 | Invoice `status` `matched`; `matched` true; `partial_receipt` boolean (not null) | API.md flow | state after match |
| INV-MATCH-04 | positive | Two-line 95.1 PO/invoice fully received; match | 200 | `partial_receipt` false; `ordered_value`, `received_value`, `invoice_total` 95.1 | API.md Invoices match example | documented option — multi-line totals |
| INV-MATCH-N01 | negative | Invoice matched and **approved** in-test (`POST .../approve`), then `POST .../match` again | 400 | `rule` `workflow_gate` | API.md Business rules #10; OpenAPI `/match` 400 | state — approved invoice |
| INV-MATCH-E01 | error | `POST /invoices/inv-does-not-exist/match` | 404 | Body matches `Error`; no `rule` | OpenAPI 404 | unknown id |
| INV-MATCH-A01 | assumed — ask | Match when PO/invoice/receipt totals do not align (match failure) | — | — | QUESTIONS.md §4 (match failure status/body) | — |
| INV-MATCH-A02 | assumed — ask | Second `POST .../match` while invoice is `matched` but not yet approved | — | — | QUESTIONS.md §4 (second match) | — |

`three_way_match_gate` applies to **approve**, not match; it is tested in `approval-and-exposure.md`.

---

## Coverage notes

| Endpoint | positive | negative | error (404) | business rules |
| --- | --- | --- | --- | --- |
| POST /invoices | 5 | 23 | 1 | `workflow_gate`, `duplicate_invoice_detection`, `invoice_line_validation`, `overpayment_protection` |
| GET /invoices/{invoiceId} | 2 | — | 1 | — |
| POST /invoices/{invoiceId}/match | 4 | 1 | 1 | `workflow_gate` (N01); `partial_receipt_flag` on success (02) |

**Cross-area setup:** INV-MATCH-N01 needs `POST .../approve` (`approval-and-exposure.md`).

**Writer note:** `tests/api/invoices.spec.ts` already covers IDs through INV-MATCH-E01 from the 2026-10-23 table. After approval, implement only **new** rows: INV-POST-05, N12–N23, INV-MATCH-04 (keep existing IDs unchanged).

---

**Status:** **approved** (2026-10-26).
