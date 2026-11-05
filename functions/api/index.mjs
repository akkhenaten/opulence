import { CORS, json, HttpError } from './lib/http.mjs';
import { migrate as migrateDb } from './lib/db.mjs';
import { seedLibrary } from './lib/contractContent.mjs';
import { userFromEvent } from './lib/auth.mjs';
import { runJobs } from './modules/jobs.mjs';
import * as auth from './modules/auth.mjs';
import * as users from './modules/users.mjs';
import * as settings from './modules/settings.mjs';
import * as venues from './modules/venues.mjs';
import * as documents from './modules/documents.mjs';
import * as officers from './modules/officers.mjs';
import * as hr from './modules/hr.mjs';
import * as rota from './modules/rota.mjs';
import * as clock from './modules/clock.mjs';
import * as clockProof from './modules/clockProof.mjs';
import * as timesheets from './modules/timesheets.mjs';
import * as money from './modules/money.mjs';
import * as incidents from './modules/incidents.mjs';
import * as dashboard from './modules/dashboard.mjs';
import * as notifications from './modules/notifications.mjs';
import * as ops from './modules/ops.mjs';
import * as incidentAi from './modules/incidentAi.mjs';
import * as compliance from './modules/compliance.mjs';
import * as toolbox from './modules/toolbox.mjs';
import * as academy from './modules/academy.mjs';
import * as everyday from './modules/everyday.mjs';
import * as cover from './modules/cover.mjs';
import * as messages from './modules/messages.mjs';
import * as shiftlog from './modules/shiftlog.mjs';
import * as bans from './modules/bans.mjs';
import * as growth from './modules/growth.mjs';
import * as payruns from './modules/payruns.mjs';
import * as assistant from './modules/assistant.mjs';
import * as demo from './modules/demo.mjs';
import * as help from './modules/help.mjs';
import * as esign from './modules/esign.mjs';
import * as contractsPack from './modules/contractsPack.mjs';
import * as contractsUpload from './modules/contractsUpload.mjs';
import * as signLinks from './modules/signLinks.mjs';
import * as orbVoice from './modules/orbVoice.mjs';
import * as venuePacks from './modules/venuePacks.mjs';
import * as email from './modules/email.mjs';

export const ACTIONS = Object.assign({}, ...[auth, users, settings, venues, documents, officers, hr, rota, clock, clockProof, timesheets, money, incidents, dashboard, notifications, ops, incidentAi, compliance, toolbox, academy, everyday, cover, messages, shiftlog, bans, growth, payruns, assistant, orbVoice, demo, help, esign, contractsPack, contractsUpload, signLinks, venuePacks, email].map((m) => m.actions));
// Orb runs real actions on confirm, through the same table and role checks
assistant.useActions(ACTIONS);

// Schema first, then the seeded contract library; a seeding problem is logged and retried, never blocks the app
async function migrate() {
  await migrateDb();
  await seedLibrary().catch((e) => console.error('[contracts] seed failed:', e.message));
}

export async function handler(event) {
  if (event.source === 'schedule') {
    await migrate();
    return runJobs();
  }
  const method = event.requestContext?.http?.method || event.httpMethod || 'POST';
  if (method === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  let body;
  try {
    body = event.body ? JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body) : {};
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (body.action === 'health') return json({ ok: true, time: new Date().toISOString() });
  // Tool calls from the Live voice relay, signed per session (see modules/orbVoice.mjs)
  if (body.action === 'tool' && body.tool) {
    try {
      await migrate();
      return json(await orbVoice.voiceTool(event, body));
    } catch (e) {
      console.error('[orb voice]', e);
      return json({ status: 'error', message: 'Something went wrong' });
    }
  }

  const entry = ACTIONS[body.action];
  if (!entry) return json({ error: 'Unknown action' }, 404);

  try {
    await migrate();
    const h = event.headers || {};
    const ip = (h['x-forwarded-for'] || '').split(',')[0].trim() || event.requestContext?.http?.sourceIp || '';
    let user = null;
    if (!entry.public) {
      user = await userFromEvent(event, body);
      if (!user) return json({ error: 'Please sign in again' }, 401);
      if (!entry.roles.includes(user.role)) return json({ error: 'You do not have access to this' }, 403);
      // An officer login not linked to a profile would turn "own records" filters into "all records"
      if (user.role === 'officer' && !user.officer_id && !/^(auth|notifications|dashboard)\./.test(body.action)) {
        return json({ error: 'Your login is not linked to an officer profile yet. Contact the office.' }, 403);
      }
    }
    const result = await entry.fn(body, { user, ip, event });
    return json(result ?? { ok: true });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, ...(e.extra || {}) }, e.status);
    if (e.code === '23505') return json({ error: 'That already exists' }, 409);
    if (e.code === '23503') return json({ error: 'It is still in use or refers to something missing' }, 409);
    if (e.code === '22P02') return json({ error: 'Invalid value' }, 400);
    console.error('[api]', body.action, e);
    return json({ error: 'Something went wrong' }, 500);
  }
}
