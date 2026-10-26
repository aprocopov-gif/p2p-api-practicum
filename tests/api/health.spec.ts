import { test, expect } from '@playwright/test';
import { expectSchema } from './helpers/schema';

test('HLT-GET-01 GET /health returns ok', { tag: '@api' }, async ({ request }) => {
  const response = await request.get('/health');
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Health');
  expect(body).toEqual({ status: 'ok' });
});

test('HLT-GET-E01 GET unknown health subpath returns 404', { tag: '@api' }, async ({ request }) => {
  const response = await request.get('/health/extra');
  expect(response.status()).toBe(404);
  const body: unknown = await response.json();
  await expectSchema(request, body, 'Error');
});
