// Numerillus · servidor de recordatorios (Cloudflare Worker).
// - Guarda la suscripción push de cada móvil (sin datos de gastos) en KV.
// - Cada 5 minutos (cron) envía el recordatorio a quien ya haya llegado a su hora
//   y no haya apuntado nada ese día.
//
// Variables del entorno:
//   SUBS                KV namespace
//   VAPID_PUBLIC_KEY    clave pública (base64url)
//   VAPID_PRIVATE_JWK   clave privada en JWK (secreto)
//   VAPID_SUBJECT       contacto VAPID (https:// o mailto:)
//   ALLOWED_ORIGINS     orígenes permitidos, separados por comas
import { sendPush } from './webpush.js';

const MESSAGES = [
  '¿Has apuntado tus gastos de hoy? Solo te llevará un minuto ✍️',
  'Tus numerillos te esperan. ¿Qué has gastado hoy? 💸',
  'Un minuto al día y tus cuentas siempre al día 📊',
  'No te olvides de anotar los movimientos de hoy 🧾',
];
const LATE_LIMIT_MIN = 180; // no avisar si han pasado más de 3 h desde la hora elegida

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const keyFor = async (endpoint) => {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)));
  return 'sub:' + [...h].map((b) => b.toString(16).padStart(2, '0')).join('');
};

const vapidOf = (env) => ({
  publicKey: env.VAPID_PUBLIC_KEY,
  privateJwk: JSON.parse(env.VAPID_PRIVATE_JWK),
  subject: env.VAPID_SUBJECT,
});

/** Fecha (YYYY-MM-DD) y minutos del día en la zona horaria del usuario. */
function localNow(tz) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
  } catch {
    return localNow('Europe/Madrid');
  }
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

const toMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

function validSubscription(s) {
  return s && typeof s.endpoint === 'string' && s.endpoint.startsWith('https://') && s.endpoint.length < 1000 &&
    s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string';
}
const validTime = (t) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

async function deliver(env, key, rec, data) {
  const res = await sendPush(rec.subscription, data, vapidOf(env));
  if (res.status === 404 || res.status === 410) {
    await env.SUBS.delete(key); // suscripción caducada
  }
  return res;
}

async function handleApi(request, env, path) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: 'JSON no válido' }, 400);

  if (path === '/subscribe') {
    const { subscription, time, tz } = body;
    if (!validSubscription(subscription) || !validTime(time)) return json({ error: 'Datos no válidos' }, 400);
    const key = await keyFor(subscription.endpoint);
    const prev = await env.SUBS.get(key, 'json');
    const rec = {
      subscription, time, tz: typeof tz === 'string' ? tz.slice(0, 64) : 'Europe/Madrid',
      lastSent: prev && prev.time === time ? prev.lastSent : null,
      loggedDate: prev?.loggedDate || null,
      createdAt: prev?.createdAt || Date.now(),
    };
    await env.SUBS.put(key, JSON.stringify(rec));
    return json({ ok: true });
  }

  const endpoint = body.endpoint;
  if (typeof endpoint !== 'string') return json({ error: 'Falta endpoint' }, 400);
  const key = await keyFor(endpoint);
  const rec = await env.SUBS.get(key, 'json');

  if (path === '/unsubscribe') {
    await env.SUBS.delete(key);
    return json({ ok: true });
  }
  if (!rec) return json({ error: 'Suscripción desconocida' }, 404);

  if (path === '/logged') {
    if (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return json({ error: 'Fecha no válida' }, 400);
    if (rec.loggedDate !== body.date) {
      rec.loggedDate = body.date;
      await env.SUBS.put(key, JSON.stringify(rec));
    }
    return json({ ok: true });
  }

  if (path === '/test') {
    const res = await deliver(env, key, rec, {
      title: 'Numerillus', body: '¡Las notificaciones funcionan! Así te avisaremos cada día 🔔', tag: 'test',
    });
    return json({ ok: res.ok, status: res.status }, res.ok ? 200 : 502);
  }

  return json({ error: 'No encontrado' }, 404);
}

async function runReminders(env) {
  let cursor;
  let sent = 0;
  do {
    const page = await env.SUBS.list({ prefix: 'sub:', cursor });
    for (const { name } of page.keys) {
      const rec = await env.SUBS.get(name, 'json');
      if (!rec) continue;
      const now = localNow(rec.tz);
      const late = now.minutes - toMinutes(rec.time);
      if (late < 0 || late > LATE_LIMIT_MIN) continue;
      if (rec.lastSent === now.date || rec.loggedDate === now.date) continue;
      try {
        const res = await deliver(env, name, rec, {
          title: 'Numerillus', body: MESSAGES[Number(now.date.slice(-2)) % MESSAGES.length], tag: 'daily-reminder',
        });
        if (res.ok) {
          rec.lastSent = now.date;
          await env.SUBS.put(name, JSON.stringify(rec));
          sent++;
        } else {
          console.log('push error', res.status, await res.text());
        }
      } catch (err) {
        console.log('push exception', err?.message);
      }
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return sent;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const cors = allowed.includes(origin)
      ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' }
      : {};

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method === 'GET' && url.pathname === '/') {
      return json({ ok: true, service: 'numerillus-push', publicKey: env.VAPID_PUBLIC_KEY });
    }
    if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405, cors);
    if (!allowed.includes(origin)) return json({ error: 'Origen no permitido' }, 403);

    const res = await handleApi(request, env, url.pathname);
    Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runReminders(env).then((n) => console.log(`recordatorios enviados: ${n}`)));
  },
};
