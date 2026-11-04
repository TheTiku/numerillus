// Utilidades generales: fechas locales, formato de dinero, escape de HTML.

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const pad = (n) => String(n).padStart(2, '0');

/** Fecha local en formato YYYY-MM-DD (sin problemas de zona horaria). */
export const toISODate = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const today = () => toISODate(new Date());

/** Mes en formato YYYY-MM. */
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

export const monthOf = (isoDate) => isoDate.slice(0, 7);

export const parseISO = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const addMonths = (mKey, delta) => {
  const [y, m] = mKey.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
};

export const daysInMonth = (mKey) => {
  const [y, m] = mKey.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

/** Fecha para el día `day` de un mes, ajustada si el mes es más corto. */
export const dateInMonth = (mKey, day) =>
  `${mKey}-${pad(Math.min(Math.max(1, day), daysInMonth(mKey)))}`;

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const monthLabel = (mKey, withYear = true) => {
  const [y, m] = mKey.split('-').map(Number);
  return cap(MONTHS[m - 1]) + (withYear ? ` ${y}` : '');
};

export const monthShort = (mKey) => cap(MONTHS_SHORT[Number(mKey.split('-')[1]) - 1]);

export const dayLabel = (iso) => {
  if (iso === today()) return 'Hoy';
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (iso === toISODate(y)) return 'Ayer';
  const d = parseISO(iso);
  return cap(d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }));
};

export const shortDate = (iso) =>
  parseISO(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

let fmtCache = {};
export const money = (n, currency = 'EUR', opts = {}) => {
  const key = currency + JSON.stringify(opts);
  if (!fmtCache[key]) {
    fmtCache[key] = new Intl.NumberFormat('es-ES', {
      style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
      useGrouping: 'always', // "1.500 €" en vez de "1500 €"
      ...opts,
    });
  }
  return fmtCache[key].format(Number.isFinite(n) ? n : 0);
};

/** Convierte "1.234,56", "12,5" o "12.5" en número. */
export const parseAmount = (str) => {
  if (typeof str === 'number') return str;
  let s = String(str || '').trim().replace(/[^\d.,-]/g, '');
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // El separador que va más a la derecha es el decimal.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = s.replace(',', '.');
  }
  return Math.round(parseFloat(s) * 100) / 100;
};

/** Redondeo a céntimos para evitar errores de coma flotante. */
export const round2 = (n) => Math.round(n * 100) / 100;

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
