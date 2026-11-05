// SIA register checks (same rules as functions/api/lib/sia.mjs)
export const SIA_REGISTER = 'https://rolh.services.sia.homeoffice.gov.uk/';
export const SIA_REGISTER_GOVUK = 'https://www.gov.uk/check-a-private-security-licence';
export const CHECK_STATUSES = [
  { value: 'active', label: 'Active' }, { value: 'expired', label: 'Expired' }, { value: 'suspended', label: 'Suspended' },
  { value: 'revoked', label: 'Revoked' }, { value: 'investigation', label: 'Under investigation' }, { value: 'not_found', label: 'Not found on the register' },
];
export const STATUS_LABEL = { pending: 'Not checked', ...Object.fromEntries(CHECK_STATUSES.map((s) => [s.value, s.label])) };
export const NOT_CLEARED = ['expired', 'suspended', 'revoked', 'investigation', 'not_found'];
export const RECHECK_DAYS = 90;
// Register checks are switched off for now (backend: SIA_CHECK=on); the licence details stay
export const SIA_CHECK_ON = false;

export const cleanSia = (n) => String(n || '').replace(/\D/g, '');
export const validSia = (n) => /^\d{16}$/.test(cleanSia(n));
export const daysSince = (at) => (at ? Math.floor((Date.now() - new Date(at)) / 86400000) : null);

// Pill tone and label for the latest register check
export function checkState(status, at) {
  if (NOT_CLEARED.includes(status)) return { tone: 'red', label: `Register: ${STATUS_LABEL[status]}` };
  if (status !== 'active' || !at) return { tone: 'grey', label: 'Register not checked' };
  return daysSince(at) > RECHECK_DAYS ? { tone: 'amber', label: 'Register check due' } : { tone: 'green', label: 'Register: Active' };
}
