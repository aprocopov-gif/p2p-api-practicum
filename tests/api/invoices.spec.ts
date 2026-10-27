import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { expectSchema } from './helpers/schema';
import {
  CEM_LINE,
  LUM_LINE,
  approveInvoice,
  createInvoice,
  createPurchaseOrder,
  draftSubmitReceiveSingleLine,
  expectApiError,
  isRecord,
  matchInvoice,
  receiveOnPo,
  submitPurchaseOrder,
} from './helpers/workflow';

async function createActiveVendor(request: APIRequestContext): Promise<string> {
  const response = await request.post('/vendors', {
    data: { name: `Invoice QA vendor ${Date.now()}` },
  });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Vendor');
  if (!isRecord(body) || typeof body.id !== 'string') {
    throw new Error('POST /vendors did not return id');
  }
  return body.id;
}

function invoiceLine(
  line: { sku: string; quantity: number; unit_price: number } = LUM_LINE,
  overrides: Partial<{ sku: string; quantity: number; unit_price: number }> = {},
): { sku: string; quantity: number; unit_price: number } {
  return { sku: line.sku, quantity: line.quantity, unit_price: line.unit_price, ...overrides };
}

test('INV-POST-01 POST /invoices creates received invoice after full receive', { tag: '@api' }, async ({
  request,
}) => {
  const { poId } = await draftSubmitReceiveSingleLine(request);
  const invoiceNumber = `INV-${Date.now()}`;
  const response = await request.post('/invoices', {
    data: {
      po_id: poId,
      invoice_number: invoiceNumber,
      line_items: [invoiceLine()],
    },
  });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Invoice');
  if (!isRecord(body)) {
    throw new Error('201 body was not an object');
  }
  expect(body.status).toBe('received');
  expect(body.matched).toBe(false);
  expect(body.partial_receipt).toBeNull();
  expect(body.total_amount).toBe(47.5);
  expect(body.po_id).toBe(poId);
  expect(body.vendor_id).toBe('vnd-001');
});

test('INV-POST-02 POST /invoices multi-line invoice totals 95.1', { tag: '@api' }, async ({ request }) => {
  const { id: poId } = await createPurchaseOrder(request, {
    vendor_id: 'vnd-001',
    line_items: [LUM_LINE, CEM_LINE],
  });
  await submitPurchaseOrder(request, poId);
  await receiveOnPo(request, poId, [
    { sku: LUM_LINE.sku, quantity: LUM_LINE.quantity },
    { sku: CEM_LINE.sku, quantity: CEM_LINE.quantity },
  ]);
  const response = await request.post('/invoices', {
    data: {
      po_id: poId,
      invoice_number: `INV-${Date.now()}`,
      line_items: [invoiceLine(LUM_LINE), invoiceLine(CEM_LINE)],
    },
  });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Invoice');
  if (!isRecord(body)) {
    throw new Error('201 body was not an object');
  }
  expect(body.total_amount).toBe(95.1);
  expect(body.status).toBe('received');
});

test('INV-POST-03 POST /invoices against closed PO returns 201', { tag: '@api' }, async ({ request }) => {
  const { id: poId } = await createPurchaseOrder(request, {
    vendor_id: 'vnd-001',
    line_items: [LUM_LINE],
  });
  await submitPurchaseOrder(request, poId);
  const po = await receiveOnPo(request, poId, [{ sku: LUM_LINE.sku, quantity: LUM_LINE.quantity }]);
  expect(po.status).toBe('closed');

  const response = await request.post('/invoices', {
    data: {
      po_id: poId,
      invoice_number: `INV-${Date.now()}`,
      line_items: [invoiceLine()],
    },
  });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Invoice');
});

