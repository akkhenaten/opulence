import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../index.mjs';
import { seal, open, pkce } from '../lib/mail/crypto.mjs';
import { cfg, setCacheForTest } from '../lib/mail/config.mjs';
import { buildMime, encodeWord } from '../lib/mail/mime.mjs';
import { cleanHtml, cleanRecipients, htmlToText, parseAddrList } from '../lib/mail/html.mjs';
import * as google from '../lib/mail/google.mjs';
import * as microsoft from '../lib/mail/microsoft.mjs';
import { canUse } from '../modules/email.mjs';
import { CATALOG, needsTap } from '../lib/orbCatalog.mjs';

test('tokens seal and open; tampering and a missing key fail', () => {
  process.env.EMAIL_TOKEN_KEY = 'test-key-for-email-tokens-only';
  const blob = seal('1//refresh-token');
  assert.ok(!blob.includes('refresh'));
  assert.equal(open(blob), '1//refresh-token');
  const parts = blob.split('.');
  parts[3] = Buffer.from('xxxx').toString('base64url');
  assert.throws(() => open(parts.join('.')));
  delete process.env.EMAIL_TOKEN_KEY;
  const appSecret = process.env.APP_SECRET;
  delete process.env.APP_SECRET;
  assert.throws(() => seal('x'), (e) => e.status === 503);
  process.env.APP_SECRET = 'app-secret-for-tests';
  assert.equal(open(seal('derived')), 'derived');
  if (appSecret === undefined) delete process.env.APP_SECRET; else process.env.APP_SECRET = appSecret;
  const p = pkce();
  assert.ok(p.verifier.length >= 43 && p.challenge !== p.verifier);
});

test('MIME: headers, threading, UTF-8 subject and attachments', () => {
  const raw = buildMime({
    from: { name: 'Ana Ops', email: 'ana@opulence.test' }, to: [{ name: 'Zoë', email: 'z@venue.test' }], cc: [], bcc: [],
    subject: 'Rota – Friday', html: '<p>Hi <b>there</b></p>', inReplyTo: '<abc@mail>', references: '<root@mail>',
    attachments: [{ name: 'rota.pdf', mime: 'application/pdf', bytes: Buffer.from('%PDF-1.4') }],
  }).toString();
  assert.match(raw, /^From: "Ana Ops" <ana@opulence\.test>/m);
  assert.match(raw, /^To: =\?UTF-8\?B\?/m);
  assert.match(raw, new RegExp(`^Subject: ${encodeWord('Rota – Friday').replace(/[?=+/]/g, '\\$&')}`, 'm'));
  assert.match(raw, /^In-Reply-To: <abc@mail>/m);
  assert.match(raw, /^References: <root@mail> <abc@mail>/m);
  assert.match(raw, /multipart\/mixed/);
  assert.match(raw, /filename="rota\.pdf"/);
  assert.ok(raw.includes(Buffer.from('%PDF-1.4').toString('base64')));
  assert.equal(encodeWord('plain'), 'plain');
});

test('HTML cleaning strips scripts, handlers and javascript: links, maps cid images', () => {
  const out = cleanHtml(`<p onclick="x()">Hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><iframe src="//e"></iframe><img src="cid:img1"><form><input></form>`,
    { cid: { img1: 'data:image/png;base64,AAAA' } });
  assert.ok(!/script|onclick|javascript:|iframe|<form|<input/i.test(out), out);
  assert.match(out, /src="data:image\/png;base64,AAAA"/);
  assert.match(out, /target="_blank"/);
  assert.equal(htmlToText('<p>One</p><p>Two &amp; three</p>'), 'One\nTwo & three');
});

test('addresses parse and recipients are checked', () => {
  assert.deepEqual(parseAddrList('"Smith, J" <J@X.com>, b@y.co.uk'), [{ name: 'Smith, J', email: 'j@x.com' }, { name: '', email: 'b@y.co.uk' }]);
  assert.deepEqual(cleanRecipients(['a@b.com', { email: 'A@B.com' }, 'nope', { name: 'C', email: 'c@d.org' }]).map((r) => r.email), ['a@b.com', 'c@d.org']);
});

test('Gmail thread → summary row and payload walking', () => {
  const h = (n, v) => ({ name: n, value: v });
  const t = { id: 't1', messages: [
    { id: 'm1', internalDate: '1700000000000', labelIds: ['INBOX'], snippet: 'Can you cover &amp; confirm', payload: { headers: [h('From', 'Venue <boss@venue.test>'), h('To', 'ops@co.test'), h('Subject', 'Cover Friday')] } },
    { id: 'm2', internalDate: '1700000100000', labelIds: ['SENT', 'UNREAD', 'STARRED'], snippet: 'Yes', payload: { headers: [h('From', 'ops@co.test'), h('To', 'boss@venue.test'), h('Cc', 'x@y.test')] } },
  ] };
  const s = google.summarise(t);
  assert.equal(s.subject, 'Cover Friday');
  assert.equal(s.folder, 'inbox');
  assert.ok(s.unread && s.starred);
  assert.equal(s.from_addr, 'ops@co.test');
  assert.deepEqual(s.addrs.sort(), ['boss@venue.test', 'ops@co.test', 'x@y.test']);
  assert.equal(google.folderOf([{ labelIds: ['SENT'] }]), 'sent');
  assert.equal(google.folderOf([{ labelIds: ['IMPORTANT'] }, { labelIds: ['SENT'] }]), 'archive');
  assert.equal(google.folderOf([{ labelIds: ['TRASH', 'INBOX'] }]), 'trash');

  const b64 = (s) => Buffer.from(s).toString('base64url');
  const w = google.walk({ mimeType: 'multipart/mixed', parts: [
    { mimeType: 'multipart/alternative', parts: [{ mimeType: 'text/plain', body: { data: b64('plain') } }, { mimeType: 'text/html', body: { data: b64('<p>html</p>') } }] },
    { mimeType: 'application/pdf', filename: 'a.pdf', body: { attachmentId: 'att1', size: 10 }, headers: [] },
    { mimeType: 'image/png', filename: 'logo.png', body: { attachmentId: 'att2', size: 5 }, headers: [{ name: 'Content-ID', value: '<logo>' }, { name: 'Content-Disposition', value: 'inline' }] },
  ] });
  assert.equal(w.html, '<p>html</p>');
  assert.equal(w.text, 'plain');
  assert.deepEqual(w.attachments.map((a) => a.name), ['a.pdf']);
  assert.equal(w.inline[0].cid, 'logo');
});

