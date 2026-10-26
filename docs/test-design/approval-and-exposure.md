# Test design — approval and exposure

Oracle: `docs/API.md` (Invoices approve, Vendors exposure, Business rules, Errors) and OpenAPI paths `/invoices/{invoiceId}/approve`, `/vendors/{vendorId}/exposure` (schemas `ApproveResult`, `GlEntry`, `GlLine`, `VendorExposure`, `Error`). Assumed gaps from `docs/QUESTIONS.md` are called out below.

Precondition: seed state via `tests/api/reset.setup.ts`. Each test runs the happy path through **match** in-test (PO → submit → receive → invoice → match) unless the row targets an earlier workflow state.

**Local setup:** unique `invoice_number`. Any row that asserts `vendor_exposure` or `open_ap_liability` creates its own active vendor in that test, so the figure is that vendor's whole sum (rule 11). `vnd-001` is only the schema-only read (EXP-GET-03). `vnd-002` is the known inactive vendor (EXP-GET-05). Approve has no request body (OpenAPI: path param only), so there is no `validation_error` equivalence class on that call.

Quantity and price limits (0, 1, 10,000, 100,000, one over) are owned by the purchase-order and invoice designs. They are not repeated here.

---

## POST /invoices/{invoiceId}/approve

| ID | type | what we send | expected status | expected body (rule, key values) | source | technique |
| --- | --- | --- | --- | --- | --- | --- |
| APR-POST-01 | positive | New active vendor. Full happy path through match (single line LUM 10 @ 4.75); `POST /invoices/{invoiceId}/approve` with no body | 200 | Body matches `ApproveResult`: `invoice_id` is that invoice; `status` `approved`; `gl_entry.balanced` true; one debit `5000 Materials Expense` and one credit `2000 Accounts Payable`, each amount 47.5; `vendor_exposure` 47.5 | API.md Invoices approve; curl session; OpenAPI `ApproveResult` / `GlEntry` | happy path |
| APR-POST-02 | positive | After APR-POST-01, `GET /invoices/{invoiceId}` | 200 | Invoice `status` `approved` | API.md flow (status moves to `approved`) | state after approve |
| APR-POST-03 | positive | New active vendor. Two-line PO/invoice of the 95.1 example through match; approve | 200 | `invoice_id` is that invoice; `vendor_exposure` 95.1; GL debit and credit amounts 95.1; `balanced` true; accounts `5000 Materials Expense` and `2000 Accounts Payable` | API.md approve example | documented option — multi-line amounts |
| APR-POST-04 | positive | New active vendor. PO line LUM qty 10; receive 4; invoice qty 4 @ 4.75 (`total_amount` 19); match (`partial_receipt` true); approve | 200 | `status` `approved`; `gl_entry.balanced` true; debit account `5000 Materials Expense` and credit account `2000 Accounts Payable`; `vendor_exposure` 19. GL line amounts are not asserted (see APR-POST-A02) | API.md flow (partial delivery); Business rules #4 and #11 | documented option — approve after partial match |
| APR-POST-05 | positive | New active vendor. Two matched invoices in one test: single-line 47.5, then the 95.1 two-line example. Approve the 47.5 invoice, then the 95.1 invoice | 200 | First approve: `vendor_exposure` 47.5. Second approve: `vendor_exposure` 142.6 (47.5 + 95.1). Both `status` `approved` and `gl_entry.balanced` true | API.md Business rules #11; approve example totals | documented option — exposure is the sum |
| APR-POST-N01 | negative | Invoice in `received` state (never matched); `POST .../approve` | 400 | `rule` `three_way_match_gate`; body matches `Error` | API.md Business rules #4 | state — not matched |
| APR-POST-N02 | negative | After successful approve, `POST .../approve` again on same invoice | 400 | `rule` `duplicate_approval` | API.md Business rules #9 | state — step done twice |
| APR-POST-E01 | error | `POST /invoices/inv-does-not-exist/approve` | 404 | Body matches `Error`; no `rule` | OpenAPI 404; API.md Errors | unknown id |
| APR-POST-A01 | assumed — ask | Whether `gl_balance` or `vendor_exposure_math` ever appear as `rule` on 400 | — | — | QUESTIONS.md §4 | — |
| APR-POST-A02 | assumed — ask | Ledger: multiple debit/credit lines, or amounts other than the invoice total | — | — | QUESTIONS.md §4 (ledger line count/amount) | — |

---

## GET /vendors/{vendorId}/exposure

| ID | type | what we send | expected status | expected body (rule, key values) | source | technique |
| --- | --- | --- | --- | --- | --- | --- |
| EXP-GET-01 | positive | New active vendor. After a single-line approve of 47.5 in the same test, `GET /vendors/{vendorId}/exposure` | 200 | Body matches `VendorExposure`: `vendor_id` is that vendor; `open_ap_liability` 47.5; `approved_invoices` contains that invoice id | API.md Vendors exposure; Business rules #11 | happy path — after approve |
| EXP-GET-02 | positive | New active vendor. After the 95.1 two-line approve in the same test, `GET /vendors/{vendorId}/exposure` | 200 | `open_ap_liability` 95.1; `approved_invoices` contains that invoice id | API.md approve example; `vendor_exposure_math` | documented option — multi-line total |
| EXP-GET-03 | positive | `GET /vendors/vnd-001/exposure` with no approve in this test | 200 | Body matches `VendorExposure`; `vendor_id` `vnd-001`. Liability is not asserted | OpenAPI `VendorExposure`; API.md Seed data | schema validation (`expectSchema`) |
| EXP-GET-04 | positive | Same test as APR-POST-05 (new vendor, both invoices approved: 47.5 and 95.1). `GET /vendors/{vendorId}/exposure` | 200 | `open_ap_liability` 142.6; `approved_invoices` has length 2 and contains both invoice ids | API.md Business rules #11 | documented option — sum of approved totals |
| EXP-GET-05 | positive | `GET /vendors/vnd-002/exposure` (seed vendor, inactive, no approve in this test) | 200 | Body matches `VendorExposure`; `vendor_id` `vnd-002`. Liability is not asserted (see EXP-GET-A01) | API.md Vendors (404 only for an unknown vendor); Seed data | documented option — known inactive vendor |
| EXP-GET-E01 | error | `GET /vendors/vnd-does-not-exist/exposure` | 404 | Body matches `Error`; no `rule` | API.md Vendors; OpenAPI 404 | unknown vendor id |
| EXP-GET-A01 | assumed — ask | Exposure for a vendor with **no** approved invoices (what `open_ap_liability` and `approved_invoices` are) | — | — | QUESTIONS.md §4 | — |

`gl_balance` and `vendor_exposure_math` are promises the API keeps on success. A client cannot send a ledger or a liability figure, so there is no request that is documented to draw those names as a 400 `rule`. That gap is APR-POST-A01.

---

## Coverage notes

| Endpoint | positive | negative | error (404) | business rules |
| --- | --- | --- | --- | --- |
| POST /invoices/{invoiceId}/approve | 5 | 2 | 1 | `three_way_match_gate` (N01), `duplicate_approval` (N02); `gl_balance` on success (01, 03, 04, 05); `vendor_exposure_math` on success (01, 03, 04, 05) |
| GET /vendors/{vendorId}/exposure | 5 | — | 1 | `vendor_exposure_math` on EXP-GET-01, 02, 04 |

**Setup endpoints:** vendors (create), purchase-orders, receipts, invoices (through match) in-test.

**Not in this area:** `workflow_gate` on a second match of an approved invoice is INV-MATCH-N01.

---

**Status:** **approved** (2026-10-26).
