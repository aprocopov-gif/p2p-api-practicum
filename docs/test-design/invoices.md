# Test design — invoices

Oracle: `docs/API.md` (Invoices, Purchase orders, Business rules, Errors) and OpenAPI paths `/invoices`, `/invoices/{invoiceId}`, `/invoices/{invoiceId}/match` (schemas `InvoiceCreate`, `InvoiceLine`, `Invoice`, `MatchResult`, `Error`). Assumed gaps from `docs/QUESTIONS.md` are called out below.

Precondition: seed state via `tests/api/reset.setup.ts`. Each test creates its own PO, submits, receives as needed, then invoices (unique `invoice_number` with `Date.now()` unless the case is duplicate detection).

**Local setup:** `POST /purchase-orders` → `POST .../submit` → `POST .../receive` (full or partial per row) → invoice/match step under test.

---

## POST /invoices

| ID | type | what we send | expected status | expected body (rule, key values) | source | technique |
| --- | --- | --- | --- | --- | --- | --- |
| INV-POST-01 | positive | Submitted PO with one line fully received (LUM 10 @ 4.75); `POST /invoices` `{ "po_id", "invoice_number": "INV-<unique>", "line_items": [{ "sku": "LUM-2X4-8", "quantity": 10, "unit_price": 4.75 }] }` | 201 | Body matches `Invoice`: `status` `received`; `matched` false; `partial_receipt` null; `total_amount` 47.5; `po_id` and `vendor_id` `vnd-001` | API.md Invoices; OpenAPI `Invoice` | happy path |
| INV-POST-02 | positive | PO with two lines fully received (API.md 95.1 example); invoice all lines | 201 | `total_amount` 95.1; `status` `received` | API.md Invoices example | multi-line invoice |
| INV-POST-03 | positive | PO fully received until `status` `closed`; then invoice | 201 | Invoice created (workflow allows submitted **or** closed) | API.md Business rules #10 | state — closed PO |
| INV-POST-04 | positive | PO partially received (one line 4 of 10); invoice only qty 4 @ 4.75 | 201 | `total_amount` 19.0 | API.md + overpayment (within received) | partial receipt invoicing |
| INV-POST-N01 | negative | `POST /invoices` body `{}` | 400 | `rule` `validation_error`; body matches `Error` | OpenAPI `InvoiceCreate` | equivalence class — missing required |
| INV-POST-N02 | negative | `"po_id": "po-does-not-exist"` with valid lines | 404 | Body matches `Error`; no `rule` | OpenAPI `/invoices` 404 | unknown PO id |
| INV-POST-N03 | negative | Invoice against **draft** PO (created but not submitted) | 400 | `rule` `workflow_gate` | API.md Business rules #10 | state — wrong workflow |
| INV-POST-N04 | negative | Two invoices same vendor with same `invoice_number` (second uses exact duplicate of first) | 400 | Second: `rule` `duplicate_invoice_detection` | API.md Business rules #6 | state — duplicate number |
| INV-POST-N05 | negative | First invoice `INV-7`, second `inv-7` (same vendor) | 400 | Second: `rule` `duplicate_invoice_detection` | API.md Business rules #6 (case/spaces) | equivalence class — case |
| INV-POST-N06 | negative | Line SKU `PLY-12-4X8` not on PO | 400 | `rule` `invoice_line_validation` | API.md Business rules #8 | equivalence class — SKU not on PO |
| INV-POST-N07 | negative | Two invoice lines with same `sku` on one invoice | 400 | `rule` `invoice_line_validation` | API.md Business rules #8 (each SKU once) | equivalence class — duplicate SKU |
| INV-POST-N08 | negative | Received 10 units; invoice line `quantity` 11 (same price) | 400 | `rule` `overpayment_protection` | API.md Business rules #3 | boundary — one unit over received |
| INV-POST-N09 | negative | Received qty OK but `unit_price` high enough that line total exceeds received **value** for that line | 400 | `rule` `overpayment_protection` | API.md Business rules #3 (no tolerance on value) | boundary — value over received |
| INV-POST-N10 | negative | `"invoice_number": ""` | 400 | `rule` `validation_error` | OpenAPI `InvoiceCreate` `minLength` 1 | boundary — empty string |
| INV-POST-N11 | negative | Line `quantity` 0 | 400 | `rule` `validation_error` | OpenAPI `InvoiceLine` | boundary — one under minimum |
| INV-POST-E01 | error | `POST /invoices/extra` with valid body | 404 | JSON `detail`; no `rule` | API.md Errors | unknown route |
| INV-POST-A01 | assumed — ask | Invoice line `unit_price` differs from PO line price for same SKU | — | — | QUESTIONS.md §4 (invoice vs PO price) | — |
| INV-POST-A02 | assumed — ask | `invoice_number` differing only by internal spaces | — | — | QUESTIONS.md §4 (spaces inside number) | — |
| INV-POST-A03 | assumed — ask | Decimal `quantity` on invoice line | — | — | QUESTIONS.md §4 (decimal quantities) | — |

