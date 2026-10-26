import { expect, test } from '@playwright/test';
import { expectSchema } from './helpers/schema';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

test('every vendor from GET /vendors matches Vendor', { tag: '@api' }, async ({ request }) => {
  const response = await request.get('/vendors');
  expect(response.status()).toBe(200);
  const vendors: unknown = await response.json();
  expect(Array.isArray(vendors)).toBe(true);
  if (!Array.isArray(vendors)) {
    return;
  }
  expect(vendors.length).toBeGreaterThan(0);
  for (const vendor of vendors) {
    await expectSchema(request, vendor, 'Vendor');
  }
});

test('a vendor without active fails the Vendor check', { tag: '@api' }, async ({ request }) => {
  const response = await request.get('/vendors');
  expect(response.status()).toBe(200);
  const vendors: unknown = await response.json();
  if (!Array.isArray(vendors) || !isRecord(vendors[0])) {
    throw new Error('GET /vendors did not return a vendor object');
  }
  const withoutActive = { ...vendors[0] };
  delete withoutActive.active;
  await expect(expectSchema(request, withoutActive, 'Vendor')).rejects.toThrow();
});

test('an unknown schema name fails', { tag: '@api' }, async ({ request }) => {
  await expect(expectSchema(request, {}, 'NotASchema')).rejects.toThrow();
});
