// Automatic SIA register lookups through SIA Checker (siachecker.co.uk), a paid service that reads the public
// register for us. Off until SIACHECKER_API_KEY is set; nothing is saved here — a manager confirms the result.
const URL = 'https://api.siachecker.co.uk/v1/licences/verify';
const PENDING_RETRIES = 3;

export const autoCheckEnabled = () => !!process.env.SIACHECKER_API_KEY;

// Register wording → our check statuses (null = let the manager pick)
export function mapStatus(s) {
  const t = String(s || '').toLowerCase();
  if (!t) return null;
  if (t.includes('investigation')) return 'investigation';
  for (const k of ['active', 'expired', 'suspended', 'revoked']) if (t.includes(k)) return k;
  return null;
}

// Register sector → SIA_TYPES (lib/licences.mjs)
export function mapSector(s) {
  const t = String(s || '').toLowerCase();
  if (!t) return null;
  if (t.includes('door')) return 'Door Supervisor';
  if (t.includes('guard')) return 'Security Guarding';
  if (t.includes('cctv') || t.includes('public space')) return 'CCTV (Public Space Surveillance)';
  if (t.includes('close protection')) return 'Close Protection';
  if (t.includes('cash') || t.includes('valuables')) return 'Cash and Valuables in Transit';
  if (t.includes('key hold')) return 'Key Holding';
  if (t.includes('vehicle') || t.includes('immobilis')) return 'Vehicle Immobilising';
  return null;
}

const MESSAGES = {
  not_found: 'No licence with this number on the SIA register.',
  pending: 'The SIA register is slow to answer. Try again in a moment.',
  unavailable: "The SIA register isn't answering right now. Try again later or check on the SIA website.",
  quota: 'This month\'s automatic check allowance is used up. Upgrade the SIA Checker plan or check on the SIA website.',
  bad_key: 'The SIA Checker key was refused. Ask an admin to update it.',
  error: "Couldn't check the register automatically. Try again or check on the SIA website.",
};

// HTTP status + SIA Checker JSON → one shape the app understands
export function mapResult(http, body) {
  const b = body || {};
  if (http === 200 && b.status === 'FOUND' && b.licence) {
    const l = b.licence;
    return {
      outcome: 'found', status: mapStatus(l.status), register_status: l.status || null,
      expiry: /^\d{4}-\d{2}-\d{2}$/.test(l.expiryDate || '') ? l.expiryDate : null,
      sector: mapSector(l.licenceSector || l.licenceType), register_sector: l.licenceSector || l.licenceType || null,
      role: l.role || null, first_name: l.firstName || null, surname: l.surname || null, message: null,
    };
  }
  const outcome = http === 202 || b.status === 'PENDING' ? 'pending'
    : http === 404 || b.status === 'NOT_FOUND' ? 'not_found'
    : http === 429 ? 'quota'
    : http === 401 || http === 403 ? 'bad_key'
    : http === 502 || http === 503 || http === 504 ? 'unavailable'
    : 'error';
  return { outcome, status: outcome === 'not_found' ? 'not_found' : null, message: MESSAGES[outcome] };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function lookupLicence(number) {
  for (let i = 0; ; i++) {
    let res;
    try {
      res = await fetch(URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.SIACHECKER_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenceNumber: number }),
        signal: AbortSignal.timeout(8000),
      });
    } catch (e) {
      console.error('[siaChecker]', e.message);
      return mapResult(503, null);
    }
    const r = mapResult(res.status, await res.json().catch(() => null));
    if (r.outcome !== 'pending' || i >= PENDING_RETRIES) return r;
    await wait(1500);
  }
}
