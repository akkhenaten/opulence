// CSV for spreadsheet exports: every cell quoted, so commas, quotes and line breaks survive Excel and Sheets

export const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/**
 * rows → CSV text. columns: [{ h: 'Header', v: (row) => value, pay?: true }]
 * Pay columns are left out unless `pay` is true (company managers, or security with pay access).
 */
export function toCsv(rows, columns, { pay = false } = {}) {
  const cols = columns.filter((c) => pay || !c.pay);
  return [cols.map((c) => csvCell(c.h)).join(','), ...(rows || []).map((r) => cols.map((c) => csvCell(c.v(r))).join(','))].join('\n');
}

/** Which columns a user may export: pay only with pay access; venue logins never get officer contact or pay columns */
export function columnsFor(columns, user, canSeePay) {
  return columns.filter((c) => (!c.pay || canSeePay(user)) && (!c.officer || user.role !== 'venue'));
}
