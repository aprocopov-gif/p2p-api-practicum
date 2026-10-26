import { expect, test } from '@playwright/test';
import {
  CEM_LINE,
  LUM_LINE,
  createPurchaseOrder,
  expectApiError,
  isRecord,
  receiveOnPo,
  submitPurchaseOrder,
} from './helpers/workflow';
import { expectSchema } from './helpers/schema';

function findPoLine(po: Record<string, unknown>, sku: string): Record<string, unknown> {
  const lineItems = po.line_items;
  if (!Array.isArray(lineItems)) {
    throw new Error('PO missing line_items');
  }
  for (const line of lineItems) {
    if (isRecord(line) && line.sku === sku) {
      return line;
    }
  }
  throw new Error(`PO line not found: ${sku}`);
}

test('RCV-POST-01 full receipt closes PO', { tag: '@api' }, async ({ request }) => {
  const { id: poId } = await createPurchaseOrder(request, {
    vendor_id: 'vnd-001',
    line_items: [LUM_LINE],
  });
  await submitPurchaseOrder(request, poId);
  const po = await receiveOnPo(request, poId, [{ sku: LUM_LINE.sku, quantity: 10 }]);

  const line = findPoLine(po, LUM_LINE.sku);
  expect(line.received_quantity).toBe(10);
  expect(po.fully_received).toBe(true);
  expect(po.status).toBe('closed');
  expect(po.received_value).toBe(47.5);
});

test('RCV-POST-02 partial receipt keeps PO submitted', { tag: '@api' }, async ({ request }) => {
  const { id: poId } = await createPurchaseOrder(request, {
    vendor_id: 'vnd-001',
    line_items: [LUM_LINE],
  });
  await submitPurchaseOrder(request, poId);
  const po = await receiveOnPo(request, poId, [{ sku: LUM_LINE.sku, quantity: 4 }]);

  const line = findPoLine(po, LUM_LINE.sku);
  expect(line.received_quantity).toBe(4);
  expect(po.fully_received).toBe(false);
  expect(po.status).toBe('submitted');
  expect(po.received_value).toBe(19.0);
});

test('RCV-POST-03 multi-line full receipt closes PO', { tag: '@api' }, async ({ request }) => {
  const { id: poId } = await createPurchaseOrder(request, {
    vendor_id: 'vnd-001',
    line_items: [LUM_LINE, CEM_LINE],
  });
  await submitPurchaseOrder(request, poId);
  const po = await receiveOnPo(request, poId, [
    { sku: LUM_LINE.sku, quantity: LUM_LINE.quantity },
    { sku: CEM_LINE.sku, quantity: CEM_LINE.quantity },
  ]);

  expect(findPoLine(po, LUM_LINE.sku).received_quantity).toBe(10);
  expect(findPoLine(po, CEM_LINE.sku).received_quantity).toBe(4);
  expect(po.fully_received).toBe(true);
  expect(po.status).toBe('closed');
  expect(po.ordered_value).toBe(95.1);
  expect(po.received_value).toBe(95.1);
});

test('RCV-POST-04 cumulative deliveries close PO', { tag: '@api' }, async ({ request }) => {
  const { id: poId } = await createPurchaseOrder(request, {
    vendor_id: 'vnd-001',
    line_items: [LUM_LINE],
  });
  await submitPurchaseOrder(request, poId);
  await receiveOnPo(request, poId, [{ sku: LUM_LINE.sku, quantity: 4 }]);
  const po = await receiveOnPo(request, poId, [{ sku: LUM_LINE.sku, quantity: 6 }]);

  expect(findPoLine(po, LUM_LINE.sku).received_quantity).toBe(10);
  expect(po.status).toBe('closed');
});

