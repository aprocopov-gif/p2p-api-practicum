import { expect, test } from '@playwright/test';
import { expectSchema } from './helpers/schema';
import {
  isRecord,
  expectApiError,
  createPurchaseOrder,
  submitPurchaseOrder,
  receiveOnPo,
  LUM_LINE,
  CEM_LINE,
} from './helpers/workflow';

function findLine(po: Record<string, unknown>, sku: string): Record<string, unknown> | undefined {
  const lines = po.line_items;
  if (!Array.isArray(lines)) {
    return undefined;
  }
  for (const line of lines) {
    if (isRecord(line) && line.sku === sku) {
      return line;
    }
  }
  return undefined;
}

function validPoBody(lineItems: Record<string, unknown>[] = [LUM_LINE]): Record<string, unknown> {
  return { vendor_id: 'vnd-001', line_items: lineItems };
}

test('PO-POST-01 POST /purchase-orders creates draft PO with computed values', { tag: '@api' }, async ({
  request,
}) => {
  const response = await request.post('/purchase-orders', {
    data: validPoBody(),
  });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'PurchaseOrder');
  if (!isRecord(body)) {
    throw new Error('201 body was not an object');
  }
  expect(body.status).toBe('draft');
  expect(body.vendor_id).toBe('vnd-001');
  expect(typeof body.id).toBe('string');
  expect((body.id as string).startsWith('po-')).toBe(true);
  expect(body.ordered_value).toBe(47.5);
  expect(body.received_value).toBe(0);
  expect(body.fully_received).toBe(false);
  const line = findLine(body, 'LUM-2X4-8');
  expect(line).toBeDefined();
  if (line) {
    expect(line.received_quantity).toBe(0);
  }
});

test('PO-POST-02 POST /purchase-orders two lines with optional description', { tag: '@api' }, async ({
  request,
}) => {
  const response = await request.post('/purchase-orders', {
    data: {
      vendor_id: 'vnd-001',
      line_items: [
        { ...LUM_LINE, description: '2x4 stud, 8 ft' },
        { sku: CEM_LINE.sku, quantity: CEM_LINE.quantity, unit_price: CEM_LINE.unit_price },
      ],
    },
  });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'PurchaseOrder');
  if (!isRecord(body)) {
    throw new Error('201 body was not an object');
  }
  expect(body.ordered_value).toBe(95.1);
  const cemLine = findLine(body, 'CEM-30KG');
  expect(cemLine).toBeDefined();
  if (cemLine) {
    expect(cemLine.description).toBe('');
  }
});

test('PO-POST-03 POST /purchase-orders accepts quantity 1', { tag: '@api' }, async ({ request }) => {
  const unitPrice = 4.75;
  const response = await request.post('/purchase-orders', {
    data: validPoBody([{ sku: 'LUM-2X4-8', quantity: 1, unit_price: unitPrice }]),
  });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'PurchaseOrder');
  if (!isRecord(body)) {
    throw new Error('201 body was not an object');
  }
  expect(body.ordered_value).toBe(unitPrice * 1);
});

test('PO-POST-04 POST /purchase-orders accepts quantity 10000', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/purchase-orders', {
    data: validPoBody([{ sku: 'LUM-2X4-8', quantity: 10000, unit_price: 4.75 }]),
  });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'PurchaseOrder');
  if (!isRecord(body)) {
    throw new Error('201 body was not an object');
  }
  const line = findLine(body, 'LUM-2X4-8');
  expect(line).toBeDefined();
  if (line) {
    expect(line.quantity).toBe(10000);
  }
});

test('PO-POST-05 POST /purchase-orders accepts unit_price 0', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/purchase-orders', {
    data: validPoBody([{ sku: 'LUM-2X4-8', quantity: 10, unit_price: 0 }]),
  });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'PurchaseOrder');
  if (!isRecord(body)) {
    throw new Error('201 body was not an object');
  }
  expect(body.ordered_value).toBe(0);
});

test('PO-POST-06 POST /purchase-orders accepts unit_price 100000', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/purchase-orders', {
    data: validPoBody([{ sku: 'LUM-2X4-8', quantity: 1, unit_price: 100000 }]),
  });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'PurchaseOrder');
  if (!isRecord(body)) {
    throw new Error('201 body was not an object');
  }
  const line = findLine(body, 'LUM-2X4-8');
  expect(line).toBeDefined();
  if (line) {
    expect(line.unit_price).toBe(100000);
  }
});

