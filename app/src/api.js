// Single POST endpoint: { action, ...fields }. Token lives in localStorage.
export const API_BASE = import.meta.env.VITE_API_BASE || 'https://hopedp5cvxdkhhpb47hfxszhwq0aqtnw.lambda-url.eu-central-1.on.aws/';
const KEY = 'orb.token';

export const getToken = () => localStorage.getItem(KEY);
export const setToken = (t) => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY));

export class ApiError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data; }
}

export async function api(action, body = {}) {
  const token = getToken();
  let res;
  try {
    res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ action, ...body }),
    });
  } catch {
    throw new ApiError('No connection. Check your signal and try again.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    setToken(null);
    window.dispatchEvent(new Event('orb:signed-out'));
  }
  if (!res.ok) throw new ApiError(data.error || 'Something went wrong', res.status, data);
  return data;
}

// Upload a file to private storage: returns the stored key (docs/...). purpose: officer|venue|incident|photo|company
export async function upload(file, purpose = 'officer') {
  const { url, key } = await api('files.uploadUrl', { purpose, filename: file.name, content_type: file.type || 'application/octet-stream' });
  const r = await fetch(url, { method: 'PUT', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file });
  if (!r.ok) throw new ApiError('Upload failed', r.status);
  return key;
}

// Actions returning { filename, pdf (base64) } or { filename, csv }
export function downloadBase64(filename, b64, type = 'application/pdf') {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  saveBlob(filename, new Blob([bytes], { type }));
}
export function downloadText(filename, text, type = 'text/csv') { saveBlob(filename, new Blob([text], { type })); }
function saveBlob(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
export async function downloadAction(action, body) {
  const d = await api(action, body);
  if (d.pdf) downloadBase64(d.filename, d.pdf);
  else if (d.csv != null) downloadText(d.filename, d.csv);
  else if (d.url) window.open(d.url, '_blank', 'noopener');
  return d;
}