test('INV-POST-04 POST /invoices partial receipt qty invoices received amount', { tag: '@api' }, async ({
  request,
}) => {
  const { poId } = await draftSubmitReceiveSingleLine(request, LUM_LINE, 4);
  const response = await request.post('/invoices', {
    data: {
      po_id: poId,
      invoice_number: `INV-${Date.now()}`,
      line_items: [invoiceLine(LUM_LINE, { quantity: 4 })],
    },
  });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Invoice');
  if (!isRecord(body)) {
    throw new Error('201 body was not an object');
  }
  expect(body.total_amount).toBe(19.0);
});

test('INV-POST-05 POST /invoices same invoice_number different vendors both 201', { tag: '@api' }, async ({
  request,
}) => {
  const { poId: poIdVnd001 } = await draftSubmitReceiveSingleLine(request);
  const otherVendorId = await createActiveVendor(request);
  const { poId: poIdOther } = await draftSubmitReceiveSingleLine(request, LUM_LINE, LUM_LINE.quantity, otherVendorId);
  const sharedNumber = `INV-shared-${Date.now()}`;
  const first = await request.post('/invoices', {
    data: {
      po_id: poIdVnd001,
      invoice_number: sharedNumber,
      line_items: [invoiceLine()],
    },
  });
  expect(first.status()).toBe(201);
  const firstBody: unknown = await first.json();
  await expectSchema(request, firstBody, 'Invoice');
  const second = await request.post('/invoices', {
    data: {
      po_id: poIdOther,
      invoice_number: sharedNumber,
      line_items: [invoiceLine()],
    },
  });
  expect(second.status()).toBe(201);
  const secondBody: unknown = await second.json();
  await expectSchema(request, secondBody, 'Invoice');
});

test('INV-POST-N01 POST /invoices rejects empty body', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/invoices', { data: {} });
  await expectApiError(request, response, 400, 'validation_error');
});

test('INV-POST-N02 POST /invoices unknown po_id returns 404', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/invoices', {
    data: {
      po_id: 'po-does-not-exist',
      invoice_number: `INV-${Date.now()}`,
      line_items: [invoiceLine()],
    },
  });
  await expectApiError(request, response, 404, null);
});

test('INV-POST-N03 POST /invoices against draft PO returns workflow_gate', { tag: '@api' }, async ({
  request,
}) => {
  const { id: poId } = await createPurchaseOrder(request, {
    vendor_id: 'vnd-001',
    line_items: [LUM_LINE],
  });
  const response = await request.post('/invoices', {
    data: {
      po_id: poId,
      invoice_number: `INV-${Date.now()}`,
      line_items: [invoiceLine()],
    },
  });
  await expectApiError(request, response, 400, 'workflow_gate');
});

test('INV-POST-N04 POST /invoices duplicate invoice number same vendor', { tag: '@api' }, async ({
  request,
}) => {
  const { poId: poId1 } = await draftSubmitReceiveSingleLine(request);
  const { poId: poId2 } = await draftSubmitReceiveSingleLine(request);
  const invoiceNumber = `INV-dup-${Date.now()}`;
  await createInvoice(request, {
    po_id: poId1,
    invoice_number: invoiceNumber,
    line_items: [invoiceLine()],
  });
  const second = await request.post('/invoices', {
    data: {
      po_id: poId2,
      invoice_number: invoiceNumber,
      line_items: [invoiceLine()],
    },
  });
  await expectApiError(request, second, 400, 'duplicate_invoice_detection');
});

test('INV-POST-N05 POST /invoices case-insensitive duplicate invoice number', { tag: '@api' }, async ({
  request,
}) => {
  const { poId: poId1 } = await draftSubmitReceiveSingleLine(request);
  const { poId: poId2 } = await draftSubmitReceiveSingleLine(request);
  await createInvoice(request, {
    po_id: poId1,
    invoice_number: 'INV-7',
    line_items: [invoiceLine()],
  });
  const second = await request.post('/invoices', {
    data: {
      po_id: poId2,
      invoice_number: 'inv-7',
      line_items: [invoiceLine()],
    },
  });
  const secondBody: unknown = await second.json();
  if (second.status() === 400) {
    await expectSchema(request, secondBody, 'Error');
    if (isRecord(secondBody)) {
      expect(secondBody.rule).toBe('duplicate_invoice_detection');
    }
  } else {
    await expectSchema(request, secondBody, 'Invoice');
  }
  expect(second.status()).toBe(400);
});

