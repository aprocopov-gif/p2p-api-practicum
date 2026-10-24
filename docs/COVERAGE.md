# API test coverage — rollup

Oracle: `docs/API.md`, `/openapi.json`, and `docs/QUESTIONS.md`. Detailed cases live in `docs/test-design/<area>.md`. Playwright specs under `tests/api/` implement approved designs only.

Precondition for runs: `POST /admin/reset` in `tests/api/reset.setup.ts` (not in individual tests).

**Last executed:** `npm run test:api` — **24 passed**, **0 failed**, **0** possible bugs (2026-10-23).

---

## Endpoint coverage

| Endpoint | Design file | positive (designed) | negative (designed) | error (designed) | implemented tests | passed | failed | possible bugs | design status |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| GET /health | — (smoke / sanity) | — | — | — | 1 | 1 | 0 | — | not in test-design |
| POST /admin/reset | — | — | — | — | 0 (setup only) | — | — | — | setup hook only |
| GET /vendors | vendors-and-catalog | 3 | — | 1 | 4 | 4 | 0 | — | **approved** |
| POST /vendors | vendors-and-catalog | 5 | 5 | 1 | 11 | 11 | 0 | — | **approved** |
| GET /skus | vendors-and-catalog | 3 | — | 1 | 4 | 4 | 0 | — | **approved** |
| POST /purchase-orders | purchase-orders | 6 | 13 | 1 | 0 | 0 | 0 | — | awaiting approval |
| GET /purchase-orders/{poId} | purchase-orders | 2 | — | 1 | 0 | 0 | 0 | — | awaiting approval |
| POST /purchase-orders/{poId}/submit | purchase-orders | 2 | 2 | 1 | 0 | 0 | 0 | — | awaiting approval |
| POST /purchase-orders/{poId}/receive | receipts | 5 | 9 | 1 | 0 | 0 | 0 | — | awaiting approval |
| POST /invoices | invoices | 4 | 11 | 1 | 0 | 0 | 0 | — | awaiting approval |
| GET /invoices/{invoiceId} | invoices | 2 | — | 1 | 0 | 0 | 0 | — | awaiting approval |
| POST /invoices/{invoiceId}/match | invoices | 3 | 1 | 1 | 0 | 0 | 0 | — | awaiting approval |
| POST /invoices/{invoiceId}/approve | approval-and-exposure | 3 | 2 | 1 | 0 | 0 | 0 | — | awaiting approval |
| GET /vendors/{vendorId}/exposure | approval-and-exposure | 3 | — | 1 | 0 | 0 | 0 | — | awaiting approval |

**Implemented test count (by spec):**

| Spec | Role | Tests (@api) |
| --- | --- | ---: |
| `tests/api/vendors-and-catalog.spec.ts` | Area cases (table row IDs) | 19 |
| `tests/api/health.spec.ts` | System sanity | 1 |
| `tests/api/schema.spec.ts` | `expectSchema` helper proof (overlaps VND-GET-02) | 3 |

---

## Area totals (designed cases, excluding assumed — ask)

| Area file | Endpoints | + | − | err | assumed — ask rows |
| --- | --- | ---: | ---: | ---: | ---: |
| [vendors-and-catalog.md](test-design/vendors-and-catalog.md) | GET /vendors, POST /vendors, GET /skus | 11 | 10 | 3 | 7 |
| [purchase-orders.md](test-design/purchase-orders.md) | POST/GET PO, submit | 10 | 15 | 3 | 5 |
| [receipts.md](test-design/receipts.md) | receive | 5 | 9 | 1 | 4 |
| [invoices.md](test-design/invoices.md) | POST/GET invoice, match | 9 | 12 | 3 | 5 |
| [approval-and-exposure.md](test-design/approval-and-exposure.md) | approve, exposure | 6 | 2 | 2 | 3 |
| **Total** | **13 paths** | **41** | **48** | **13** | **24** |

Executable design rows (not assumed): **102**. Implemented: **19** area rows + **1** health ≈ **20%** of designed endpoint cases (vendors-and-catalog only).

---

## Business rules (API.md §11) — designed coverage

| Rule | Designed break or prove (ID / area) | Playwright yet |
| --- | --- | --- |
| `inactive_vendor_gate` | PO-POST-N04 | no |
| `receive_quantity_limit` | RCV-POST-N02, N03 | no |
| `overpayment_protection` | INV-POST-N08, N09 | no |
| `three_way_match_gate` | APR-POST-N01 | no |
| `partial_receipt_flag` | INV-MATCH-02 (success path) | no |
| `duplicate_invoice_detection` | INV-POST-N04, N05 | no |
| `gl_balance` | APR-POST-01, 03 (assert `balanced`) | no |
| `invoice_line_validation` | INV-POST-N06, N07 | no |
| `duplicate_approval` | APR-POST-N02 | no |
| `workflow_gate` | PO-SUB-N01/N02, RCV-POST-N01, INV-POST-N03, INV-MATCH-N01, … | partial (vendors: none) |
| `vendor_exposure_math` | EXP-GET-01, 02 | no |

Open question (QUESTIONS.md §4): when `partial_receipt_flag`, `gl_balance`, or `vendor_exposure_math` appear as `rule` on **400** — **inspected only**, not tested.

---

## Evidence labels (rollup)

| Claim | Label |
| --- | --- |
| Vendors-and-catalog table rows match `tests/api/vendors-and-catalog.spec.ts` | **executed** (24/24 suite pass) |
| Purchase-orders through exposure designs match OpenAPI paths read for P51 design | **inspected only** (no Playwright for those areas yet) |
| Assumed — ask rows (24) | **not yet tested** (by design) |

---

## Next P51 writer runs (after approval)

1. `purchase-orders` → `tests/api/purchase-orders.spec.ts`
2. `receipts` → `tests/api/receipts.spec.ts`
3. `invoices` → `tests/api/invoices.spec.ts`
4. `approval-and-exposure` → `tests/api/approval-and-exposure.spec.ts`

Update this file after each writer run: **implemented**, **passed**, **failed**, **possible bugs** columns.

---

**Status:** awaiting human **approved** or change requests for this rollup (design-only P51 artifact; does not replace per-area test-design files).
