# Documentation questions — inspected only

## 1. In both documents — inspected only

- The base URL is `http://localhost:8000`. API.md Basics; OpenAPI `servers`. — inspected only
- There is no authentication. API.md Basics; OpenAPI `info.description`. — inspected only
- Data is kept in memory and returns to the seed data on restart or `POST /admin/reset`. API.md Basics; OpenAPI `info.description`. — inspected only
- Request and response bodies are JSON (`application/json`). API.md Basics; OpenAPI request and response `content` on the paths below. — inspected only
- Money is dollars, rounded to cents. API.md Basics; OpenAPI amount fields on schemas `VendorExposure`, `Sku`, `PoLine`, `PurchaseOrder`, `Invoice`, `MatchResult`, `GlLine`, and `ApproveResult`. — inspected only
- A rejected request returns JSON `detail`. A validation failure or a business rule also returns `rule`. A 404 has no `rule`. API.md Errors; OpenAPI `info.description` and schema `Error`. — inspected only
- 200 means the action worked, 201 means a vendor, purchase order, or invoice was created, and 400 means the body is invalid or a business rule rejected it. API.md Errors; OpenAPI responses on `/vendors`, `/purchase-orders`, `/invoices`, and the submit, receive, match, and approve paths. — inspected only
- On a 400, `rule` is `validation_error` or one of these names: `inactive_vendor_gate`, `receive_quantity_limit`, `overpayment_protection`, `three_way_match_gate`, `partial_receipt_flag`, `duplicate_invoice_detection`, `gl_balance`, `invoice_line_validation`, `duplicate_approval`, `workflow_gate`, `vendor_exposure_math`. API.md Errors and Business rules; OpenAPI schema `Error`. — inspected only
- Purchase-order status is `draft`, `submitted`, or `closed`. Invoice status is `received`, `matched`, or `approved`. API.md The purchase-to-pay flow; OpenAPI schemas `PurchaseOrder` and `Invoice`. — inspected only
- `GET /health` returns `{"status": "ok"}`. API.md System; OpenAPI path `/health`, schema `Health`. — inspected only
- `POST /admin/reset` deletes purchase orders, invoices, and created vendors, restores the two seed vendors and the SKU catalog, and returns `{"status": "reset"}`. API.md System and Seed data; OpenAPI path `/admin/reset`, schema `Reset`. — inspected only
- `GET /vendors` lists vendors with `id`, `name`, and `active`. API.md Vendors and Seed data; OpenAPI path `/vendors`, schema `Vendor`. — inspected only
- `POST /vendors` requires a non-empty `name`, defaults `active` to `true`, and returns 201. API.md Vendors; OpenAPI path `/vendors`, schema `VendorCreate`. — inspected only
- `GET /vendors/{vendorId}/exposure` returns `vendor_id`, `open_ap_liability`, and `approved_invoices`, and returns 404 for an unknown vendor. API.md Vendors; OpenAPI path `/vendors/{vendorId}/exposure`, schema `VendorExposure`. — inspected only
- `open_ap_liability` is the sum of `total_amount` over that vendor's approved invoices (`vendor_exposure_math`). API.md Business rules; OpenAPI path `/vendors/{vendorId}/exposure`. — inspected only
- `GET /skus` lists catalog SKUs with `sku`, `description`, and `unit_price`. API.md Catalog; OpenAPI path `/skus`, schema `Sku`. — inspected only
- `POST /purchase-orders` creates a draft and returns 201. The vendor must exist (404) and be active (`inactive_vendor_gate`). Each SKU may appear once. API.md Purchase orders and Business rules; OpenAPI path `/purchase-orders`. — inspected only
- A purchase-order line needs `sku`, `quantity` greater than 0 and at most 10,000, and `unit_price` from 0 to 100,000. `description` is optional and comes back as `""` when omitted. API.md Purchase orders; OpenAPI schema `PoLineCreate`. — inspected only
- Those quantity limits also apply to delivery items and invoice lines, and those price limits also apply to invoice lines. API.md Purchase orders; OpenAPI schemas `ReceiveRequest` and `InvoiceLine`. — inspected only
- A purchase order includes each line's `received_quantity`, plus `ordered_value`, `received_value`, and `fully_received`. API.md Purchase orders; OpenAPI schemas `PurchaseOrder` and `PoLine`. — inspected only
- `GET /purchase-orders/{poId}` returns the purchase order in that shape. API.md Purchase orders; OpenAPI path `/purchase-orders/{poId}`. — inspected only
- `POST /purchase-orders/{poId}/submit` submits only a draft (`workflow_gate`). API.md Purchase orders and Business rules; OpenAPI path `/purchase-orders/{poId}/submit`. — inspected only
- `POST /purchase-orders/{poId}/receive` accepts goods only on a submitted purchase order (`workflow_gate`). Received quantity on a line cannot exceed ordered quantity (`receive_quantity_limit`). The purchase order becomes `closed` when every line is fully received. The body is `items` of `sku` and `quantity`. API.md Purchase orders and Business rules; OpenAPI path `/purchase-orders/{poId}/receive`, schema `ReceiveRequest`. — inspected only
- `POST /invoices` records an invoice against a submitted or closed purchase order (`workflow_gate`). The same invoice number cannot be used twice for one vendor; comparison ignores case and surrounding spaces (`duplicate_invoice_detection`). Every line SKU must be on the purchase order, once (`invoice_line_validation`). Invoiced quantity per line and invoiced total value cannot exceed what was received (`overpayment_protection`). API.md Invoices and Business rules; OpenAPI path `/invoices`. — inspected only
- `partial_receipt` is null until the invoice is matched, then `true` when any purchase-order line is not fully received (`partial_receipt_flag`). API.md Invoices and Business rules; OpenAPI schema `Invoice` and path `/invoices/{invoiceId}/match`. — inspected only
- `GET /invoices/{invoiceId}` returns the invoice and its current status. API.md Invoices; OpenAPI path `/invoices/{invoiceId}`, schema `Invoice`. — inspected only
- `POST /invoices/{invoiceId}/match` compares the purchase order, the goods received, and the invoice, and an approved invoice cannot be matched again (`workflow_gate`). API.md Invoices and Business rules; OpenAPI path `/invoices/{invoiceId}/match`. — inspected only
- The match result includes `invoice_id`, `po_id`, `status`, `matched`, `partial_receipt`, `ordered_value`, `received_value`, `invoice_total`, and `message`. API.md Invoices; OpenAPI schema `MatchResult`. — inspected only
- `POST /invoices/{invoiceId}/approve` approves a matched invoice once (`three_way_match_gate`, `duplicate_approval`), posts a balanced ledger entry (`gl_balance`) that debits `5000 Materials Expense` and credits `2000 Accounts Payable`, and returns `vendor_exposure`. API.md Invoices and Business rules; OpenAPI path `/invoices/{invoiceId}/approve`, schemas `ApproveResult`, `GlEntry`, and `GlLine`. — inspected only

