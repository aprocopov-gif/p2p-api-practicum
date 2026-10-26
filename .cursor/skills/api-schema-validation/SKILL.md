---
name: api-schema-validation
description: Checks that API responses match the shapes in /openapi.json, through one helper, expectSchema. Use when writing or reviewing an API test, when the user asks to validate a response, check a schema, a contract, field types or required fields, or when a response has a field nobody expected. Do NOT use to decide which cases to test — that is api-test-design.
paths: "tests/**"
---

# API schema validation

Import `expectSchema` from `tests/api/helpers/schema.ts`.

## Helper (`tests/api/helpers/schema.ts`)

- Loads `GET /openapi.json` once per worker through Playwright's `request` and adds it to Ajv: `new Ajv({ strict: false, allErrors: true })`, `addSchema(doc, 'openapi')`. Strict mode is off because OpenAPI adds keywords such as `example` that aren't JSON Schema.
- `export async function expectSchema(request, body, name)`: looks up `openapi#/components/schemas/<name>`; fails clearly if that schema doesn't exist; fails listing Ajv's errors (path and message) if the body doesn't match. No `any` type.

When the response schema is an array, the `$ref` is on `items`. Call `expectSchema` once per element with that component name.

```typescript
const body: unknown = await response.json();
await expectSchema(request, body, 'Error');
```

## Steps

1. Find the schema name in /openapi.json (the response's $ref under paths → responses); never guess it. Rejected requests use Error.
2. Call expectSchema on every response body, success and error.
3. A schema check proves the shape, not the business: still assert the values that matter (status, rule, amounts, flags).
4. When a check fails, show the Ajv errors and ask the human whether the API or the docs are wrong. Never edit the schema or loosen the check to make it pass.

## Proof tests

`tests/api/schema.spec.ts` — each test uses `{ tag: '@api' }`: every vendor from `GET /vendors` matches `Vendor`; a vendor without `active` fails the check (`expect(...).rejects.toThrow()`); an unknown schema name fails too. Run `npm run test:api`.
