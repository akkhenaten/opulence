// "Waiting for you" under the bell: to-dos counted live from the work itself, so they clear only when it is done
const s = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** counts: null means that count couldn't be read (left out, never shown as nothing). */
export function waitingItems(role, c = {}) {
  const rows = role === 'officer' ? [
    ['answer', c.answer, (n) => `${s(n, 'shift')} waiting for your answer`, '/officer#todo'],
    ['resign', c.reports, (n) => `${s(n, 'incident report')} to sign`, '/officer/incidents?to_sign=1'],
  ] : role === 'venue' ? [
    ['timesheets', c.timesheets, (n) => `${s(n, 'timesheet')} to sign`, '/venue/timesheets?show=review'],
    ['reports', c.reports, (n) => `${s(n, 'incident report')} to sign`, '/venue/incidents?to_sign=1'],
    ['invoices', c.invoices, (n) => `${s(n, 'invoice')} to pay`, '/venue/invoices'],
  ] : [
    ['decisions', c.decisions, (n) => `${s(n, 'decision')} waiting in Needs you`, '/company#needs'],
    ['reports', c.reports, (n) => `${s(n, 'incident report')} to sign`, '/company/incidents?to_sign=1'],
  ];
  return {
    items: rows.filter(([, n]) => n > 0).map(([key, n, title, link]) => ({ key, count: n, title: title(n), link })),
    failed: rows.some(([, n]) => n == null),
  };
}
