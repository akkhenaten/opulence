// Single POST endpoint: { action, ...fields }. Token lives in localStorage.
export const API_BASE = import.meta.env.VITE_API_BASE || 'https://6ij75kpgf7kiwtvwo3nke763dm0oejxo.lambda-url.eu-central-1.on.aws/';
const KEY = 'orb.token';
import { viewFiles } from './ui/FileViewer.jsx';

export const getToken = () => localStorage.getItem(KEY);
export const setToken = (t) => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY));

// A manager who also works shifts is on the "Manager" or "My shifts" side; the server ignores it for everyone else
const SIDE = 'orb.side';
export const getSide = () => (localStorage.getItem(SIDE) === 'officer' ? 'officer' : 'manager');
export const setSide = (s) => (s === 'officer' ? localStorage.setItem(SIDE, s) : localStorage.removeItem(SIDE));

// A page that needs sign-in first (an NFC tag tap) comes back here after login
const AFTER = 'orb.afterLogin';
export const setAfterLogin = (path) => sessionStorage.setItem(AFTER, path);
export const takeAfterLogin = () => { const p = sessionStorage.getItem(AFTER); sessionStorage.removeItem(AFTER); return p; };

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
      body: JSON.stringify({ action, ...body, ...(getSide() === 'officer' ? { _as: 'officer' } : {}) }),
    });
  } catch {
    throw new ApiError('No connection. Check your signal and try again.', 0);
  }
  // The CDN answers an API 404 with the app's index.html (status 200), so a non-JSON reply means "not found"
  if (!(res.headers.get('content-type') || '').includes('json')) throw new ApiError('Not found', 404);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    setToken(null);
    setSide(null);
    window.dispatchEvent(new Event('orb:signed-out'));
  }
  if (!res.ok) throw new ApiError(data.error || 'Something went wrong', res.status, data);
  // A shift change tidies alerts and Orb cards on the server, so the bell and Live catch up straight away
  if (SHIFT_CHANGES.test(action)) {
    window.dispatchEvent(new Event('orb:ops'));
    window.dispatchEvent(new Event('orb:notify'));
  }
  return data;
}

const SHIFT_CHANGES = /^(shifts\.(assign|reassign|unassign|save|cancel|delete|publish|respond|request|decideRequest|bulkCreate|copyWeek)|cover\.(accept|cancel|create|decideChange|decline|update)|offboarding\.(save|rehire)|ops\.(decide|offerRespond|reply))$/;

// Upload a file to private storage: returns the stored key (docs/...). purpose: officer|venue|incident|photo|company
export async function upload(file, purpose = 'officer') {
  const { url, key } = await api('files.uploadUrl', { purpose, filename: file.name, content_type: file.type || 'application/octet-stream' });
  const r = await fetch(url, { method: 'PUT', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file });
  if (!r.ok) throw new ApiError('Upload failed', r.status);
  return key;
}

// Upload from the public Apply page (no login): kind cv|sia_front|sia_back; returns the stored key
export async function publicUpload(file, kind) {
  const type = file.type || 'application/octet-stream';
  const { url, key } = await api('apply.uploadUrl', { kind, filename: file.name, content_type: type });
  const r = await fetch(url, { method: 'PUT', headers: { 'content-type': type }, body: file });
  if (!r.ok) throw new ApiError('Upload failed — please try again', r.status);
  return key;
}

// Upload from the public Staff details form (no login): kind sia_front|rtw|poa|photo; returns the stored key
export async function staffFormUpload(file, kind, token) {
  const type = file.type || 'application/octet-stream';
  const { url, key } = await api('staffSetup.uploadUrl', { token, kind, filename: file.name, content_type: type });
  const r = await fetch(url, { method: 'PUT', headers: { 'content-type': type }, body: file });
  if (!r.ok) throw new ApiError('Upload failed — please try again', r.status);
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
  // Files open in the in-app viewer (it has its own Download); spreadsheets download straight away
  if (d.pdf) {
    const bytes = Uint8Array.from(atob(d.pdf), (c) => c.charCodeAt(0));
    viewFiles([{ url: URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), mime: 'application/pdf', name: d.filename }]);
  } else if (d.csv != null) downloadText(d.filename, d.csv);
  else if (d.url) viewFiles([{ url: d.url, mime: d.mime, name: d.name || d.filename }]);
  return d;
}
