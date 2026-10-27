# P2P Adversary Attack Plan

Oracle: `docs/API.md` — Business rules (#1–#11).

Each attack uses a **fresh vendor** (unique name) and its **own PO** unless noted.

---

## CHALLENGE.md required (first four)

| # | Attack | Rule | Doc section |
|---|--------|------|-------------|
| C1 | Approve invoice in `received` status without calling `/match` | `three_way_match_gate` | Business rules #4 |
| C2 | Receive quantity greater than ordered on a line | `receive_quantity_limit` | Business rules #2 |
| C3 | Invoice total value above PO `received_value` (full receive then over-invoice line qty) | `overpayment_protection` | Business rules #3 |
| C4 | `POST /purchase-orders` for seed inactive vendor `vnd-002` | `inactive_vendor_gate` | Business rules #1 |

---

## Rule 1: `inactive_vendor_gate` (beyond C4)

| # | Attack | Rule | Doc section |
|---|--------|------|-------------|
| 1a | Create vendor with `active: false`, then create PO for that vendor | `inactive_vendor_gate` | Business rules #1 |

---

## Rule 2: `receive_quantity_limit` (beyond C2)

| # | Attack | Rule | Doc section |
|---|--------|------|-------------|
| 2a | One unit over ordered via second partial delivery (cumulative exceed) | `receive_quantity_limit` | Business rules #2 |
| 2a-edge | Receive on draft PO (workflow should block; targets workflow if receive fails for wrong reason) | `workflow_gate` / receive | Endpoints PO receive + rule #10 |

---

## Rule 3: `overpayment_protection`

| # | Attack | Rule | Doc section |
|---|--------|------|-------------|
| 3a | Invoice one unit more than received on a single line | `overpayment_protection` | Business rules #3 |
| 3b | Invoice one cent over received value (tweak unit_price on invoice) | `overpayment_protection` | Business rules #3 |
| 3c | Two separate invoices on same PO whose combined total exceeds received value | `overpayment_protection` | Business rules #3 |
| 3d | Small percentage over received value (~1% on line total) | `overpayment_protection` | Business rules #3 |

---

## Rule 4: `three_way_match_gate`

(Covered by C1.)

---

## Rule 5: `partial_receipt_flag`

| # | Attack | Rule | Doc section |
|---|--------|------|-------------|
| 5a | Multi-line PO: receive **first line short**, match invoice for received qty — expect `partial_receipt: true` | `partial_receipt_flag` | Business rules #5 |
| 5b | Multi-line PO: receive all but **last line partial**, match — expect `partial_receipt: true` | `partial_receipt_flag` | Business rules #5 |

---

## Rule 6: `duplicate_invoice_detection`

| # | Attack | Rule | Doc section |
|---|--------|------|-------------|
| 6a | Second invoice with same number different **case** (`INV-X` vs `inv-x`) | `duplicate_invoice_detection` | Business rules #6 |
| 6b | Second invoice with same number with **surrounding spaces** | `duplicate_invoice_detection` | Business rules #6 |

---

## Rule 7: `gl_balance`

| # | Attack | Rule | Doc section |
|---|--------|------|-------------|
| 7a | Happy-path approve; verify response `gl_entry.balanced === true` and debits sum equals credits | `gl_balance` | Business rules #7 |

---

## Rule 8: `invoice_line_validation`

| # | Attack | Rule | Doc section |
|---|--------|------|-------------|
| 8a | Invoice line SKU not on PO | `invoice_line_validation` | Business rules #8 |
| 8b | Duplicate SKU twice on same invoice | `invoice_line_validation` | Business rules #8 |
| 8c | Invoice line quantity **zero** | `validation_error` / limits | Endpoints Invoices + PO line limits |
| 8d | Invoice line **negative** quantity | `validation_error` | Endpoints Invoices |
| 8e | PO line **negative** unit_price at create | `validation_error` | Endpoints PO |

---

## Rule 9: `duplicate_approval`

| # | Attack | Rule | Doc section |
|---|--------|------|-------------|
| 9a | Approve same matched invoice twice | `duplicate_approval` | Business rules #9 |

---

## Rule 10: `workflow_gate`

| # | Attack | Rule | Doc section |
|---|--------|------|-------------|
| 10a | Submit PO twice (second submit on already submitted) | `workflow_gate` | Business rules #10 |
| 10b | Invoice against **draft** PO (never submitted) | `workflow_gate` | Business rules #10 |
| 10c | Receive on **draft** PO | `workflow_gate` | Business rules #10 |
| 10d | Match invoice already **approved** (re-match) | `workflow_gate` | Business rules #10 |
| 10e | Out of order: approve before match (same as C1) | `three_way_match_gate` | — |

---

## Rule 11: `vendor_exposure_math`

| # | Attack | Rule | Doc section |
|---|--------|------|-------------|
| 11a | Approve two invoices for same vendor; `GET exposure` equals sum of `total_amount` | `vendor_exposure_math` | Business rules #11 |
| 11b | Rounding: lines at **0.1** and **0.2** unit prices; exposure matches approved totals | `vendor_exposure_math` | Money + rule #11 |

---

## Execution order

Reset once at start, then run C1→C4, then remaining attacks in rule order. Each attack: create vendor → PO → flow → attack HTTP → log to `attacks.jsonl`.
