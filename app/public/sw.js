// App-shell cache only: API calls and private files always go to the network.
const CACHE = 'orb-shell-v7';
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/app/', '/app/favicon-64.png', '/app/icon-192.png', '/app/badge-96.png']))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith('/app')) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((r) => { caches.open(CACHE).then((c) => c.put('/app/', r.clone())); return r; }).catch(() => caches.match('/app/')));
    return;
  }
  if (url.pathname.startsWith('/app/assets/')) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })));
  }
});

// Phone notifications: { title, body, link, tier, badge, actions } — the link is opened in the app on tap; urgent ones stay on screen until dismissed;
// badge is the person's unread count, shown in red on the app icon;
// actions: up to two buttons (Accept, On my way, Sign site pack). A reply opens the app, which sends it and shows the conversation
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  const icon = typeof d.badge === 'number' && self.navigator.setAppBadge ? self.navigator.setAppBadge(d.badge).catch(() => {}) : null;
  e.waitUntil(Promise.all([icon, self.registration.showNotification(d.title || 'Orb Security', {
    body: d.body || '', icon: '/app/icon-192.png', badge: '/app/badge-96.png', data: { link: d.link || '', actions: d.actions || [] },
    ...(Array.isArray(d.actions) && d.actions.length ? { actions: d.actions.map((a) => ({ action: a.action, title: a.title })) } : {}), requireInteraction: d.tier === 'urgent',
    // Never silent: the phone's own sound and vibration in normal mode, quiet on silent or Do Not Disturb
    silent: false, vibrate: [200, 100, 200], ...(d.tag ? { tag: d.tag, renotify: true } : {}),
  })]));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = e.notification.data || {};
  const act = e.action && (data.actions || []).find((a) => a.action === e.action);
  const url = act?.to ? `/app/open?to=${encodeURIComponent(act.to)}`
    : `/app/open?to=${encodeURIComponent(data.link || '')}${act?.reply ? `&reply=${encodeURIComponent(act.reply)}&value=${encodeURIComponent(act.value)}` : ''}`;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const win = list.find((c) => new URL(c.url).pathname.startsWith('/app'));
    if (win) { win.focus(); return win.navigate(url); }
    return self.clients.openWindow(url);
  }));
});
