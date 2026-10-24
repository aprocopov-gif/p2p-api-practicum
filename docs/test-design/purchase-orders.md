# Test design — purchase orders

Oracle: `docs/API.md` (Purchase orders, Seed data, Business rules, Errors) and OpenAPI paths `/purchase-orders`, `/purchase-orders/{poId}`, `/purchase-orders/{poId}/submit` (schemas `PurchaseOrderCreate`, `PoLineCreate`, `PurchaseOrder`, `Error`). Assumed gaps from `docs/QUESTIONS.md` are called out below.

Precondition for every case: data is at seed state (`POST /admin/reset` in `tests/api/reset.setup.ts` only — not inside individual tests). Each test creates its own PO (and uses seed `vnd-001` / `vnd-002` where documented).

---

## POST /purchase-orders

| ID | type | what we send | expected status | expected body (rule, key values) | source | technique |
| --- | --- | --- | --- | --- | --- | --- |
| PO-POST-01 | positive | `POST /purchase-orders` `{ "vendor_id": "vnd-001", "line_items": [{ "sku": "LUM-2X4-8", "quantity": 10, "unit_price": 4.75 }] }` | 201 | Body matches `PurchaseOrder`: `status` `draft`; `vendor_id` `vnd-001`; `id` starts with `po-`; line `received_quantity` 0; `ordered_value` 47.5; `received_value` 0; `fully_received` false | API.md Purchase orders; OpenAPI `PurchaseOrder` | happy path |
| PO-POST-02 | positive | Two lines: `LUM-2X4-8` with `description` set; `CEM-30KG` with `description` omitted | 201 | Second line `description` `""`; `ordered_value` 95.1 per API.md example math | API.md Purchase orders; OpenAPI `PoLineCreate` `description` default | documented option |
| PO-POST-03 | positive | Single line `quantity` 1 (smallest valid; OpenAPI `exclusiveMinimum` 0) | 201 | `ordered_value` equals `unit_price` × 1 | OpenAPI `PoLineCreate` `quantity` | boundary — smallest valid |
| PO-POST-04 | positive | Single line `quantity` 10000 | 201 | Line `quantity` 10000; PO created | OpenAPI `PoLineCreate` `quantity` `maximum` 10000 | boundary — at maximum |
| PO-POST-05 | positive | Single line `unit_price` 0 | 201 | `ordered_value` 0 | OpenAPI `PoLineCreate` `unit_price` `minimum` 0 | boundary — minimum price |
| PO-POST-06 | positive | Single line `unit_price` 100000 | 201 | PO created with that price | OpenAPI `PoLineCreate` `unit_price` `maximum` 100000 | boundary — at maximum price |
| PO-POST-N01 | negative | `POST /purchase-orders` body `{}` | 400 | Body matches `Error`; `rule` `validation_error` | OpenAPI `/purchase-orders` 400; `PurchaseOrderCreate` required fields | equivalence class — missing required |
| PO-POST-N02 | negative | Body `{ "line_items": [{ "sku": "LUM-2X4-8", "quantity": 1, "unit_price": 1 }] }` (no `vendor_id`) | 400 | `rule` `validation_error`; body matches `Error` | OpenAPI `PurchaseOrderCreate` | equivalence class — missing field |
| PO-POST-N03 | negative | Body `{ "vendor_id": "vnd-001", "line_items": [] }` | 400 | `rule` `validation_error` | OpenAPI `line_items` `minItems` 1 | boundary — empty array |
| PO-POST-N04 | negative | Body with `"vendor_id": "vnd-002"` (inactive seed vendor) and valid line | 400 | `rule` `inactive_vendor_gate`; body matches `Error` | API.md Business rules #1; OpenAPI description | business rule |
| PO-POST-N05 | negative | Body with `"vendor_id": "vnd-no-such"` and valid line | 404 | Body matches `Error`; `detail` present; no `rule` | OpenAPI `/purchase-orders` 404 | unknown vendor id |
| PO-POST-N06 | negative | Line `quantity` 0 | 400 | `rule` `validation_error` | OpenAPI `PoLineCreate` `exclusiveMinimum` 0 | boundary — one under minimum |
| PO-POST-N07 | negative | Line `quantity` 10001 | 400 | `rule` `validation_error` | OpenAPI `PoLineCreate` `maximum` 10000 | boundary — one over maximum |
| PO-POST-N08 | negative | Line `quantity` -1 | 400 | `rule` `validation_error` | OpenAPI `PoLineCreate` | equivalence class — negative |
| PO-POST-N09 | negative | Line `unit_price` -0.01 | 400 | `rule` `validation_error` | OpenAPI `PoLineCreate` `minimum` 0 | equivalence class — negative price |
| PO-POST-N10 | negative | Line `unit_price` 100001 | 400 | `rule` `validation_error` | OpenAPI `PoLineCreate` `maximum` 100000 | boundary — one over maximum price |
| PO-POST-N11 | negative | Line missing `sku` | 400 | `rule` `validation_error` | OpenAPI `PoLineCreate` required | equivalence class — missing field |
| PO-POST-N12 | negative | Line `"sku": ""` | 400 | `rule` `validation_error` | OpenAPI `PoLineCreate` `sku` `minLength` 1 | boundary — empty string |
| PO-POST-N13 | negative | Line `"quantity": "ten"` (string) | 400 | `rule` `validation_error` | OpenAPI `PoLineCreate` types | equivalence class — wrong type |
| PO-POST-E01 | error | `POST /purchase-orders/extra` with valid body | 404 | JSON `detail`; no `rule` | API.md Errors | unknown route |
| PO-POST-A01 | assumed — ask | Two lines with the same `sku` on one PO | — | — | QUESTIONS.md §4 (duplicate SKU on PO) | — |
| PO-POST-A02 | assumed — ask | Line `sku` not listed on `GET /skus` | — | — | QUESTIONS.md §4 (SKU must exist on catalog) | — |
| PO-POST-A03 | assumed — ask | Second identical `POST /purchase-orders` body | — | — | QUESTIONS.md §4 (duplicate create) | — |
| PO-POST-A04 | assumed — ask | Line `quantity` 0.5 (decimal) | — | — | QUESTIONS.md §4 (decimal quantities) | — |
| PO-POST-A05 | assumed — ask | Body with unknown property `{ "vendor_id": "vnd-001", "note": "x", "line_items": [...] }` | — | — | QUESTIONS.md §4 (unknown JSON properties) | — |

