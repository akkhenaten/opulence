// Claude via the OpenKBS proxy (plain fetch, no SDK) with a monthly credit cap.
import { one, q } from './db.mjs';
import { HttpError } from './http.mjs';
import { notify, companyManagers } from './notify.mjs';

export const SONNET = 'claude-sonnet-5';
export const HAIKU = 'claude-haiku-4-5-20251001';
const URL = 'https://proxy.openkbs.com/v1/anthropic/v1/messages';

// Prices are credits per 1K tokens
export function creditsFor(usage = {}, price = {}) {
  const input = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
  return Math.round(((input * (price.inputPrice || 0) + (usage.output_tokens || 0) * (price.outputPrice || 0)) / 1000) * 100) / 100;
}

// Month key in London time, e.g. 2026-10
export const monthKey = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }).slice(0, 7);

let prices;
async function priceFor(model) {
  if (!prices) {
    try {
      const r = await fetch('https://proxy.openkbs.com/v1/models');
      prices = Object.fromEntries(((await r.json()).models || []).map((m) => [m.model, m]));
    } catch {
      prices = {};
    }
  }
  return prices[model] || { inputPrice: model === HAIKU ? 150 : 450, outputPrice: model === HAIKU ? 750 : 2250 };
}

/** Throws 429 when the month's AI budget is used up. Resets the counter on a new month. */
export async function checkCap(module = 'ops') {
  const m = monthKey();
  const s = await one(
    `UPDATE settings SET ops_ai_used = CASE WHEN ops_ai_month = $1 THEN ops_ai_used ELSE 0 END, ops_ai_month = $1 WHERE id = 1
     RETURNING ops_ai_used, ops_ai_cap_credits, ai_module_caps`, [m]);
  if (Number(s.ops_ai_used) >= Number(s.ops_ai_cap_credits)) {
    await notify(await companyManagers(), {
      kind: 'ops', severity: 'warning', title: 'Ops AI paused: monthly credit cap reached',
      body: 'Raise the cap in Ops AI → Settings to resume AI features. Reminders and records keep running.', link: '/company/ops?tab=settings', dedupe: `aicap:${m}`,
    });
    throw new HttpError(429, 'Ops AI paused: monthly credit cap reached');
  }
  const cap = (s.ai_module_caps || {})[module];
  if (cap != null && cap !== '') {
    const u = await one('SELECT credits FROM ai_usage WHERE month = $1 AND module = $2', [m, module]);
    if (Number(u?.credits || 0) >= Number(cap)) {
      await notify(await companyManagers(), {
        kind: 'ops', severity: 'warning', title: `AI for ${MODULE_NAMES[module] || module} paused: its monthly cap is reached`,
        body: 'Raise the cap in Ops AI → Settings. Everything else keeps working.', link: '/company/ops?tab=settings', dedupe: `aicap:${module}:${m}`,
      });
      throw new HttpError(429, `AI for ${MODULE_NAMES[module] || module} is paused this month (credit cap reached)`);
    }
  }
}

const MODULE_NAMES = { ops: 'Ops AI', academy: 'Academy', toolbox: 'Toolbox', everyday: 'Everyday' };

export async function claude({ model = SONNET, system, messages, tools, tool_choice, max_tokens = 1024, module = 'ops' }) {
  await checkCap(module);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  let res;
  try {
    res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENKBS_API_KEY}`, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, system, messages, max_tokens, ...(tools ? { tools } : {}), ...(tool_choice ? { tool_choice } : {}) }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new HttpError(502, 'Ops AI is unavailable right now — try again shortly');
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[ai]', res.status, JSON.stringify(data).slice(0, 500));
    throw new HttpError(502, 'Ops AI is unavailable right now — try again shortly');
  }
  const credits = creditsFor(data.usage, await priceFor(model));
  await q('UPDATE settings SET ops_ai_used = ops_ai_used + $1 WHERE id = 1', [credits]);
  await q(`INSERT INTO ai_usage (month, module, credits) VALUES ($1, $2, $3)
    ON CONFLICT (month, module) DO UPDATE SET credits = ai_usage.credits + EXCLUDED.credits`, [monthKey(), module, credits]);
  data.credits = credits;
  return data;
}

// Force a single tool call and return its input (structured output)
export async function extract({ model = HAIKU, system, messages, tool, max_tokens = 1024, module = 'ops' }) {
  const r = await claude({ model, system, messages, tools: [tool], tool_choice: { type: 'tool', name: tool.name }, max_tokens, module });
  const block = (r.content || []).find((c) => c.type === 'tool_use');
  return { input: block?.input ? fixShapes(block.input, tool.input_schema) : null, credits: r.credits };
}

// Models sometimes send a list or object as a JSON string (or a plain list as lines of text); put it back in the schema's shape
function fixShapes(v, schema) {
  if (!schema) return v;
  // Stray tool-call markup inside a value, e.g. '<parameter name="steps">[…]' or '<item>…</item>'
  if (typeof v === 'string' && /<\/?(parameter|item)[^>]*>/.test(v)) v = v.replace(/<\/?(parameter|item)[^>]*>/g, '').trim();
  if ((schema.type === 'array' || schema.type === 'object') && typeof v === 'string') {
    try { v = JSON.parse(v); } catch {
      if (schema.type === 'array' && schema.items?.type === 'string') v = v.split('\n').map((x) => x.replace(/^\s*(\d+[.)]|[-•*])\s*/, '').trim()).filter(Boolean);
    }
  }
  if (schema.type === 'array' && Array.isArray(v)) return v.map((x) => fixShapes(x, schema.items));
  if (schema.type === 'object' && v && typeof v === 'object' && schema.properties) {
    for (const [k, sub] of Object.entries(schema.properties)) if (k in v) v[k] = fixShapes(v[k], sub);
  }
  return v;
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
export const canRead = (mime) => IMAGE_TYPES.has(mime) || mime === 'application/pdf';

// Image or PDF content block for vision; null for files the model cannot read
// The stored mime can be wrong (renamed files, phone exports), and the API rejects a mismatch, so trust the bytes
function sniffImage(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export function fileBlock(bytes, mime) {
  const buf = Buffer.from(bytes);
  const sniffed = String(mime || '').startsWith('image/') ? sniffImage(buf) : null;
  if (sniffed || IMAGE_TYPES.has(mime)) return { type: 'image', source: { type: 'base64', media_type: sniffed || mime, data: buf.toString('base64') } };
  if (mime === 'application/pdf') return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(bytes).toString('base64') } };
  return null;
}
