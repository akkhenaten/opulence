import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { renderSigned, fingerprintOf, device } from '../lib/signdoc.mjs';
import { parse } from '../lib/docmarkup.mjs';

const long = Array.from({ length: 14 }, (_, i) => `# Section ${i + 1}\n${'The Contractor agrees to the terms set out here. '.repeat(8)}\n\n- a point\n- another point`).join('\n\n');
const doc = (body = long) => ({ kind: 'contract', typeLabel: 'Contract', title: 'Agreement', reference: 'ORB-C-2026-0001', issuedAt: new Date('2026-11-01T10:00:00Z'), version: 2, officerName: 'Zoë Ščerbaková Жуков', blocks: parse(body) });
const at = new Date('2026-11-02T10:00:00Z');
const signers = { company: { name: 'Jane Doe', title: 'Manager', png: 'data:image/png;base64,AAAA', at }, officer: { name: 'Zoë Ščerbaková', png: 'data:image/png;base64,BBBB', at } };

test('a long signed document runs over several pages and ends with the certificate', async () => {
  const { bytes } = await renderSigned({ company: { company_name: 'Orb Security Ltd' }, doc: doc(), signers: { company: null, officer: null }, status: 'sent', verifyUrl: 'https://x.test/app/verify/ORB-C-2026-0001' });
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() >= 3);
  assert.equal(pdf.getTitle(), 'Agreement');
  assert.match(pdf.getKeywords() || '', /[0-9a-f]{64}/);
});

test('the fingerprint is stable and changes with the wording or a signature', () => {
  const a = fingerprintOf({ reference: 'R', title: 'T', blocks: parse(long), signers });
  assert.equal(a, fingerprintOf({ reference: 'R', title: 'T', blocks: parse(long), signers }));
  assert.notEqual(a, fingerprintOf({ reference: 'R', title: 'T', blocks: parse(`${long} changed`), signers }));
  assert.notEqual(a, fingerprintOf({ reference: 'R', title: 'T', blocks: parse(long), signers: { ...signers, officer: { ...signers.officer, png: 'data:image/png;base64,CCCC' } } }));
});

test('devices are named in plain words', () => {
  assert.equal(device('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605 Version/17.0 Mobile/15E148 Safari/604.1'), 'iPhone · Safari');
  assert.equal(device('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'), 'Android · Chrome');
  assert.equal(device(''), '');
});
