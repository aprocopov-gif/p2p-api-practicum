# API test coverage — rollup

Oracle: `docs/API.md`, `/openapi.json` (generated from `src/openapi.ts`), and `docs/QUESTIONS.md`. Case tables: `docs/test-design/<area>.md`. Specs: `tests/api/*.spec.ts`.

Precondition: `POST /admin/reset` in `tests/api/reset.setup.ts` only.

**Last executed:** `npm run test:api` — **130 passed**, **0 failed** (2026-10-26, **executed**).

## How to read this table

| Column | Meaning |
| --- | --- |
| **+** / **−** / **err** | Count of `@api` tests classified positive / negative / error (404 or unknown route) for this operation. **n/a** = no designed negative cases for that operation. |
| **tests** | `@api` tests whose **primary** operation is this row (test-design row ID prefix or obvious path). |
| **pass** / **fail** | Outcome of the last suite run above. **—** = no failures. |
| **schema** | Tests where **every** HTTP response body in the test is checked with `expectSchema` or `expectApiError` before business-field assertions. |
| **schema all?** | **yes** if `schema` = `tests`; **no** if any attributed test skips schema on a response (see notes). |

Setup-only rows use **setup** instead of `@api` counts where noted.

---

## OpenAPI operations (`/openapi.json`)

| Method | Path | Spec file(s) | + | − | err | tests | pass | fail | schema | schema all? |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| GET | `/health` | `health.spec.ts` | 1 | n/a | 1 | 2 | 2 | — | 2 | yes |
| POST | `/admin/reset` | `reset.setup.ts` | 0 | 0 | 0 | 0 | — | — | 0 | setup only (1 project test; status **200** only, no `Reset` schema) |
| GET | `/vendors` | `vendors-and-catalog.spec.ts`, `schema.spec.ts` | 5 | n/a | 1 | 6 | 6 | — | 5 | no — `VND-GET-03` does not schema-check the list body |
| POST | `/vendors` | `vendors-and-catalog.spec.ts` | 5 | 6 | 1 | 12 | 12 | — | 11 | no — `VND-POST-04` does not schema-check the `GET /vendors` list body |
| GET | `/vendors/{vendorId}/exposure` | `approval-and-exposure.spec.ts` | 5 | n/a | 1 | 6 | 6 | — | 6 | yes |
| GET | `/skus` | `vendors-and-catalog.spec.ts` | 3 | n/a | 1 | 4 | 4 | — | 4 | yes |
| POST | `/purchase-orders` | `purchase-orders.spec.ts` | 6 | 15 | 2 | 23 | 23 | — | 23 | yes |
| GET | `/purchase-orders/{poId}` | `purchase-orders.spec.ts` | 3 | n/a | 1 | 4 | 4 | — | 4 | yes |
| POST | `/purchase-orders/{poId}/submit` | `purchase-orders.spec.ts` | 2 | 2 | 1 | 5 | 5 | — | 5 | yes |
| POST | `/purchase-orders/{poId}/receive` | `receipts.spec.ts` | 6 | 13 | 1 | 20 | 20 | — | 20 | yes |
| POST | `/invoices` | `invoices.spec.ts` | 5 | 22 | 2 | 29 | 29 | — | 29 | yes |
| GET | `/invoices/{invoiceId}` | `invoices.spec.ts`, `approval-and-exposure.spec.ts` | 2 | n/a | 1 | 3 | 3 | — | 3 | yes |
| POST | `/invoices/{invoiceId}/match` | `invoices.spec.ts` | 4 | 1 | 1 | 6 | 6 | — | 6 | yes |
| POST | `/invoices/{invoiceId}/approve` | `approval-and-exposure.spec.ts` | 5 | 2 | 1 | 8 | 8 | — | 8 | yes |

**Note on `POST /purchase-orders`:** **PO-POST-N05** (404 unknown vendor) and **PO-POST-E01** (404 unknown route) count as **err**, not **−**.

**Note on cross-path tests:** Some tests call other paths as setup (for example `PO-SUB-02` uses `GET /purchase-orders/{poId}` but is counted under **submit** per `docs/test-design/purchase-orders.md`). `APR-POST-02` uses `GET /invoices/{invoiceId}` but is counted under **approve**. `INV-MATCH-03` uses `GET /invoices/{invoiceId}` but is counted under **match**.

**Helper / overlap:** `tests/api/schema.spec.ts` — 3 `@api` tests (2 hit `GET /vendors`, 1 is local `expectSchema` only with no HTTP body). Included in **GET /vendors** counts above.

**Out of `@api` inventory:** `reset.setup.ts` — 1 setup test (not tagged `@api`).

---

## Endpoints with a numeric **zero** in any column

| Method | Path | Zero column(s) | Notes |
| --- | --- | --- | --- |
| POST | `/admin/reset` | **+**, **−**, **err**, **tests**, **schema** (all **0** for `@api` coverage) | By design: only `reset.setup.ts` (**1** setup test, **pass** not in `@api` rollup). |

No other OpenAPI operation has **0** in **+**, **err**, **tests**, **pass**, or **schema**. Operations with no negative cases use **n/a** in **−**, not **0**.

---

## Pass criteria (this document)

1. **No numeric zero** in **+**, **−**, **err**, **tests**, **pass**, or **schema** for `@api` rows (use **n/a** when an operation has no designed negative cases; use **—** when there are no failures). **Exception:** `POST /admin/reset` setup row as documented above.
2. **Every HTTP response body** in `@api` tests is validated with `expectSchema` or `expectApiError` before assertions on business fields.

**Criterion 2:** **not met** for **GET /vendors** and **POST /vendors** (`VND-GET-03`, `VND-POST-04` list responses). **Met** for all other `@api` operations on the last run.

**Criterion 1:** **met** for all `@api` rows on the last run.

---

## Spec inventory

| Spec | tests (@api) |
| --- | ---: |
| `vendors-and-catalog.spec.ts` | 20 |
| `purchase-orders.spec.ts` | 32 |
| `receipts.spec.ts` | 20 |
| `invoices.spec.ts` | 38 |
| `approval-and-exposure.spec.ts` | 14 |
| `health.spec.ts` | 2 |
| `schema.spec.ts` | 3 |
| **Total** | **129** (+ 1 setup in `reset.setup.ts`) |

Shared helpers: `tests/api/helpers/schema.ts`, `tests/api/helpers/workflow.ts`.

---

## Possible bugs (from executed runs)

None on the last run. (Previously **INV-POST-N05** / **INV-POST-N12** failed until `checkInvoiceNumberUnique` normalized case and surrounding spaces per API.md rule #6.)

---

## Assumed — ask (not tested)

Rows marked **assumed — ask** in area design files — see `docs/QUESTIONS.md` §4. **not yet tested** by design.

---

## Evidence

| Claim | Label |
| --- | --- |
| Suite 130 pass / 0 fail | **executed** (2026-10-26) |
| Schema column counts | **inspected only** (2026-10-26 audit of `tests/api/*.spec.ts`) |
| duplicate_invoice_detection normalization | **executed** (fix in `src/rules.ts`) |

---

**Status:** OpenAPI rollup refresh (2026-10-26). Refresh after each writer run or suite change.
