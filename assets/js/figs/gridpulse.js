import * as d3 from '../../vendor/d3.mjs';
import { css, fmt, pct, onThemeChange, observeWidth, prefersReducedMotion, tooltip, whenVisible } from '../site.js';
import { segmented, legend, hiDpiCanvas, themed } from './ui.js';

const data = await fetch(new URL('../../../data/figures/gridpulse.json', import.meta.url)).then(r => r.json());

const DAY_MS = 86400000;
const firstDay = Date.parse(data.days.first + 'T12:00:00Z');
const dayDate = i => new Date(firstDay + i * DAY_MS);
const fDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const fShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fMonth = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' });
const parisParts = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', hourCycle: 'h23' });
const parisDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
const parisHourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' });
const parisHour = ts => Number(parisHourFmt.formatToParts(new Date(ts)).find(p => p.type === 'hour').value);
const parisTick = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric' });
const parisLong = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' });
const stamp = ts => `${cap(parisLong.format(new Date(ts)))}, ${parisHour(ts)} h`;
const dayIndexOf = iso => Math.round((Date.parse(iso + 'T12:00:00Z') - firstDay) / DAY_MS);
const gw = mw => (mw == null ? null : mw / 1000);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

const FUEL_COLORS = {
  nucleaire: { light: '#cbc5b6', dark: '#59554c' },
  hydraulique: { light: '#4d6fc9', dark: '#7d9cf0' },
  eolien: { light: '#2a9d8f', dark: '#4cc2b3' },
  solaire: { light: '#e0a019', dark: '#f2c14e' },
  gaz: { light: '#c0395f', dark: '#f27ba3' },
  bioenergies: { light: '#6f9a4b', dark: '#9bc27a' },
  fioul: { light: '#8a6b5a', dark: '#b8977f' },
  charbon: { light: '#3d3a33', dark: '#a39f94' },
};

function svgText(g, x, y, text, { size = 11, anchor = 'start', color = '--ink-3', weight = 400, mono = true } = {}) {
  return g.append('text').attr('x', x).attr('y', y).attr('font-size', size).attr('font-weight', weight).attr('text-anchor', anchor)
    .attr('fill', css(color)).attr('class', mono ? 'mono' : null).text(text);
}