test('RCV-POST-05 smallest valid receive quantity closes PO', { tag: '@api' }, async ({ request }) => {
  const line = { sku: LUM_LINE.sku, quantity: 1, unit_price: LUM_LINE.unit_price };
  const { id: poId } = await createPurchaseOrder(request, {
    vendor_id: 'vnd-001',
    line_items: [line],
  });
  await submitPurchaseOrder(request, poId);
  const po = await receiveOnPo(request, poId, [{ sku: line.sku, quantity: 1 }]);

  expect(findPoLine(po, line.sku).received_quantity).toBe(1);
  expect(po.status).toBe('closed');
});

test('RCV-POST-06 receive at maximum quantity closes PO', { tag: '@api' }, async ({ request }) => {
  const line = { sku: LUM_LINE.sku, quantity: 10000, unit_price: LUM_LINE.unit_price };
  const { id: poId } = await createPurchaseOrder(request, {
    vendor_id: 'vnd-001',
    line_items: [line],
  });
  await submitPurchaseOrder(request, poId);
  const po = await receiveOnPo(request, poId, [{ sku: line.sku, quantity: 10000 }]);

  expect(findPoLine(po, line.sku).received_quantity).toBe(10000);
  expect(po.status).toBe('closed');
});

test('RCV-POST-N01 receive on draft PO returns workflow_gate', { tag: '@api' }, async ({ request }) => {
  const { id: poId } = await createPurchaseOrder(request, {
    vendor_id: 'vnd-001',
    line_items: [LUM_LINE],
  });
  const response = await request.post(`/purchase-orders/${poId}/receive`, {
    data: { items: [{ sku: LUM_LINE.sku, quantity: 10 }] },
  });
  await expectApiError(request, response, 400, 'workflow_gate');
});

test('RCV-POST-N02 receive over ordered qty returns receive_quantity_limit', { tag: '@api' }, async ({ request }) => {
  const { id: poId } = await createPurchaseOrder(request, {
    vendor_id: 'vnd-001',
    line_items: [LUM_LINE],
  });
  await submitPurchaseOrder(request, poId);
  const response = await request.post(`/purchase-orders/${poId}/receive`, {
    data: { items: [{ sku: LUM_LINE.sku, quantity: 11 }] },
  });
  await expectApiError(request, response, 400, 'receive_quantity_limit');
});

test('RCV-POST-N03 cumulative receive over limit returns receive_quantity_limit', { tag: '@api' }, async ({ request }) => {
  const { id: poId } = await createPurchaseOrder(request, {
    vendor_id: 'vnd-001',
    line_items: [LUM_LINE],
  });
  await submitPurchaseOrder(request, poId);
  await receiveOnPo(request, poId, [{ sku: LUM_LINE.sku, quantity: 6 }]);
  const response = await request.post(`/purchase-orders/${poId}/receive`, {
    data: { items: [{ sku: LUM_LINE.sku, quantity: 5 }] },
  });
  await expectApiError(request, response, 400, 'receive_quantity_limit');
});