## 2. In one document only — inspected only

- API.md, Basics: the port changes with `PORT=8001 npm start`. — inspected only
- API.md, Basics: send `Content-Type: application/json` with every body. — inspected only
- API.md, Basics: the server creates ids prefixed `vnd-`, `po-`, and `inv-`, and seed vendors keep fixed ids. — inspected only
- API.md, Errors: 404 is also the response when the route does not exist. — inspected only
- API.md, The purchase-to-pay flow: the business sequence is active vendor, draft purchase order, submit, receive, invoice, match, approve, then vendor exposure. — inspected only
- API.md, The purchase-to-pay flow: deliveries may be partial, and status changes only move forward (`draft` → `submitted` → `closed`, and `received` → `matched` → `approved`). — inspected only
- API.md, Seed data: the seed vendors are `vnd-001` Maple Ridge Supply (active) and `vnd-002` Old Quarry Materials (inactive). — inspected only
- API.md, Seed data: the catalog has five SKUs — `LUM-2X4-8` at 4.75, `PLY-12-4X8` at 22.40, `CEM-30KG` at 11.90, `REB-10MM-6` at 18.25, and `SCR-DECK-1LB` at 9.99. — inspected only
- API.md, Seed data: catalog prices are a reference, and a purchase order stores its own `unit_price` on each line. — inspected only
- API.md, Business rules: `receive_quantity_limit` applies across all deliveries of a line, and overpayment protection has no tolerance. — inspected only
- API.md, Purchase orders: every SKU on a delivery must already be on the purchase order. — inspected only
- API.md, Invoices: a newly created invoice is returned with `status` `received` and `matched` false. — inspected only
- API.md, System: call `POST /admin/reset` before every test run. — inspected only
- API.md, A full session with curl: `npm run smoke` runs the happy path. — inspected only
- OpenAPI, `info`: the document is OpenAPI 3.1.0, titled P2P Practice API, version 1.0.0. — inspected only
- OpenAPI, schema `Error`: `detail` is the only required field, and `rule` is an enum. — inspected only
- OpenAPI, schema `PurchaseOrderCreate`: `vendor_id` has `minLength` 1 and `line_items` has `minItems` 1. — inspected only
- OpenAPI, schema `PoLineCreate`: `sku` has `minLength` 1. — inspected only
- OpenAPI, schema `ReceiveRequest`: `items` has `minItems` 1 and each item `sku` has `minLength` 1. — inspected only
- OpenAPI, schema `InvoiceCreate`: `po_id` and `invoice_number` have `minLength` 1, and `line_items` has `minItems` 1. — inspected only
- OpenAPI, schema `Invoice`: the invoice object requires `id`, `po_id`, `vendor_id`, `invoice_number`, `line_items`, and `total_amount` along with `status`, `matched`, and `partial_receipt`. — inspected only
- OpenAPI, paths `/vendors` and `/skus`: those lists are JSON arrays. — inspected only
- OpenAPI, path `/vendors`: the 201 body is a `Vendor` with required `id`, `name`, and `active`. — inspected only
- OpenAPI, schema `MatchResult`: the documented 200 body allows only `status` `matched` and `matched` true. — inspected only
- OpenAPI, schemas `PoLineCreate`, `ReceiveRequest`, and `InvoiceLine`: `quantity` and `unit_price` are JSON numbers. — inspected only
- OpenAPI, paths `POST /vendors`, `POST /purchase-orders`, `POST /purchase-orders/{poId}/receive`, and `POST /invoices`: `requestBody` is not marked `required`. — inspected only