/* ===================================================== Figure 1 · heatmap */
function heatmap(el) {
  const plot = el.querySelector('.fig__plot');
  const tip = tooltip(plot);
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Carte de chaleur de la consommation électrique horaire en France, de janvier 2023 à décembre 2024. Les heures du soir en hiver sont les plus chargées.');
  plot.appendChild(canvas);
  const overlay = d3.select(plot).append('svg').style('position', 'absolute').style('inset', '0').style('pointer-events', 'none');
  const n = data.days.count;
  const values = data.heat;
  const finite = values.filter(v => v >= 0);
  const lo = d3.min(finite) / 10, hi = d3.max(finite) / 10;
  let revealed = prefersReducedMotion() ? 1 : 0, started = false, geom = null;
  const peaks = Object.values(data.years).map(y => ({ day: dayIndexOf(y.peak.date), hour: Number(y.peak.time.slice(0, 2)), mw: y.peak.mw, date: y.peak.date }));

  function offscreen() {
    const off = document.createElement('canvas');
    off.width = n; off.height = 24;
    const ctx = off.getContext('2d');
    const img = ctx.createImageData(n, 24);
    const scale = d3.scaleSequential(d3.interpolateLab(css('--paper-3'), css('--grid'))).domain([lo, hi]);
    for (let d = 0; d < n; d++) for (let h = 0; h < 24; h++) {
      const v = values[d * 24 + h];
      const k = (h * n + d) * 4;
      if (v < 0) { img.data[k + 3] = 0; continue; }
      const c = d3.rgb(scale(v / 10));
      img.data[k] = c.r; img.data[k + 1] = c.g; img.data[k + 2] = c.b; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return { off, scale };
  }
  let tex = offscreen();

  function paint() {
    const { ctx, l, t, w, h } = geom;
    ctx.clearRect(0, 0, geom.width, geom.height);
    ctx.imageSmoothingEnabled = false;
    const cols = Math.max(1, Math.round(n * revealed));
    ctx.drawImage(tex.off, 0, 0, cols, 24, l, t, (w * cols) / n, h);
  }
  function render(width) {
    const height = Math.round(Math.max(220, Math.min(340, width * 0.3)));
    const l = width < 560 ? 30 : 40, r = 6, t = 6, b = 24;
    const ctx = hiDpiCanvas(canvas, width, height);
    geom = { ctx, l, t, w: width - l - r, h: height - t - b, width, height };
    overlay.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
    overlay.selectAll('*').remove();
    const g = overlay.append('g');
    for (const hr of [0, 6, 12, 18, 23]) svgText(g, l - 6, t + ((hr + 0.5) * geom.h) / 24 + 4, `${hr} h`, { anchor: 'end', size: 10 });
    for (let d = 0; d < n; d++) {
      const date = dayDate(d);
      if (date.getUTCDate() !== 1 || date.getUTCMonth() % 3 !== 0) continue;
      const x = l + (d * geom.w) / n;
      g.append('line').attr('x1', x).attr('x2', x).attr('y1', t + geom.h).attr('y2', t + geom.h + 5).attr('stroke', css('--rule-2'));
      const label = date.getUTCMonth() === 0 ? `janv. ${date.getUTCFullYear()}` : fMonth.format(date);
      if (width >= 520 || date.getUTCMonth() === 0) svgText(g, x + 3, height - 6, label, { size: 10 });
    }
    for (const p of peaks) {
      const cx = l + ((p.day + 0.5) * geom.w) / n, cy = t + ((p.hour + 0.5) * geom.h) / 24;
      g.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 6).attr('fill', 'none').attr('stroke', css('--ink')).attr('stroke-width', 1.4).attr('class', 'peak').attr('opacity', revealed >= (p.day / n) ? 1 : 0);
    }
    paint();
  }
  function reveal() {
    if (started) return; started = true;
    if (prefersReducedMotion()) { revealed = 1; paint(); return; }
    const timer = d3.timer(elapsed => {
      revealed = d3.easeCubicInOut(Math.min(1, elapsed / 1600));
      paint();
      overlay.selectAll('.peak').attr('opacity', (_, i) => (revealed >= peaks[i].day / n ? 1 : 0));
      if (revealed >= 1) timer.stop();
    });
  }
  canvas.addEventListener('pointermove', ev => {
    if (!geom) return;
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    const d = Math.floor(((x - geom.l) / geom.w) * n), h = Math.floor(((y - geom.t) / geom.h) * 24);
    if (d < 0 || d >= n || h < 0 || h > 23) { tip.hide(); return; }
    const v = values[d * 24 + h];
    tip.show(`<b>${cap(fDay.format(dayDate(d)))}, ${h} h</b><br><span class="mono">${v < 0 ? 'donnée manquante' : `${fmt(v / 10, 1)} GW`}</span>`, x, y);
  });
  canvas.addEventListener('pointerleave', () => tip.hide());
  const scaleEl = el.querySelector('[data-scale]');
  const paintScale = () => {
    if (!scaleEl) return;
    scaleEl.innerHTML = `<span class="mono">${fmt(lo, 0)} GW</span><i style="background:linear-gradient(90deg, ${css('--paper-3')}, ${css('--grid')})"></i><span class="mono">${fmt(hi, 0)} GW</span>`;
  };
  paintScale();
  observeWidth(plot, render);
  onThemeChange(() => { tex = offscreen(); paintScale(); render(plot.clientWidth); });
  whenVisible(plot, reveal, { threshold: 0.3 });
}