test('PO-POST-N01 POST /purchase-orders rejects empty body', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/purchase-orders', { data: {} });
  await expectApiError(request, response, 400, 'validation_error');
});

test('PO-POST-N02 POST /purchase-orders rejects missing vendor_id', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/purchase-orders', {
    data: { line_items: [{ sku: 'LUM-2X4-8', quantity: 1, unit_price: 1 }] },
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('PO-POST-N03 POST /purchase-orders rejects empty line_items', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/purchase-orders', {
    data: { vendor_id: 'vnd-001', line_items: [] },
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('PO-POST-N04 POST /purchase-orders rejects inactive vendor vnd-002', { tag: '@api' }, async ({
  request,
}) => {
  const response = await request.post('/purchase-orders', {
    data: { vendor_id: 'vnd-002', line_items: [LUM_LINE] },
  });
  await expectApiError(request, response, 400, 'inactive_vendor_gate');
});

test('PO-POST-N05 POST /purchase-orders unknown vendor returns 404', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/purchase-orders', {
    data: { vendor_id: 'vnd-no-such', line_items: [LUM_LINE] },
  });
  expect(response.status()).toBe(404);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Error');
  if (!isRecord(body)) {
    throw new Error('404 body was not an object');
  }
  expect(typeof body.detail).toBe('string');
  expect(body.detail).not.toHaveLength(0);
  expect(body.rule).toBeUndefined();
});