## 3. Conflicts — inspected only

None found — inspected only

## 4. Not documented — inspected only

- May a quantity be a decimal, such as 0.5 or 1.25, on a purchase order, a delivery, and an invoice? assumed until answered — inspected only
- When a `unit_price` or a computed total has more than two decimal places, is that value rejected or rounded, and what rounding mode is used? assumed until answered — inspected only
- What maximum length applies to a vendor name, an invoice number, a SKU, and a line description, and is a name made only of spaces rejected? assumed until answered — inspected only
- What happens on a second identical request: the same `POST /vendors` name, the same `POST /purchase-orders` body, a second delivery of quantities already received, and a second `POST /invoices/{invoiceId}/match` while the invoice is matched and not yet approved? assumed until answered — inspected only
- Must a purchase-order SKU exist on `GET /skus`, and is SKU comparison case-sensitive? assumed until answered — inspected only
- May an invoice line use a different `unit_price` from that SKU's price on the purchase order? assumed until answered — inspected only
- When a delivery names a SKU that is not on the purchase order, which status code and which `rule` are returned? assumed until answered — inspected only
- When a purchase order repeats a SKU, which status code and which `rule` are returned? assumed until answered — inspected only
- When the 3-way match does not pass, which status code and which body are returned? assumed until answered — inspected only
- Which amount is posted on the ledger lines, and may the entry contain more than one debit or one credit? assumed until answered — inspected only
- What does `GET /vendors/{vendorId}/exposure` return for a vendor with no approved invoices? assumed until answered — inspected only
- When would `partial_receipt_flag`, `gl_balance`, or `vendor_exposure_math` appear in `rule` on a 400? assumed until answered — inspected only
- Are unknown JSON properties or unknown query parameters rejected or ignored, and what is returned when a required body is sent without `Content-Type: application/json`? assumed until answered — inspected only
- What is the exact id pattern after the `vnd-`, `po-`, and `inv-` prefix? assumed until answered — inspected only
- If one receive body repeats a SKU, are those quantities added together or rejected? assumed until answered — inspected only
- Does invoice-number comparison ignore only surrounding spaces, or also spaces inside the number? assumed until answered — inspected only
