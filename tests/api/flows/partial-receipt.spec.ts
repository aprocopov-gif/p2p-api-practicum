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

const ORDERED_VALUE = 95.1;
const CEM_PARTIAL_QTY = 2;
const RECEIVED_VALUE = LUM_LINE.quantity * LUM_LINE.unit_price + CEM_PARTIAL_QTY * CEM_LINE.unit_price;

test.describe('partial receipt — two-line PO', () => {
  test.describe.configure({ mode: 'serial' });

  let vendorId: string;
  let poId: string;
  let invoiceId: string;
  const stamp = Date.now();

  test('create vendor', { tag: '@e2e' }, async ({ request }) => {
    vendorId = await createFlowVendor(request, 'partial-receipt');
  });

  test('create purchase order with two lines', { tag: '@e2e' }, async ({ request }) => {
    const { id, po } = await createPurchaseOrder(request, {
      vendor_id: vendorId,
      line_items: [LUM_LINE, CEM_LINE],
    });
    poId = id;
    expect(po.ordered_value).toBe(ORDERED_VALUE);
  });

  test('submit purchase order', { tag: '@e2e' }, async ({ request }) => {
    const po = await submitPurchaseOrder(request, poId);
    expect(po.status).toBe('submitted');
  });

  test('receive first line in full and part of the second', { tag: '@e2e' }, async ({ request }) => {
    const po = await receiveOnPo(request, poId, [
      { sku: LUM_LINE.sku, quantity: LUM_LINE.quantity },
      { sku: CEM_LINE.sku, quantity: CEM_PARTIAL_QTY },
    ]);
    expect(po.status).toBe('submitted');
    expect(po.fully_received).toBe(false);
    expect(po.received_value).toBe(RECEIVED_VALUE);
  });

  test('invoice only what was received', { tag: '@e2e' }, async ({ request }) => {
    const { id, invoice } = await createInvoice(request, {
      po_id: poId,
      invoice_number: `INV-partial-${stamp}`,
      line_items: [
        { sku: LUM_LINE.sku, quantity: LUM_LINE.quantity, unit_price: LUM_LINE.unit_price },
        { sku: CEM_LINE.sku, quantity: CEM_PARTIAL_QTY, unit_price: CEM_LINE.unit_price },
      ],
    });
    invoiceId = id;
    expect(invoice.total_amount).toBe(RECEIVED_VALUE);
  });

  test('match — partial receipt flag', { tag: '@e2e' }, async ({ request }) => {
    const result = await matchInvoice(request, invoiceId);
    expect(result.partial_receipt).toBe(true);
    expect(result.received_value).toBe(RECEIVED_VALUE);
    expect(result.ordered_value).toBe(ORDERED_VALUE);
    expect(result.invoice_total).toBe(RECEIVED_VALUE);
  });

  test('approve — exposure equals received value not ordered', { tag: '@e2e' }, async ({ request }) => {
    const result = await approveInvoice(request, invoiceId);
    expect(result.status).toBe('approved');
    expect(result.vendor_exposure).toBe(RECEIVED_VALUE);
    expect(result.vendor_exposure).not.toBe(ORDERED_VALUE);
    assertBalancedGlEntry(result, RECEIVED_VALUE);
  });

  test('GET exposure matches received value', { tag: '@e2e' }, async ({ request }) => {
    const body = await fetchVendorExposure(request, vendorId);
    expect(body.open_ap_liability).toBe(RECEIVED_VALUE);
    const approved = body.approved_invoices;
    expect(Array.isArray(approved)).toBe(true);
    expect(approved).toContain(invoiceId);
  });
});
