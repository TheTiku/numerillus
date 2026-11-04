// Gráficos SVG sencillos, sin dependencias.
import { esc } from './utils.js';

/**
 * Barras agrupadas por mes.
 * data: [{ label, values: [n, n, ...] }], series: [{ name, color }]
 */
export function barChart(data, series, { height = 200, format = (n) => n } = {}) {
  const W = 340, H = height, padL = 8, padR = 8, padT = 18, padB = 26;
  const max = Math.max(1, ...data.flatMap((d) => d.values));
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const groupW = innerW / Math.max(1, data.length);
  const barGap = 3;
  const barW = Math.min(18, (groupW - 10) / series.length - barGap);

  const grid = [0.25, 0.5, 0.75, 1].map((p) => {
    const y = padT + innerH * (1 - p);
    return `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" class="grid"/>`;
  }).join('');

  const bars = data.map((d, i) => {
    const gx = padL + groupW * i + groupW / 2;
    const total = series.length * barW + (series.length - 1) * barGap;
    const start = gx - total / 2;
    const rects = d.values.map((v, j) => {
      const h = Math.max(v > 0 ? 2 : 0, (v / max) * innerH);
      const x = start + j * (barW + barGap);
      const y = padT + innerH - h;
      return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="${series[j].color}">
        <title>${esc(series[j].name)}: ${esc(format(v))}</title></rect>`;
    }).join('');
    return `${rects}<text x="${gx}" y="${H - 8}" class="axis" text-anchor="middle">${esc(d.label)}</text>`;
  }).join('');

  const legend = series.map((s) =>
    `<span class="legend-item"><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('');

  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Gráfico por meses">
      ${grid}<line x1="${padL}" x2="${W - padR}" y1="${padT + innerH}" y2="${padT + innerH}" class="baseline"/>
      ${bars}
    </svg><div class="legend">${legend}</div>`;
}

/** Gráfico de dona. rows: [{ amount, color, label }] */
export function donutChart(rows, centerTop, centerBottom) {
  const size = 200, r = 76, stroke = 26, c = 2 * Math.PI * r;
  const total = rows.reduce((a, r) => a + r.amount, 0);
  let offset = 0;
  const arcs = total
    ? rows.map((row) => {
      const len = (row.amount / total) * c;
      const gap = rows.length > 1 ? Math.min(2, len / 3) : 0;
      const seg = `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${row.color}"
          stroke-width="${stroke}" stroke-dasharray="${Math.max(0, len - gap)} ${c}"
          stroke-dashoffset="${-offset}" transform="rotate(-90 ${size / 2} ${size / 2})">
          <title>${esc(row.label)}</title></circle>`;
      offset += len;
      return seg;
    }).join('')
    : `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" class="donut-empty" stroke-width="${stroke}"/>`;

  return `<svg viewBox="0 0 ${size} ${size}" class="donut" role="img" aria-label="Gastos por categoría">
      ${arcs}
      <text x="50%" y="46%" text-anchor="middle" class="donut-top">${esc(centerTop)}</text>
      <text x="50%" y="58%" text-anchor="middle" class="donut-bottom">${esc(centerBottom)}</text>
    </svg>`;
}
