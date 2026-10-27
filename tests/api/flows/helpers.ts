import { expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { expectSchema } from '../helpers/schema';
import { isRecord } from '../helpers/workflow';

const MATERIALS_EXPENSE = '5000 Materials Expense';
const ACCOUNTS_PAYABLE = '2000 Accounts Payable';

export async function createFlowVendor(
  request: APIRequestContext,
  label: string,
): Promise<string> {
  const response = await request.post('/vendors', {
    data: { name: `E2E ${label} ${Date.now()}` },
  });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Vendor');
  if (!isRecord(body) || typeof body.id !== 'string') {
    throw new Error('POST /vendors did not return id');
  }
  return body.id;
}

export function assertBalancedGlEntry(result: Record<string, unknown>, amount: number): void {
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

export async function fetchVendorExposure(
  request: APIRequestContext,
  vendorId: string,
): Promise<Record<string, unknown>> {
  const response = await request.get(`/vendors/${vendorId}/exposure`);
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'VendorExposure');
  if (!isRecord(body)) {
    throw new Error('exposure body was not an object');
  }
  return body;
}
