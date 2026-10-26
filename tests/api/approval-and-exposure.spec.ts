import { expect, test } from '@playwright/test';
import { expectSchema } from './helpers/schema';
import {
  CEM_LINE,
  LUM_LINE,
  approveInvoice,
  createInvoice,
  createPurchaseOrder,
  draftSubmitReceiveSingleLine,
  expectApiError,
  happyPathToMatchedInvoice,
  isRecord,
  matchInvoice,
  receiveOnPo,
  submitPurchaseOrder,
} from './helpers/workflow';

const MATERIALS_EXPENSE = '5000 Materials Expense';
const ACCOUNTS_PAYABLE = '2000 Accounts Payable';

async function createActiveVendor(
  request: import('@playwright/test').APIRequestContext,
): Promise<string> {
  const response = await request.post('/vendors', {
    data: { name: `Approval exposure QA ${Date.now()}` },
  });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Vendor');
  if (!isRecord(body) || typeof body.id !== 'string') {
    throw new Error('POST /vendors did not return id');
  }
  return body.id;
}

function assertGlEntry(result: Record<string, unknown>, amount: number): void {
  const glEntry = result.gl_entry;
  if (!isRecord(glEntry)) {
    throw new Error('approve result missing gl_entry');
  }
  expect(glEntry.balanced).toBe(true);
  const debits = glEntry.debits;
  const credits = glEntry.credits;
  if (!Array.isArray(debits) || !Array.isArray(credits)) {
    throw new Error('gl_entry missing debits or credits');
  }
  expect(debits).toEqual([{ account: MATERIALS_EXPENSE, amount }]);
  expect(credits).toEqual([{ account: ACCOUNTS_PAYABLE, amount }]);
}

function glAccounts(lines: unknown): string[] {
  if (!Array.isArray(lines)) {
    throw new Error('gl lines were not an array');
  }
  return lines.map((line) => {
    if (!isRecord(line) || typeof line.account !== 'string') {
      throw new Error('gl line missing account');
    }
    return line.account;
  });
}

function assertGlAccounts(result: Record<string, unknown>): void {
  const glEntry = result.gl_entry;
  if (!isRecord(glEntry)) {
    throw new Error('approve result missing gl_entry');
  }
  expect(glEntry.balanced).toBe(true);
  expect(glAccounts(glEntry.debits)).toContain(MATERIALS_EXPENSE);
  expect(glAccounts(glEntry.credits)).toContain(ACCOUNTS_PAYABLE);
}

async function approveSingleLineThenTwoLine(
  request: import('@playwright/test').APIRequestContext,
  label: string,
): Promise<{
  vendorId: string;
  firstInvoiceId: string;
  secondInvoiceId: string;
  first: Record<string, unknown>;
  second: Record<string, unknown>;
}> {
  const vendorId = await createActiveVendor(request);
  const stamp = `${Date.now()}-${label}`;
  const { invoiceId: firstInvoiceId } = await happyPathToMatchedInvoice(
    request,
    `INV-${label}-A-${stamp}`,
    vendorId,
  );
  const first = await approveInvoice(request, firstInvoiceId);
  const { invoiceId: secondInvoiceId } = await happyPathMultiLineToMatched(
    request,
    `INV-${label}-B-${stamp}`,
    vendorId,
  );
  const second = await approveInvoice(request, secondInvoiceId);
  return { vendorId, firstInvoiceId, secondInvoiceId, first, second };
}

async function happyPathMultiLineToMatched(
  request: import('@playwright/test').APIRequestContext,
  invoiceNumber: string,
  vendorId: string,
): Promise<{ poId: string; invoiceId: string }> {
  const { id: poId } = await createPurchaseOrder(request, {
    vendor_id: vendorId,
    line_items: [LUM_LINE, CEM_LINE],
  });
  await submitPurchaseOrder(request, poId);
  await receiveOnPo(request, poId, [
    { sku: LUM_LINE.sku, quantity: LUM_LINE.quantity },
    { sku: CEM_LINE.sku, quantity: CEM_LINE.quantity },
  ]);
  const { id: invoiceId } = await createInvoice(request, {
    po_id: poId,
    invoice_number: invoiceNumber,
    line_items: [
      { sku: LUM_LINE.sku, quantity: LUM_LINE.quantity, unit_price: LUM_LINE.unit_price },
      { sku: CEM_LINE.sku, quantity: CEM_LINE.quantity, unit_price: CEM_LINE.unit_price },
    ],
  });
  await matchInvoice(request, invoiceId);
  return { poId, invoiceId };
}

