// Estado de la app y persistencia en localStorage.
import { uid, today, monthOf, dateInMonth, round2 } from './utils.js';

const KEY = 'numerillus:v1';

const DEFAULT_CATEGORIES = [
  ['Supermercado', '🛒', '#22c55e', 'expense'],
  ['Restaurantes', '🍽️', '#f97316', 'expense'],
  ['Transporte', '🚗', '#3b82f6', 'expense'],
  ['Hogar', '🏠', '#a855f7', 'expense'],
  ['Facturas', '💡', '#eab308', 'expense'],
  ['Ocio', '🎬', '#ec4899', 'expense'],
  ['Salud', '💊', '#14b8a6', 'expense'],
  ['Compras', '🛍️', '#f43f5e', 'expense'],
  ['Suscripciones', '📺', '#6366f1', 'expense'],
  ['Educación', '📚', '#0ea5e9', 'expense'],
  ['Otros', '📦', '#94a3b8', 'expense'],
  ['Nómina', '💼', '#10b981', 'income'],
  ['Extra', '💰', '#84cc16', 'income'],
  ['Regalos', '🎁', '#f59e0b', 'income'],
  ['Otros ingresos', '➕', '#64748b', 'income'],
].map(([name, icon, color, kind]) => ({ id: uid(), name, icon, color, kind }));

const defaultState = () => ({
  version: 1,
  settings: {
    onboarded: false,
    initialBalance: 0,
    initialDate: today(),
    currency: 'EUR',
    savingsGoal: 0,
    theme: 'auto',
    notifications: { enabled: false, time: '21:00' },
  },
  categories: DEFAULT_CATEGORIES,
  transactions: [],
  fixed: [],
  meta: { lastReminder: null },
});

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return {
      ...base,
      ...parsed,
      settings: {
        ...base.settings,
        ...parsed.settings,
        notifications: { ...base.settings.notifications, ...(parsed.settings?.notifications || {}) },
      },
      meta: { ...base.meta, ...parsed.meta },
    };
  } catch (e) {
    console.error('No se pudieron leer los datos', e);
    return defaultState();
  }
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
  listeners.forEach((fn) => fn(state));
}

export const getState = () => state;
export const subscribe = (fn) => listeners.add(fn);

export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  save();
}

export function setMeta(patch) {
  state.meta = { ...state.meta, ...patch };
  localStorage.setItem(KEY, JSON.stringify(state));
}

// ---------- Categorías ----------
export const getCategory = (id) =>
  state.categories.find((c) => c.id === id) ||
  { id: null, name: 'Sin categoría', icon: '❔', color: '#94a3b8', kind: 'expense' };

export const categoriesOf = (kind) => state.categories.filter((c) => c.kind === kind);

export function saveCategory(cat) {
  if (cat.id) {
    state.categories = state.categories.map((c) => (c.id === cat.id ? { ...c, ...cat } : c));
  } else {
    state.categories.push({ ...cat, id: uid() });
  }
  save();
}

export function deleteCategory(id) {
  const inUse =
    state.transactions.some((t) => t.categoryId === id) ||
    state.fixed.some((f) => f.categoryId === id);
  if (inUse) return false;
  state.categories = state.categories.filter((c) => c.id !== id);
  save();
  return true;
}

// ---------- Movimientos ----------
// type: 'income' | 'variable' | 'fixed' | 'saving'
export function saveTransaction(tx) {
  const clean = { ...tx, amount: round2(Number(tx.amount)) };
  if (clean.id) {
    state.transactions = state.transactions.map((t) => (t.id === clean.id ? { ...t, ...clean } : t));
  } else {
    state.transactions.push({ ...clean, id: uid(), createdAt: Date.now() });
  }
  save();
}

export function deleteTransaction(id) {
  state.transactions = state.transactions.filter((t) => t.id !== id);
  save();
}

export const getTransaction = (id) => state.transactions.find((t) => t.id === id);

export const transactionsInMonth = (mKey) =>
  state.transactions
    .filter((t) => monthOf(t.date) === mKey)
    .sort((a, b) => (b.date.localeCompare(a.date)) || (b.createdAt - a.createdAt));