test('INV-POST-N06 POST /invoices SKU not on PO returns invoice_line_validation', { tag: '@api' }, async ({
  request,
}) => {
  const { poId } = await draftSubmitReceiveSingleLine(request);
  const response = await request.post('/invoices', {
    data: {
      po_id: poId,
      invoice_number: `INV-${Date.now()}`,
      line_items: [{ sku: 'PLY-12-4X8', quantity: 1, unit_price: 4.75 }],
    },
  });
  await expectApiError(request, response, 400, 'invoice_line_validation');
});

test('INV-POST-N07 POST /invoices duplicate SKU on one invoice', { tag: '@api' }, async ({ request }) => {
  const { poId } = await draftSubmitReceiveSingleLine(request);
  const response = await request.post('/invoices', {
    data: {
      po_id: poId,
      invoice_number: `INV-${Date.now()}`,
      line_items: [invoiceLine(), invoiceLine()],
    },
  });
  await expectApiError(request, response, 400, 'invoice_line_validation');
});

test('INV-POST-N08 POST /invoices quantity over received returns overpayment_protection', { tag: '@api' }, async ({
  request,
}) => {
  const { poId } = await draftSubmitReceiveSingleLine(request);
  const response = await request.post('/invoices', {
    data: {
      po_id: poId,
      invoice_number: `INV-${Date.now()}`,
      line_items: [invoiceLine(LUM_LINE, { quantity: 11 })],
    },
  });
  await expectApiError(request, response, 400, 'overpayment_protection');
});

test('INV-POST-N09 POST /invoices line value over received value', { tag: '@api' }, async ({ request }) => {
  const { poId } = await draftSubmitReceiveSingleLine(request);
  const response = await request.post('/invoices', {
    data: {
      po_id: poId,
      invoice_number: `INV-${Date.now()}`,
      line_items: [invoiceLine(LUM_LINE, { unit_price: 5.0 })],
    },
  });
  await expectApiError(request, response, 400, 'overpayment_protection');
});

test('INV-POST-BUG-1 POST /invoices line total over received when unit_price raised', { tag: '@api' }, async ({
  request,
}) => {
  test.fail(true, 'BUG-1: invoice total over received value via unit_price accepted with 201');
  const lowPriceLine = { sku: 'LUM-2X4-8', quantity: 2, unit_price: 1.0 } as const;
  const { id: poId } = await createPurchaseOrder(request, {
    vendor_id: 'vnd-001',
    line_items: [lowPriceLine],
  });
  await submitPurchaseOrder(request, poId);
  await receiveOnPo(request, poId, [{ sku: lowPriceLine.sku, quantity: 2 }]);
  const response = await request.post('/invoices', {
    data: {
      po_id: poId,
      invoice_number: `INV-BUG1-${Date.now()}`,
      line_items: [{ sku: lowPriceLine.sku, quantity: 2, unit_price: 1.01 }],
    },
  });
  await expectApiError(request, response, 400, 'overpayment_protection');
});

