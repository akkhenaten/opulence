import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brandOf } from '../lib/brand.mjs';

test('the app style defaults to Classic', () => {
  assert.equal(brandOf({}).style, 'classic');
  assert.equal(brandOf(null).style, 'classic');
});

test('the company app style is passed through with the brand', () => {
  const b = brandOf({ company_name: 'Acme', brand_color: '#123456', ui_style: 'control' });
  assert.deepEqual(b, { name: 'Acme', logo_url: null, color: '#123456', style: 'control' });
});