// ---------- Gastos fijos ----------
export function saveFixed(f) {
  const clean = { ...f, amount: round2(Number(f.amount)), day: Number(f.day) };
  if (clean.id) {
    state.fixed = state.fixed.map((x) => (x.id === clean.id ? { ...x, ...clean } : x));
  } else {
    state.fixed.push({ active: true, ...clean, id: uid(), createdAt: Date.now() });
  }
  save();
}

/** Elimina la plantilla; los pagos ya marcados quedan en el historial. */
export function deleteFixed(id) {
  state.fixed = state.fixed.filter((f) => f.id !== id);
  save();
}

export const getFixed = (id) => state.fixed.find((f) => f.id === id);

export const fixedPayment = (fixedId, mKey) =>
  state.transactions.find((t) => t.type === 'fixed' && t.fixedId === fixedId && t.month === mKey);

/** Gastos fijos que aplican a un mes, con su estado de pago. */
export function fixedForMonth(mKey) {
  return state.fixed
    .filter((f) => f.active !== false && (!f.startMonth || f.startMonth <= mKey))
    .map((f) => ({ ...f, payment: fixedPayment(f.id, mKey), dueDate: dateInMonth(mKey, f.day) }))
    .sort((a, b) => a.day - b.day);
}

export function markFixedPaid(fixedId, mKey, date) {
  const f = getFixed(fixedId);
  if (!f || fixedPayment(fixedId, mKey)) return;
  saveTransaction({
    type: 'fixed',
    fixedId,
    month: mKey,
    amount: f.amount,
    categoryId: f.categoryId,
    note: f.name,
    date: date || dateInMonth(mKey, f.day),
  });
}

export function unmarkFixedPaid(fixedId, mKey) {
  const p = fixedPayment(fixedId, mKey);
  if (p) deleteTransaction(p.id);
}

// ---------- Cálculos ----------
const sign = (t) => (t.type === 'income' ? 1 : -1);

/** Saldo de la cuenta: saldo inicial + ingresos − gastos − aportaciones a ahorro. */
export function balance() {
  return round2(state.transactions.reduce((acc, t) => acc + sign(t) * t.amount, Number(state.settings.initialBalance) || 0));
}

export const totalSaved = () =>
  round2(state.transactions.filter((t) => t.type === 'saving').reduce((a, t) => a + t.amount, 0));

export function monthSummary(mKey) {
  const txs = transactionsInMonth(mKey);
  const sum = (pred) => round2(txs.filter(pred).reduce((a, t) => a + t.amount, 0));
  const income = sum((t) => t.type === 'income');
  const variable = sum((t) => t.type === 'variable');
  const fixedPaid = sum((t) => t.type === 'fixed');
  const saving = sum((t) => t.type === 'saving');
  const fixedPending = round2(
    fixedForMonth(mKey).filter((f) => !f.payment).reduce((a, f) => a + f.amount, 0)
  );
  return {
    income, variable, fixedPaid, saving, fixedPending,
    expenses: round2(variable + fixedPaid),
    net: round2(income - variable - fixedPaid - saving),
    count: txs.length,
  };
}

/** Gasto por categoría (variables + fijos) para una lista de meses. */
export function expensesByCategory(monthKeys) {
  const set = new Set(monthKeys);
  const map = new Map();
  state.transactions
    .filter((t) => (t.type === 'variable' || t.type === 'fixed') && set.has(monthOf(t.date)))
    .forEach((t) => map.set(t.categoryId, round2((map.get(t.categoryId) || 0) + t.amount)));
  const total = round2([...map.values()].reduce((a, b) => a + b, 0));
  const rows = [...map.entries()]
    .map(([id, amount]) => ({ category: getCategory(id), amount, pct: total ? amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
  return { rows, total };
}

export const hasMovementToday = () => state.transactions.some((t) => {
  const created = t.createdAt ? new Date(t.createdAt) : null;
  return t.date === today() || (created && created.toDateString() === new Date().toDateString());
});

// ---------- Copia de seguridad ----------
export const exportData = () => JSON.stringify(state, null, 2);

export function importData(json) {
  const data = JSON.parse(json);
  if (!data || !Array.isArray(data.transactions) || !Array.isArray(data.categories)) {
    throw new Error('El archivo no es una copia válida de Numerillus');
  }
  localStorage.setItem(KEY, JSON.stringify(data));
  state = load();
  save();
}

export function resetAll() {
  localStorage.removeItem(KEY);
  state = defaultState();
  save();
}
