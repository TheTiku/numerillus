// Service worker de Numerillus: funcionamiento sin conexión y recordatorios.
const VERSION = 'numerillus-v1';
const CONFIG_CACHE = 'numerillus-config';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/store.js',
  './js/utils.js',
  './js/charts.js',
  './js/notify.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== CONFIG_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero (para recibir actualizaciones), caché si no hay conexión.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    // 'no-cache' revalida con el servidor para que las actualizaciones lleguen siempre.
    fetch(new Request(request.url, { cache: 'no-cache', credentials: 'same-origin' }))
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(request, copy));
        return res;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});

// ---- Configuración de recordatorios (enviada por la app) ----
const readConfig = async () => {
  const res = await (await caches.open(CONFIG_CACHE)).match('config');
  return res ? res.json() : null;
};
const writeConfig = async (cfg) =>
  (await caches.open(CONFIG_CACHE)).put('config', new Response(JSON.stringify(cfg)));

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

self.addEventListener('message', (event) => {
  if (event.data?.type === 'config') {
    event.waitUntil(writeConfig({ ...event.data, savedOn: todayISO() }));
  }
});

async function maybeRemind() {
  const cfg = await readConfig();
  if (!cfg?.notifications?.enabled) return;
  const [h, m] = cfg.notifications.time.split(':').map(Number);
  const due = new Date(); due.setHours(h, m, 0, 0);
  const t = todayISO();
  if (new Date() < due || cfg.lastReminder === t) return;
  if (cfg.savedOn === t && cfg.hasMovementToday) return;
  await writeConfig({ ...cfg, lastReminder: t });
  await self.registration.showNotification('Numerillus', {
    body: '¿Has apuntado tus gastos de hoy? Solo te llevará un minuto ✍️',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: 'daily-reminder',
    data: { url: './#home' },
  });
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'daily-reminder') event.waitUntil(maybeRemind());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const client = list.find((c) => 'focus' in c);
      if (client) return client.focus();
      return self.clients.openWindow(url);
    })
  );
});