test('INV-POST-N10 POST /invoices empty invoice_number returns validation_error', { tag: '@api' }, async ({
  request,
}) => {
  const { poId } = await draftSubmitReceiveSingleLine(request);
  const response = await request.post('/invoices', {
    data: {
      po_id: poId,
      invoice_number: '',
      line_items: [invoiceLine()],
    },
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('INV-POST-N11 POST /invoices line quantity zero returns validation_error', { tag: '@api' }, async ({
  request,
}) => {
  const { poId } = await draftSubmitReceiveSingleLine(request);
  const response = await request.post('/invoices', {
    data: {
      po_id: poId,
      invoice_number: `INV-${Date.now()}`,
      line_items: [invoiceLine(LUM_LINE, { quantity: 0 })],
    },
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('INV-POST-N12 POST /invoices surrounding spaces duplicate invoice number', { tag: '@api' }, async ({
  request,
}) => {
  const { poId: poId1 } = await draftSubmitReceiveSingleLine(request);
  const { poId: poId2 } = await draftSubmitReceiveSingleLine(request);
  const invoiceNumber = `INV-7-${Date.now()}`;
  await createInvoice(request, {
    po_id: poId1,
    invoice_number: invoiceNumber,
    line_items: [invoiceLine()],
  });
  const second = await request.post('/invoices', {
    data: {
      po_id: poId2,
      invoice_number: ` ${invoiceNumber} `,
      line_items: [invoiceLine()],
    },
  });
  await expectApiError(request, second, 400, 'duplicate_invoice_detection');
});

test('INV-POST-N13 POST /invoices cumulative qty on same PO overpayment_protection', { tag: '@api' }, async ({
  request,
}) => {
  const { poId } = await draftSubmitReceiveSingleLine(request);
  await createInvoice(request, {
    po_id: poId,
    invoice_number: `INV-first-${Date.now()}`,
    line_items: [invoiceLine(LUM_LINE, { quantity: 6 })],
  });
  const second = await request.post('/invoices', {
    data: {
      po_id: poId,
      invoice_number: `INV-second-${Date.now()}`,
      line_items: [invoiceLine(LUM_LINE, { quantity: 5 })],
    },
  });
  await expectApiError(request, second, 400, 'overpayment_protection');
});

test('INV-POST-N14 POST /invoices empty line_items returns validation_error', { tag: '@api' }, async ({
  request,
}) => {
  const { poId } = await draftSubmitReceiveSingleLine(request);
  const response = await request.post('/invoices', {
    data: {
      po_id: poId,
      invoice_number: `INV-${Date.now()}`,
      line_items: [],
    },
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('INV-POST-N15 POST /invoices missing po_id returns validation_error', { tag: '@api' }, async ({
  request,
}) => {
  const response = await request.post('/invoices', {
    data: {
      invoice_number: `INV-${Date.now()}`,
      line_items: [invoiceLine()],
    },
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('INV-POST-N16 POST /invoices empty po_id returns validation_error', { tag: '@api' }, async ({
  request,
}) => {
  const response = await request.post('/invoices', {
    data: {
      po_id: '',
      invoice_number: `INV-${Date.now()}`,
      line_items: [invoiceLine()],
    },
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('INV-POST-N17 POST /invoices line quantity 10001 returns validation_error', { tag: '@api' }, async ({
  request,
}) => {
  const { poId } = await draftSubmitReceiveSingleLine(request);
  const response = await request.post('/invoices', {
    data: {
      po_id: poId,
      invoice_number: `INV-${Date.now()}`,
      line_items: [invoiceLine(LUM_LINE, { quantity: 10001 })],
    },
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('INV-POST-N18 POST /invoices line quantity -1 returns validation_error', { tag: '@api' }, async ({
  request,
}) => {
  const { poId } = await draftSubmitReceiveSingleLine(request);
  const response = await request.post('/invoices', {
    data: {
      po_id: poId,
      invoice_number: `INV-${Date.now()}`,
      line_items: [invoiceLine(LUM_LINE, { quantity: -1 })],
    },
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('INV-POST-N19 POST /invoices negative unit_price returns validation_error', { tag: '@api' }, async ({
  request,
}) => {
  const { poId } = await draftSubmitReceiveSingleLine(request);
  const response = await request.post('/invoices', {
    data: {
      po_id: poId,
      invoice_number: `INV-${Date.now()}`,
      line_items: [invoiceLine(LUM_LINE, { unit_price: -0.01 })],
    },
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('INV-POST-N20 POST /invoices unit_price 100001 returns validation_error', { tag: '@api' }, async ({
  request,
}) => {
  const { poId } = await draftSubmitReceiveSingleLine(request);
  const response = await request.post('/invoices', {
    data: {
      po_id: poId,
      invoice_number: `INV-${Date.now()}`,
      line_items: [invoiceLine(LUM_LINE, { unit_price: 100001 })],
    },
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('INV-POST-N21 POST /invoices line missing sku returns validation_error', { tag: '@api' }, async ({
  request,
}) => {
  const { poId } = await draftSubmitReceiveSingleLine(request);
  const response = await request.post('/invoices', {
    data: {
      po_id: poId,
      invoice_number: `INV-${Date.now()}`,
      line_items: [{ quantity: 10, unit_price: 4.75 }],
    },
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('INV-POST-N22 POST /invoices empty sku returns validation_error', { tag: '@api' }, async ({ request }) => {
  const { poId } = await draftSubmitReceiveSingleLine(request);
  const response = await request.post('/invoices', {
    data: {
      po_id: poId,
      invoice_number: `INV-${Date.now()}`,
      line_items: [{ sku: '', quantity: 10, unit_price: 4.75 }],
    },
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('INV-POST-N23 POST /invoices string quantity returns validation_error', { tag: '@api' }, async ({
  request,
}) => {
  const { poId } = await draftSubmitReceiveSingleLine(request);
  const response = await request.post('/invoices', {
    data: {
      po_id: poId,
      invoice_number: `INV-${Date.now()}`,
      line_items: [{ sku: LUM_LINE.sku, quantity: 'ten', unit_price: 4.75 }],
    },
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('INV-POST-E01 POST unknown invoices subpath returns 404', { tag: '@api' }, async ({ request }) => {
  const { poId } = await draftSubmitReceiveSingleLine(request);
  const response = await request.post('/invoices/extra', {
    data: {
      po_id: poId,
      invoice_number: `INV-${Date.now()}`,
      line_items: [invoiceLine()],
    },
  });
  expect(response.status()).toBe(404);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Error');
  if (!isRecord(body)) {
    throw new Error('404 body was not an object');
  }
  expect(typeof body.detail).toBe('string');
  expect(body.rule).toBeUndefined();
});

test('INV-GET-01 GET /invoices/{invoiceId} after create', { tag: '@api' }, async ({ request }) => {
  const { poId } = await draftSubmitReceiveSingleLine(request);
  const { id: invoiceId, invoice: created } = await createInvoice(request, {
    po_id: poId,
    invoice_number: `INV-${Date.now()}`,
    line_items: [invoiceLine()],
  });
  const response = await request.get(`/invoices/${invoiceId}`);
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Invoice');
  if (!isRecord(body)) {
    throw new Error('GET body was not an object');
  }
  expect(body.id).toBe(invoiceId);
  expect(body.status).toBe('received');
  expect(body.matched).toBe(false);
  expect(body.partial_receipt).toBeNull();
  expect(body.id).toBe(created.id);
});

test('INV-GET-02 GET /invoices/{invoiceId} matches Invoice schema', { tag: '@api' }, async ({ request }) => {
  const { poId } = await draftSubmitReceiveSingleLine(request);
  const { id: invoiceId } = await createInvoice(request, {
    po_id: poId,
    invoice_number: `INV-${Date.now()}`,
    line_items: [invoiceLine()],
  });
  const response = await request.get(`/invoices/${invoiceId}`);
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Invoice');
});

test('INV-GET-E01 GET unknown invoice id returns 404', { tag: '@api' }, async ({ request }) => {
  const response = await request.get('/invoices/inv-does-not-exist');
  await expectApiError(request, response, 404, null);
});

test('INV-MATCH-01 POST /invoices/{invoiceId}/match full match', { tag: '@api' }, async ({ request }) => {
  const { poId } = await draftSubmitReceiveSingleLine(request);
  const { id: invoiceId } = await createInvoice(request, {
    po_id: poId,
    invoice_number: `INV-${Date.now()}`,
    line_items: [invoiceLine()],
  });
  const response = await request.post(`/invoices/${invoiceId}/match`);
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'MatchResult');
  if (!isRecord(body)) {
    throw new Error('match body was not an object');
  }
  expect(body.status).toBe('matched');
  expect(body.matched).toBe(true);
  expect(body.partial_receipt).toBe(false);
  expect(body.ordered_value).toBe(47.5);
  expect(body.received_value).toBe(47.5);
  expect(body.invoice_total).toBe(47.5);
  expect(typeof body.message).toBe('string');
  expect((body.message as string).length).toBeGreaterThan(0);
});

test('INV-MATCH-02 POST /invoices/{invoiceId}/match partial receipt flag', { tag: '@api' }, async ({
  request,
}) => {
  const { poId } = await draftSubmitReceiveSingleLine(request, LUM_LINE, 4);
  const { id: invoiceId } = await createInvoice(request, {
    po_id: poId,
    invoice_number: `INV-${Date.now()}`,
    line_items: [invoiceLine(LUM_LINE, { quantity: 4 })],
  });
  const result = await matchInvoice(request, invoiceId);
  expect(result.partial_receipt).toBe(true);
});

test('INV-MATCH-03 GET invoice after match shows matched state', { tag: '@api' }, async ({ request }) => {
  const { poId } = await draftSubmitReceiveSingleLine(request);
  const { id: invoiceId } = await createInvoice(request, {
    po_id: poId,
    invoice_number: `INV-${Date.now()}`,
    line_items: [invoiceLine()],
  });
  await matchInvoice(request, invoiceId);
  const response = await request.get(`/invoices/${invoiceId}`);
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Invoice');
  if (!isRecord(body)) {
    throw new Error('GET body was not an object');
  }
  expect(body.status).toBe('matched');
  expect(body.matched).toBe(true);
  expect(typeof body.partial_receipt).toBe('boolean');
});

test('INV-MATCH-04 POST /invoices/{invoiceId}/match multi-line totals 95.1', { tag: '@api' }, async ({
  request,
}) => {
  const { id: poId } = await createPurchaseOrder(request, {
    vendor_id: 'vnd-001',
    line_items: [LUM_LINE, CEM_LINE],
  });
  await submitPurchaseOrder(request, poId);
  await receiveOnPo(request, poId, [
    { sku: LUM_LINE.sku, quantity: LUM_LINE.quantity },
    { sku: CEM_LINE.sku, quantity: CEM_LINE.quantity },
  ]);
  const { id: invoiceId } = await createInvoice(request, {
    po_id: poId,
    invoice_number: `INV-${Date.now()}`,
    line_items: [invoiceLine(LUM_LINE), invoiceLine(CEM_LINE)],
  });
  const response = await request.post(`/invoices/${invoiceId}/match`);
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'MatchResult');
  if (!isRecord(body)) {
    throw new Error('match body was not an object');
  }
  expect(body.partial_receipt).toBe(false);
  expect(body.ordered_value).toBe(95.1);
  expect(body.received_value).toBe(95.1);
  expect(body.invoice_total).toBe(95.1);
});

test('INV-MATCH-N01 POST match on approved invoice returns workflow_gate', { tag: '@api' }, async ({
  request,
}) => {
  const { poId } = await draftSubmitReceiveSingleLine(request);
  const { id: invoiceId } = await createInvoice(request, {
    po_id: poId,
    invoice_number: `INV-${Date.now()}`,
    line_items: [invoiceLine()],
  });
  await matchInvoice(request, invoiceId);
  await approveInvoice(request, invoiceId);
  const response = await request.post(`/invoices/${invoiceId}/match`);
  await expectApiError(request, response, 400, 'workflow_gate');
});

test('INV-MATCH-E01 POST match unknown invoice returns 404', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/invoices/inv-does-not-exist/match');
  await expectApiError(request, response, 404, null);
});