/* =================================================== Figure 2 · one day */
function dayMix(el) {
  const plot = el.querySelector('.fig__plot');
  const controls = el.querySelector('.fig__controls');
  const readout = el.querySelector('[data-readout]');
  const legendEl = el.querySelector('[data-legend]');
  const tip = tooltip(plot);
  const fuels = data.fuels;
  const presets = Object.fromEntries(data.presets.map(p => [p.id, p]));
  const LABELS = { typical: 'Jour ouvré de janvier', peak: 'Pointe de 2024', low: "Creux d'été", sun: 'Le plus solaire', wind: 'Le plus venteux' };
  let current = 'typical', width = 0, drawn = false;
  const svg = d3.select(plot).append('svg').attr('role', 'img');
  const gGrid = svg.append('g'), gAreas = svg.append('g'), gLine = svg.append('g'), gAxis = svg.append('g'), gHover = svg.append('g');
  const x = d3.scaleLinear().domain([0, 23]);
  const y = d3.scaleLinear();
  const M = { t: 12, r: 12, b: 26, l: 44 };
  let height = 320;

  const stacked = p => {
    const rows = p.hours.map((h, i) => ({ i, ...Object.fromEntries(fuels.map((f, k) => [f.key, (h.mix[k] ?? 0) / 1000])) }));
    return d3.stack().keys(fuels.map(f => f.key))(rows);
  };
  const yMax = d3.max(data.presets, p => d3.max(p.hours, h => Math.max(d3.sum(h.mix) / 1000, (h.conso ?? 0) / 1000)));
  const area = d3.area().x(d => x(d.data.i)).y0(d => y(d[0])).y1(d => y(d[1])).curve(d3.curveMonotoneX);
  const line = d3.line().defined(h => h.conso != null).x((_, i) => x(i)).y(h => y(h.conso / 1000)).curve(d3.curveMonotoneX);

  function describe(p) {
    const date = new Date(p.date + 'T12:00:00Z');
    const conso = p.hours.map(h => h.conso).filter(v => v != null);
    const peakHour = p.hours.findIndex(h => h.conso === Math.max(...conso));
    const total = d3.sum(p.hours, h => d3.sum(h.mix));
    const share = key => d3.sum(p.hours, h => h.mix[fuels.findIndex(f => f.key === key)] ?? 0) / total;
    const surplus = d3.sum(p.hours, h => d3.sum(h.mix) - (h.conso ?? 0)) / 1000;
    readout.innerHTML = `<span>${cap(fDay.format(date))}</span><span>Pointe <b>${fmt(gw(Math.max(...conso)), 1)} GW</b> à ${peakHour} h</span><span>Nucléaire <b>${pct(share('nucleaire'), 0)}</b> · éolien <b>${pct(share('eolien'), 0)}</b> · solaire <b>${pct(share('solaire'), 0)}</b></span><span>Production − consommation <b>${surplus >= 0 ? '+' : '−'}${fmt(Math.abs(surplus), 0)} GWh</b></span>`;
    svg.attr('aria-label', `Production par filière et consommation heure par heure, ${fDay.format(date)}.`);
  }
  function draw(animate) {
    const p = presets[current];
    const layers = stacked(p);
    x.range([M.l, width - M.r]);
    y.domain([0, Math.ceil(yMax / 10) * 10]).range([height - M.b, M.t]);
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);
    gGrid.selectAll('*').remove(); gAxis.selectAll('*').remove();
    for (const v of y.ticks(5)) {
      gGrid.append('line').attr('x1', M.l).attr('x2', width - M.r).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', css('--rule'));
      svgText(gAxis, M.l - 8, y(v) + 4, `${v} GW`, { anchor: 'end', size: 10 });
    }
    for (const h of [0, 3, 6, 9, 12, 15, 18, 21, 23]) if (width > 480 || h % 6 === 0) svgText(gAxis, x(h), height - 8, `${h} h`, { anchor: h === 0 ? 'start' : h === 23 ? 'end' : 'middle', size: 10 });
    const t = animate && !prefersReducedMotion() ? d3.transition().duration(650).ease(d3.easeCubicInOut) : null;
    const paths = gAreas.selectAll('path').data(layers, d => d.key);
    const entered = paths.enter().append('path').attr('fill', d => themed(FUEL_COLORS[d.key])).attr('d', area);
    paths.attr('fill', d => themed(FUEL_COLORS[d.key]));
    (t ? paths.transition(t) : paths).attr('d', area);
    if (!drawn && !prefersReducedMotion()) {
      entered.attr('opacity', 0).transition().duration(500).delay((_, i) => i * 60).attr('opacity', 1);
    }
    const cl = gLine.selectAll('path').data([p.hours]);
    const clEnter = cl.enter().append('path').attr('fill', 'none').attr('stroke-width', 2.2).attr('stroke-linejoin', 'round').attr('d', line);
    gLine.selectAll('path').attr('stroke', css('--ink'));
    (t ? cl.transition(t) : cl).attr('d', line);
    if (!drawn && !prefersReducedMotion()) {
      const node = clEnter.node();
      if (node) { const len = node.getTotalLength(); clEnter.attr('stroke-dasharray', `${len} ${len}`).attr('stroke-dashoffset', len).transition().delay(300).duration(900).attr('stroke-dashoffset', 0).on('end', () => clEnter.attr('stroke-dasharray', null)); }
    }
    drawn = true;
    describe(p);
    paintLegend();
  }
  function hover(ev) {
    const [px] = d3.pointer(ev, svg.node());
    const i = Math.max(0, Math.min(23, Math.round(x.invert(px))));
    const h = presets[current].hours[i];
    gHover.selectAll('*').remove();
    gHover.append('line').attr('x1', x(i)).attr('x2', x(i)).attr('y1', M.t).attr('y2', height - M.b).attr('stroke', css('--ink')).attr('stroke-width', 1).attr('stroke-dasharray', '2 3');
    const rows = fuels.map((f, k) => ({ f, v: h.mix[k] })).filter(r => r.v > 50).reverse();
    tip.show(`<b>${i} h</b> · consommation <span class="mono">${fmt(gw(h.conso), 1)} GW</span><br>${rows.map(r => `<span style="color:${themed(FUEL_COLORS[r.f.key])}">■</span> ${r.f.label} <span class="mono">${fmt(r.v / 1000, 1)}</span>`).join('<br>')}<br><span class="mono">${fmt(h.co2, 0)} gCO₂/kWh</span>`, x(i), M.t + 20);
  }
  svg.on('pointermove', hover).on('pointerleave', () => { gHover.selectAll('*').remove(); tip.hide(); });
  segmented(controls, Object.keys(LABELS).map(k => ({ value: k, label: LABELS[k] })), current, v => { current = v; draw(true); }, 'Choisir une journée');
  const paintLegend = () => legend(legendEl, [...fuels.map(f => ({ label: f.label, color: themed(FUEL_COLORS[f.key]), kind: 'sq' })), { label: 'Consommation', color: css('--ink') }]);
  paintLegend();
  whenVisible(plot, () => {
    observeWidth(plot, w => { width = w; height = Math.max(260, Math.min(360, w * 0.42)); draw(false); });
    onThemeChange(() => { paintLegend(); draw(false); });
  });
}

