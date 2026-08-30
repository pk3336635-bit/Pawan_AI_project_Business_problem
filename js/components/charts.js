/**
 * components/charts.js — dependency-free SVG/HTML charts.
 *
 * Every chart returns a markup string, is responsive through a viewBox and
 * exposes accessible text alternatives. No chart library, no canvas, ~6 KB.
 */

import { escapeHtml, currency, number, percent } from '../utils/format.js';

export const PALETTE = [
  '#e2621f', '#2a8248', '#c9942f', '#2f6fb0', '#a8452f',
  '#7a5335', '#d1477d', '#5aa7c9', '#8a6d3b', '#4f7942',
];

const niceMax = (value) => {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
};

/* -------------------------------------------------------------------------- */
/* Vertical bar chart                                                         */
/* -------------------------------------------------------------------------- */

/**
 * @param {{ data: Array<{label:string,value:number}>, height?:number,
 *           color?:string, format?:(n:number)=>string, caption?:string }} options
 */
export function barChart({ data = [], height = 220, color = PALETTE[0], format = number, caption = '' }) {
  if (!data.length) return emptyChart();

  const W = 640;
  const H = height;
  const padL = 46;
  const padR = 12;
  const padT = 16;
  const padB = 34;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const step = innerW / data.length;
  const barW = Math.max(4, Math.min(46, step * 0.62));

  const gridLines = [0, 0.25, 0.5, 0.75, 1]
    .map((fraction) => {
      const y = padT + innerH - fraction * innerH;
      return `<line class="chart__grid" x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}"></line>
              <text x="${padL - 8}" y="${y + 3}" text-anchor="end">${escapeHtml(format(max * fraction))}</text>`;
    })
    .join('');

  const bars = data
    .map((d, i) => {
      const h = max ? (d.value / max) * innerH : 0;
      const x = padL + i * step + (step - barW) / 2;
      const y = padT + innerH - h;
      const showLabel = data.length <= 16 || i % Math.ceil(data.length / 12) === 0;
      return `
        <g>
          <rect class="chart__bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}"
            height="${Math.max(1, h).toFixed(1)}" rx="4" fill="${color}">
            <title>${escapeHtml(d.label)}: ${escapeHtml(format(d.value))}</title>
          </rect>
          ${showLabel
            ? `<text x="${(x + barW / 2).toFixed(1)}" y="${H - 12}" text-anchor="middle">${escapeHtml(d.label)}</text>`
            : ''}
        </g>`;
    })
    .join('');

  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img"
      aria-label="${escapeHtml(caption || 'Bar chart')}">
      ${gridLines}
      <line class="chart__axis" x1="${padL}" x2="${W - padR}" y1="${padT + innerH}" y2="${padT + innerH}"></line>
      ${bars}
    </svg>`;
}

/* -------------------------------------------------------------------------- */
/* Line / area chart                                                          */
/* -------------------------------------------------------------------------- */

export function lineChart({ data = [], height = 220, color = PALETTE[0], format = currency, caption = '' }) {
  if (data.length < 2) return emptyChart();

  const W = 640;
  const H = height;
  const padL = 52;
  const padR = 14;
  const padT = 16;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const stepX = innerW / (data.length - 1);

  const points = data.map((d, i) => {
    const x = padL + i * stepX;
    const y = padT + innerH - (max ? (d.value / max) * innerH : 0);
    return [x, y, d];
  });

  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${path} L${(padL + innerW).toFixed(1)} ${padT + innerH} L${padL} ${padT + innerH} Z`;

  const grid = [0, 0.5, 1]
    .map((fraction) => {
      const y = padT + innerH - fraction * innerH;
      return `<line class="chart__grid" x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}"></line>
              <text x="${padL - 8}" y="${y + 3}" text-anchor="end">${escapeHtml(format(max * fraction))}</text>`;
    })
    .join('');

  const labelEvery = Math.max(1, Math.ceil(data.length / 8));
  const labels = points
    .map(([x, , d], i) =>
      i % labelEvery === 0
        ? `<text x="${x.toFixed(1)}" y="${H - 10}" text-anchor="middle">${escapeHtml(d.label)}</text>`
        : ''
    )
    .join('');

  const dots = points
    .map(([x, y, d]) => `
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${color}" opacity=".85">
        <title>${escapeHtml(d.label)}: ${escapeHtml(format(d.value))}</title>
      </circle>`)
    .join('');

  const gradientId = `grad-${Math.random().toString(36).slice(2, 8)}`;

  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(caption || 'Line chart')}">
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity=".28"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${grid}
      <path d="${area}" fill="url(#${gradientId})"></path>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></path>
      ${dots}
      ${labels}
    </svg>`;
}

/* -------------------------------------------------------------------------- */
/* Donut chart                                                                */
/* -------------------------------------------------------------------------- */

export function donutChart({ data = [], size = 200, thickness = 26, centerLabel = '', centerValue = '' }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (!total) return emptyChart();

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const arcs = data
    .map((d, i) => {
      const fraction = d.value / total;
      const dash = fraction * circumference;
      const markup = `
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none"
          stroke="${d.color || PALETTE[i % PALETTE.length]}" stroke-width="${thickness}"
          stroke-dasharray="${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}"
          stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})">
          <title>${escapeHtml(d.label)}: ${escapeHtml(number(d.value))} (${percent(fraction * 100)})</title>
        </circle>`;
      offset += dash;
      return markup;
    })
    .join('');

  const legend = data
    .map((d, i) => `
      <span>
        <i style="background:${d.color || PALETTE[i % PALETTE.length]}"></i>
        ${escapeHtml(d.label)} · <strong>${escapeHtml(percent((d.value / total) * 100, 0))}</strong>
      </span>`)
    .join('');

  return `
    <div class="row" style="gap:var(--sp-5);justify-content:center">
      <svg class="chart" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img"
        aria-label="Donut chart">
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="var(--cream-300)" stroke-width="${thickness}"></circle>
        ${arcs}
        ${centerValue
          ? `<text x="${size / 2}" y="${size / 2 - 2}" text-anchor="middle" font-size="20" font-weight="700" fill="var(--brown-700)">${escapeHtml(centerValue)}</text>`
          : ''}
        ${centerLabel
          ? `<text x="${size / 2}" y="${size / 2 + 16}" text-anchor="middle" font-size="10">${escapeHtml(centerLabel)}</text>`
          : ''}
      </svg>
    </div>
    <div class="chart-legend">${legend}</div>`;
}

/* -------------------------------------------------------------------------- */
/* Horizontal ranked bars (HTML, better for long labels)                      */
/* -------------------------------------------------------------------------- */

export function rankedBars(items = [], { format = number, showRank = true } = {}) {
  if (!items.length) return emptyChart();
  const max = Math.max(...items.map((item) => item.value)) || 1;

  return `<div class="hbar-list">
    ${items
      .map((item, index) => `
        <div class="hbar">
          <span class="hbar__label">
            ${showRank ? `<span class="hbar__rank">${index + 1}</span>` : ''}
            <span class="hbar__name" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span>
          </span>
          <span class="hbar__value">${escapeHtml(format(item.value))}</span>
          <span class="hbar__track">
            <span class="hbar__fill" style="width:${((item.value / max) * 100).toFixed(1)}%${item.color ? `;background:${item.color}` : ''}"></span>
          </span>
        </div>`)
      .join('')}
  </div>`;
}

/* -------------------------------------------------------------------------- */
/* Hour x weekday heatmap                                                     */
/* -------------------------------------------------------------------------- */

/**
 * @param {{ matrix: number[][], rowLabels: string[], colLabels: string[] }} options
 * matrix[row][col]
 */
export function heatmap({ matrix = [], rowLabels = [], colLabels = [], format = number }) {
  if (!matrix.length) return emptyChart();

  const max = Math.max(1, ...matrix.flat());
  const cols = colLabels.length;

  const head = `<div></div>${colLabels.map((label) => `<div class="heatmap__head">${escapeHtml(label)}</div>`).join('')}`;

  const rows = matrix
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          const intensity = value / max;
          const bg = intensity === 0
            ? 'var(--cream-300)'
            : `rgba(226, 98, 31, ${(0.14 + intensity * 0.86).toFixed(2)})`;
          return `<div class="heatmap__cell" style="background:${bg}"
            title="${escapeHtml(rowLabels[r])} ${escapeHtml(colLabels[c])}: ${escapeHtml(format(value))}"></div>`;
        })
        .join('');
      return `<div class="heatmap__label">${escapeHtml(rowLabels[r])}</div>${cells}`;
    })
    .join('');

  return `
    <div class="heatmap" style="grid-template-columns:54px repeat(${cols}, minmax(0, 1fr))" role="img"
      aria-label="Order volume heatmap by hour and weekday">
      ${head}
      ${rows}
    </div>
    <div class="chart-legend">
      <span><i style="background:var(--cream-300)"></i> quiet</span>
      <span><i style="background:rgba(226,98,31,.5)"></i> busy</span>
      <span><i style="background:rgba(226,98,31,1)"></i> peak</span>
    </div>`;
}

/* -------------------------------------------------------------------------- */
/* Progress / gauge                                                           */
/* -------------------------------------------------------------------------- */

export function progressBar(value, { max = 100, color = 'var(--primary)', label = '' } = {}) {
  const ratio = Math.max(0, Math.min(1, max ? value / max : 0));
  return `
    <div class="capacity-bar" role="progressbar" aria-valuenow="${Math.round(value)}"
      aria-valuemin="0" aria-valuemax="${max}" ${label ? `aria-label="${escapeHtml(label)}"` : ''}>
      <span class="capacity-bar__fill" style="width:${(ratio * 100).toFixed(1)}%;background:${color}"></span>
    </div>`;
}

export function emptyChart(message = 'Not enough data yet') {
  return `<div class="empty-state" style="padding:var(--sp-6) var(--sp-3)">
    <p class="text-muted mb-0">${escapeHtml(message)}</p>
  </div>`;
}
