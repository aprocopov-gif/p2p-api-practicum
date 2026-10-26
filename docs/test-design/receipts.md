# Test design — receipts

Oracle: `docs/API.md` (Purchase orders / receive, Business rules, Errors) and OpenAPI path `/purchase-orders/{poId}/receive` (schemas `ReceiveRequest`, `PurchaseOrder`, `Error`). Assumed gaps from `docs/QUESTIONS.md` are called out below.

**Area scope:** `POST /purchase-orders/{poId}/receive` only. Draft PO creation and submit live in `docs/test-design/purchase-orders.md`.

Precondition: seed state via `tests/api/reset.setup.ts`. Each test builds its own draft PO, submits it, then receives (unless the case is about wrong PO status).

**Local setup:** `POST /purchase-orders` for `vnd-001` with known lines → `POST .../submit` → receive step under test.

---

## POST /purchase-orders/{poId}/receive

| ID | type | what we send | expected status | expected body (rule, key values) | source | technique |
| --- | --- | --- | --- | --- | --- | --- |
| RCV-POST-01 | positive | Submitted PO: one line `LUM-2X4-8` qty 10 @ 4.75; `POST .../receive` `{ "items": [{ "sku": "LUM-2X4-8", "quantity": 10 }] }` | 200 | Body matches `PurchaseOrder`; line `received_quantity` 10; `fully_received` true; `status` `closed`; `received_value` 47.5 | API.md Purchase orders (receive closes PO); OpenAPI | happy path — full receipt |
| RCV-POST-02 | positive | Submitted PO: one line qty 10; receive qty 4 only | 200 | `received_quantity` 4; `fully_received` false; `status` `submitted`; `received_value` 19.0 | API.md (partial deliveries) | partial receipt |
| RCV-POST-03 | positive | Submitted PO: two lines (`LUM` 10, `CEM` 4); receive both full quantities in one delivery | 200 | Both lines fully received; `status` `closed`; `ordered_value` 95.1; `received_value` 95.1 | API.md example PO | multi-line full receipt |
| RCV-POST-04 | positive | Submitted PO qty 10; first receive 4, second receive 6 (same test, serial steps) | 200 | After second: `received_quantity` 10; `status` `closed` | API.md (`receive_quantity_limit` across deliveries) | state — cumulative deliveries |
| RCV-POST-05 | positive | Receive item `quantity` 1 (smallest valid) on a PO line ordered 1 | 200 | `received_quantity` 1; PO `closed` | OpenAPI receive item `exclusiveMinimum` 0 | boundary — smallest valid |
| RCV-POST-06 | positive | Submitted PO: one line `quantity` 10000; receive 10000 in one delivery | 200 | `received_quantity` 10000; `status` `closed` | OpenAPI receive item `maximum` 10000 | boundary — at maximum |
| RCV-POST-N01 | negative | `POST .../receive` on a **draft** PO (never submitted) | 400 | `rule` `workflow_gate`; body matches `Error` | API.md Business rules #10 | state — wrong workflow step |
| RCV-POST-N02 | negative | Submitted PO line ordered 10; receive qty 11 in one delivery | 400 | `rule` `receive_quantity_limit`; body matches `Error` | API.md Business rules #2 | boundary — one unit over ordered |
| RCV-POST-N03 | negative | Submitted PO line ordered 10; receive 6 then receive 5 (total 11) | 400 | Second receive: `rule` `receive_quantity_limit` | API.md Business rules #2 (across deliveries) | boundary — cumulative over limit |
| RCV-POST-N04 | negative | Body `{ "items": [] }` | 400 | `rule` `validation_error` | OpenAPI `ReceiveRequest` `minItems` 1 | boundary — empty array |
| RCV-POST-N05 | negative | Item `quantity` 0 | 400 | `rule` `validation_error` | OpenAPI receive item `exclusiveMinimum` 0 | boundary — one under minimum |
| RCV-POST-N06 | negative | Item `quantity` 10001 | 400 | `rule` `validation_error` | OpenAPI receive item `maximum` 10000 | boundary — one over maximum |
| RCV-POST-N07 | negative | Body `{}` (no `items`) | 400 | `rule` `validation_error` | OpenAPI `ReceiveRequest` required | equivalence class — missing field |
| RCV-POST-N08 | negative | Item missing `sku` | 400 | `rule` `validation_error` | OpenAPI receive item required | equivalence class — missing field |
| RCV-POST-N09 | negative | Item `"sku": ""` | 400 | `rule` `validation_error` | OpenAPI `sku` `minLength` 1 | boundary — empty string |
| RCV-POST-N10 | negative | Submitted PO with only `LUM-2X4-8`; receive item `PLY-12-4X8` | 400 | `rule` `validation_error`; body matches `Error` | API.md Purchase orders (every SKU must be on the PO) | equivalence class — SKU not on PO |
| RCV-POST-N11 | negative | PO fully received until `status` `closed`; `POST .../receive` again with valid items | 400 | `rule` `workflow_gate` | API.md Business rules #10 (receive only on submitted) | state — closed PO |
| RCV-POST-N12 | negative | Item `quantity` -1 | 400 | `rule` `validation_error` | OpenAPI receive item `quantity` positive | equivalence class — negative |
| RCV-POST-N13 | negative | Item `"quantity": "ten"` (string) | 400 | `rule` `validation_error` | OpenAPI receive item types | equivalence class — wrong type |
| RCV-POST-E01 | error | `POST /purchase-orders/po-does-not-exist/receive` with valid body | 404 | Body matches `Error`; no `rule` | OpenAPI 404 | unknown id |
| RCV-POST-A01 | assumed — ask | One receive body lists the same `sku` twice (are quantities summed or rejected?) | — | — | QUESTIONS.md §4 (duplicate SKU in one receive) | — |
| RCV-POST-A02 | assumed — ask | Repeat the same delivery quantities already received | — | — | QUESTIONS.md §4 (second identical delivery) | — |
| RCV-POST-A03 | assumed — ask | Item `quantity` 0.5 | — | — | QUESTIONS.md §4 (decimal quantities) | — |

---

## Coverage notes

| Endpoint | positive | negative | error (404) | business rules |
| --- | --- | --- | --- | --- |
| POST /purchase-orders/{poId}/receive | 6 | 13 | 1 | `workflow_gate` (N01, N11), `receive_quantity_limit` (N02, N03); SKU-not-on-PO as `validation_error` (N10) |

**Setup endpoints:** `POST /purchase-orders`, `POST .../submit` (`purchase-orders.md`).

**Writer note:** `tests/api/receipts.spec.ts` already covers RCV-POST-01–05, N01–N09, E01. After approval, implement **RCV-POST-06**, **N10–N13** only.

---

**Status:** **approved** (2026-10-26).
