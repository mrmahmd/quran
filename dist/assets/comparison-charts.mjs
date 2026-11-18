// Small SVG charts for the monthly comparison (no library). Right-to-left layout:
// the first category sits on the right, the value axis on the right edge.
// Every mark carries data-tip for the shared tooltip, and every chart has a table twin.

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const number = new Intl.NumberFormat('ar-EG');
const signed = new Intl.NumberFormat('ar-EG', { signDisplay: 'exceptZero' });
const percent = new Intl.NumberFormat('ar-EG', { style: 'percent', signDisplay: 'exceptZero', maximumFractionDigits: 0 });

// Validated with the dataviz palette script (light surface): blue/teal pass every check.
export const kindColors = { memorization: '#0f9f7f', revision: '#2a78d6' };
const statusColors = { up: '#0ca30c', down: '#d03b3b' };

function niceStep(maximum, count = 4) {
  const raw = Math.max(1, maximum) / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map(step => step * power).find(step => step >= raw);
}

// Rounded data-end (4px), square at the baseline.
function columnPath(x, y, width, height) {
  const r = Math.min(4, width / 2, height);
  if (height <= 0) return '';
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

function legend(series) {
  return `<ul class="mc-legend">${series.map(item => `<li><i style="background:${item.color}" aria-hidden="true"></i>${escape(item.name)}</li>`).join('')}</ul>`;
}

function tableTwin(caption, head, rows) {
  return `<details class="mc-chart-table"><summary>عرض الأرقام في جدول</summary><table><caption>${escape(caption)}</caption>
    <thead><tr>${head.map(cell => `<th scope="col">${escape(cell)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row => `<tr>${row.map((cell, index) => index ? `<td>${cell}</td>` : `<th scope="row">${escape(cell)}</th>`).join('')}</tr>`).join('')}</tbody></table></details>`;
}

// Grouped columns: categories on the x axis (months), one column per series (kind).
export function columnChart({ title, caption, categories, series, unit = 'آية', labelValues = true }) {
  const table = tableTwin(caption || title, ['', ...series.map(item => item.name)],
    categories.map((category, index) => [category, ...series.map(item => item.values[index] == null ? '—' : `${number.format(item.values[index])} ${unit}`)]));
  return `<figure class="mc-chart"><figcaption><strong>${escape(title)}</strong>${caption ? `<span>${escape(caption)}</span>` : ''}</figcaption>
    ${series.length > 1 ? legend(series) : ''}${frames(width => columnSvg({ width, title, categories, series, unit, labelValues }))}${table}</figure>`;
}

// Two drawings of each chart: a wide one, and a narrow one for phones with the same text size.
function frames(draw) {
  return `<div class="mc-chart-frame"><div class="mc-chart-wide">${draw(640)}</div><div class="mc-chart-narrow">${draw(360)}</div></div>`;
}

function columnSvg({ width, title, categories, series, unit, labelValues }) {
  const narrow = width < 500;
  const height = narrow ? 240 : 260, top = 30, bottom = 44, right = narrow ? 50 : 56, left = narrow ? 6 : 16;
  const plot = { width: width - right - left, height: height - top - bottom };
  const maximum = Math.max(1, ...series.flatMap(item => item.values.filter(value => value != null)));
  const step = niceStep(maximum);
  const ceiling = Math.ceil(maximum / step) * step;
  const y = value => top + plot.height - value / ceiling * plot.height;
  const band = plot.width / categories.length;
  const bar = Math.min(24, (band * 0.6 - (series.length - 1) * 2) / series.length);
  // Neighbouring columns sit far enough apart for their cap labels never to collide.
  const slot = Math.max(bar + 2, Math.min(narrow ? 40 : 56, band / series.length));
  const groupWidth = bar + slot * (series.length - 1);
  const showValues = labelValues;
  const ticks = [];
  for (let value = 0; value <= ceiling; value += step) ticks.push(value);
  // RTL: category 0 at the right end of the plot.
  const inset = narrow ? 14 : 0, inner = (plot.width - inset) / categories.length;
  const center = index => left + plot.width - inset - inner * (index + 0.5);
  const marks = categories.map((category, index) => series.map((item, s) => {
    const value = item.values[index];
    // Series order also runs right to left inside a group.
    const x = center(index) + groupWidth / 2 - bar - s * slot;
    if (value == null) return `<text class="mc-chart-na" x="${x + bar / 2}" y="${top + plot.height - 6}" text-anchor="middle">—</text>`;
    const tip = `${item.name} · ${category}: ${number.format(value)} ${unit}`;
    const h = top + plot.height - y(value);
    return `<g class="mc-chart-mark" tabindex="0" role="img" aria-label="${escape(tip)}" data-tip="${escape(tip)}">
      <rect x="${x - 4}" y="${top}" width="${bar + 8}" height="${plot.height}" fill="transparent"/>
      <path d="${columnPath(x, y(value), bar, h)}" fill="${item.color}"/>
      ${showValues ? `<text class="mc-chart-value" x="${x + bar / 2}" y="${y(value) - 7}" text-anchor="middle">${number.format(value)}</text>` : ''}</g>`;
  }).join('')).join('');
  return `<svg class="mc-chart-svg" viewBox="0 0 ${width} ${height}" role="group" aria-label="${escape(title)}">
    ${ticks.map(value => `<line class="mc-chart-gridline" x1="${left}" x2="${left + plot.width}" y1="${y(value)}" y2="${y(value)}"/>
      <text class="mc-chart-tick" x="${width - right + 8}" y="${y(value) + 4}" text-anchor="start">${number.format(value)}</text>`).join('')}
    ${marks}
    ${categories.map((category, index) => `<text class="mc-chart-category" x="${center(index)}" y="${height - 16}" text-anchor="middle">${escape(narrow && categories.length > 2 ? category.replace(/^الشهر\s+/, '') : category)}</text>`).join('')}
  </svg>`;
}

// Horizontal bars from a zero line: increases grow toward the reading direction (left in RTL).
// rows: [{ label, value, note? }]; value null = not comparable (listed under the chart).
export function divergingChart({ title, caption, rows, format = value => signed.format(value), unit = 'آية', emptyText = 'لا توجد بيانات للمقارنة.' }) {
  const measured = rows.filter(row => row.value != null).sort((a, b) => b.value - a.value);
  const missing = rows.filter(row => row.value == null);
  if (!measured.length) return `<figure class="mc-chart"><figcaption><strong>${escape(title)}</strong></figcaption><p class="mc-chart-empty">${escape(emptyText)}</p></figure>`;
  const table = tableTwin(caption || title, ['', 'التغيّر'], [...measured, ...missing].map(row => [row.label,
    row.value == null ? escape(row.note || '—') : `${row.value > 0 ? '↑' : row.value < 0 ? '↓' : '='} ${escape(format(row.value))}${row.note ? ' · ' + escape(row.note) : ''}`]));
  return `<figure class="mc-chart"><figcaption><strong>${escape(title)}</strong>${caption ? `<span>${escape(caption)}</span>` : ''}</figcaption>
    <ul class="mc-legend"><li><i style="background:${statusColors.up}" aria-hidden="true"></i>↑ زيادة</li><li><i style="background:${statusColors.down}" aria-hidden="true"></i>↓ نقص</li></ul>
    ${frames(width => divergingSvg({ width, title, measured, format }))}
    ${missing.length ? `<p class="mc-chart-missing">بلا مقارنة: ${missing.map(row => escape(row.label)).join('، ')}</p>` : ''}${table}</figure>`;
}

function divergingSvg({ width, title, measured, format }) {
  const narrow = width < 500;
  const rowHeight = 30, top = 8, labelWidth = narrow ? 112 : 170, valueRoom = narrow ? 74 : 116;
  const height = top * 2 + measured.length * rowHeight;
  const plot = width - labelWidth - valueRoom * 2;
  const maximum = Math.max(1, ...measured.map(row => Math.abs(row.value)));
  const hasDown = measured.some(row => row.value < 0), hasUp = measured.some(row => row.value > 0);
  // Zero line: centred when both directions exist, otherwise at the edge with room for one side.
  const zero = valueRoom + (hasDown && hasUp ? plot / 2 : hasDown ? 0 : plot);
  const scale = (hasDown && hasUp ? plot / 2 : plot) / maximum;
  const bars = measured.map((row, index) => {
    const y = top + index * rowHeight, size = Math.abs(row.value) * scale, up = row.value > 0, flat = row.value === 0;
    const x = up ? zero - size : zero;
    const color = up ? statusColors.up : statusColors.down;
    const arrow = flat ? '=' : up ? '↑' : '↓';
    const valueText = `${arrow} ${format(row.value)}`;
    const tip = `${row.label}: ${valueText}${row.note ? ' · ' + row.note : ''}`;
    const tx = flat ? zero - 8 : up ? x - 8 : x + size + 8;
    return `<g class="mc-chart-mark" tabindex="0" role="img" aria-label="${escape(tip)}" data-tip="${escape(tip)}">
      <rect x="0" y="${y}" width="${width}" height="${rowHeight}" fill="transparent"/>
      <text class="mc-chart-row-label" x="${width - 6}" y="${y + rowHeight / 2 + 5}" text-anchor="start">${escape(row.label)}</text>
      ${flat ? '' : `<rect x="${x}" y="${y + 7}" width="${Math.max(2, size)}" height="16" rx="4" fill="${color}"/>`}
      <text class="mc-chart-value" x="${tx}" y="${y + rowHeight / 2 + 5}" text-anchor="${flat || up ? 'start' : 'end'}">${escape(valueText)}</text></g>`;
    // (direction:rtl on the svg: "start" is the right edge of the text, "end" its left edge.)
  }).join('');
  return `<svg class="mc-chart-svg" viewBox="0 0 ${width} ${height}" role="group" aria-label="${escape(title)}" style="direction:rtl">
    <line class="mc-chart-axis" x1="${zero}" x2="${zero}" y1="0" y2="${height}"/>${bars}</svg>`;
}

// The arrow beside a value already gives its direction, so these print magnitudes.
const plainPercent = new Intl.NumberFormat('ar-EG', { style: 'percent', maximumFractionDigits: 0 });
export const formatPercentChange = value => plainPercent.format(Math.abs(value));
export const formatAyatChange = (value, unit = 'آية') => `${number.format(Math.abs(value))} ${unit}`;

// One tooltip per workspace; values come from data-tip and are set with textContent.
export function bindChartTooltips(host) {
  const tip = document.createElement('div');
  tip.className = 'mc-chart-tooltip';
  tip.setAttribute('role', 'status');
  tip.hidden = true;
  host.append(tip);
  const show = (mark, x, y) => {
    tip.textContent = mark.dataset.tip;
    tip.hidden = false;
    const box = host.getBoundingClientRect(), own = tip.getBoundingClientRect();
    const left = Math.min(Math.max(8, x - box.left - own.width / 2), box.width - own.width - 8);
    tip.style.insetInlineStart = '';
    tip.style.left = `${left}px`;
    tip.style.top = `${y - box.top - own.height - 12}px`;
  };
  const hide = () => { tip.hidden = true; };
  host.addEventListener('pointermove', event => {
    const mark = event.target.closest?.('.mc-chart-mark');
    if (mark && host.contains(mark)) show(mark, event.clientX, event.clientY); else hide();
  });
  host.addEventListener('pointerleave', hide);
  host.addEventListener('focusin', event => {
    const mark = event.target.closest?.('.mc-chart-mark');
    if (!mark) return;
    const rect = mark.getBoundingClientRect();
    show(mark, rect.left + rect.width / 2, rect.top);
  });
  host.addEventListener('focusout', hide);
}
