import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  invitable, passedReminders, cleanReminders, icsToken, readIcsToken, buildIcs, shiftClashes, suggestTimes, whereText, reminderLabel,
} from '../lib/calendar.mjs';
import { actions } from '../modules/calendar.mjs';
import { TIER } from '../lib/notify.mjs';

const src = readFileSync(new URL('../modules/calendar.mjs', import.meta.url), 'utf8');
const rota = readFileSync(new URL('../modules/rota.mjs', import.meta.url), 'utf8');

test('company managers invite anyone; everyone else company managers only', () => {
  assert.equal(invitable('company', ['a', 'b'], []).ok, true);
  assert.deepEqual(invitable('officer', ['co1', 'sam'], ['co1']), { ok: false, refused: ['sam'] });
  assert.equal(invitable('venue', ['co1'], ['co1']).ok, true);
  assert.equal(invitable('security', ['venue1'], ['co1']).ok, false);
  // Every role can use the calendar; the server checks invites, not the menu
  for (const k of ['calendar.save', 'calendar.respond', 'calendar.propose', 'calendar.range']) assert.deepEqual(actions[k].roles, ['company', 'security', 'venue', 'officer']);
  assert.deepEqual(actions['calendar.forRota'].roles, ['company', 'security']);
  assert.match(src, /You can invite company managers only/);
  assert.match(src, /You can only see your own calendar/);
});

test('reminders: 1 day and 30 minutes by default, past ones are skipped on booking', () => {
  const now = Date.parse('2026-11-18T10:00:00Z');
  assert.deepEqual(passedReminders([1440, 30], '2026-11-18T14:00:00Z', now), [1440]);
  assert.deepEqual(passedReminders([1440, 30], '2026-11-20T14:00:00Z', now), []);
  assert.deepEqual(cleanReminders(['30', 1440, 30, -5, 99999, 1.5]), [1440, 30]);
  assert.equal(reminderLabel(1440), '1 day before');
  assert.equal(reminderLabel(30), '30 minutes before');
  assert.equal(reminderLabel(60), '1 hour before');
});

test('the Add to calendar link is signed per meeting and person', () => {
  const t = icsToken('e1', 'u1');
  assert.deepEqual(readIcsToken(t), { eventId: 'e1', userId: 'u1' });
  assert.equal(readIcsToken(t.replace('u1', 'u2')), null);
  assert.equal(readIcsToken('e1.u1.bad'), null);
  assert.equal(readIcsToken(''), null);
});

test('the .ics file has the time in UTC, the place, reminders and a cancelled status', () => {
  const e = {
    id: 'e1', seq: 2, title: 'Toolbox talk, radios', starts_at: '2026-11-19T14:00:00Z', ends_at: '2026-11-19T15:00:00Z', where_kind: 'venue', venue_name: 'The Loft',
    venue_address: '1 High St', notes: 'Bring your licence', organiser_name: 'Matthew', reminders: [1440, 30], updated_at: '2026-11-18T10:00:00Z',
  };
  const ics = buildIcs(e, { company: 'Opulence', appUrl: 'https://x.test/app/company/calendar?event=e1' });
  assert.match(ics, /DTSTART:20261119T140000Z/);
  assert.match(ics, /SUMMARY:Toolbox talk\\, radios/);
  assert.match(ics, /LOCATION:The Loft\\, 1 High St/);
  assert.match(ics, /SEQUENCE:2/);
  assert.match(ics, /TRIGGER:-PT30M/);
  assert.match(ics, /STATUS:CONFIRMED/);
  assert.ok(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75));
  assert.match(buildIcs({ ...e, cancelled_at: new Date() }), /STATUS:CANCELLED/);
  const allDay = buildIcs({ ...e, all_day: true, starts_at: '2026-11-19T00:00:00Z', ends_at: '2026-11-20T00:00:00Z' });
  assert.match(allDay, /DTSTART;VALUE=DATE:20261119/);
  assert.match(allDay, /DTEND;VALUE=DATE:20261120/);
});

test('where reads as one line', () => {
  assert.equal(whereText({ where_kind: 'phone', phone: '07700 900123' }), 'Phone call: 07700 900123');
  assert.equal(whereText({ where_kind: 'video', video_url: 'https://meet.example.test/x' }), 'https://meet.example.test/x');
  assert.equal(whereText({ where_kind: 'hq', hq_address: '2 Bank St' }), 'Head office, 2 Bank St');
  assert.equal(whereText({ where_kind: 'none' }), '');
});

test('a shift clash names the shift, except a meeting at the same venue', () => {
  const shift = { person: 'Sam', venue_id: 'v1', venue_name: 'The Loft', starts_at: '2026-11-19T20:00:00Z', ends_at: '2026-11-20T02:00:00Z' };
  const m = { starts_at: '2026-11-19T21:00:00Z', ends_at: '2026-11-19T22:00:00Z', where_kind: 'hq' };
  assert.deepEqual(shiftClashes(m, [shift]), ['Sam is on at The Loft 20:00–02:00']);
  assert.deepEqual(shiftClashes({ ...m, where_kind: 'venue', venue_id: 'v1' }, [shift]), []);
  assert.deepEqual(shiftClashes({ ...m, starts_at: '2026-11-19T18:00:00Z', ends_at: '2026-11-19T19:00:00Z' }, [shift]), []);
  assert.deepEqual(shiftClashes(m, [{ ...shift, person: 'You', self: true }]), ['You are on at The Loft 20:00–02:00']);
});

test('suggested times are free for everyone, in working hours, from the asked time', () => {
  const now = Date.parse('2026-11-18T09:00:00Z');
  const busy = [{ starts_at: '2026-11-19T14:00:00Z', ends_at: '2026-11-19T16:00:00Z' }];
  const s = suggestTimes('2026-11-19T14:00:00Z', 60, busy, { now });
  assert.equal(s.length, 3);
  assert.equal(s[0].starts_at, '2026-11-19T16:00:00.000Z');
  assert.equal(s[1].starts_at, '2026-11-19T17:00:00.000Z');
  assert.equal(s[2].starts_at, '2026-11-19T18:00:00.000Z');
  // Nothing ends after 20:00: a late ask rolls to 08:00 the next morning
  const late = suggestTimes('2026-11-19T19:30:00Z', 60, [], { now });
  assert.equal(late[0].starts_at, '2026-11-20T08:00:00.000Z');
});

test('a new time resets replies; notes and place changes do not; everything is audited', () => {
  assert.match(src, /if \(moved\)[\s\S]*response = CASE WHEN user_id = \$2 THEN response ELSE 'pending' END/);
  for (const a of ['calendar.create', 'calendar.update', 'calendar.cancel', 'calendar.respond', 'calendar.propose', 'calendar.acceptProposal', 'calendar.declineProposal']) assert.ok(src.includes(`'${a}'`), a);
  assert.match(src, /on_behalf_of/);
  assert.equal(TIER.meeting, 'action');
});

test('the rota warns when a shift is assigned over an accepted meeting', () => {
  assert.match(rota, /ca.response = 'accepted'[\s\S]*NOT \(e.where_kind = 'venue'/);
  assert.match(rota, /warnings.push\(`In a meeting at/);
});
