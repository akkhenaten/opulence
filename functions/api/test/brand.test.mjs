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

test('emails come from the company name and reply to the company email', async () => {
  const { senderOf } = await import('../lib/brand.mjs');
  assert.deepEqual(senderOf({ company_name: 'Opulence Security', company_email: ' info@opulence.co.uk ' }), { fromName: 'Opulence Security', replyTo: 'info@opulence.co.uk' });
  assert.deepEqual(senderOf({ company_name: 'Acme', company_email: 'not an email' }), { fromName: 'Acme' });
  assert.deepEqual(senderOf(null), { fromName: 'Orb Security' });
  assert.equal(senderOf({ company_name: 'Bad\r\nBcc: x@y.z "<a>"' }).fromName.includes('\n'), false);
});

test('the email footer lists the company details in order', async () => {
  const { footerOf } = await import('../lib/brand.mjs');
  const f = footerOf({ company_name: 'Opulence Security', company_address: '1 High St\n\nEdinburgh\r\nEH1 1AA', company_phone: '0131 555 0100',
    company_email: 'office@opulence.co.uk', company_number: 'SC123456', vat_number: 'GB123' });
  assert.equal(f.name, 'Opulence Security');
  assert.equal(f.address, '1 High St, Edinburgh, EH1 1AA');
  assert.equal(f.phone, '0131 555 0100');
  assert.equal(f.email, 'office@opulence.co.uk');
  assert.deepEqual(f.reg, ['Company no. SC123456', 'VAT GB123']);
});

test('blank or invalid footer details are left out, with no stray separators', async () => {
  const { footerOf, footerHtml } = await import('../lib/brand.mjs');
  const f = footerOf({ company_name: 'Acme', company_address: 'Leith', company_email: 'not an email' });
  assert.equal(f.email, '');
  assert.deepEqual(f.reg, []);
  const html = footerHtml(f);
  assert.ok(!html.includes('·'), html);
  assert.ok(!html.includes('mailto:'));
  assert.ok(html.includes('Leith'));
});

test('the footer HTML is escaped and marked, with phone and email links', async () => {
  const { footerOf, footerHtml } = await import('../lib/brand.mjs');
  const f = footerOf({ company_name: 'A & <B>', company_phone: '+44 131 555', company_email: 'a@b.co' });
  const html = footerHtml(f);
  assert.ok(html.includes('data-co-footer'));
  assert.ok(html.includes('A &amp; &lt;B&gt;'));
  assert.ok(html.includes('href="tel:+44131555"'));
  assert.ok(html.includes('href="mailto:a@b.co"'));
  assert.ok(!html.includes('<img'));
  assert.ok(!footerHtml(f, { logo: true }).includes('<img'));
  assert.ok(footerHtml({ ...f, logo_url: 'https://x/logo.png' }, { logo: true }).includes('<img src="https://x/logo.png"'));
});
