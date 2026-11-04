// Live chat events. The server publishes to this person's own channel (user:<id>); the app only listens.
// Events are hints to refetch: msg / upd / read / typing, each with { c: conversationId, ... }.
// If anything here fails the app keeps polling, so chat still works, just slower.
import { useEffect, useState } from 'react';
import { api } from './api.js';

const SCRIPTS = ['https://unpkg.com/mqtt/dist/mqtt.min.js', 'https://openkbs.com/sdk/mqtt.js'];
const REMINT_MS = 13 * 60000; // credentials last 15 minutes
const RETRY_MS = 60000;

let sdk;
const loadScript = (src) => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)?.dataset.loaded) { resolve(); return; }
  const el = document.createElement('script');
  el.src = src;
  el.async = false;
  el.onload = () => { el.dataset.loaded = '1'; resolve(); };
  el.onerror = () => { el.remove(); reject(new Error('realtime script failed')); };
  document.head.appendChild(el);
});
const loadSdk = () => {
  sdk ||= SCRIPTS.reduce((p, s) => p.then(() => loadScript(s)), Promise.resolve())
    .then(() => { if (!window.MQTT?.Realtime) throw new Error('realtime sdk missing'); return window.MQTT; })
    .catch((e) => { sdk = null; throw e; });
  return sdk;
};

const handlers = new Map(); // event → Set(fn)
const watchers = new Set();
let connected = false;
let client = null;
let timer = null;
let running = null; // user id

const setConnected = (v) => {
  if (v === connected) return;
  connected = v;
  watchers.forEach((fn) => fn(v));
  if (v) window.dispatchEvent(new Event('orb:realtime-reconnected'));
};
const emit = (event, data) => (handlers.get(event) || []).forEach((fn) => { try { fn(data || {}); } catch (e) { console.warn('[realtime]', e); } });

async function connect(uid) {
  clearTimeout(timer);
  try {
    const [MQTT, { token }] = await Promise.all([loadSdk(), api('messages.realtime')]);
    if (running !== uid) return;
    if (!token) { timer = setTimeout(() => connect(uid), RETRY_MS * 5); return; }
    const next = new MQTT.Realtime({
      credentials: token.credentials,
      iotEndpoint: token.iotEndpoint,
      region: token.region,
      topicPrefix: token.topicPrefix,
      clientIdPrefix: token.clientIdPrefix,
      presence: token.presence,
      clientId: `u-${String(uid).slice(0, 8)}-${Date.now()}`,
      debug: false,
    });
    next.connection.on('connected', () => { if (client === next) setConnected(true); });
    next.connection.on('disconnected', () => { if (client === next) setConnected(false); });
    // Only the one channel the token allows: anything else would close the connection
    next.channels.get(token.channel).subscribe((m) => emit(m.name, m.data));
    const old = client;
    client = next;
    try { old?.close(); } catch { /* already closed */ }
    timer = setTimeout(() => connect(uid), REMINT_MS);
  } catch (e) {
    console.warn('[realtime] offline, polling instead:', e.message);
    setConnected(false);
    if (running === uid) timer = setTimeout(() => connect(uid), RETRY_MS);
  }
}

/** Start listening for this person (Shell calls it after sign-in); returns stop. */
export function startRealtime(uid) {
  if (running === uid) return stopRealtime;
  stopRealtime();
  running = uid;
  connect(uid);
  return stopRealtime;
}

export function stopRealtime() {
  running = null;
  clearTimeout(timer);
  try { client?.close(); } catch { /* already closed */ }
  client = null;
  setConnected(false);
}

/** Listen for one event ('msg', 'upd', 'read', 'typing'); returns unsubscribe. */
export function onRealtime(event, fn) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event).add(fn);
  return () => handlers.get(event).delete(fn);
}

/** In a component: run fn on these events while mounted (fn may change between renders). */
export function useRealtime(events, fn) {
  const key = [].concat(events).join(',');
  const ref = useRefLatest(fn);
  useEffect(() => {
    const offs = key.split(',').map((e) => onRealtime(e, (d) => ref.current(d, e)));
    const back = () => ref.current({}, 'reconnected');
    window.addEventListener('orb:realtime-reconnected', back);
    return () => { offs.forEach((o) => o()); window.removeEventListener('orb:realtime-reconnected', back); };
  }, [key, ref]);
}

export function useRealtimeConnected() {
  const [v, setV] = useState(connected);
  useEffect(() => { watchers.add(setV); setV(connected); return () => watchers.delete(setV); }, []);
  return v;
}

function useRefLatest(v) {
  const [ref] = useState(() => ({ current: v }));
  ref.current = v;
  return ref;
}
