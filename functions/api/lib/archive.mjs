// Saved copies of issued PDFs (invoices, credit notes, pay statements) — system documents that cannot be deleted
import crypto from 'node:crypto';
import { insert, one } from './db.mjs';
import { putObject, getObjectBytes } from './storage.mjs';

const keySafe = (s) => String(s || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
// Filenames keep spaces and dashes; only characters that break downloads are removed
export const nameSafe = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();

export const longDate = (d) => new Date(typeof d === 'string' && d.length === 10 ? `${d}T12:00:00Z` : d || Date.now())
  .toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' });

/** Store the PDF and add a system document row. Returns the document. */
export async function archivePdf({ ownerType, ownerId, kind, filename, bytes, title, number = '', userId = null }) {
  const name = nameSafe(filename);
  const key = `docs/archive/${kind}/${crypto.randomUUID()}-${keySafe(name)}`;
  await putObject(key, Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, 'base64'), 'application/pdf');
  return insert('documents', {
    owner_type: ownerType, owner_id: ownerId, kind, title: title || name, number, s3_key: key, mime: 'application/pdf',
    uploaded_by: userId, system: true,
  });
}

/** The saved copy as { filename, pdf } (base64), or null. */
export async function savedPdf(documentId) {
  if (!documentId) return null;
  const d = await one('SELECT title, s3_key FROM documents WHERE id = $1', [documentId]);
  if (!d?.s3_key) return null;
  try {
    return { filename: d.title, pdf: (await getObjectBytes(d.s3_key)).toString('base64'), saved: true };
  } catch (e) {
    console.error('[archive] missing saved copy', documentId, e.message);
    return null;
  }
}
