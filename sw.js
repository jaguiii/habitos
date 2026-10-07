/* Service worker: app offline + recordatorio en segundo plano (si Chrome lo permite) */
const VERSION = 'habitos-shell-v1';   // súbelo (v2, v3…) cada vez que cambies index.html
const ARCHIVOS = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
const META = './__meta__';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.startsWith('habitos-shell-') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Cache primero, y actualiza en segundo plano (stale-while-revalidate). */
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  if (new URL(r.url).origin !== location.origin) return;
  e.respondWith(caches.match(r, {ignoreSearch: true}).then(hit => {
    const red = fetch(r).then(res => {
      if (res && res.ok) { const cp = res.clone(); caches.open(VERSION).then(c => c.put(r, cp)); }
      return res;
    }).catch(() => null);
    if (hit) { e.waitUntil(red); return hit; }
    return red.then(res => res || (r.mode === 'navigate' ? caches.match('index.html') : Response.error()));
  }));
});

/* Periodic Background Sync: Chrome lo dispara aproximadamente 1 vez al día, sin hora exacta. */
self.addEventListener('periodicsync', e => {
  if (e.tag === 'recordatorio-diario') e.waitUntil(avisar());
});

async function avisar() {
  const c = await caches.open('habitos-meta');
  const r = await c.match(META);
  const m = r ? await r.json() : {};
  if (!m.activo) return;
  const n = new Date();
  const hoy = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  const [h, mi] = (m.hora || '23:00').split(':').map(Number);
  if (n.getHours() * 60 + n.getMinutes() < h * 60 + mi) return;
  if (m.registroHoy === hoy || m.ultimoAviso === hoy) return;
  await self.registration.showNotification('Hábitos de hoy', {
    body: '¿Qué hábitos has cumplido hoy? Apúntalos.',
    icon: 'icon-192.png', badge: 'icon-192.png', tag: 'recordatorio', data: {url: './'}
  });
  m.ultimoAviso = hoy;
  await c.put(META, new Response(JSON.stringify(m), {headers: {'content-type': 'application/json'}}));
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(ws => {
    for (const w of ws) { if ('focus' in w) return w.focus(); }
    return self.clients.openWindow('./');
  }));
});
