import { hmac } from './auth.mjs';

export const qrPayload = (venue) => {
  const base = `ORB1.${venue.id}.${venue.qr_version}`;
  return `${base}.${hmac(base, 'qr').slice(0, 16)}`;
};

export function parseQr(text) {
  const parts = String(text || '').trim().split('.');
  if (parts.length !== 4 || parts[0] !== 'ORB1') return null;
  const [, venueId, version, sig] = parts;
  const base = `ORB1.${venueId}.${version}`;
  if (hmac(base, 'qr').slice(0, 16) !== sig) return null;
  return { venueId, version: Number(version) };
}
