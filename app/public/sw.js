// App-shell cache only: API calls and private files always go to the network.
const CACHE = 'orb-shell-v2';
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/app/', '/app/icon.svg']))); self.skipWaiting(); });
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

// Phone notifications: { title, body, link } — the link is opened in the app on tap
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Orb Security', {
    body: d.body || '', icon: '/app/icon.svg', badge: '/app/icon.svg', data: { link: d.link || '' }, tag: d.tag,
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = `/app/open?to=${encodeURIComponent(e.notification.data?.link || '')}`;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const win = list.find((c) => new URL(c.url).pathname.startsWith('/app'));
    if (win) { win.focus(); return win.navigate(url); }
    return self.clients.openWindow(url);
  }));
});