test('APR-POST-01 matched invoice approve returns balanced GL and exposure', { tag: '@api' }, async ({
  request,
}) => {
  const vendorId = await createActiveVendor(request);
  const invoiceNumber = `INV-APR-01-${Date.now()}`;
  const { invoiceId } = await happyPathToMatchedInvoice(request, invoiceNumber, vendorId);
  const result = await approveInvoice(request, invoiceId);

  expect(result.status).toBe('approved');
  expect(result.invoice_id).toBe(invoiceId);
  expect(result.vendor_exposure).toBe(47.5);
  assertGlEntry(result, 47.5);
});

test('APR-POST-02 GET invoice after approve shows approved status', { tag: '@api' }, async ({ request }) => {
  const invoiceNumber = `INV-APR-02-${Date.now()}`;
  const { invoiceId } = await happyPathToMatchedInvoice(request, invoiceNumber);
  await approveInvoice(request, invoiceId);

  const response = await request.get(`/invoices/${invoiceId}`);
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Invoice');
  if (!isRecord(body)) {
    throw new Error('GET invoice did not return object');
  }
  expect(body.status).toBe('approved');
});

test('APR-POST-03 two-line invoice approve totals 95.1', { tag: '@api' }, async ({ request }) => {
  const vendorId = await createActiveVendor(request);
  const invoiceNumber = `INV-APR-03-${Date.now()}`;
  const { invoiceId } = await happyPathMultiLineToMatched(request, invoiceNumber, vendorId);
  const result = await approveInvoice(request, invoiceId);

  expect(result.status).toBe('approved');
  expect(result.invoice_id).toBe(invoiceId);
  expect(result.vendor_exposure).toBe(95.1);
  assertGlEntry(result, 95.1);
});

test('APR-POST-04 approve after partial receipt sets exposure to 19', { tag: '@api' }, async ({
  request,
}) => {
  const vendorId = await createActiveVendor(request);
  const { poId } = await draftSubmitReceiveSingleLine(request, LUM_LINE, 4, vendorId);
  const { id: invoiceId, invoice } = await createInvoice(request, {
    po_id: poId,
    invoice_number: `INV-APR-04-${Date.now()}`,
    line_items: [{ sku: LUM_LINE.sku, quantity: 4, unit_price: LUM_LINE.unit_price }],
  });
  expect(invoice.total_amount).toBe(19);
  const match = await matchInvoice(request, invoiceId);
  expect(match.partial_receipt).toBe(true);

  const result = await approveInvoice(request, invoiceId);
  expect(result.status).toBe('approved');
  expect(result.vendor_exposure).toBe(19);
  assertGlAccounts(result);
});

test('APR-POST-05 two approved invoices sum exposure to 142.6', { tag: '@api' }, async ({ request }) => {
  const { first, second } = await approveSingleLineThenTwoLine(request, 'APR-05');

  expect(first.status).toBe('approved');
  expect(first.vendor_exposure).toBe(47.5);
  if (!isRecord(first.gl_entry)) {
    throw new Error('first approve result missing gl_entry');
  }
  expect(first.gl_entry.balanced).toBe(true);

  expect(second.status).toBe('approved');
  expect(second.vendor_exposure).toBe(142.6);
  if (!isRecord(second.gl_entry)) {
    throw new Error('second approve result missing gl_entry');
  }
  expect(second.gl_entry.balanced).toBe(true);
});

test('APR-POST-N01 approve on received invoice returns three_way_match_gate', { tag: '@api' }, async ({
  request,
}) => {
  const invoiceNumber = `INV-APR-N01-${Date.now()}`;
  const { poId } = await draftSubmitReceiveSingleLine(request);
  const { id: invoiceId } = await createInvoice(request, {
    po_id: poId,
    invoice_number: invoiceNumber,
    line_items: [{ sku: LUM_LINE.sku, quantity: LUM_LINE.quantity, unit_price: LUM_LINE.unit_price }],
  });

  const response = await request.post(`/invoices/${invoiceId}/approve`);
  await expectApiError(request, response, 400, 'three_way_match_gate');
});