---

## GET /purchase-orders/{poId}

| ID | type | what we send | expected status | expected body (rule, key values) | source | technique |
| --- | --- | --- | --- | --- | --- | --- |
| PO-GET-01 | positive | After PO-POST-01 in same test, `GET /purchase-orders/{poId}` with returned `id` | 200 | Same `id`, `status` `draft`, same line items and values as create response | API.md Purchase orders; OpenAPI `PurchaseOrder` | create-then-get |
| PO-GET-02 | positive | `GET` on a PO created in the test | 200 | Body matches OpenAPI schema `PurchaseOrder` | OpenAPI path `/purchase-orders/{poId}` | schema validation (`expectSchema`) |
| PO-GET-E01 | error | `GET /purchase-orders/po-does-not-exist` | 404 | Body matches `Error`; `detail` present; no `rule` | OpenAPI 404 | unknown id |

---

## POST /purchase-orders/{poId}/submit

| ID | type | what we send | expected status | expected body (rule, key values) | source | technique |
| --- | --- | --- | --- | --- | --- | --- |
| PO-SUB-01 | positive | Create draft PO, then `POST /purchase-orders/{poId}/submit` | 200 | Body matches `PurchaseOrder`; `status` `submitted`; same `id` | API.md Purchase orders; OpenAPI `/submit` 200 | happy path |
| PO-SUB-02 | positive | After PO-SUB-01, `GET /purchase-orders/{poId}` | 200 | `status` still `submitted` | API.md flow (forward-only status) | state check |
| PO-SUB-N01 | negative | `POST .../submit` again on already `submitted` PO | 400 | `rule` `workflow_gate`; body matches `Error` | API.md Business rules #10; OpenAPI `/submit` 400 | state — step done twice |
| PO-SUB-N02 | negative | Create PO, submit, fully receive until `closed`, then `POST .../submit` | 400 | `rule` `workflow_gate` | API.md Business rules #10 (submit only draft) | state — wrong status |
| PO-SUB-E01 | error | `POST /purchase-orders/po-does-not-exist/submit` | 404 | Body matches `Error`; no `rule` | OpenAPI 404 | unknown id |

---

## Coverage notes

| Endpoint | positive | negative | error (404) | business rules |
| --- | --- | --- | --- | --- |
| POST /purchase-orders | 6 | 13 | 1 | `inactive_vendor_gate` (N04) |
| GET /purchase-orders/{poId} | 2 | — | 1 | — |
| POST /purchase-orders/{poId}/submit | 2 | 2 | 1 | `workflow_gate` (N01, N02) |

**Depends on (not in this file):** `POST /purchase-orders/{poId}/receive` for PO-SUB-N02 setup only.

---

**Status:** awaiting human **approved** or change requests before any Playwright code is written (`api-test-writer`).
