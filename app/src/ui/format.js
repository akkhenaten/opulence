// Display helpers. All times shown in UK local time.
const TZ = 'Europe/London';
const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const gbp0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

export const money = (n) => gbp.format(Number(n || 0));
export const money0 = (n) => gbp0.format(Number(n || 0));
export const hours = (n) => `${Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: 2 })}h`;

const fmt = (opts) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts });
const asDate = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00Z`) : new Date(d));

export const time = (d) => (d ? fmt({ hour: '2-digit', minute: '2-digit', hour12: false }).format(asDate(d)) : '');
export const date = (d) => (d ? fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(asDate(d)) : '');
export const dateShort = (d) => (d ? fmt({ day: 'numeric', month: 'short' }).format(asDate(d)) : '');
export const weekday = (d) => (d ? fmt({ weekday: 'short' }).format(asDate(d)) : '');
export const dayLabel = (d) => (d ? fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(asDate(d)) : '');
export const dateTime = (d) => (d ? `${dayLabel(d)}, ${time(d)}` : '');
export const range = (a, b) => `${time(a)}–${time(b)}`;

// YYYY-MM-DD in London for a Date
export const isoDate = (d = new Date()) => fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(asDate(d)).split('/').reverse().join('-');
export const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const mondayOf = (iso = isoDate()) => addDays(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7));

// datetime-local <-> ISO, in the browser's zone (UK users)
// "Onyeka Goddey" + goes by "Goddey" reads as the name alone; a different name is added after it
export const withGoesBy = (name, gb) => (gb && !String(name || '').toLowerCase().includes(gb.toLowerCase()) ? `${name} · “${gb}”` : name || '');
// Does a search term match someone's name or the name they go by?
export const nameMatches = (p, term) => !term || `${p.name || ''} ${p.goes_by || ''}`.toLowerCase().includes(term.toLowerCase());
export const toLocalInput = (d) => { if (!d) return ''; const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
export const fromLocalInput = (s) => (s ? new Date(s).toISOString() : null);

export const relative = (d) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return dateShort(d);
};
export const daysUntil = (iso) => (iso ? Math.round((new Date(`${iso}T12:00:00Z`) - new Date(`${isoDate()}T12:00:00Z`)) / 86400000) : null);
export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
export const titleCase = (s = '') => String(s).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