test('APR-POST-N02 second approve returns duplicate_approval', { tag: '@api' }, async ({ request }) => {
  const invoiceNumber = `INV-APR-N02-${Date.now()}`;
  const { invoiceId } = await happyPathToMatchedInvoice(request, invoiceNumber);
  await approveInvoice(request, invoiceId);

  const response = await request.post(`/invoices/${invoiceId}/approve`);
  await expectApiError(request, response, 400, 'duplicate_approval');
});

test('APR-POST-E01 unknown invoice id returns 404', { tag: '@api' }, async ({ request }) => {
  const response = await request.post('/invoices/inv-does-not-exist/approve');
  await expectApiError(request, response, 404, null);
});

test('EXP-GET-01 vendor exposure after single-line approve', { tag: '@api' }, async ({ request }) => {
  const vendorId = await createActiveVendor(request);
  const invoiceNumber = `INV-EXP-01-${Date.now()}`;
  const { invoiceId } = await happyPathToMatchedInvoice(request, invoiceNumber, vendorId);
  await approveInvoice(request, invoiceId);

  const response = await request.get(`/vendors/${vendorId}/exposure`);
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'VendorExposure');
  if (!isRecord(body)) {
    throw new Error('exposure body was not an object');
  }
  expect(body.vendor_id).toBe(vendorId);
  expect(body.open_ap_liability).toBe(47.5);
  const approved = body.approved_invoices;
  expect(Array.isArray(approved)).toBe(true);
  expect(approved).toContain(invoiceId);
});

test('EXP-GET-02 vendor exposure after two-line approve totals 95.1', { tag: '@api' }, async ({ request }) => {
  const vendorId = await createActiveVendor(request);
  const invoiceNumber = `INV-EXP-02-${Date.now()}`;
  const { invoiceId } = await happyPathMultiLineToMatched(request, invoiceNumber, vendorId);
  await approveInvoice(request, invoiceId);

  const response = await request.get(`/vendors/${vendorId}/exposure`);
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'VendorExposure');
  if (!isRecord(body)) {
    throw new Error('exposure body was not an object');
  }
  expect(body.open_ap_liability).toBe(95.1);
  const approved = body.approved_invoices;
  expect(Array.isArray(approved)).toBe(true);
  expect(approved).toContain(invoiceId);
});

test('EXP-GET-03 seed vendor exposure matches VendorExposure schema', { tag: '@api' }, async ({ request }) => {
  const response = await request.get('/vendors/vnd-001/exposure');
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'VendorExposure');
  if (!isRecord(body)) {
    throw new Error('exposure body was not an object');
  }
  expect(body.vendor_id).toBe('vnd-001');
});

test('EXP-GET-04 exposure is the sum of two approved invoices', { tag: '@api' }, async ({ request }) => {
  const { vendorId, firstInvoiceId, secondInvoiceId } = await approveSingleLineThenTwoLine(
    request,
    'EXP-04',
  );

  const response = await request.get(`/vendors/${vendorId}/exposure`);
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'VendorExposure');
  if (!isRecord(body)) {
    throw new Error('exposure body was not an object');
  }
  expect(body.vendor_id).toBe(vendorId);
  expect(body.open_ap_liability).toBe(142.6);
  const approved = body.approved_invoices;
  expect(Array.isArray(approved)).toBe(true);
  expect(approved).toHaveLength(2);
  expect(approved).toEqual(expect.arrayContaining([firstInvoiceId, secondInvoiceId]));
});

test('EXP-GET-05 inactive seed vendor exposure matches VendorExposure schema', { tag: '@api' }, async ({
  request,
}) => {
  const response = await request.get('/vendors/vnd-002/exposure');
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'VendorExposure');
  if (!isRecord(body)) {
    throw new Error('exposure body was not an object');
  }
  expect(body.vendor_id).toBe('vnd-002');
});

test('EXP-GET-E01 unknown vendor id returns 404', { tag: '@api' }, async ({ request }) => {
  const response = await request.get('/vendors/vnd-does-not-exist/exposure');
  await expectApiError(request, response, 404, null);
});
