// Recordatorios diarios.
// Un navegador no puede programar notificaciones exactas con la app cerrada, así que
// combinamos varias vías:
//  1. Mientras la app está abierta (o al abrirla), si ya pasó la hora y no has
//     apuntado nada hoy, se muestra la notificación.
//  2. En Android/Chrome con la app instalada, "Periodic Background Sync" despierta
//     al service worker aproximadamente una vez al día.
//  3. Recordatorio en el calendario del móvil (.ics): la opción más fiable, sobre todo en iPhone.
import { getState, setMeta, hasMovementToday } from './store.js';
import { today } from './utils.js';

export const notificationsSupported = () => 'Notification' in window && 'serviceWorker' in navigator;
export const permission = () => (notificationsSupported() ? Notification.permission : 'unsupported');

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export async function requestPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  return Notification.requestPermission();
}

const MESSAGES = [
  '¿Has apuntado tus gastos de hoy? Solo te llevará un minuto ✍️',
  'Tus numerillos te esperan. ¿Qué has gastado hoy? 💸',
  'Un minuto al día y tus cuentas siempre al día 📊',
  'No te olvides de anotar los movimientos de hoy 🧾',
];

export async function showReminder(force = false) {
  if (permission() !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  const body = MESSAGES[new Date().getDate() % MESSAGES.length];
  await reg.showNotification('Numerillus', {
    body: force ? '¡Las notificaciones funcionan! Así te avisaremos cada día.' : body,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: 'daily-reminder',
    renotify: true,
    data: { url: './#home' },
  });
  return true;
}

const reminderDue = () => {
  const { enabled, time } = getState().settings.notifications;
  if (!enabled) return false;
  const [h, m] = time.split(':').map(Number);
  const now = new Date();
  const due = new Date(); due.setHours(h, m, 0, 0);
  return now >= due && getState().meta.lastReminder !== today();
};

async function check() {
  if (getState().meta.pushActive) return; // el servidor push se encarga del aviso
  if (!reminderDue()) return;
  setMeta({ lastReminder: today() });
  if (hasMovementToday()) return; // Ya has apuntado algo hoy: no molestamos.
  await showReminder();
}

/** Comparte la configuración con el service worker (que no puede leer localStorage). */
export async function syncWithServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const { notifications } = getState().settings;
  reg.active?.postMessage({
    type: 'config',
    notifications,
    hasMovementToday: hasMovementToday(),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    lastReminder: getState().meta.lastReminder,
  });

  // Android / Chrome instalado: comprobación en segundo plano ~1 vez al día.
  if ('periodicSync' in reg) {
    try {
      if (notifications.enabled) {
        const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
        if (status.state === 'granted') {
          await reg.periodicSync.register('daily-reminder', { minInterval: 12 * 60 * 60 * 1000 });
        }
      } else {
        await reg.periodicSync.unregister('daily-reminder');
      }
    } catch { /* no disponible */ }
  }
}

let timer = null;
export function startReminderLoop() {
  clearInterval(timer);
  check();
  timer = setInterval(check, 30 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
}

/** Genera un evento diario repetitivo con alarma para importar en el calendario. */
export function downloadCalendarReminder(time = '21:00') {
  const [h, m] = time.split(':');
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Numerillus//ES',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:numerillus-daily-${Date.now()}@numerillus.app`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${ymd}T${h}${m}00`,
    'DURATION:PT5M',
    'RRULE:FREQ=DAILY',
    'SUMMARY:Apuntar gastos en Numerillus',
    'DESCRIPTION:Abre Numerillus y anota los ingresos y gastos de hoy.',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Apunta tus gastos de hoy en Numerillus',
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'recordatorio-numerillus.ics';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
