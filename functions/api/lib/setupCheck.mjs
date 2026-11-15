// Company set-up checklist (Settings → Company). Only what the app already checks or needs; nothing here blocks anything.

const blank = (v) => v == null || String(v).trim() === '';

/** Each item: { key, done, optional?, missing: [...] }; venue rates list the venues and what each lacks. */
export function setupMissing(s, { venues = [], templates = 0, email = 0, signatory = false, sia = false }) {
  const company = [['name', s.company_name], ['email', s.company_email], ['phone', s.company_phone], ['address', s.company_address]].filter(([, v]) => blank(v)).map(([k]) => k);
  const invoice = [['bank', blank(s.bank_account) || blank(s.bank_sort_code) ? '' : 'x'], ['prefix', s.invoice_prefix], ['terms', s.payment_terms_days]].filter(([, v]) => blank(v)).map(([k]) => k);
  const rates = venues
    .map((v) => ({ id: v.id, name: v.name, charge: v.no_rates || (v.charge_roles || []).length > 0, charge_roles: v.charge_roles || [], pay_officers: v.pay_officers || [] }))
    .filter((v) => v.charge || v.pay_officers.length);
  const items = [
    { key: 'company', done: !company.length, missing: company },
    { key: 'invoice', done: !invoice.length, missing: invoice },
    { key: 'rates', done: !rates.length, missing: rates },
    { key: 'signatory', done: !!signatory, missing: [] },
    { key: 'templates', done: templates > 0, missing: [] },
    { key: 'email', done: email > 0, optional: true, missing: [] },
    { key: 'sia', done: !!sia, platform: true, missing: [] },
  ];
  const counted = items.filter((i) => !i.optional && !i.platform);
  return { items, done: counted.filter((i) => i.done).length, total: counted.length, complete: counted.every((i) => i.done) };
}