---

## GET /invoices/{invoiceId}

| ID | type | what we send | expected status | expected body (rule, key values) | source | technique |
| --- | --- | --- | --- | --- | --- | --- |
| INV-GET-01 | positive | After INV-POST-01, `GET /invoices/{invoiceId}` | 200 | Same `id`, `status` `received`, `matched` false, `partial_receipt` null | API.md Invoices; OpenAPI `Invoice` | create-then-get |
| INV-GET-02 | positive | `GET` on invoice created in test | 200 | Body matches OpenAPI schema `Invoice` | OpenAPI path | schema validation (`expectSchema`) |
| INV-GET-E01 | error | `GET /invoices/inv-does-not-exist` | 404 | Body matches `Error`; no `rule` | OpenAPI 404 | unknown id |

---

## POST /invoices/{invoiceId}/match

| ID | type | what we send | expected status | expected body (rule, key values) | source | technique |
| --- | --- | --- | --- | --- | --- | --- |
| INV-MATCH-01 | positive | After full receive + INV-POST-01, `POST /invoices/{invoiceId}/match` (no body) | 200 | Body matches `MatchResult`: `status` `matched`; `matched` true; `partial_receipt` false; `ordered_value`, `received_value`, `invoice_total` 47.5; `message` non-empty | API.md Invoices; OpenAPI `MatchResult` | happy path — full match |
| INV-MATCH-02 | positive | PO partially received (4 of 10); invoice qty 4; match | 200 | `partial_receipt` true (PO line not fully received) | API.md Business rules #5 | partial_receipt_flag |
| INV-MATCH-03 | positive | After INV-MATCH-01, `GET /invoices/{invoiceId}` | 200 | Invoice `status` `matched`; `matched` true; `partial_receipt` boolean (not null) | API.md flow | state after match |
| INV-MATCH-N01 | negative | Create invoice, **approve** it (see approval area), then `POST .../match` again | 400 | `rule` `workflow_gate` | API.md Business rules #10; OpenAPI `/match` 400 | state — approved invoice |
| INV-MATCH-E01 | error | `POST /invoices/inv-does-not-exist/match` | 404 | Body matches `Error`; no `rule` | OpenAPI 404 | unknown id |
| INV-MATCH-A01 | assumed — ask | Match when PO/invoice/receipt totals do not align (match failure) | — | — | QUESTIONS.md §4 (match failure status/body) | — |
| INV-MATCH-A02 | assumed — ask | Second `POST .../match` while invoice is `matched` but not yet approved | — | — | QUESTIONS.md §4 (second match) | — |

---

## Coverage notes

| Endpoint | positive | negative | error (404) | business rules |
| --- | --- | --- | --- | --- |
| POST /invoices | 4 | 11 | 1 | `workflow_gate`, `duplicate_invoice_detection`, `invoice_line_validation`, `overpayment_protection` |
| GET /invoices/{invoiceId} | 2 | — | 1 | — |
| POST /invoices/{invoiceId}/match | 3 | 1 | 1 | `workflow_gate` (N01); `partial_receipt_flag` exercised on success (02) |

**Cross-area setup:** INV-MATCH-N01 needs `POST .../approve` (approval-and-exposure file).

---

**Status:** awaiting human **approved** or change requests before any Playwright code is written (`api-test-writer`).
