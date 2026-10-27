import { expect, test } from '@playwright/test';
import {
  LUM_LINE,
  approveInvoice,
  createInvoice,
  createPurchaseOrder,
  expectApiError,
  matchInvoice,
  receiveOnPo,
  submitPurchaseOrder,
} from '../helpers/workflow';
import { assertBalancedGlEntry, createFlowVendor, fetchVendorExposure } from './helpers';

const INVOICE_TOTAL = LUM_LINE.quantity * LUM_LINE.unit_price;

test.describe('over-invoice protection then happy path', () => {
  test.describe.configure({ mode: 'serial' });

  let vendorId: string;
  let poId: string;
  let invoiceId: string;
  const stamp = Date.now();

  test('create vendor', { tag: '@e2e' }, async ({ request }) => {
    vendorId = await createFlowVendor(request, 'over-invoice');
  });

  test('create and submit purchase order', { tag: '@e2e' }, async ({ request }) => {
    const { id, po } = await createPurchaseOrder(request, {
      vendor_id: vendorId,
      line_items: [LUM_LINE],
    });
    poId = id;
    const submitted = await submitPurchaseOrder(request, poId);
    expect(submitted.status).toBe('submitted');
    expect(po.vendor_id).toBe(vendorId);
  });

  test('receive everything', { tag: '@e2e' }, async ({ request }) => {
    const po = await receiveOnPo(request, poId, [{ sku: LUM_LINE.sku, quantity: LUM_LINE.quantity }]);
    expect(po.fully_received).toBe(true);
    expect(po.received_value).toBe(INVOICE_TOTAL);
  });

  test('reject invoice for one unit over received', { tag: '@e2e' }, async ({ request }) => {
    const response = await request.post('/invoices', {
      data: {
        po_id: poId,
        invoice_number: `INV-over-${stamp}`,
        line_items: [
          { sku: LUM_LINE.sku, quantity: LUM_LINE.quantity + 1, unit_price: LUM_LINE.unit_price },
        ],
      },
    });
    await expectApiError(request, response, 400, 'overpayment_protection');
  });

  test('exposure remains zero after rejected invoice', { tag: '@e2e' }, async ({ request }) => {
    const body = await fetchVendorExposure(request, vendorId);
    expect(body.open_ap_liability).toBe(0);
    const approved = body.approved_invoices;
    expect(Array.isArray(approved)).toBe(true);
    expect(approved).toHaveLength(0);
  });

  test('accept correct invoice', { tag: '@e2e' }, async ({ request }) => {
    const { id, invoice } = await createInvoice(request, {
      po_id: poId,
      invoice_number: `INV-ok-${stamp}`,
      line_items: [
        { sku: LUM_LINE.sku, quantity: LUM_LINE.quantity, unit_price: LUM_LINE.unit_price },
      ],
    });
    invoiceId = id;
    expect(invoice.total_amount).toBe(INVOICE_TOTAL);
  });

  test('match correct invoice', { tag: '@e2e' }, async ({ request }) => {
    const result = await matchInvoice(request, invoiceId);
    expect(result.partial_receipt).toBe(false);
    expect(result.matched).toBe(true);
    expect(result.invoice_total).toBe(INVOICE_TOTAL);
  });

  test('approve correct invoice', { tag: '@e2e' }, async ({ request }) => {
    const result = await approveInvoice(request, invoiceId);
    expect(result.status).toBe('approved');
    expect(result.vendor_exposure).toBe(INVOICE_TOTAL);
    assertBalancedGlEntry(result, INVOICE_TOTAL);

    const exposure = await fetchVendorExposure(request, vendorId);
    expect(exposure.open_ap_liability).toBe(INVOICE_TOTAL);
    const approved = exposure.approved_invoices;
    expect(Array.isArray(approved)).toBe(true);
    expect(approved).toContain(invoiceId);
  });
});
