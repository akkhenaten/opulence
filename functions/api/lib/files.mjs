import { fail } from './http.mjs';
import { downloadUrl, headObject } from './storage.mjs';

/** Checks files the user just uploaded under docs/<folder>/<their id>/ and keeps only key, name and type. */
export async function cleanFiles(user, list, folder, max = 6) {
  const out = [];
  for (const a of (Array.isArray(list) ? list : []).slice(0, max)) {
    if (a.key && out.some((o) => o.key === a.key)) continue;
    if (!String(a.key || '').startsWith(`docs/${folder}/${user.id.slice(0, 8)}/`)) fail(400, 'Upload the file first');
    const h = await headObject(a.key);
    if (!h) fail(400, 'Upload the file first');
    if (h.size > 15 * 1024 * 1024) fail(400, 'Files must be under 15 MB');
    out.push({ key: a.key, name: String(a.name || 'file').slice(0, 120), mime: h.mime || a.mime || '' });
  }
  return out;
}

export const signFiles = (list) => Promise.all((list || []).map(async (a) => ({ name: a.name, mime: a.mime, url: await downloadUrl(a.key, a.name) })));
