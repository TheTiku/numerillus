// Notificaciones push reales a través del servidor de Numerillus (Cloudflare Worker).
import { getState, setMeta } from './store.js';
import { today } from './utils.js';

export const PUSH_SERVER = 'https://numerillus-push.numerillus-7171cc.workers.dev';
export const VAPID_PUBLIC_KEY = 'BIBwGQ7LdDzhFo6nRrtI0ElQ0_YYvBX_itLCZqSwbh7aq_5V6Z7IlJPqiS46EuhlJMmeifPK0DsbEq5ZP5PU2Ys';

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid';

const keyBytes = (b64) => {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
};

async function api(path, body) {
  const res = await fetch(PUSH_SERVER + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Servidor de avisos: ${res.status}`);
  return res.json();
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Suscribe este dispositivo y registra la hora del aviso. Lanza error si falla. */
export async function enablePush(time) {
  if (!pushSupported()) throw new Error('unsupported');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
  }
  await api('/subscribe', { subscription: sub.toJSON(), time, tz: tz() });
  setMeta({ pushActive: true, pushSynced: today() });
  return sub;
}

export async function disablePush() {
  const sub = await currentSubscription();
  setMeta({ pushActive: false });
  if (!sub) return;
  await api('/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

export async function testPush() {
  const sub = await currentSubscription();
  if (!sub) throw new Error('no-subscription');
  return api('/test', { endpoint: sub.endpoint });
}

/** Avisa al servidor de que hoy ya has apuntado algo (para no molestarte). */
export async function reportLoggedToday() {
  const { meta } = getState();
  if (!meta.pushActive || meta.loggedReported === today()) return;
  const sub = await currentSubscription();
  if (!sub) return;
  try {
    await api('/logged', { endpoint: sub.endpoint, date: today() });
    setMeta({ loggedReported: today() });
  } catch { /* sin conexión: se reintentará */ }
}

/** Al abrir la app: renueva la suscripción una vez al día (zona horaria, claves nuevas…). */
export async function refreshPush() {
  const { settings, meta } = getState();
  if (!settings.notifications.enabled || !pushSupported() || Notification.permission !== 'granted') return;
  if (meta.pushActive && meta.pushSynced === today()) return;
  try { await enablePush(settings.notifications.time); } catch { /* sin conexión */ }
}