test('Graph conversation → summary row', () => {
  const map = { F_IN: 'inbox', F_SENT: 'sent' };
  const m = (o) => ({ conversationId: 'c1', isRead: true, flag: { flagStatus: 'notFlagged' }, toRecipients: [], ccRecipients: [], ...o });
  const s = microsoft.summarise([
    m({ id: '2', subject: 'RE: Rota', from: { emailAddress: { name: 'Ops', address: 'Ops@co.test' } }, receivedDateTime: '2026-11-02T10:00:00Z', parentFolderId: 'F_SENT', bodyPreview: 'Thanks' }),
    m({ id: '1', subject: 'Rota', from: { emailAddress: { name: 'Client', address: 'c@client.test' } }, toRecipients: [{ emailAddress: { address: 'ops@co.test' } }], receivedDateTime: '2026-11-01T10:00:00Z', parentFolderId: 'F_IN', isRead: false }),
  ], map);
  assert.equal(s.id, 'c1');
  assert.equal(s.subject, 'Rota');
  assert.equal(s.from_addr, 'ops@co.test');
  assert.equal(s.folder, 'inbox');
  assert.ok(s.unread && !s.starred);
  assert.equal(s.count, 2);
  assert.equal(microsoft.folderOf([{ parentFolderId: 'F_SENT' }], map), 'sent');
});

test('mailbox access: owner only for personal, creator or grant for shared', () => {
  const personal = { shared: false, owner_user_id: 'u1', created_by: 'u1' };
  assert.ok(canUse(personal, 'u1'));
  assert.ok(!canUse(personal, 'u2', ['u2']));
  const shared = { shared: true, owner_user_id: null, created_by: 'u1' };
  assert.ok(canUse(shared, 'u1'));
  assert.ok(canUse(shared, 'u2', ['u2']));
  assert.ok(!canUse(shared, 'u3', ['u2']));
});

test('Orb: email reads are in the catalogue, and sending always needs a tap', () => {
  assert.equal(CATALOG['email.search'].tier, 'read');
  assert.equal(CATALOG['email.send'].tier, 'confirm');
  assert.equal(needsTap({ action: 'email.send' }), 'something sent to people');
  assert.ok(!CATALOG['email.connectStart'] && !CATALOG['email.disconnect']);
});

test('provider keys: saved keys switch a provider on, env keys win, Microsoft uses the tenant', () => {
  process.env.EMAIL_TOKEN_KEY = 'test-key-for-email-tokens-only';
  for (const k of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MS_TENANT']) delete process.env[k];
  setCacheForTest([]);
  assert.equal(google.configured(), false);
  assert.equal(microsoft.configured(), false);
  setCacheForTest([
    { provider: 'google', client_id: 'abc.apps.googleusercontent.com', secret_enc: seal('GOCSPX-secret1234'), tenant: null },
    { provider: 'microsoft', client_id: '11111111-2222-3333-4444-555555555555', secret_enc: seal('ms~secret9876'), tenant: 'contoso.onmicrosoft.com' },
  ]);
  assert.equal(google.configured(), true);
  assert.equal(cfg('google').secret_hint, '••••1234');
  assert.equal(cfg('google').from_env, false);
  assert.match(google.authUrl({ state: 's', challenge: 'c', redirect: 'https://x.test/cb' }), /client_id=abc\.apps\.googleusercontent\.com/);
  assert.match(microsoft.authUrl({ state: 's', challenge: 'c', redirect: 'https://x.test/cb' }), /microsoftonline\.com\/contoso\.onmicrosoft\.com\/oauth2/);
  process.env.GOOGLE_CLIENT_ID = 'env.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'env-secret';
  assert.equal(cfg('google').client_id, 'env.apps.googleusercontent.com');
  assert.equal(cfg('google').from_env, true);
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  setCacheForTest([{ provider: 'microsoft', client_id: '11111111-2222-3333-4444-555555555555', secret_enc: seal('x'), tenant: null }]);
  assert.match(microsoft.authUrl({ state: 's', challenge: 'c', redirect: 'https://x.test/cb' }), /microsoftonline\.com\/common\/oauth2/);
  // A secret sealed under another key is treated as not set rather than crashing
  setCacheForTest([{ provider: 'google', client_id: 'abc.apps.googleusercontent.com', secret_enc: 'v1.bad.bad.bad', tenant: null }]);
  assert.equal(google.configured(), false);
  setCacheForTest([]);
});

test('provider keys are never offered to Orb', () => {
  assert.ok(!Object.keys(CATALOG).some((k) => k.startsWith('email.setup')));
});
