# API test coverage — rollup

Oracle: `docs/API.md`, `/openapi.json`, and `docs/QUESTIONS.md`. Case tables: `docs/test-design/<area>.md`. Specs: `tests/api/*.spec.ts`.

Precondition: `POST /admin/reset` in `tests/api/reset.setup.ts` only.

**Last executed:** `npm run test:api` — **101 passed**, **1 failed** (2026-10-23).

## Pass criteria (this document)

1. **No numeric zero** in the endpoint table below for columns **+**, **−**, **err**, **tests**, **pass**, or **schema** (use **n/a** when an endpoint has no designed negative cases; use **—** when there are no failures).
2. **Every HTTP response body** in `@api` tests is validated with `expectSchema` (or `expectApiError`, which schema-checks `Error`) before assertions on business fields.

**Pass:** **met** for criterion 2. Criterion 1 **met** for all rows except **POST /invoices** **pass** (15 vs 16 tests) due to documented **INV-POST-N05** failure.

---

## Endpoint coverage

| Endpoint | Design file | + | − | err | tests | pass | fail | schema | design |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| GET /health | sanity | 1 | n/a | 1 | 2 | 2 | — | 2 | — |
| GET /vendors | vendors-and-catalog | 3 | n/a | 1 | 4 | 4 | — | 4 | approved |
| POST /vendors | vendors-and-catalog | 5 | 5 | 1 | 11 | 11 | — | 11 | approved |
| GET /skus | vendors-and-catalog | 3 | n/a | 1 | 4 | 4 | — | 4 | approved |
| POST /purchase-orders | purchase-orders | 6 | 13 | 1 | 20 | 20 | — | 20 | approved |
| GET /purchase-orders/{poId} | purchase-orders | 2 | n/a | 1 | 3 | 3 | — | 3 | approved |
| POST /purchase-orders/{poId}/submit | purchase-orders | 2 | 2 | 1 | 5 | 5 | — | 5 | approved |
| POST /purchase-orders/{poId}/receive | receipts | 5 | 9 | 1 | 15 | 15 | — | 15 | approved |
| POST /invoices | invoices | 4 | 11 | 1 | 16 | 15 | 1 | 16 | approved |
| GET /invoices/{invoiceId} | invoices | 2 | n/a | 1 | 3 | 3 | — | 3 | approved |
| POST /invoices/{invoiceId}/match | invoices | 3 | 1 | 1 | 5 | 5 | — | 5 | approved |
| POST /invoices/{invoiceId}/approve | approval-and-exposure | 3 | 2 | 1 | 6 | 6 | — | 6 | approved |
| GET /vendors/{vendorId}/exposure | approval-and-exposure | 3 | n/a | 1 | 4 | 4 | — | 4 | approved |

**schema** = count of `@api` tests for that endpoint where every response in the test is `expectSchema` / `expectApiError` (helpers `workflow.ts` schema-check `PurchaseOrder`, `Invoice`, `MatchResult`, `ApproveResult`, etc.).

**Out of table:** `POST /admin/reset` — setup project only (`reset.setup.ts`), not endpoint coverage.

**Helper / overlap:** `tests/api/schema.spec.ts` (3) — `expectSchema` proof; overlaps vendor list shape with VND-GET-02.

---

## Spec inventory

| Spec | tests (@api) |
| --- | ---: |
| `vendors-and-catalog.spec.ts` | 19 |
| `purchase-orders.spec.ts` | 28 |
| `receipts.spec.ts` | 15 |
| `invoices.spec.ts` | 24 |
| `approval-and-exposure.spec.ts` | 10 |
| `health.spec.ts` | 2 |
| `schema.spec.ts` | 3 |
| **Total** | **101** (+ 1 setup) |

Shared: `tests/api/helpers/schema.ts`, `tests/api/helpers/workflow.ts`.

---

## Possible bug

| Test | Expected (docs) | Actual | Doc |
| --- | --- | --- | --- |
| INV-POST-N05 | Second `inv-7` → **400** `duplicate_invoice_detection` after `INV-7` (same vendor) | **201** (body still matches `Invoice` schema) | API.md rule #6 |

Expectation unchanged; `test.fail` not added until a human confirms.

---

## Assumed — ask (not tested)

24 rows across area designs — see `docs/QUESTIONS.md` §4. **not yet tested** by design.

---

## Evidence

| Claim | Label |
| --- | --- |
| Suite 101 pass / 1 fail | **executed** |
| All `@api` responses schema-checked | **executed** (audit 2026-10-23) |
| INV-POST-N05 vs API.md | **executed** (failure) |

---

**Status:** **approved** (P51 coverage rollup, 2026-10-23). Refresh after each writer run or suite change.
