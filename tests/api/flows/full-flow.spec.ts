import { expect, test } from '@playwright/test';
import {
  CEM_LINE,
  LUM_LINE,
  approveInvoice,
  createInvoice,
  createPurchaseOrder,
  matchInvoice,
  receiveOnPo,
  submitPurchaseOrder,
} from '../helpers/workflow';
import { assertBalancedGlEntry, createFlowVendor, fetchVendorExposure } from './helpers';

const INVOICE_TOTAL = 95.1;

test.describe('full P2P flow — two-line PO to exposure', () => {
  test.describe.configure({ mode: 'serial' });

  let vendorId: string;
  let poId: string;
  let invoiceId: string;
  const stamp = Date.now();

  test('create vendor', { tag: '@e2e' }, async ({ request }) => {
    vendorId = await createFlowVendor(request, 'full-flow');
  });

  test('create purchase order with two lines', { tag: '@e2e' }, async ({ request }) => {
    const { id, po } = await createPurchaseOrder(request, {
      vendor_id: vendorId,
      line_items: [LUM_LINE, CEM_LINE],
    });
    poId = id;
    expect(po.status).toBe('draft');
    expect(po.vendor_id).toBe(vendorId);
    expect(po.ordered_value).toBe(INVOICE_TOTAL);
  });

  test('submit purchase order', { tag: '@e2e' }, async ({ request }) => {
    const po = await submitPurchaseOrder(request, poId);
    expect(po.status).toBe('submitted');
  });

  test('receive all lines', { tag: '@e2e' }, async ({ request }) => {
    const po = await receiveOnPo(request, poId, [
      { sku: LUM_LINE.sku, quantity: LUM_LINE.quantity },
      { sku: CEM_LINE.sku, quantity: CEM_LINE.quantity },
    ]);
    expect(po.fully_received).toBe(true);
    expect(po.status).toBe('closed');
    expect(po.received_value).toBe(INVOICE_TOTAL);
  });

  test('invoice for everything received', { tag: '@e2e' }, async ({ request }) => {
    const { id, invoice } = await createInvoice(request, {
      po_id: poId,
      invoice_number: `INV-full-${stamp}`,
      line_items: [
        { sku: LUM_LINE.sku, quantity: LUM_LINE.quantity, unit_price: LUM_LINE.unit_price },
        { sku: CEM_LINE.sku, quantity: CEM_LINE.quantity, unit_price: CEM_LINE.unit_price },
      ],
    });
    invoiceId = id;
    expect(invoice.total_amount).toBe(INVOICE_TOTAL);
    expect(invoice.status).toBe('received');
    expect(invoice.matched).toBe(false);
  });

  test('match — full receipt', { tag: '@e2e' }, async ({ request }) => {
    const result = await matchInvoice(request, invoiceId);
    expect(result.partial_receipt).toBe(false);
    expect(result.matched).toBe(true);
    expect(result.ordered_value).toBe(INVOICE_TOTAL);
    expect(result.received_value).toBe(INVOICE_TOTAL);
    expect(result.invoice_total).toBe(INVOICE_TOTAL);
  });

  test('approve — balanced GL and vendor exposure on result', { tag: '@e2e' }, async ({ request }) => {
    const result = await approveInvoice(request, invoiceId);
    expect(result.status).toBe('approved');
    expect(result.invoice_id).toBe(invoiceId);
    expect(result.vendor_exposure).toBe(INVOICE_TOTAL);
    assertBalancedGlEntry(result, INVOICE_TOTAL);
  });

  test('GET exposure equals invoice total and lists invoice', { tag: '@e2e' }, async ({ request }) => {
    const body = await fetchVendorExposure(request, vendorId);
    expect(body.vendor_id).toBe(vendorId);
    expect(body.open_ap_liability).toBe(INVOICE_TOTAL);
    const approved = body.approved_invoices;
    expect(Array.isArray(approved)).toBe(true);
    expect(approved).toContain(invoiceId);
  });
});