/* ================================================== Figure 3 · forecast */
function forecastWeeks() {
  const f = data.forecast;
  const points = f.t.map((t, i) => ({ ts: (f.start + t * 3600) * 1000, obs: gw(f.observed[i]), pred: gw(f.prediction[i]), base: gw(f.baseline[i]), lo: gw(f.lower[i]), hi: gw(f.upper[i]) }));
  // Weeks start on Monday at midnight, Paris time. The last week absorbs the final two days.
  const weeks = [];
  for (const p of points) {
    const day = parisDay.format(new Date(p.ts));
    const monday = d3.utcMonday.floor(new Date(day + 'T12:00:00Z')).toISOString().slice(0, 10);
    let w = weeks.find(x => x.monday === monday);
    if (!w) { w = { monday, points: [] }; weeks.push(w); }
    w.points.push(p);
  }
  if (weeks.length > 1 && weeks.at(-1).points.length < 72) { weeks.at(-2).points.push(...weeks.pop().points); }
  return { points, weeks };
}

function forecast(el) {
  const plot = el.querySelector('.fig__plot');
  const controls = el.querySelector('.fig__controls');
  const readout = el.querySelector('[data-readout]');
  const legendEl = el.querySelector('[data-legend]');
  const tip = tooltip(plot);
  const { points, weeks } = forecastWeeks();
  let week = 0, width = 0, height = 320, drawn = false;
  const svg = d3.select(plot).append('svg').attr('role', 'img');
  const gGrid = svg.append('g'), gBand = svg.append('g'), gLines = svg.append('g'), gAxis = svg.append('g'), gHover = svg.append('g');
  const M = { t: 12, r: 12, b: 28, l: 44 };
  const yDomain = [Math.floor(d3.min(points, p => Math.min(p.lo, p.obs ?? Infinity, p.base)) / 5) * 5, Math.ceil(d3.max(points, p => Math.max(p.hi, p.obs ?? 0, p.base)) / 5) * 5];
  const x = d3.scaleTime(), y = d3.scaleLinear().domain(yDomain);
  const mk = key => d3.line().defined(p => p[key] != null).x(p => x(p.ts)).y(p => y(p[key])).curve(d3.curveMonotoneX);
  const band = d3.area().defined(p => p.lo != null).x(p => x(p.ts)).y0(p => y(p.lo)).y1(p => y(p.hi)).curve(d3.curveMonotoneX);

  function stats(list) {
    const valid = list.filter(p => p.obs != null && p.pred != null && p.base != null);
    return {
      mae: d3.mean(valid, p => Math.abs(p.obs - p.pred)) * 1000,
      base: d3.mean(valid, p => Math.abs(p.obs - p.base)) * 1000,
      cover: d3.mean(valid, p => (p.obs >= p.lo && p.obs <= p.hi ? 1 : 0)),
      n: valid.length,
    };
  }
  function draw(animate) {
    const list = weeks[week].points;
    const t = animate && !prefersReducedMotion() ? d3.transition().duration(600).ease(d3.easeCubicInOut) : null;
    x.domain([d3.min(list, p => p.ts), d3.max(list, p => p.ts)]).range([M.l, width - M.r]);
    y.range([height - M.b, M.t]);
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);
    gGrid.selectAll('*').remove(); gAxis.selectAll('*').remove();
    for (const v of y.ticks(5)) {
      gGrid.append('line').attr('x1', M.l).attr('x2', width - M.r).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', css('--rule'));
      svgText(gAxis, M.l - 8, y(v) + 4, `${v} GW`, { anchor: 'end', size: 10 });
    }
    const seen = new Set();
    for (const p of list) {
      const day = parisDay.format(new Date(p.ts));
      if (seen.has(day) || parisHour(p.ts) !== 0) continue;
      seen.add(day);
      const xx = x(p.ts);
      gGrid.append('line').attr('x1', xx).attr('x2', xx).attr('y1', M.t).attr('y2', height - M.b).attr('stroke', css('--rule')).attr('stroke-dasharray', '2 4');
      if (width > 520 || seen.size % 2 === 1) svgText(gAxis, xx + 4, height - 9, parisTick.format(new Date(p.ts)), { size: 10 });
    }
    const series = [
      { key: 'base', color: css('--data-muted'), width: 1.4, dash: '4 3' },
      { key: 'pred', color: css('--grid'), width: 2 },
      { key: 'obs', color: css('--ink'), width: 1.6 },
    ];
    const b = gBand.selectAll('path').data([list]);
    b.enter().append('path').merge(b).attr('fill', css('--grid-soft')).attr('opacity', 0.9);
    (t ? gBand.selectAll('path').transition(t) : gBand.selectAll('path')).attr('d', band);
    const lines = gLines.selectAll('path').data(series, s => s.key);
    lines.enter().append('path').attr('fill', 'none').attr('stroke-linejoin', 'round').merge(lines)
      .attr('stroke', s => s.color).attr('stroke-width', s => s.width).attr('stroke-dasharray', s => s.dash || null);
    const all = gLines.selectAll('path');
    (t ? all.transition(t) : all).attr('d', s => mk(s.key)(list));
    if (!drawn && !prefersReducedMotion()) all.attr('opacity', 0).transition().duration(600).delay((_, i) => 200 + i * 180).attr('opacity', 1);
    drawn = true;
    const s = stats(list), all8 = stats(points);
    readout.innerHTML = `<span>Semaine du ${fShort.format(new Date(weeks[week].monday + 'T12:00:00Z'))} · erreur moyenne <b>${fmt(s.mae, 0)} MW</b> pour le modèle, <b>${fmt(s.base, 0)} MW</b> pour la référence</span><span>Heures dans l'intervalle : <b>${pct(s.cover, 0)}</b> (période complète : ${pct(all8.cover, 1)})</span>`;
    svg.attr('aria-label', `Prévision à 24 heures et consommation observée, semaine du ${fShort.format(new Date(weeks[week].monday + 'T12:00:00Z'))}.`);
    paintLegend();
  }
  svg.on('pointermove', ev => {
    const [px] = d3.pointer(ev, svg.node());
    const list = weeks[week].points;
    const ts = x.invert(px).getTime();
    const p = list.reduce((a, q) => (Math.abs(q.ts - ts) < Math.abs(a.ts - ts) ? q : a), list[0]);
    gHover.selectAll('*').remove();
    gHover.append('line').attr('x1', x(p.ts)).attr('x2', x(p.ts)).attr('y1', M.t).attr('y2', height - M.b).attr('stroke', css('--ink')).attr('stroke-dasharray', '2 3');
    tip.show(`<b>${stamp(p.ts)}</b><br>Observé <span class="mono">${fmt(p.obs, 1)} GW</span><br>Prévu <span class="mono">${fmt(p.pred, 1)} GW</span> · référence <span class="mono">${fmt(p.base, 1)}</span><br><span class="mono">intervalle de ${fmt(p.lo, 1)} à ${fmt(p.hi, 1)} GW</span>`, x(p.ts), M.t + 10);
  }).on('pointerleave', () => { gHover.selectAll('*').remove(); tip.hide(); });
  segmented(controls, weeks.map((w, i) => ({ value: i, label: fShort.format(new Date(w.monday + 'T12:00:00Z')).replace('.', '') })), week, v => { week = v; draw(true); }, 'Choisir une semaine de test');
  const paintLegend = () => legend(legendEl, [
    { label: 'Consommation observée', color: css('--ink') },
    { label: 'Prévision du modèle', color: css('--grid') },
    { label: 'Intervalle annoncé à 90 %', color: css('--grid-soft'), kind: 'sq' },
    { label: 'Référence : même heure, semaine précédente', color: css('--data-muted'), kind: 'dash' },
  ]);
  paintLegend();
  whenVisible(plot, () => {
    observeWidth(plot, w => { width = w; height = Math.max(260, Math.min(360, w * 0.4)); draw(false); });
    onThemeChange(() => { paintLegend(); draw(false); });
  });
}

