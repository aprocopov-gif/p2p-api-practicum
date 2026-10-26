import { expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { expectSchema } from './schema';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function expectApiError(
  request: APIRequestContext,
  response: { status: () => number; json: () => Promise<unknown> },
  status: number,
  rule: string | null,
): Promise<void> {
  expect(response.status()).toBe(status);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Error');
  if (!isRecord(body)) {
    throw new Error('error body was not an object');
  }
  if (rule === null) {
    expect(body.rule).toBeUndefined();
  } else {
    expect(body.rule).toBe(rule);
  }
}

export const LUM_LINE = { sku: 'LUM-2X4-8', quantity: 10, unit_price: 4.75 } as const;
export const CEM_LINE = { sku: 'CEM-30KG', quantity: 4, unit_price: 11.9 } as const;

export async function createPurchaseOrder(
  request: APIRequestContext,
  body: Record<string, unknown>,
): Promise<{ id: string; po: Record<string, unknown> }> {
  const response = await request.post('/purchase-orders', { data: body });
  expect(response.status()).toBe(201);
  const po: unknown = await response.json();
  await expectSchema(request, po, 'PurchaseOrder');
  if (!isRecord(po) || typeof po.id !== 'string') {
    throw new Error('POST /purchase-orders did not return id');
  }
  return { id: po.id, po };
}

export async function submitPurchaseOrder(
  request: APIRequestContext,
  poId: string,
): Promise<Record<string, unknown>> {
  const response = await request.post(`/purchase-orders/${poId}/submit`);
  expect(response.status()).toBe(200);
  const po: unknown = await response.json();
  await expectSchema(request, po, 'PurchaseOrder');
  if (!isRecord(po)) {
    throw new Error('submit did not return PO');
  }
  return po;
}

export async function receiveOnPo(
  request: APIRequestContext,
  poId: string,
  items: { sku: string; quantity: number }[],
): Promise<Record<string, unknown>> {
  const response = await request.post(`/purchase-orders/${poId}/receive`, {
    data: { items },
  });
  expect(response.status()).toBe(200);
  const po: unknown = await response.json();
  await expectSchema(request, po, 'PurchaseOrder');
  if (!isRecord(po)) {
    throw new Error('receive did not return PO');
  }
  return po;
}

export async function draftSubmitReceiveSingleLine(
  request: APIRequestContext,
  line: { sku: string; quantity: number; unit_price: number } = LUM_LINE,
  receiveQty: number = line.quantity,
  vendorId: string = 'vnd-001',
): Promise<{ poId: string }> {
  const { id: poId } = await createPurchaseOrder(request, {
    vendor_id: vendorId,
    line_items: [line],
  });
  await submitPurchaseOrder(request, poId);
  if (receiveQty > 0) {
    await receiveOnPo(request, poId, [{ sku: line.sku, quantity: receiveQty }]);
  }
  return { poId };
}

export async function createInvoice(
  request: APIRequestContext,
  data: Record<string, unknown>,
): Promise<{ id: string; invoice: Record<string, unknown> }> {
  const response = await request.post('/invoices', { data });
  expect(response.status()).toBe(201);
  const invoice: unknown = await response.json();
  await expectSchema(request, invoice, 'Invoice');
  if (!isRecord(invoice) || typeof invoice.id !== 'string') {
    throw new Error('POST /invoices did not return id');
  }
  return { id: invoice.id, invoice };
}

export async function matchInvoice(
  request: APIRequestContext,
  invoiceId: string,
): Promise<Record<string, unknown>> {
  const response = await request.post(`/invoices/${invoiceId}/match`);
  expect(response.status()).toBe(200);
  const result: unknown = await response.json();
  await expectSchema(request, result, 'MatchResult');
  if (!isRecord(result)) {
    throw new Error('match did not return result');
  }
  return result;
}

export async function approveInvoice(
  request: APIRequestContext,
  invoiceId: string,
): Promise<Record<string, unknown>> {
  const response = await request.post(`/invoices/${invoiceId}/approve`);
  expect(response.status()).toBe(200);
  const result: unknown = await response.json();
  await expectSchema(request, result, 'ApproveResult');
  if (!isRecord(result)) {
    throw new Error('approve did not return result');
  }
  return result;
}

export async function happyPathToMatchedInvoice(
  request: APIRequestContext,
  invoiceNumber: string,
  vendorId: string = 'vnd-001',
): Promise<{ poId: string; invoiceId: string }> {
  const { poId } = await draftSubmitReceiveSingleLine(request, LUM_LINE, LUM_LINE.quantity, vendorId);
  const { id: invoiceId } = await createInvoice(request, {
    po_id: poId,
    invoice_number: invoiceNumber,
    line_items: [{ sku: LUM_LINE.sku, quantity: LUM_LINE.quantity, unit_price: LUM_LINE.unit_price }],
  });
  await matchInvoice(request, invoiceId);
  return { poId, invoiceId };
}
