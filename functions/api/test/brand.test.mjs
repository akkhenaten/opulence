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

test('Opulence gold is the default, with dark text on it', async () => {
  const { onColor, DEFAULT_COLOR } = await import('../lib/brand.mjs');
  assert.equal(DEFAULT_COLOR, '#C9A45C');
  assert.equal(onColor('#C9A45C'), '#0B0B0C');
  assert.equal(onColor('#0b1220'), '#ffffff');
});

test('the brand colour is darkened for text on white paper', async () => {
  const { inkColor } = await import('../lib/brand.mjs');
  const lum = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
  const ink = inkColor('#C9A45C');
  assert.ok(1.05 / (lum(ink) + 0.05) >= 4.5, ink);
  assert.equal(inkColor('#0b1220'), '#0b1220');
});
