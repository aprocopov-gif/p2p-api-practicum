# Test design — approval and exposure

Oracle: `docs/API.md` (Invoices approve, Vendors exposure, Business rules, Errors) and OpenAPI paths `/invoices/{invoiceId}/approve`, `/vendors/{vendorId}/exposure` (schemas `ApproveResult`, `GlEntry`, `GlLine`, `VendorExposure`, `Error`). Assumed gaps from `docs/QUESTIONS.md` are called out below.

Precondition: seed state via `tests/api/reset.setup.ts`. Each test runs the happy path through **match** in-test (PO → submit → receive → invoice → match) unless the row targets an earlier workflow state.

**Local setup:** unique `invoice_number`; use seed vendor `vnd-001` unless testing exposure for another vendor.

---

## POST /invoices/{invoiceId}/approve

| ID | type | what we send | expected status | expected body (rule, key values) | source | technique |
| --- | --- | --- | --- | --- | --- | --- |
| APR-POST-01 | positive | Full happy path through match (single line LUM 10 @ 4.75); `POST /invoices/{invoiceId}/approve` | 200 | Body matches `ApproveResult`: `status` `approved`; `gl_entry.balanced` true; debit `5000 Materials Expense` and credit `2000 Accounts Payable` each amount 47.5; `vendor_exposure` 47.5 | API.md Invoices approve; OpenAPI `ApproveResult` / `GlEntry` | happy path |
| APR-POST-02 | positive | After APR-POST-01, `GET /invoices/{invoiceId}` | 200 | Invoice `status` `approved` | API.md flow | state after approve |
| APR-POST-03 | positive | Two-line PO/invoiced 95.1 example through match; approve | 200 | `vendor_exposure` 95.1; GL amounts 95.1; `balanced` true | API.md curl session totals | multi-line amounts |
| APR-POST-N01 | negative | Invoice in `received` state (never matched); `POST .../approve` | 400 | `rule` `three_way_match_gate`; body matches `Error` | API.md Business rules #4 | state — not matched |
| APR-POST-N02 | negative | After successful approve, `POST .../approve` again on same invoice | 400 | `rule` `duplicate_approval` | API.md Business rules #9 | state — step done twice |
| APR-POST-E01 | error | `POST /invoices/inv-does-not-exist/approve` | 404 | Body matches `Error`; no `rule` | OpenAPI 404 | unknown id |
| APR-POST-A01 | assumed — ask | Whether `gl_balance` or `vendor_exposure_math` ever appear as `rule` on 400 | — | — | QUESTIONS.md §4 | — |
| APR-POST-A02 | assumed — ask | Ledger: multiple debit/credit lines or amounts other than invoice total | — | — | QUESTIONS.md §4 (ledger line count/amount) | — |

---

## GET /vendors/{vendorId}/exposure

| ID | type | what we send | expected status | expected body (rule, key values) | source | technique |
| --- | --- | --- | --- | --- | --- | --- |
| EXP-GET-01 | positive | After APR-POST-01 in same test, `GET /vendors/vnd-001/exposure` | 200 | Body matches `VendorExposure`: `vendor_id` `vnd-001`; `open_ap_liability` 47.5; `approved_invoices` array contains approved invoice id | API.md Vendors exposure; Business rules #11 | happy path — after approve |
| EXP-GET-02 | positive | After APR-POST-03 (95.1 approval), `GET /vendors/vnd-001/exposure` | 200 | `open_ap_liability` 95.1; `approved_invoices` includes that invoice id | API.md `vendor_exposure_math` | value assertion |
| EXP-GET-03 | positive | `GET /vendors/vnd-001/exposure` on seed state (no approvals in **this** test’s flow — fresh PO path not run) | 200 | Body matches `VendorExposure` schema | OpenAPI `VendorExposure` | schema validation (`expectSchema`) |
| EXP-GET-E01 | error | `GET /vendors/vnd-does-not-exist/exposure` | 404 | Body matches `Error`; no `rule` | API.md Vendors; OpenAPI 404 | unknown vendor id |
| EXP-GET-A01 | assumed — ask | Exposure for vendor with **no** approved invoices (empty liability?) | — | — | QUESTIONS.md §4 | — |

Note: EXP-GET-03 uses only `GET` with seed reset and no approve in the same test — documents shape only; liability value is **not** asserted (see EXP-GET-A01).

---

## Coverage notes

| Endpoint | positive | negative | error (404) | business rules |
| --- | --- | --- | --- | --- |
| POST /invoices/{invoiceId}/approve | 3 | 2 | 1 | `three_way_match_gate`, `duplicate_approval`; `gl_balance` on success (01, 03) |
| GET /vendors/{vendorId}/exposure | 3 | — | 1 | `vendor_exposure_math` on EXP-GET-01/02 |

**Setup endpoints:** purchase-orders, receipts, invoices (through match) in-test.

---

**Status:** awaiting human **approved** or change requests before any Playwright code is written (`api-test-writer`).