test('PO-POST-N06 POST /purchase-orders rejects quantity 0', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/purchase-orders', {
    data: validPoBody([{ sku: 'LUM-2X4-8', quantity: 0, unit_price: 4.75 }]),
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('PO-POST-N07 POST /purchase-orders rejects quantity 10001', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/purchase-orders', {
    data: validPoBody([{ sku: 'LUM-2X4-8', quantity: 10001, unit_price: 4.75 }]),
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('PO-POST-N08 POST /purchase-orders rejects negative quantity', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/purchase-orders', {
    data: validPoBody([{ sku: 'LUM-2X4-8', quantity: -1, unit_price: 4.75 }]),
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('PO-POST-N09 POST /purchase-orders rejects negative unit_price', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/purchase-orders', {
    data: validPoBody([{ sku: 'LUM-2X4-8', quantity: 1, unit_price: -0.01 }]),
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('PO-POST-N10 POST /purchase-orders rejects unit_price over maximum', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/purchase-orders', {
    data: validPoBody([{ sku: 'LUM-2X4-8', quantity: 1, unit_price: 100001 }]),
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('PO-POST-N11 POST /purchase-orders rejects line missing sku', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/purchase-orders', {
    data: validPoBody([{ quantity: 1, unit_price: 4.75 }]),
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('PO-POST-N12 POST /purchase-orders rejects empty sku', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/purchase-orders', {
    data: validPoBody([{ sku: '', quantity: 1, unit_price: 4.75 }]),
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('PO-POST-N13 POST /purchase-orders rejects string quantity', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/purchase-orders', {
    data: validPoBody([{ sku: 'LUM-2X4-8', quantity: 'ten', unit_price: 4.75 }]),
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('PO-POST-N14 POST /purchase-orders rejects duplicate SKU on one PO', { tag: '@api' }, async ({
  request,
}) => {
  const response = await request.post('/purchase-orders', {
    data: validPoBody([
      { sku: 'LUM-2X4-8', quantity: 10, unit_price: 4.75 },
      { sku: 'LUM-2X4-8', quantity: 5, unit_price: 4.75 },
    ]),
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('PO-POST-N15 POST /purchase-orders rejects empty vendor_id', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/purchase-orders', {
    data: { vendor_id: '', line_items: [LUM_LINE] },
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('PO-POST-N16 POST /purchase-orders rejects string unit_price', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/purchase-orders', {
    data: validPoBody([{ sku: 'LUM-2X4-8', quantity: 10, unit_price: '4.75' }]),
  });
  await expectApiError(request, response, 400, 'validation_error');
});

test('PO-POST-E01 POST unknown purchase-orders subpath returns 404', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/purchase-orders/extra', { data: validPoBody() });
  expect(response.status()).toBe(404);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Error');
  if (!isRecord(body)) {
    throw new Error('404 body was not an object');
  }
  expect(typeof body.detail).toBe('string');
  expect(body.rule).toBeUndefined();
});

test('PO-GET-01 GET /purchase-orders/{poId} matches create response', { tag: '@api' }, async ({ request }) => {
  const createRes = await request.post('/purchase-orders', { data: validPoBody() });
  expect(createRes.status()).toBe(201);
  const created: unknown = await createRes.json();
  await expectSchema(request, created, 'PurchaseOrder');
  if (!isRecord(created) || typeof created.id !== 'string') {
    throw new Error('create did not return PO id');
  }

  const getRes = await request.get(`/purchase-orders/${created.id}`);
  expect(getRes.status()).toBe(200);
  const fetched: unknown = await getRes.json();
  await expectSchema(request, fetched, 'PurchaseOrder');
  if (!isRecord(fetched)) {
    throw new Error('GET body was not an object');
  }
  expect(fetched.id).toBe(created.id);
  expect(fetched.status).toBe('draft');
  expect(fetched.vendor_id).toBe(created.vendor_id);
  expect(fetched.ordered_value).toBe(created.ordered_value);
  expect(fetched.received_value).toBe(created.received_value);
  expect(fetched.fully_received).toBe(created.fully_received);
  expect(fetched.line_items).toEqual(created.line_items);
});

test('PO-GET-02 GET /purchase-orders/{poId} body matches PurchaseOrder schema', { tag: '@api' }, async ({
  request,
}) => {
  const { id: poId } = await createPurchaseOrder(request, validPoBody());
  const response = await request.get(`/purchase-orders/${poId}`);
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'PurchaseOrder');
});

test('PO-GET-03 GET /purchase-orders/{poId} after submit shows submitted status', { tag: '@api' }, async ({
  request,
}) => {
  const { id: poId } = await createPurchaseOrder(request, validPoBody());
  await submitPurchaseOrder(request, poId);
  const response = await request.get(`/purchase-orders/${poId}`);
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'PurchaseOrder');
  if (!isRecord(body)) {
    throw new Error('GET body was not an object');
  }
  expect(body.status).toBe('submitted');
});

test('PO-GET-E01 GET unknown purchase order returns 404', { tag: '@api' }, async ({ request }) => {
  const response = await request.get('/purchase-orders/po-does-not-exist');
  expect(response.status()).toBe(404);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Error');
  if (!isRecord(body)) {
    throw new Error('404 body was not an object');
  }
  expect(typeof body.detail).toBe('string');
  expect(body.detail).not.toHaveLength(0);
  expect(body.rule).toBeUndefined();
});

test('PO-SUB-01 POST submit moves draft PO to submitted', { tag: '@api' }, async ({ request }) => {
  const { id: poId } = await createPurchaseOrder(request, validPoBody());
  const response = await request.post(`/purchase-orders/${poId}/submit`);
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'PurchaseOrder');
  if (!isRecord(body)) {
    throw new Error('submit body was not an object');
  }
  expect(body.id).toBe(poId);
  expect(body.status).toBe('submitted');
});

test('PO-SUB-02 GET after submit shows submitted status', { tag: '@api' }, async ({ request }) => {
  const { id: poId } = await createPurchaseOrder(request, validPoBody());
  await submitPurchaseOrder(request, poId);
  const response = await request.get(`/purchase-orders/${poId}`);
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'PurchaseOrder');
  if (!isRecord(body)) {
    throw new Error('GET body was not an object');
  }
  expect(body.status).toBe('submitted');
});

test('PO-SUB-N01 POST submit on already submitted PO returns workflow_gate', { tag: '@api' }, async ({
  request,
}) => {
  const { id: poId } = await createPurchaseOrder(request, validPoBody());
  await submitPurchaseOrder(request, poId);
  const response = await request.post(`/purchase-orders/${poId}/submit`);
  await expectApiError(request, response, 400, 'workflow_gate');
});

test('PO-SUB-N02 POST submit on closed PO returns workflow_gate', { tag: '@api' }, async ({ request }) => {
  const { id: poId } = await createPurchaseOrder(request, validPoBody());
  await submitPurchaseOrder(request, poId);
  const received = await receiveOnPo(request, poId, [{ sku: LUM_LINE.sku, quantity: LUM_LINE.quantity }]);
  expect(received.status).toBe('closed');
  expect(received.fully_received).toBe(true);
  const response = await request.post(`/purchase-orders/${poId}/submit`);
  await expectApiError(request, response, 400, 'workflow_gate');
});

test('PO-SUB-E01 POST submit on unknown PO returns 404', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/purchase-orders/po-does-not-exist/submit');
  await expectApiError(request, response, 404, null);
});