/* ================================================== Figure 4 · coverage */
function coverage(el) {
  const plot = el.querySelector('.fig__plot');
  const legendEl = el.querySelector('[data-legend]');
  const tip = tooltip(plot);
  const { points } = forecastWeeks();
  const byDay = d3.groups(points, p => parisDay.format(new Date(p.ts)));
  const svg = d3.select(plot).append('svg').attr('role', 'img').attr('aria-label', "Pour chaque heure de la période de test, la consommation observée est-elle dans l'intervalle annoncé ? Les dépassements se regroupent sur des journées entières.");
  let shown = false;
  const status = p => (p.obs == null ? null : p.obs > p.hi ? 'above' : p.obs < p.lo ? 'below' : 'in');
  const colors = () => ({ in: css('--paper-3'), above: css('--grid'), below: css('--ink-2') });
  function draw(width) {
    svg.selectAll('*').remove();
    const l = 30, t = 4, b = 22, gap = 1;
    const cw = (width - l) / byDay.length;
    const ch = Math.max(5, Math.min(9, cw * 0.9));
    const height = t + 24 * ch + b;
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);
    const c = colors();
    const g = svg.append('g');
    for (const hr of [0, 12, 23]) svgText(g, l - 6, t + (hr + 0.7) * ch, `${hr} h`, { anchor: 'end', size: 10 });
    byDay.forEach(([day, list], i) => {
      const date = new Date(day + 'T12:00:00Z');
      if (date.getUTCDay() === 1) svgText(g, l + i * cw, height - 6, fShort.format(date).replace('.', ''), { size: 10 });
      for (const p of list) {
        const hr = parisHour(p.ts);
        const s = status(p);
        if (!s) continue;
        const rect = g.append('rect').attr('x', l + i * cw).attr('y', t + hr * ch).attr('width', Math.max(1, cw - gap)).attr('height', ch - gap).attr('fill', c[s])
          .on('pointermove', ev => { const [px, py] = d3.pointer(ev, plot); tip.show(`<b>${stamp(p.ts)}</b><br><span class="mono">observé ${fmt(p.obs, 1)} GW · intervalle de ${fmt(p.lo, 1)} à ${fmt(p.hi, 1)}</span>`, px, py); })
          .on('pointerleave', () => tip.hide());
        if (!shown && !prefersReducedMotion()) rect.attr('opacity', 0).transition().delay(i * 14).duration(300).attr('opacity', 1);
      }
    });
    shown = true;
    paintLegend();
  }
  const paintLegend = () => { const c = colors(); legend(legendEl, [{ label: "Dans l'intervalle", color: c.in, kind: 'sq' }, { label: 'Au-dessus (plus de demande que prévu)', color: c.above, kind: 'sq' }, { label: 'En dessous', color: c.below, kind: 'sq' }]); };
  paintLegend();
  whenVisible(plot, () => { observeWidth(plot, draw); onThemeChange(() => { paintLegend(); draw(plot.clientWidth); }); });
}

const FIGS = { heatmap, day: dayMix, forecast, coverage };
document.querySelectorAll('[data-fig]').forEach(el => FIGS[el.dataset.fig]?.(el));
