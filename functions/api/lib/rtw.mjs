// Right to work: the share code an officer gets from GOV.UK, and what a GOV.UK check page says.
// The Home Office has no employer API, so the check itself is done by a manager on GOV.UK and its page saved here.

export const GOV_CHECK_URL = 'https://www.gov.uk/view-right-to-work';
export const GOV_PROVE_URL = 'https://www.gov.uk/prove-right-to-work';
// A share code stops working after 90 days; past this many days, ask for a new one
export const SHARE_CODE_DAYS = 90;
export const SHARE_CODE_OLD = 80;

/** A right to work share code as 'W12 345 678', or null. 9 letters/digits starting with W. */
export function cleanShareCode(s) {
  const c = String(s ?? '').toUpperCase().replace(/[\s-]+/g, '');
  return /^W[A-Z0-9]{8}$/.test(c) ? `${c.slice(0, 3)} ${c.slice(3, 6)} ${c.slice(6)}` : null;
}
export const isShareCode = (s) => cleanShareCode(s) !== null;

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());

/** What the AI read off a GOV.UK check page, made safe to pre-fill the form with */
export function rtwResultOf(r) {
  if (!r || typeof r !== 'object') return { permission: 'unknown', concerns: [] };
  const permission = ['unlimited', 'time_limited'].includes(r.permission) ? r.permission : 'unknown';
  return {
    readable: r.readable !== false,
    is_gov_check: r.is_gov_check === true,
    name: String(r.name || '').trim().slice(0, 120),
    permission,
    expiry: permission === 'time_limited' && isDate(r.expiry) ? r.expiry : '',
    reference: String(r.reference || '').trim().slice(0, 40),
    check_date: isDate(r.check_date) ? r.check_date : '',
    concerns: Array.isArray(r.concerns) ? r.concerns.map(String).slice(0, 5) : [],
  };
}

export const RTW_CHECK_TOOL = {
  name: 'read_rtw_check',
  description: "What a saved GOV.UK 'right to work' check page shows",
  input_schema: {
    type: 'object',
    properties: {
      readable: { type: 'boolean', description: 'False if the file cannot be read' },
      is_gov_check: { type: 'boolean', description: "True only if this is the GOV.UK / Home Office employer right to work profile page (not a share code letter, not a passport)" },
      name: { type: 'string', description: 'Full name of the person as shown' },
      permission: { type: 'string', enum: ['unlimited', 'time_limited', 'unknown'], description: 'unlimited when it says they can work with no time limit; time_limited when permission ends on a date' },
      expiry: { type: 'string', description: 'Date permission to work ends, YYYY-MM-DD; empty if no time limit' },
      reference: { type: 'string', description: 'Reference number on the page, if any' },
      check_date: { type: 'string', description: 'Date the check was made, YYYY-MM-DD, if shown' },
      concerns: { type: 'array', items: { type: 'string' }, description: 'Only real problems: work restrictions (e.g. limited hours, only certain jobs), not a GOV.UK page, details obscured. Empty when fine.' },
    },
    required: ['readable', 'is_gov_check', 'permission', 'concerns'],
  },
};
