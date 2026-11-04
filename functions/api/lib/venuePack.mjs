// Venue packs: which published documents make up a venue's pack, and whether an officer's signature still covers it.
import { q } from './db.mjs';

export const REFRESHER_DAYS = 183;
const DAY = 86400000;

/**
 * pack: [{ procedure_id, version, resign_versions: [versions published as a real change] }]
 * signing: the officer's latest signing for the venue { signed_at, items: [{ procedure_id, version }] } or null
 * lastShiftAt: end of the officer's last shift at the venue (null = none)
 * → { status: 'none'|'current'|'resign'|'refresher'|'unsigned', toRead: [procedure ids] }
 */
export function packStatus({ pack, signing, lastShiftAt = null, now = new Date() }) {
  if (!pack?.length) return { status: 'none', toRead: [] };
  const all = pack.map((d) => d.procedure_id);
  if (!signing) return { status: 'unsigned', toRead: all };
  const signedAt = new Date(signing.signed_at);
  const last = lastShiftAt && new Date(lastShiftAt) > signedAt ? new Date(lastShiftAt) : signedAt;
  if (new Date(now) - last > REFRESHER_DAYS * DAY) return { status: 'refresher', toRead: all };
  const signed = new Map((signing.items || []).map((i) => [i.procedure_id, Number(i.version)]));
  const toRead = pack.filter((d) => {
    const v = signed.get(d.procedure_id);
    if (v == null) return true; // added since they signed
    return (d.resign_versions || []).some((r) => Number(r) > v && Number(r) <= Number(d.version));
  }).map((d) => d.procedure_id);
  return toRead.length ? { status: 'resign', toRead } : { status: 'current', toRead: [] };
}

export const OK = new Set(['none', 'current']);
export const STATUS_LABEL = { none: 'No pack', current: 'Current', resign: 'Needs re-sign', refresher: 'Refresher due', unsigned: 'Not signed' };

/** Live board view of a pack status: 'none' | 'signed' | 'unsigned' | 'resign' (refresher counts as re-sign). */
export const livePack = (status) => ({ current: 'signed', resign: 'resign', refresher: 'resign', unsigned: 'unsigned' }[status] || 'none');

/** Venue clients only see signed or not: a re-sign reads as not signed yet. */
export const venuePack = (pack) => (pack === 'resign' ? 'unsigned' : pack);

/** Ops AI pre-shift check, in order. Offsets are minutes from shift start (negative = before). */
export const PACK_STEPS = ['chase1', 'chase2', 'escalate', 'cover'];

/**
 * Which pack-check steps are due and not done yet. When both chases are due at once
 * (a late booking, a slow run) only the later message is worth sending.
 * → { due: [steps to record], chase: 'chase1'|'chase2'|null, escalate, cover }
 */
export function packDue({ startsAt, now = new Date(), offsets, done = {} }) {
  const mins = (new Date(now) - new Date(startsAt)) / 60000;
  const due = PACK_STEPS.filter((k) => !done[k] && mins >= Number(offsets[k]));
  return { due, chase: ['chase2', 'chase1'].find((k) => due.includes(k)) || null, escalate: due.includes('escalate'), cover: due.includes('cover') };
}

/** Published packs for many venues at once: Map venueId → ordered documents (instructions first). */
export async function packsFor(venueIds, { body = false } = {}) {
  const ids = [...new Set(venueIds.filter(Boolean))];
  const out = new Map(ids.map((id) => [id, []]));
  if (!ids.length) return out;
  const rows = await q(
    `SELECT v.vid AS venue_id, p.id AS procedure_id, p.kind, p.scope, p.current_version AS version, pv.title, pv.published_at,
            COALESCE(pvn.position, 1000) AS position${body ? ', pv.body' : ''},
            COALESCE((SELECT array_agg(x.version) FROM procedure_versions x WHERE x.procedure_id = p.id AND x.requires_resign), '{}') AS resign_versions
       FROM unnest($1::uuid[]) AS v(vid)
       JOIN procedures p ON p.status = 'published' AND p.current_version > 0 AND (p.venue_id = v.vid OR p.scope = 'general')
       JOIN procedure_versions pv ON pv.procedure_id = p.id AND pv.version = p.current_version
       LEFT JOIN procedure_venues pvn ON pvn.procedure_id = p.id AND pvn.venue_id = v.vid
      WHERE p.scope = 'venue' OR (NOT COALESCE(pvn.excluded, false) AND (p.applies_all OR pvn.venue_id IS NOT NULL))
      ORDER BY v.vid, (p.kind = 'instructions') DESC, position, (p.scope = 'venue'), pv.title`, [ids]);
  for (const r of rows) out.get(r.venue_id).push(r);
  return out;
}

export const packFor = async (venueId, opts) => (await packsFor([venueId], opts)).get(venueId) || [];

const key = (o, v) => `${o}:${v}`;

/** Status for many officer/venue pairs: Map "officer:venue" → { status, toRead, signing }. */
export async function statusesFor(pairs, { packs = null, now = new Date() } = {}) {
  const out = new Map();
  if (!pairs.length) return out;
  const officers = [...new Set(pairs.map((p) => p.officer_id))];
  const venues = [...new Set(pairs.map((p) => p.venue_id))];
  const [pk, signings, shifts] = await Promise.all([
    packs || packsFor(venues),
    q(`SELECT DISTINCT ON (officer_id, venue_id) id, officer_id, venue_id, signed_at, items, reference, pdf_document_id
         FROM pack_signings WHERE officer_id = ANY($1::uuid[]) AND venue_id = ANY($2::uuid[]) AND status = 'signed'
        ORDER BY officer_id, venue_id, signed_at DESC`, [officers, venues]),
    q(`SELECT a.officer_id, s.venue_id, max(s.ends_at) AS last FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
        WHERE a.officer_id = ANY($1::uuid[]) AND s.venue_id = ANY($2::uuid[]) AND a.status IN ('assigned','accepted')
          AND s.status = 'published' AND s.ends_at < $3 GROUP BY 1, 2`, [officers, venues, now]),
  ]);
  const sig = new Map(signings.map((s) => [key(s.officer_id, s.venue_id), s]));
  const last = new Map(shifts.map((s) => [key(s.officer_id, s.venue_id), s.last]));
  for (const p of pairs) {
    const k = key(p.officer_id, p.venue_id);
    const signing = sig.get(k) || null;
    out.set(k, { ...packStatus({ pack: pk.get(p.venue_id), signing, lastShiftAt: last.get(k), now }), signing });
  }
  return out;
}

export async function statusFor(officerId, venueId, opts) {
  return (await statusesFor([{ officer_id: officerId, venue_id: venueId }], opts)).get(key(officerId, venueId));
}

export const pairKey = key;
