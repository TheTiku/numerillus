// Numerillus — app principal (vistas, navegación y formularios).
import * as S from './store.js';
import {
  esc, money, parseAmount, monthKey, addMonths, monthLabel, monthShort, dayLabel, shortDate,
  today, monthOf, round2,
} from './utils.js';
import { barChart, donutChart } from './charts.js';
import * as N from './notify.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ui = {
  month: monthKey(),
  filter: 'all',
  statsMode: 'months',
  statsRange: 6,
  catPeriod: 'month',
  sheet: null, // contexto del formulario abierto
};

const cur = () => S.getState().settings.currency;
const fmt = (n, opts) => money(n, cur(), opts);
const fmt0 = (n) => money(n, cur(), { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const ICONS = {
  prev: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const EMOJIS = ['🛒', '🍽️', '☕', '🍕', '🍺', '🚗', '⛽', '🚌', '✈️', '🏠', '💡', '🔧', '🎬', '🎮', '🎉', '💊',
  '🏥', '💪', '💇', '🛍️', '👕', '📺', '📱', '🌐', '📚', '🎓', '👶', '🐶', '🎁', '💼', '💰', '🏦', '🧾', '📦', '➕', '❤️'];
const COLORS = ['#22c55e', '#10b981', '#14b8a6', '#0ea5e9', '#3b82f6', '#6366f1', '#a855f7', '#ec4899',
  '#f43f5e', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#64748b'];
const CURRENCIES = [['EUR', 'Euro (€)'], ['USD', 'Dólar ($)'], ['GBP', 'Libra (£)'], ['MXN', 'Peso mexicano'],
  ['COP', 'Peso colombiano'], ['ARS', 'Peso argentino'], ['CLP', 'Peso chileno'], ['PEN', 'Sol peruano']];

const TYPE_LABEL = { income: 'Ingreso', variable: 'Gasto variable', fixed: 'Gasto fijo', saving: 'Ahorro' };

// ======================================================================
// Componentes
// ======================================================================
const catIcon = (cat) =>
  `<span class="cat-icon" style="background:${cat.color}22">${esc(cat.icon)}</span>`;

const monthSwitch = () => `
  <div class="month-switch">
    <button class="icon-btn" data-action="month-prev" aria-label="Mes anterior">${ICONS.prev}</button>
    <strong data-action="month-today">${monthLabel(ui.month)}</strong>
    <button class="icon-btn" data-action="month-next" aria-label="Mes siguiente">${ICONS.next}</button>
  </div>`;

function txAmount(t) {
  if (t.type === 'income') return `<span class="amt income">+${fmt(t.amount)}</span>`;
  if (t.type === 'saving') {
    return t.amount >= 0
      ? `<span class="amt saving">${fmt(t.amount)}</span>`
      : `<span class="amt income">+${fmt(-t.amount)}</span>`;
  }
  return `<span class="amt expense">−${fmt(t.amount)}</span>`;
}

function txTitle(t) {
  if (t.type === 'saving') return t.note || (t.amount >= 0 ? 'Aportación a ahorro' : 'Retirada de ahorro');
  return t.note || S.getCategory(t.categoryId).name;
}

function txItem(t, showDate = false) {
  const cat = t.type === 'saving'
    ? { icon: t.amount >= 0 ? '🐷' : '↩️', color: '#0284c7', name: 'Ahorro' }
    : S.getCategory(t.categoryId);
  const meta = [t.type === 'saving' ? 'Ahorro' : cat.name, t.type === 'fixed' ? 'Fijo' : null,
    showDate ? shortDate(t.date) : null].filter(Boolean).join(' · ');
  return `<button class="item" data-action="edit-tx" data-id="${t.id}">
      ${catIcon(cat)}
      <span class="main"><span class="title">${esc(txTitle(t))}</span><span class="meta">${esc(meta)}</span></span>
      ${txAmount(t)}
    </button>`;
}

function fixedRow(f) {
  const paid = !!f.payment;
  const late = !paid && f.dueDate < today();
  const cat = S.getCategory(f.categoryId);
  const status = paid
    ? `<span class="badge paid">Cobrado ${shortDate(f.payment.date)}</span>`
    : `<span class="badge ${late ? 'late' : ''}">${late ? 'Vencido' : 'Pendiente'} · día ${f.day}</span>`;
  return `<div class="fixed-item ${paid ? 'is-paid' : ''}">
      <button class="check ${paid ? 'on' : ''}" data-action="toggle-fixed" data-id="${f.id}"
        aria-label="${paid ? 'Desmarcar' : 'Marcar como cobrado'}: ${esc(f.name)}">${ICONS.check}</button>
      ${catIcon(cat)}
      <button class="main" data-action="${paid ? 'edit-tx' : 'edit-fixed'}" data-id="${paid ? f.payment.id : f.id}">
        <div class="title">${esc(f.name)}</div>
        <div>${status}</div>
      </button>
      <span class="amt ${paid ? 'muted' : 'expense'}">${fmt(paid ? f.payment.amount : f.amount)}</span>
    </div>`;
}

const empty = (emoji, text, extra = '') =>
  `<div class="empty"><span class="emoji">${emoji}</span>${text}${extra}</div>`;

// ======================================================================
// Vistas
// ======================================================================
function viewHome() {
  const st = S.getState();
  const sum = S.monthSummary(ui.month);
  const nowMonth = monthKey();
  const pendingNow = S.monthSummary(nowMonth).fixedPending;
  const goal = Number(st.settings.savingsGoal) || 0;
  const fixed = S.fixedForMonth(ui.month);
  const pending = fixed.filter((f) => !f.payment);
  const recent = S.transactionsInMonth(ui.month).slice(0, 6);
  const hour = new Date().getHours();
  const hello = hour < 7 ? 'Buenas noches' : hour < 14 ? 'Buenos días' : hour < 21 ? 'Buenas tardes' : 'Buenas noches';

  const reminder = !S.hasMovementToday() ? `
    <div class="reminder-card">
      <span class="emoji">✍️</span>
      <div style="flex:1"><b>¿Qué has gastado hoy?</b><p class="muted">Aún no has apuntado nada hoy.</p></div>
      <button class="btn small" data-action="new-tx">Apuntar</button>
    </div>` : '';

  const savingCard = goal > 0 ? `
    <div class="card">
      <div class="card-title"><h2>🐷 Ahorro del mes</h2><button class="link" data-action="new-saving">Aportar</button></div>
      <div class="progress"><i style="width:${Math.min(100, Math.max(0, (sum.saving / goal) * 100))}%"></i></div>
      <div class="progress-meta"><span>${fmt(sum.saving)} de ${fmt(goal)}</span>
        <span>${sum.saving >= goal ? '¡Objetivo cumplido! 🎉' : `Faltan ${fmt(goal - sum.saving)}`}</span></div>
    </div>` : `
    <div class="card">
      <div class="card-title"><h2>🐷 Ahorro mensual</h2><button class="link" data-action="edit-goal">Fijar objetivo</button></div>
      <p class="muted small" style="margin:0">Ponte un objetivo de ahorro cada mes y sigue tu progreso aquí.
      Este mes llevas <b class="saving">${fmt(sum.saving)}</b>.</p>
    </div>`;

  return `
    <header class="header">
      <div class="brand"><img src="icons/icon.svg" alt="">
        <div><h1>Numerillus</h1><div class="sub">${hello} 👋</div></div></div>
    </header>

    <section class="balance-card">
      <div class="label">Saldo actual</div>
      <div class="amount">${fmt(S.balance())}</div>
      <div class="row">
        <div class="pill"><span>Total ahorrado</span><b>${fmt(S.totalSaved())}</b></div>
        <div class="pill"><span>Fijos pendientes (${monthShort(nowMonth)})</span><b>${fmt(pendingNow)}</b></div>
      </div>
    </section>

    ${reminder}
    ${monthSwitch()}

    <div class="stats-grid">
      <div class="stat"><div class="k"><i class="dot" style="background:var(--income)"></i>Ingresos</div><div class="v income">${fmt(sum.income)}</div></div>
      <div class="stat"><div class="k"><i class="dot" style="background:var(--expense)"></i>Gastos</div><div class="v expense">${fmt(sum.expenses)}</div></div>
      <div class="stat"><div class="k"><i class="dot" style="background:var(--saving)"></i>Ahorro</div><div class="v saving">${fmt(sum.saving)}</div></div>
      <div class="stat"><div class="k"><i class="dot" style="background:var(--primary)"></i>Balance del mes</div><div class="v">${fmt(sum.net)}</div></div>
    </div>

    ${savingCard}

    <div class="card">
      <div class="card-title"><h2>📅 Gastos fijos pendientes</h2><a class="link" href="#fixed">Ver todos</a></div>
      ${fixed.length === 0
        ? `<p class="muted small" style="margin:0">Añade tus gastos fijos (alquiler, luz, móvil…) en la pestaña <b>Fijos</b>.</p>`
        : pending.length === 0
          ? `<p class="muted small" style="margin:0">✅ Todos los gastos fijos de ${monthLabel(ui.month, false).toLowerCase()} están cobrados.</p>`
          : pending.slice(0, 4).map(fixedRow).join('') +
            (pending.length > 4 ? `<p class="muted small">y ${pending.length - 4} más…</p>` : '')}
    </div>

    <div class="card">
      <div class="card-title"><h2>🧾 Últimos movimientos</h2><a class="link" href="#movements">Ver todos</a></div>
      ${recent.length ? `<div class="list">${recent.map((t) => txItem(t, true)).join('')}</div>`
        : empty('🪙', 'Todavía no hay movimientos este mes.')}
    </div>`;
}

function viewMovements() {
  const filters = [['all', 'Todos'], ['variable', 'Gastos variables'], ['fixed', 'Gastos fijos'],
    ['income', 'Ingresos'], ['saving', 'Ahorro']];
  const txs = S.transactionsInMonth(ui.month).filter((t) => ui.filter === 'all' || t.type === ui.filter);
  const groups = new Map();
  txs.forEach((t) => { if (!groups.has(t.date)) groups.set(t.date, []); groups.get(t.date).push(t); });

  const body = txs.length === 0
    ? `<div class="card">${empty('🔍', 'No hay movimientos para este filtro.',
      '<div style="margin-top:12px"><button class="btn small" data-action="new-tx">Añadir movimiento</button></div>')}</div>`
    : [...groups.entries()].map(([date, list]) => {
      const dayNet = round2(list.reduce((a, t) => a + (t.type === 'income' ? t.amount : -t.amount), 0));
      return `<section class="day-group">
          <div class="day-head"><span>${esc(dayLabel(date))}</span><span>${dayNet >= 0 ? '+' : ''}${fmt(dayNet)}</span></div>
          <div class="card" style="padding:4px 16px"><div class="list">${list.map((t) => txItem(t)).join('')}</div></div>
        </section>`;
    }).join('');

  return `
    <header class="header"><div><h1>Movimientos</h1><div class="sub">${txs.length} en ${monthLabel(ui.month).toLowerCase()}</div></div></header>
    ${monthSwitch()}
    <div class="chips">${filters.map(([k, l]) =>
      `<button class="chip ${ui.filter === k ? 'on' : ''}" data-action="filter" data-value="${k}">${l}</button>`).join('')}</div>
    ${body}`;
}

function viewFixed() {
  const list = S.fixedForMonth(ui.month);
  const total = round2(list.reduce((a, f) => a + (f.payment ? f.payment.amount : f.amount), 0));
  const paid = round2(list.filter((f) => f.payment).reduce((a, f) => a + f.payment.amount, 0));
  const pct = total ? (paid / total) * 100 : 0;

  return `
    <header class="header"><div><h1>Gastos fijos</h1><div class="sub">Marca cada uno cuando te lo cobren</div></div>
      <button class="btn small" data-action="new-fixed">+ Nuevo</button></header>
    ${monthSwitch()}
    <div class="card">
      <div class="stats-grid" style="margin-bottom:12px;grid-template-columns:1fr 1fr 1fr">
        <div><div class="muted small">Total</div><b>${fmt(total)}</b></div>
        <div><div class="muted small">Cobrado</div><b class="income">${fmt(paid)}</b></div>
        <div><div class="muted small">Pendiente</div><b class="expense">${fmt(round2(total - paid))}</b></div>
      </div>
      <div class="progress"><i style="width:${pct}%"></i></div>
      <div class="progress-meta"><span>${list.filter((f) => f.payment).length} de ${list.length} cobrados</span><span>${Math.round(pct)}%</span></div>
    </div>
    <div class="card">
      ${list.length ? list.map(fixedRow).join('')
        : empty('📅', 'Aún no tienes gastos fijos.',
          '<p class="small">Alquiler, hipoteca, luz, internet, gimnasio, suscripciones…</p><button class="btn small" data-action="new-fixed">Añadir gasto fijo</button>')}
    </div>
    <p class="note">Al marcar ✓ un gasto fijo se descuenta de tu saldo con la fecha de cobro. Toca un gasto cobrado para cambiar la fecha o el importe de ese mes.</p>`;
}

function viewStats() {
  const tabs = `<div class="segmented">
      <button class="${ui.statsMode === 'months' ? 'on' : ''}" data-action="stats-mode" data-value="months">Por meses</button>
      <button class="${ui.statsMode === 'categories' ? 'on' : ''}" data-action="stats-mode" data-value="categories">Por categorías</button>
    </div>`;
  return `<header class="header"><div><h1>Estadísticas</h1><div class="sub">Tus números, de un vistazo</div></div></header>
    ${tabs}${ui.statsMode === 'months' ? statsMonths() : statsCategories()}`;
}

function statsMonths() {
  const months = Array.from({ length: ui.statsRange }, (_, i) => addMonths(ui.month, i - ui.statsRange + 1));
  const sums = months.map((m) => ({ m, ...S.monthSummary(m) }));
  const data = sums.map((s) => ({ label: monthShort(s.m), values: [s.income, s.expenses, Math.max(0, s.saving)] }));
  const css = getComputedStyle(document.documentElement);
  const color = (v) => css.getPropertyValue(v).trim();
  const chart = barChart(data, [
    { name: 'Ingresos', color: color('--income') },
    { name: 'Gastos', color: color('--expense') },
    { name: 'Ahorro', color: color('--saving') },
  ], { format: fmt });
  const avg = (k) => round2(sums.reduce((a, s) => a + s[k], 0) / sums.length);
  const totals = (k) => round2(sums.reduce((a, s) => a + s[k], 0));

  return `
    ${monthSwitch()}
    <div class="chips">${[3, 6, 12].map((n) =>
      `<button class="chip ${ui.statsRange === n ? 'on' : ''}" data-action="stats-range" data-value="${n}">Últimos ${n} meses</button>`).join('')}</div>
    <div class="card">${chart}</div>
    <div class="stats-grid">
      <div class="stat"><div class="k">Media ingresos</div><div class="v income">${fmt0(avg('income'))}</div></div>
      <div class="stat"><div class="k">Media gastos</div><div class="v expense">${fmt0(avg('expenses'))}</div></div>
      <div class="stat"><div class="k">Media ahorro</div><div class="v saving">${fmt0(avg('saving'))}</div></div>
      <div class="stat"><div class="k">Balance total</div><div class="v">${fmt0(totals('net'))}</div></div>
    </div>
    <div class="card">
      <div class="card-title"><h2>Detalle por mes</h2></div>
      <table class="table">
        <thead><tr><th>Mes</th><th>Ingresos</th><th>Gastos</th><th>Ahorro</th><th>Balance</th></tr></thead>
        <tbody>${sums.slice().reverse().map((s) => `
          <tr><td>${monthShort(s.m)} ${s.m.slice(2, 4)}</td>
            <td class="income">${fmt0(s.income)}</td><td class="expense">${fmt0(s.expenses)}</td>
            <td class="saving">${fmt0(s.saving)}</td><td><b>${fmt0(s.net)}</b></td></tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function statsCategories() {
  const year = ui.month.slice(0, 4);
  const months = ui.catPeriod === 'month' ? [ui.month] : Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const { rows, total } = S.expensesByCategory(months);
  const period = ui.catPeriod === 'month' ? monthLabel(ui.month) : `Año ${year}`;
  const donut = donutChart(rows.map((r) => ({ amount: r.amount, color: r.category.color, label: `${r.category.name}: ${fmt(r.amount)}` })),
    fmt0(total), 'gastado');

  return `
    ${monthSwitch()}
    <div class="segmented">
      <button class="${ui.catPeriod === 'month' ? 'on' : ''}" data-action="cat-period" data-value="month">Mes</button>
      <button class="${ui.catPeriod === 'year' ? 'on' : ''}" data-action="cat-period" data-value="year">Año ${year}</button>
    </div>
    <div class="card">
      <div class="card-title"><h2>Gastos · ${esc(period)}</h2></div>
      ${donut}
      ${rows.length ? rows.map((r) => `
        <div class="bar-row">
          <div class="top">${catIcon(r.category)}<span class="name">${esc(r.category.name)}</span>
            <span class="muted small">${Math.round(r.pct * 100)}%</span><b>${fmt(r.amount)}</b></div>
          <div class="track"><i style="width:${r.pct * 100}%;background:${r.category.color}"></i></div>
        </div>`).join('') : empty('📊', 'Sin gastos en este periodo.')}
    </div>`;
}

function viewSettings() {
  const s = S.getState().settings;
  const perm = N.permission();
  let notifNote = '';
  if (perm === 'unsupported' || (N.isIOS() && !N.isStandalone())) {
    notifNote = N.isIOS()
      ? '📲 En iPhone, primero instala la app: botón Compartir → «Añadir a pantalla de inicio», y ábrela desde el icono. Para un aviso 100% fiable usa también «Añadir al calendario».'
      : 'Este navegador no admite notificaciones. Usa «Añadir al calendario» para recibir el aviso diario.';
  } else if (perm === 'denied') {
    notifNote = '⚠️ Has bloqueado las notificaciones. Actívalas en los ajustes del navegador para Numerillus.';
  } else if (s.notifications.enabled) {
    notifNote = `Te avisaremos cada día a las ${s.notifications.time} si aún no has apuntado nada. Los navegadores pueden retrasar el aviso si la app lleva tiempo cerrada; para que suene siempre a la hora exacta, añádelo también al calendario.`;
  }

  return `
    <header class="header"><div><h1>Ajustes</h1><div class="sub">Personaliza Numerillus</div></div></header>

    <div class="settings-label">Cuenta</div>
    <div class="settings-group">
      <button class="setting" data-action="edit-initial"><span class="setting-icon">🏦</span>
        <span class="main">Saldo inicial<small>Dinero con el que empiezas</small></span>
        <span class="value">${fmt(Number(s.initialBalance) || 0)}</span><span class="chev">›</span></button>
      <button class="setting" data-action="edit-goal"><span class="setting-icon">🐷</span>
        <span class="main">Objetivo de ahorro mensual</span>
        <span class="value">${s.savingsGoal ? fmt(s.savingsGoal) : 'Sin fijar'}</span><span class="chev">›</span></button>
      <label class="setting"><span class="setting-icon">💱</span><span class="main">Moneda</span>
        <select data-setting="currency">${CURRENCIES.map(([c, l]) =>
          `<option value="${c}" ${s.currency === c ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>

    <div class="settings-label">Notificaciones</div>
    <div class="settings-group">
      <label class="setting"><span class="setting-icon">🔔</span>
        <span class="main">Recordatorio diario<small>Para que no se te olvide apuntar tus gastos</small></span>
        <span class="switch"><input type="checkbox" data-setting="notif-enabled" ${s.notifications.enabled ? 'checked' : ''}><span></span></span></label>
      <label class="setting"><span class="setting-icon">⏰</span><span class="main">Hora del aviso</span>
        <input type="time" data-setting="notif-time" value="${esc(s.notifications.time)}"></label>
      <button class="setting" data-action="test-notif"><span class="setting-icon">🧪</span>
        <span class="main">Probar notificación</span><span class="chev">›</span></button>
      <button class="setting" data-action="calendar"><span class="setting-icon">📆</span>
        <span class="main">Añadir aviso al calendario<small>Recordatorio diario a las ${esc(s.notifications.time)} en tu calendario</small></span><span class="chev">›</span></button>
    </div>
    ${notifNote ? `<p class="note ${perm === 'denied' ? 'warn' : ''}">${notifNote}</p>` : ''}

    <div class="settings-label">Categorías</div>
    <div class="settings-group">
      <button class="setting" data-action="manage-cats"><span class="setting-icon">🏷️</span>
        <span class="main">Gestionar categorías<small>${S.categoriesOf('expense').length} de gasto · ${S.categoriesOf('income').length} de ingreso</small></span><span class="chev">›</span></button>
    </div>

    <div class="settings-label">Apariencia</div>
    <div class="settings-group">
      <label class="setting"><span class="setting-icon">🎨</span><span class="main">Tema</span>
        <select data-setting="theme">
          ${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, l]) =>
            `<option value="${v}" ${s.theme === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label>
    </div>

    <div class="settings-label">Datos</div>
    <div class="settings-group">
      <button class="setting" data-action="export"><span class="setting-icon">💾</span>
        <span class="main">Exportar copia de seguridad<small>Descarga tus datos en un archivo</small></span><span class="chev">›</span></button>
      <label class="setting"><span class="setting-icon">📥</span>
        <span class="main">Importar copia de seguridad<small>Reemplaza los datos actuales</small></span><span class="chev">›</span>
        <input type="file" accept="application/json,.json" data-setting="import" hidden></label>
      <button class="setting danger" data-action="reset"><span class="setting-icon">🗑️</span>
        <span class="main">Borrar todos los datos</span></button>
    </div>
    <p class="note">Tus datos se guardan solo en este dispositivo. Haz copias de seguridad de vez en cuando.</p>

    <div class="settings-label">Acerca de</div>
    <div class="settings-group">
      <div class="setting"><span class="setting-icon">ℹ️</span><span class="main">Numerillus<small>Versión 1.0</small></span></div>
      ${N.isStandalone() ? '' : `<button class="setting" data-action="install-help"><span class="setting-icon">📲</span>
        <span class="main">Instalar en el móvil<small>Añádela a tu pantalla de inicio</small></span><span class="chev">›</span></button>`}
    </div>`;
}

function viewOnboarding() {
  return `
    <form class="onboarding" data-form="onboarding">
      <img class="logo" src="icons/icon.svg" alt="">
      <h1>¡Hola! Soy Numerillus</h1>
      <p class="lead">Apunta tus ingresos y gastos, controla los gastos fijos y ahorra cada mes. Empecemos con dos datos:</p>
      <div class="field"><label for="ob-balance">¿Cuánto dinero tienes ahora en la cuenta?</label>
        <input id="ob-balance" name="balance" class="input amount-input" inputmode="decimal" placeholder="0,00" autocomplete="off"></div>
      <div class="field"><label for="ob-goal">¿Cuánto te gustaría ahorrar al mes? (opcional)</label>
        <input id="ob-goal" name="goal" class="input" inputmode="decimal" placeholder="Por ejemplo, 200" autocomplete="off"></div>
      <div class="field"><label for="ob-cur">Moneda</label>
        <select id="ob-cur" name="currency" class="input">${CURRENCIES.map(([c, l]) => `<option value="${c}">${l}</option>`).join('')}</select></div>
      <label class="setting" style="padding:8px 0;margin-bottom:16px">
        <span class="main">Recordarme cada día a las 21:00<small>Puedes cambiarlo en Ajustes</small></span>
        <span class="switch"><input type="checkbox" name="notif" checked><span></span></span></label>
      <button class="btn" type="submit">Empezar</button>
    </form>`;
}

// ======================================================================
// Navegación y render
// ======================================================================
const ROUTES = { home: viewHome, movements: viewMovements, fixed: viewFixed, stats: viewStats, settings: viewSettings };
const route = () => (location.hash.replace('#', '') in ROUTES ? location.hash.replace('#', '') : 'home');

function render() {
  const onboarded = S.getState().settings.onboarded;
  const view = $('#view');
  $('.tabbar').classList.toggle('hidden', !onboarded);
  $('#fab').classList.toggle('hidden', !onboarded || route() === 'settings');
  if (!onboarded) { view.innerHTML = viewOnboarding(); return; }
  const r = route();
  view.innerHTML = ROUTES[r]();
  $$('.tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === r));
}

function applyTheme() {
  const t = S.getState().settings.theme;
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

let lastRoute = route();
window.addEventListener('hashchange', () => {
  const r = route();
  if (r !== lastRoute) window.scrollTo(0, 0);
  lastRoute = r;
  render();
});
S.subscribe(() => { render(); N.syncWithServiceWorker(); });

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2200);
}

// ======================================================================
// Hojas (formularios)
// ======================================================================
function openSheet(html, ctx = {}) {
  ui.sheet = ctx;
  $('#sheet-root').innerHTML = `
    <div class="overlay" data-action="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true"><div class="grabber"></div>${html}</div>`;
  document.body.style.overflow = 'hidden';
  const auto = $('#sheet-root [autofocus]');
  if (auto && !('ontouchstart' in window)) setTimeout(() => auto.focus(), 50);
}

function closeSheet() {
  $('#sheet-root').innerHTML = '';
  document.body.style.overflow = '';
  ui.sheet = null;
}

const sheetHead = (title) =>
  `<div class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-action="close-sheet" aria-label="Cerrar">${ICONS.close}</button></div>`;

function catGrid(kind, selected) {
  const cats = S.categoriesOf(kind);
  return `<div class="cat-grid">${cats.map((c) => `
      <button type="button" class="cat-opt ${c.id === selected ? 'on' : ''}" data-action="pick-cat" data-id="${c.id}">
        <span class="ico">${esc(c.icon)}</span><span>${esc(c.name)}</span></button>`).join('')}
      <button type="button" class="cat-opt" data-action="new-cat-inline" data-kind="${kind}"><span class="ico">＋</span><span>Nueva</span></button>
    </div>`;
}

/** Fecha por defecto: hoy si estás viendo el mes actual, si no el día 1 del mes que ves. */
const defaultDate = () => (ui.month === monthKey() ? today() : `${ui.month}-01`);

// --- Movimiento (gasto, ingreso, ahorro) ---
function openTxSheet(tx = null, presetType = 'variable') {
  const editing = !!tx;
  const type = tx ? tx.type : presetType;
  const kind = type === 'income' ? 'income' : 'expense';
  const firstCat = S.categoriesOf(kind)[0]?.id;
  const ctx = {
    id: tx?.id, type, categoryId: tx?.categoryId || firstCat,
    savingDir: tx && tx.type === 'saving' && tx.amount < 0 ? 'out' : 'in',
    fixedId: tx?.fixedId, month: tx?.month,
  };
  const amount = tx ? Math.abs(tx.amount).toString().replace('.', ',') : '';
  const typeTabs = type === 'fixed' ? '' : `
    <div class="segmented" data-role="type-tabs">
      <button type="button" class="${type === 'variable' ? 'on' : ''}" data-action="tx-type" data-value="variable">Gasto</button>
      <button type="button" class="${type === 'income' ? 'on' : ''}" data-action="tx-type" data-value="income">Ingreso</button>
      <button type="button" class="${type === 'saving' ? 'on' : ''}" data-action="tx-type" data-value="saving">Ahorro</button>
    </div>`;

  openSheet(`
    <form data-form="tx">
      ${sheetHead(editing ? `Editar ${TYPE_LABEL[type].toLowerCase()}` : 'Nuevo movimiento')}
      ${typeTabs}
      ${type === 'fixed' ? `<p class="muted small" style="margin-top:0">Pago de «${esc(tx.note)}» en ${monthLabel(tx.month).toLowerCase()}. Cambia aquí la fecha o el importe de este mes.</p>` : ''}
      <div class="field"><input name="amount" class="input amount-input" inputmode="decimal" placeholder="0,00"
        value="${esc(amount)}" autocomplete="off" autofocus required aria-label="Importe"></div>
      <div data-role="cat-area">${txCatArea(ctx)}</div>
      <div class="row-2">
        <div class="field"><label for="tx-date">Fecha</label>
          <input id="tx-date" type="date" name="date" class="input" value="${esc(tx?.date || defaultDate())}" required></div>
        <div class="field"><label for="tx-note">Nota</label>
          <input id="tx-note" name="note" class="input" value="${esc(tx?.note || '')}" placeholder="Opcional" maxlength="60" autocomplete="off"></div>
      </div>
      <div class="btn-row">
        <button class="btn" type="submit">${editing ? 'Guardar cambios' : 'Añadir'}</button>
        ${editing ? `<button class="btn danger" type="button" data-action="delete-tx">${type === 'fixed' ? 'Desmarcar como cobrado' : 'Eliminar'}</button>` : ''}
      </div>
    </form>`, ctx);
}

function txCatArea(ctx) {
  if (ctx.type === 'saving') {
    return `<div class="segmented">
        <button type="button" class="${ctx.savingDir === 'in' ? 'on' : ''}" data-action="saving-dir" data-value="in">🐷 Aportar a ahorro</button>
        <button type="button" class="${ctx.savingDir === 'out' ? 'on' : ''}" data-action="saving-dir" data-value="out">↩️ Retirar de ahorro</button>
      </div>
      <p class="muted small" style="margin-top:-4px">Aportar aparta dinero de tu saldo hacia el ahorro. Retirar lo devuelve al saldo.</p>`;
  }
  const kind = ctx.type === 'income' ? 'income' : 'expense';
  return `<div class="field"><label>Categoría</label>${catGrid(kind, ctx.categoryId)}</div>`;
}

function submitTx(form) {
  const ctx = ui.sheet;
  const amount = parseAmount(form.amount.value);
  if (!(amount > 0)) { toast('Introduce un importe mayor que 0'); form.amount.focus(); return; }
  const tx = {
    id: ctx.id, type: ctx.type, date: form.date.value || today(), note: form.note.value.trim(),
    amount: ctx.type === 'saving' && ctx.savingDir === 'out' ? -amount : amount,
  };
  if (ctx.type !== 'saving') tx.categoryId = ctx.categoryId;
  if (ctx.type === 'fixed') { tx.fixedId = ctx.fixedId; tx.month = ctx.month; }
  closeSheet();
  S.saveTransaction(tx);
  toast(ctx.id ? 'Cambios guardados' : `${TYPE_LABEL[tx.type]} añadido`);
  if (!ctx.id && monthOf(tx.date) !== ui.month) { ui.month = monthOf(tx.date); render(); }
}

// --- Gasto fijo ---
function openFixedSheet(f = null) {
  const ctx = { id: f?.id, categoryId: f?.categoryId || (S.categoriesOf('expense').find((c) => c.name === 'Facturas') || S.categoriesOf('expense')[0])?.id, type: 'fixedTpl' };
  openSheet(`
    <form data-form="fixed">
      ${sheetHead(f ? 'Editar gasto fijo' : 'Nuevo gasto fijo')}
      <div class="field"><label for="fx-name">Nombre</label>
        <input id="fx-name" name="name" class="input" value="${esc(f?.name || '')}" placeholder="Alquiler, luz, gimnasio…" required maxlength="40" autocomplete="off" autofocus></div>
      <div class="row-2">
        <div class="field"><label for="fx-amount">Importe mensual</label>
          <input id="fx-amount" name="amount" class="input" inputmode="decimal" placeholder="0,00" value="${f ? String(f.amount).replace('.', ',') : ''}" required autocomplete="off"></div>
        <div class="field"><label for="fx-day">Día de cobro</label>
          <select id="fx-day" name="day" class="input">${Array.from({ length: 31 }, (_, i) => i + 1).map((d) =>
            `<option value="${d}" ${(f?.day || 1) === d ? 'selected' : ''}>Día ${d}</option>`).join('')}</select></div>
      </div>
      <div data-role="cat-area"><div class="field"><label>Categoría</label>${catGrid('expense', ctx.categoryId)}</div></div>
      <div class="btn-row">
        <button class="btn" type="submit">${f ? 'Guardar cambios' : 'Añadir gasto fijo'}</button>
        ${f ? '<button class="btn danger" type="button" data-action="delete-fixed">Eliminar gasto fijo</button>' : ''}
      </div>
      ${f ? '<p class="muted small">Si lo eliminas, los meses que ya marcaste como cobrados seguirán en tu historial.</p>' : ''}
    </form>`, ctx);
}

function submitFixed(form) {
  const ctx = ui.sheet;
  const amount = parseAmount(form.amount.value);
  if (!form.name.value.trim()) { toast('Ponle un nombre'); return; }
  if (!(amount > 0)) { toast('Introduce un importe mayor que 0'); return; }
  const data = { id: ctx.id, name: form.name.value.trim(), amount, day: Number(form.day.value), categoryId: ctx.categoryId };
  if (!ctx.id) data.startMonth = ui.month;
  closeSheet();
  S.saveFixed(data);
  toast(ctx.id ? 'Gasto fijo actualizado' : 'Gasto fijo añadido');
}

// --- Importe simple (saldo inicial / objetivo de ahorro) ---
function openAmountSheet({ title, hint, value, onSave, allowNegative = false }) {
  openSheet(`
    <form data-form="amount">
      ${sheetHead(title)}
      ${hint ? `<p class="muted small" style="margin-top:0">${hint}</p>` : ''}
      <div class="field"><input name="amount" class="input amount-input" inputmode="decimal" placeholder="0,00"
        value="${value ? String(value).replace('.', ',') : ''}" autocomplete="off" autofocus aria-label="Importe"></div>
      <button class="btn" type="submit">Guardar</button>
    </form>`, { onSave, allowNegative });
}

// --- Categorías ---
function openCategoriesSheet(kind = 'expense') {
  const cats = S.categoriesOf(kind);
  openSheet(`
    ${sheetHead('Categorías')}
    <div class="segmented">
      <button type="button" class="${kind === 'expense' ? 'on' : ''}" data-action="cats-kind" data-value="expense">Gastos</button>
      <button type="button" class="${kind === 'income' ? 'on' : ''}" data-action="cats-kind" data-value="income">Ingresos</button>
    </div>
    <div class="list">${cats.map((c) => `
      <button class="item" data-action="edit-cat" data-id="${c.id}">${catIcon(c)}
        <span class="main"><span class="title">${esc(c.name)}</span></span><span class="muted">›</span></button>`).join('')}
    </div>
    <div class="btn-row"><button class="btn" data-action="new-cat" data-kind="${kind}">+ Nueva categoría</button></div>`,
  { kind });
}

function openCategoryEditSheet(cat = null, kind = 'expense', returnTo = null) {
  const ctx = { id: cat?.id, kind: cat?.kind || kind, icon: cat?.icon || (kind === 'income' ? '💰' : '📦'),
    color: cat?.color || COLORS[Math.floor(Math.random() * COLORS.length)], returnTo };
  openSheet(`
    <form data-form="category">
      ${sheetHead(cat ? 'Editar categoría' : `Nueva categoría de ${ctx.kind === 'income' ? 'ingreso' : 'gasto'}`)}
      <div class="field"><label for="cat-name">Nombre</label>
        <input id="cat-name" name="name" class="input" value="${esc(cat?.name || '')}" required maxlength="24" autocomplete="off" autofocus></div>
      <div class="field"><label>Icono</label><div class="emoji-grid">${EMOJIS.map((e) =>
        `<button type="button" class="emoji-opt ${e === ctx.icon ? 'on' : ''}" data-action="pick-emoji" data-value="${e}">${e}</button>`).join('')}</div></div>
      <div class="field"><label>Color</label><div class="color-grid">${COLORS.map((c) =>
        `<button type="button" class="color-opt ${c === ctx.color ? 'on' : ''}" style="background:${c}" data-action="pick-color" data-value="${c}" aria-label="Color ${c}"></button>`).join('')}</div></div>
      <div class="btn-row">
        <button class="btn" type="submit">Guardar</button>
        ${cat ? '<button class="btn danger" type="button" data-action="delete-cat">Eliminar categoría</button>' : ''}
      </div>
    </form>`, ctx);
}

function openConfirmSheet({ title, text, confirm, onConfirm }) {
  openSheet(`${sheetHead(title)}<p class="muted">${text}</p>
    <div class="btn-row"><button class="btn" style="background:var(--expense)" data-action="confirm-yes">${esc(confirm)}</button>
    <button class="btn secondary" data-action="close-sheet">Cancelar</button></div>`, { onConfirm });
}

function openInfoSheet(title, html) {
  openSheet(`${sheetHead(title)}<div class="muted">${html}</div>
    <div class="btn-row"><button class="btn secondary" data-action="close-sheet">Entendido</button></div>`);
}

// ======================================================================
// Eventos
// ======================================================================
const actions = {
  'month-prev': () => { ui.month = addMonths(ui.month, -1); render(); },
  'month-next': () => { ui.month = addMonths(ui.month, 1); render(); },
  'month-today': () => { ui.month = monthKey(); render(); },
  filter: (el) => { ui.filter = el.dataset.value; render(); },
  'stats-mode': (el) => { ui.statsMode = el.dataset.value; render(); },
  'stats-range': (el) => { ui.statsRange = Number(el.dataset.value); render(); },
  'cat-period': (el) => { ui.catPeriod = el.dataset.value; render(); },

  'new-tx': () => openTxSheet(null, 'variable'),
  'new-saving': () => openTxSheet(null, 'saving'),
  'edit-tx': (el) => { const t = S.getTransaction(el.dataset.id); if (t) openTxSheet(t); },
  'tx-type': (el) => {
    const ctx = ui.sheet;
    ctx.type = el.dataset.value;
    if (ctx.type !== 'saving') {
      const kind = ctx.type === 'income' ? 'income' : 'expense';
      if (S.getCategory(ctx.categoryId).kind !== kind) ctx.categoryId = S.categoriesOf(kind)[0]?.id;
    }
    $$('[data-role="type-tabs"] button').forEach((b) => b.classList.toggle('on', b === el));
    $('[data-role="cat-area"]').innerHTML = txCatArea(ctx);
  },
  'saving-dir': (el) => {
    ui.sheet.savingDir = el.dataset.value;
    $$('[data-action="saving-dir"]').forEach((b) => b.classList.toggle('on', b === el));
  },
  'pick-cat': (el) => {
    ui.sheet.categoryId = el.dataset.id;
    $$('.cat-opt[data-action="pick-cat"]').forEach((b) => b.classList.toggle('on', b === el));
  },
  'new-cat-inline': (el) => {
    // Guarda lo escrito, crea la categoría y vuelve al formulario.
    const form = $('#sheet-root form');
    const snapshot = { ctx: { ...ui.sheet }, values: Object.fromEntries(new FormData(form)), formType: form.dataset.form };
    openCategoryEditSheet(null, el.dataset.kind, snapshot);
  },
  'delete-tx': () => {
    const { id, type } = ui.sheet;
    closeSheet();
    S.deleteTransaction(id);
    toast(type === 'fixed' ? 'Marcado como pendiente' : 'Movimiento eliminado');
  },

  'new-fixed': () => openFixedSheet(),
  'edit-fixed': (el) => { const f = S.getFixed(el.dataset.id); if (f) openFixedSheet(f); },
  'toggle-fixed': (el) => {
    const id = el.dataset.id;
    if (S.fixedPayment(id, ui.month)) { S.unmarkFixedPaid(id, ui.month); toast('Marcado como pendiente'); }
    else { S.markFixedPaid(id, ui.month); toast('✓ Cobrado y descontado del saldo'); }
  },
  'delete-fixed': () => { const { id } = ui.sheet; closeSheet(); S.deleteFixed(id); toast('Gasto fijo eliminado'); },

  'edit-initial': () => openAmountSheet({
    title: 'Saldo inicial', allowNegative: true,
    hint: 'El dinero que tenías en la cuenta al empezar a usar Numerillus. Tu saldo actual se calcula a partir de él.',
    value: S.getState().settings.initialBalance,
    onSave: (n) => S.updateSettings({ initialBalance: n }),
  }),
  'edit-goal': () => openAmountSheet({
    title: 'Objetivo de ahorro mensual', hint: '¿Cuánto quieres apartar cada mes? Pon 0 para no usar objetivo.',
    value: S.getState().settings.savingsGoal,
    onSave: (n) => S.updateSettings({ savingsGoal: Math.max(0, n) }),
  }),
  'manage-cats': () => openCategoriesSheet('expense'),
  'cats-kind': (el) => openCategoriesSheet(el.dataset.value),
  'new-cat': (el) => openCategoryEditSheet(null, el.dataset.kind),
  'edit-cat': (el) => openCategoryEditSheet(S.getState().categories.find((c) => c.id === el.dataset.id)),
  'pick-emoji': (el) => { ui.sheet.icon = el.dataset.value; $$('.emoji-opt').forEach((b) => b.classList.toggle('on', b === el)); },
  'pick-color': (el) => { ui.sheet.color = el.dataset.value; $$('.color-opt').forEach((b) => b.classList.toggle('on', b === el)); },
  'delete-cat': () => {
    const { id, kind } = ui.sheet;
    if (!S.deleteCategory(id)) { toast('No se puede borrar: hay movimientos con esta categoría'); return; }
    toast('Categoría eliminada');
    openCategoriesSheet(kind);
  },

  'test-notif': async () => {
    const p = await N.requestPermission();
    if (p === 'granted') { await N.showReminder(true); toast('Notificación enviada'); }
    else if (p === 'denied') toast('Las notificaciones están bloqueadas en el navegador');
    else toast('Este navegador no permite notificaciones aquí');
    render();
  },
  calendar: () => {
    N.downloadCalendarReminder(S.getState().settings.notifications.time);
    openInfoSheet('Aviso en el calendario', `<p>Se ha generado el archivo <b>recordatorio-numerillus.ics</b>.</p>
      <p>Ábrelo y pulsa <b>Añadir</b> para crear un evento diario a las ${esc(S.getState().settings.notifications.time)} con alarma.
      Así recibirás el aviso cada día aunque la app esté cerrada.</p>`);
  },
  export: () => {
    const blob = new Blob([S.exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `numerillus-${today()}.json`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Copia descargada');
  },
  reset: () => openConfirmSheet({
    title: '¿Borrar todos los datos?', confirm: 'Sí, borrar todo',
    text: 'Se eliminarán todos tus movimientos, gastos fijos, categorías y ajustes de este dispositivo. No se puede deshacer. Te recomendamos exportar antes una copia.',
    onConfirm: () => { S.resetAll(); location.hash = '#home'; toast('Datos borrados'); },
  }),
  'install-help': () => openInfoSheet('Instalar Numerillus', `
    <p><b>iPhone (Safari):</b> pulsa el botón <b>Compartir</b> ⬆️ y elige <b>«Añadir a pantalla de inicio»</b>.</p>
    <p><b>Android (Chrome):</b> abre el menú ⋮ y pulsa <b>«Instalar aplicación»</b> o «Añadir a pantalla de inicio».</p>
    <p>Así se abrirá a pantalla completa como una app, funcionará sin conexión y podrá enviarte notificaciones.</p>`),

  'confirm-yes': () => { const fn = ui.sheet?.onConfirm; closeSheet(); fn?.(); },
  'close-sheet': () => closeSheet(),
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el, e); }
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.sheet) closeSheet(); });

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const type = form.dataset.form;

  if (type === 'tx') return submitTx(form);
  if (type === 'fixed') return submitFixed(form);

  if (type === 'amount') {
    const raw = form.amount.value.trim();
    const n = raw === '' ? 0 : parseAmount(raw);
    if (!Number.isFinite(n) || (!ui.sheet.allowNegative && n < 0)) { toast('Importe no válido'); return; }
    const { onSave } = ui.sheet;
    closeSheet(); onSave(n); toast('Guardado');
    return;
  }

  if (type === 'category') {
    const ctx = ui.sheet;
    const name = form.name.value.trim();
    if (!name) return;
    S.saveCategory({ id: ctx.id, name, icon: ctx.icon, color: ctx.color, kind: ctx.kind });
    toast('Categoría guardada');
    if (ctx.returnTo) {
      // Volver al formulario original con la nueva categoría seleccionada.
      const newCat = S.getState().categories.at(-1);
      const { ctx: prev, values, formType } = ctx.returnTo;
      if (formType === 'fixed') {
        openFixedSheet(prev.id ? S.getFixed(prev.id) : null);
      } else {
        openTxSheet(prev.id ? S.getTransaction(prev.id) : null, prev.type);
        ui.sheet.type = prev.type; ui.sheet.savingDir = prev.savingDir;
      }
      ui.sheet.categoryId = newCat.id;
      const f = $('#sheet-root form');
      Object.entries(values).forEach(([k, v]) => { if (f.elements[k]) f.elements[k].value = v; });
      $('[data-role="cat-area"]').innerHTML = formType === 'fixed'
        ? `<div class="field"><label>Categoría</label>${catGrid('expense', newCat.id)}</div>`
        : txCatArea(ui.sheet);
    } else {
      openCategoriesSheet(ctx.kind);
    }
    return;
  }

  if (type === 'onboarding') {
    const balance = parseAmount(form.balance.value);
    const goal = parseAmount(form.goal.value);
    const wantsNotif = form.notif.checked;
    let notifEnabled = false;
    if (wantsNotif) notifEnabled = (await N.requestPermission()) === 'granted';
    S.updateSettings({
      onboarded: true,
      initialBalance: Number.isFinite(balance) ? balance : 0,
      savingsGoal: Number.isFinite(goal) && goal > 0 ? goal : 0,
      currency: form.currency.value,
      initialDate: today(),
      notifications: { enabled: notifEnabled, time: '21:00' },
    });
    location.hash = '#home';
    toast(wantsNotif && !notifEnabled ? '¡Listo! Activa los avisos en Ajustes cuando quieras' : '¡Todo listo! 🎉');
  }
});

document.addEventListener('change', async (e) => {
  const el = e.target.closest('[data-setting]');
  if (!el) return;
  const s = S.getState().settings;
  switch (el.dataset.setting) {
    case 'currency': S.updateSettings({ currency: el.value }); break;
    case 'theme': S.updateSettings({ theme: el.value }); applyTheme(); render(); break;
    case 'notif-time': S.updateSettings({ notifications: { ...s.notifications, time: el.value || '21:00' } });
      S.setMeta({ lastReminder: null }); toast(`Aviso a las ${el.value}`); break;
    case 'notif-enabled': {
      if (el.checked) {
        const p = await N.requestPermission();
        if (p !== 'granted') {
          el.checked = false;
          toast(p === 'denied' ? 'Notificaciones bloqueadas en el navegador' : 'Notificaciones no disponibles aquí. Prueba «Añadir al calendario»');
          S.updateSettings({ notifications: { ...s.notifications, enabled: false } });
          return;
        }
      }
      S.updateSettings({ notifications: { ...s.notifications, enabled: el.checked } });
      toast(el.checked ? `Recordatorio activado a las ${s.notifications.time}` : 'Recordatorio desactivado');
      break;
    }
    case 'import': {
      const file = el.files?.[0];
      if (!file) return;
      try { S.importData(await file.text()); applyTheme(); toast('Copia importada'); }
      catch (err) { toast(err.message || 'No se pudo importar'); }
      el.value = '';
      break;
    }
    default:
  }
});

// ======================================================================
// Inicio
// ======================================================================
applyTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(() => N.syncWithServiceWorker()).catch((err) => console.warn('SW', err));
}
N.startReminderLoop();
