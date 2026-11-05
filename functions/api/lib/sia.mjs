// SIA register checks: statuses, the 16-digit number and the date formats the register search expects.
export const SIA_REGISTER_URL = 'https://rolh.services.sia.homeoffice.gov.uk/';
export const CHECK_STATUSES = ['active', 'expired', 'suspended', 'revoked', 'investigation', 'not_found'];
export const NOT_CLEARED = ['expired', 'suspended', 'revoked', 'investigation', 'not_found'];
export const STATUS_LABEL = {
  pending: 'Not checked', active: 'Active', expired: 'Expired', suspended: 'Suspended', revoked: 'Revoked',
  investigation: 'Under investigation', not_found: 'Not found',
};
export const RECHECK_DAYS = 90;

export const cleanSia = (n) => String(n || '').replace(/\D/g, '');
export const validSia = (n) => /^\d{16}$/.test(cleanSia(n));
export const siaGroups = (n) => cleanSia(n).replace(/(\d{4})(?=\d)/g, '$1-');

// 'YYYY-MM-DD' → 'DD/MM/YYYY' (the register's date of birth format)
export const ukDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};
export const maskDob = (iso) => {
  const m = /^(\d{4})-/.exec(String(iso || ''));
  return m ? `••/••/${m[1]}` : '';
};

// Days since the last register check, null when never checked
export const daysSinceCheck = (at, today) => (at ? Math.floor((new Date(today) - new Date(String(at).slice(0, 10))) / 86400000) : null);
export const checkDue = (o, today) => {
  const d = daysSinceCheck(o.sia_last_verified_at, today);
  return d === null || d > RECHECK_DAYS;
};