test('RCV-POST-N04 empty items array returns validation_error', { tag: '@api' }, async ({ request }) => {
  const { id: poId } = await createPurchaseOrder(request, {
    vendor_id: 'vnd-001',
    line_items: [LUM_LINE],
  });
  await submitPurchaseOrder(request, poId);
  const response = await request.post(`/purchase-orders/${poId}/receive`, {
    data: { items: [] },
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('RCV-POST-N05 receive quantity zero returns validation_error', { tag: '@api' }, async ({ request }) => {
  const { id: poId } = await createPurchaseOrder(request, {
    vendor_id: 'vnd-001',
    line_items: [LUM_LINE],
  });
  await submitPurchaseOrder(request, poId);
  const response = await request.post(`/purchase-orders/${poId}/receive`, {
    data: { items: [{ sku: LUM_LINE.sku, quantity: 0 }] },
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('RCV-POST-N06 receive quantity over maximum returns validation_error', { tag: '@api' }, async ({ request }) => {
  const { id: poId } = await createPurchaseOrder(request, {
    vendor_id: 'vnd-001',
    line_items: [LUM_LINE],
  });
  await submitPurchaseOrder(request, poId);
  const response = await request.post(`/purchase-orders/${poId}/receive`, {
    data: { items: [{ sku: LUM_LINE.sku, quantity: 10001 }] },
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('RCV-POST-N07 missing items field returns validation_error', { tag: '@api' }, async ({ request }) => {
  const { id: poId } = await createPurchaseOrder(request, {
    vendor_id: 'vnd-001',
    line_items: [LUM_LINE],
  });
  await submitPurchaseOrder(request, poId);
  const response = await request.post(`/purchase-orders/${poId}/receive`, {
    data: {},
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('RCV-POST-N08 receive item missing sku returns validation_error', { tag: '@api' }, async ({ request }) => {
  const { id: poId } = await createPurchaseOrder(request, {
    vendor_id: 'vnd-001',
    line_items: [LUM_LINE],
  });
  await submitPurchaseOrder(request, poId);
  const response = await request.post(`/purchase-orders/${poId}/receive`, {
    data: { items: [{ quantity: 1 }] },
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('RCV-POST-N09 empty sku returns validation_error', { tag: '@api' }, async ({ request }) => {
  const { id: poId } = await createPurchaseOrder(request, {
    vendor_id: 'vnd-001',
    line_items: [LUM_LINE],
  });
  await submitPurchaseOrder(request, poId);
  const response = await request.post(`/purchase-orders/${poId}/receive`, {
    data: { items: [{ sku: '', quantity: 1 }] },
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('RCV-POST-N10 receive SKU not on PO returns validation_error', { tag: '@api' }, async ({ request }) => {
  const { id: poId } = await createPurchaseOrder(request, {
    vendor_id: 'vnd-001',
    line_items: [LUM_LINE],
  });
  await submitPurchaseOrder(request, poId);
  const response = await request.post(`/purchase-orders/${poId}/receive`, {
    data: { items: [{ sku: 'PLY-12-4X8', quantity: 1 }] },
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('RCV-POST-N11 receive on closed PO returns workflow_gate', { tag: '@api' }, async ({ request }) => {
  const { id: poId } = await createPurchaseOrder(request, {
    vendor_id: 'vnd-001',
    line_items: [LUM_LINE],
  });
  await submitPurchaseOrder(request, poId);
  await receiveOnPo(request, poId, [{ sku: LUM_LINE.sku, quantity: LUM_LINE.quantity }]);
  const response = await request.post(`/purchase-orders/${poId}/receive`, {
    data: { items: [{ sku: LUM_LINE.sku, quantity: 1 }] },
  });
  await expectApiError(request, response, 400, 'workflow_gate');
});

test('RCV-POST-N12 negative receive quantity returns validation_error', { tag: '@api' }, async ({ request }) => {
  const { id: poId } = await createPurchaseOrder(request, {
    vendor_id: 'vnd-001',
    line_items: [LUM_LINE],
  });
  await submitPurchaseOrder(request, poId);
  const response = await request.post(`/purchase-orders/${poId}/receive`, {
    data: { items: [{ sku: LUM_LINE.sku, quantity: -1 }] },
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('RCV-POST-N13 string receive quantity returns validation_error', { tag: '@api' }, async ({ request }) => {
  const { id: poId } = await createPurchaseOrder(request, {
    vendor_id: 'vnd-001',
    line_items: [LUM_LINE],
  });
  await submitPurchaseOrder(request, poId);
  const response = await request.post(`/purchase-orders/${poId}/receive`, {
    data: { items: [{ sku: LUM_LINE.sku, quantity: 'ten' }] },
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('RCV-POST-E01 unknown PO id returns 404 Error', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/purchase-orders/po-does-not-exist/receive', {
    data: { items: [{ sku: LUM_LINE.sku, quantity: 1 }] },
  });
  await expectApiError(request, response, 404, null);
});
