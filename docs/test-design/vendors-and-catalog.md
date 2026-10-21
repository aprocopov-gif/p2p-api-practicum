# Test design — vendors and catalog

Oracle: `docs/API.md` (Vendors, Catalog, Seed data, Errors) and OpenAPI paths `/vendors`, `/skus` (schemas `Vendor`, `VendorCreate`, `Sku`). Assumed gaps from `docs/QUESTIONS.md` are called out below.

Precondition for every case: data is at seed state (`POST /admin/reset` in `tests/api/reset.setup.ts` only — not inside individual tests).

---

## GET /vendors

| ID | type | what we send | expected status | expected body (rule, key values) | source | technique |
| --- | --- | --- | --- | --- | --- | --- |
| VND-GET-01 | positive | `GET /vendors` | 200 | JSON array; length ≥ 2; includes objects with `id` `vnd-001`, `name` `Maple Ridge Supply`, `active` true and `id` `vnd-002`, `name` `Old Quarry Materials`, `active` false | API.md Seed data, Vendors; OpenAPI `Vendor` | seed data assertion |
| VND-GET-02 | positive | `GET /vendors` | 200 | Every element validates as OpenAPI schema `Vendor` (`id`, `name`, `active` present and typed correctly) | OpenAPI path `/vendors`, schema `Vendor` | schema validation (`expectSchema`) |
| VND-GET-03 | positive | Create vendor via `POST /vendors` with unique `name`, then `GET /vendors` | 200 | Array contains an entry whose `name` matches the created vendor and whose `id` starts with `vnd-` | API.md Basics (IDs), Vendors | create-then-list |
| VND-GET-E01 | error | `GET /vendors/not-a-route` (path does not exist) | 404 | JSON `detail`; no `rule` | API.md Errors | unknown route |
| VND-GET-A01 | assumed — ask | `GET /vendors?unknown=query` | — | — | QUESTIONS.md §4 (unknown query params not documented) | — |

No business rule from API.md § Business rules applies to listing vendors; no 400 is documented for this path.

---

## POST /vendors

| ID | type | what we send | expected status | expected body (rule, key values) | source | technique |
| --- | --- | --- | --- | --- | --- | --- |
| VND-POST-01 | positive | `POST /vendors` body `{ "name": "<unique non-empty string>" }` | 201 | `Vendor`: `name` equals sent name; `active` true; `id` present and starts with `vnd-` | API.md Vendors, Basics; OpenAPI `VendorCreate` / `Vendor` | happy path |
| VND-POST-02 | positive | `POST /vendors` body `{ "name": "<unique>", "active": false }` | 201 | `active` false; other fields as in VND-POST-01 | API.md Vendors (`active` optional); OpenAPI `VendorCreate` | documented option |
| VND-POST-03 | positive | `POST /vendors` body `{ "name": "<unique>", "active": true }` | 201 | Same as VND-POST-01 (`active` true) | API.md Vendors (default `active` true) | default equivalence |
| VND-POST-04 | positive | After VND-POST-01, `GET /vendors` | 200 | Created vendor appears in list with same `id` and `name` | API.md Vendors | create-then-list |
| VND-POST-N01 | negative | `POST /vendors` body `{}` | 400 | `rule` `validation_error`; non-empty `detail` | OpenAPI `/vendors` 400; API.md Errors | equivalence class — missing required field |
| VND-POST-N02 | negative | `POST /vendors` body `{ "name": "" }` | 400 | `rule` `validation_error` | API.md Vendors (name cannot be empty); OpenAPI `VendorCreate` | boundary — empty string |
| VND-POST-N03 | negative | `POST /vendors` body `{ "name": 12345 }` | 400 | `rule` `validation_error` | OpenAPI `VendorCreate` (`name` string) | equivalence class — wrong type |
| VND-POST-N04 | negative | `POST /vendors` body `{ "name": "Valid Name", "active": "yes" }` | 400 | `rule` `validation_error` | OpenAPI `VendorCreate` (`active` boolean) | equivalence class — wrong type |
| VND-POST-N05 | negative | `POST /vendors` body `{ "name": null }` | 400 | `rule` `validation_error` | OpenAPI `VendorCreate` | equivalence class — null |
| VND-POST-E01 | error | `POST /vendors/extra` (path does not exist) | 404 | JSON `detail`; no `rule` | API.md Errors | unknown route |
| VND-POST-A01 | assumed — ask | `POST /vendors` body `{ "name": "   " }` (only spaces) | — | — | QUESTIONS.md §4 (spaces-only name) | — |
| VND-POST-A02 | assumed — ask | Second `POST /vendors` with the same `name` as an existing vendor | — | — | QUESTIONS.md §4 (duplicate create) | — |
| VND-POST-A03 | assumed — ask | `POST /vendors` with body but without `Content-Type: application/json` | — | — | QUESTIONS.md §4 (Content-Type) | — |
| VND-POST-A04 | assumed — ask | `POST /vendors` body `{ "name": "<very long string>" }` beyond any documented max | — | — | QUESTIONS.md §4 (max length) | — |

None of the eleven named business rules in API.md are triggered by vendor creation; rejections use `validation_error` only (OpenAPI `/vendors` 400).

---

## GET /skus

| ID | type | what we send | expected status | expected body (rule, key values) | source | technique |
| --- | --- | --- | --- | --- | --- | --- |
| SKU-GET-01 | positive | `GET /skus` | 200 | JSON array of length 5 | API.md Catalog; OpenAPI path `/skus` | happy path |
| SKU-GET-02 | positive | `GET /skus` | 200 | Contains entries for all seed SKUs with exact `sku`, `description`, and `unit_price`: `LUM-2X4-8` / 4.75, `PLY-12-4X8` / 22.40, `CEM-30KG` / 11.90, `REB-10MM-6` / 18.25, `SCR-DECK-1LB` / 9.99 (descriptions per API.md Seed data table) | API.md Seed data, Catalog | seed data assertion |
| SKU-GET-03 | positive | `GET /skus` | 200 | Every element validates as OpenAPI schema `Sku` (`sku`, `description`, `unit_price`) | OpenAPI schema `Sku` | schema validation (`expectSchema`) |
| SKU-GET-E01 | error | `GET /skus/extra` (path does not exist) | 404 | JSON `detail`; no `rule` | API.md Errors | unknown route |
| SKU-GET-A01 | assumed — ask | `GET /skus?unknown=query` | — | — | QUESTIONS.md §4 (unknown query params not documented) | — |

Catalog is read-only in the API; no 400 or business-rule rows apply to `GET /skus`.

---

## Coverage notes

| Endpoint | positive | negative | error (404) | business rules |
| --- | --- | --- | --- | --- |
| GET /vendors | 3 | — | 1 | — |
| POST /vendors | 4 | 5 | 1 | — (validation only) |
| GET /skus | 3 | — | 1 | — |

**Out of scope for this area file** (separate design): `GET /vendors/{vendorId}/exposure`.

**Existing tests:** `tests/api/schema.spec.ts` partially overlaps VND-GET-02 (Vendor schema on list). Implementing this design may extend or split that file when approved.

---

**Status:** awaiting human **approved** or change requests before any Playwright code is written (`api-test-writer`).
