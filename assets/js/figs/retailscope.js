import * as d3 from '../../vendor/d3.mjs';
import { css, fmt, pct, onThemeChange, observeWidth, prefersReducedMotion, tooltip, whenVisible } from '../site.js';
import { segmented, legend } from './ui.js';

const data = await fetch(new URL('../../../data/figures/retailscope.json', import.meta.url)).then(r => r.json());
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const mLong = m => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const mShort = m => `${SHORT[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
// Amounts are stored in thousandths of a pound: 1e9 milli = £1 million.
const pounds = milli => `${fmt(milli / 1e9, 2)} M£`;
const SEG_COLORS = { Champions: '--retail', Fidèles: '--ink', 'Nouveaux observés': '--flow', Occasionnels: '--data-muted', 'À réactiver': '--grid' };

function text(g, x, y, value, { size = 11, anchor = 'start', color = '--ink-3', weight = 400, mono = true } = {}) {
  return g.append('text').attr('x', x).attr('y', y).attr('font-size', size).attr('font-weight', weight).attr('text-anchor', anchor).attr('fill', css(color)).attr('class', mono ? 'mono' : null).text(value);
}

/* ================================================ Figure 1 · monthly sales */
function monthly(el) {
  const plot = el.querySelector('.fig__plot');
  const controls = el.querySelector('.fig__controls');
  const legendEl = el.querySelector('[data-legend]');
  const tip = tooltip(plot);
  const svg = d3.select(plot).append('svg').attr('role', 'img');
  let mode = 'net', width = 0, shown = false;
  const rows = data.monthly;
  const M = { t: 18, r: 8, b: 28, l: 56 };
  function draw(animate) {
    const height = Math.max(260, Math.min(360, width * 0.36));
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);
    const value = r => (mode === 'net' ? [r.ukNet, r.net - r.ukNet] : [r.orders, 0]);
    const x = d3.scaleBand().domain(rows.map(r => r.month)).range([M.l, width - M.r]).paddingInner(0.28);
    const y = d3.scaleLinear().domain([0, d3.max(rows, r => d3.sum(value(r)))]).nice().range([height - M.b, M.t]);
    svg.selectAll('.grid,.axis,.note').remove();
    const grid = svg.insert('g', ':first-child').attr('class', 'grid');
    for (const v of y.ticks(4)) {
      grid.append('line').attr('x1', M.l).attr('x2', width - M.r).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', css('--rule'));
      text(grid, M.l - 8, y(v) + 4, mode === 'net' ? (v ? `${fmt(v / 1e9, 1)} M£` : '0') : fmt(v), { size: 10, anchor: 'end' });
    }
    const axis = svg.append('g').attr('class', 'axis');
    rows.forEach((r, i) => { if (width > 560 || i % 2 === 0) text(axis, x(r.month) + x.bandwidth() / 2, height - 8, mShort(r.month), { size: 10, anchor: 'middle' }); });
    const colors = [css('--retail'), d3.interpolateLab(css('--paper'), css('--retail'))(0.42)];
    const t = animate && !prefersReducedMotion() ? d3.transition().duration(550).ease(d3.easeCubicInOut) : null;
    const groups = svg.selectAll('g.bar').data(rows, r => r.month);
    const gEnter = groups.enter().append('g').attr('class', 'bar');
    gEnter.append('rect').attr('class', 'b0');
    gEnter.append('rect').attr('class', 'b1');
    const all = gEnter.merge(groups);
    all.each(function (r, i) {
      const [a, b] = value(r);
      const g = d3.select(this);
      const r0 = g.select('.b0').attr('x', x(r.month)).attr('width', x.bandwidth()).attr('fill', colors[0]);
      const r1 = g.select('.b1').attr('x', x(r.month)).attr('width', x.bandwidth()).attr('fill', colors[1]);
      const set0 = s => s.attr('y', y(a)).attr('height', y(0) - y(a));
      const set1 = s => s.attr('y', y(a + b)).attr('height', y(a) - y(a + b));
      if (!shown && !prefersReducedMotion()) {
        r0.attr('y', y(0)).attr('height', 0); r1.attr('y', y(0)).attr('height', 0);
        set0(r0.transition().delay(i * 55).duration(600).ease(d3.easeCubicOut));
        set1(r1.transition().delay(300 + i * 55).duration(500).ease(d3.easeCubicOut));
      } else if (t) { set0(r0.transition(t)); set1(r1.transition(t)); } else { set0(r0); set1(r1); }
      g.on('pointermove', ev => {
        const [px, py] = d3.pointer(ev, plot);
        tip.show(mode === 'net'
          ? `<b>${mLong(r.month)}</b><br>Chiffre d'affaires net <span class="mono">${pounds(r.net)}</span><br><span class="mono">Royaume-Uni ${pounds(r.ukNet)} · autres pays ${pounds(r.net - r.ukNet)}</span>`
          : `<b>${mLong(r.month)}</b><br><span class="mono">${fmt(r.orders)} commandes</span>`, px, py);
      }).on('pointerleave', () => tip.hide());
    });
    const peak = rows.reduce((a, r) => (d3.sum(value(r)) > d3.sum(value(a)) ? r : a), rows[0]);
    const note = svg.append('g').attr('class', 'note');
    text(note, x(peak.month) + x.bandwidth(), y(d3.sum(value(peak))) - 8, mode === 'net' ? pounds(peak.net) : `${fmt(peak.orders)} commandes`, { size: 11, anchor: 'end', color: '--ink', weight: 500 });
    shown = true;
    svg.attr('aria-label', mode === 'net' ? "Chiffre d'affaires net par mois, de décembre 2010 à novembre 2011, Royaume-Uni et autres pays." : 'Nombre de commandes par mois, de décembre 2010 à novembre 2011.');
    legend(legendEl, mode === 'net' ? [{ label: 'Royaume-Uni', color: colors[0], kind: 'sq' }, { label: 'Autres pays', color: colors[1], kind: 'sq' }] : [{ label: 'Commandes, tous pays', color: colors[0], kind: 'sq' }]);
  }
  segmented(controls, [{ value: 'net', label: "Chiffre d'affaires net" }, { value: 'orders', label: 'Commandes' }], mode, v => { mode = v; draw(true); }, 'Choisir la mesure');
  whenVisible(plot, () => { observeWidth(plot, w => { width = w; draw(false); }); onThemeChange(() => draw(false)); });
}

/* =================================================== Figure 2 · cleaning */
function cleaning(el) {
  const plot = el.querySelector('.fig__plot');
  const svg = d3.select(plot).append('svg').attr('role', 'img').attr('aria-label', 'Du fichier source aux lignes retenues : doublons et prix invalides retirés, lignes sans client conservées pour les totaux.');
  const c = data.meta.counts;
  const steps = [
    { label: 'Lignes de la source', value: c.source_rows, kind: 'total' },
    { label: 'Doublons exacts', value: -c.duplicates_removed, kind: 'out' },
    { label: 'Prix nul ou négatif', value: -c.nonpositive_price, kind: 'out' },
    { label: 'Lignes retenues', value: c.accepted_rows, kind: 'total' },
    { label: 'dont sans identifiant client', value: c.missing_customer_kept, kind: 'part' },
  ];
  let shown = false;
  function draw(width) {
    svg.selectAll('*').remove();
    const narrow = width < 560;
    const labelW = narrow ? 150 : 210, rowH = 36, valueW = 76;
    const height = steps.length * rowH;
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);
    const x = d3.scaleLinear().domain([0, c.source_rows]).range([labelW, width - valueW]);
    let cursor = c.source_rows;
    steps.forEach((s, i) => {
      const y = i * rowH;
      const g = svg.append('g');
      text(g, 0, y + rowH / 2 + 4, s.label, { size: narrow ? 12 : 13, color: s.kind === 'part' ? '--ink-2' : '--ink', mono: false, weight: s.kind === 'total' ? 600 : 400 });
      let x0, x1, fill;
      if (s.kind === 'total') { x0 = x(0); x1 = x(s.value); fill = css('--retail'); cursor = s.value; }
      else if (s.kind === 'out') { x0 = x(cursor + s.value); x1 = x(cursor); fill = css('--ink'); cursor += s.value; }
      else { x0 = x(0); x1 = x(s.value); fill = d3.interpolateLab(css('--paper'), css('--retail'))(0.42); }
      const w = Math.max(2, x1 - x0);
      const rect = g.append('rect').attr('y', y + 8).attr('height', rowH - 16).attr('rx', 1.5).attr('fill', fill).attr('x', x0).attr('width', !shown && !prefersReducedMotion() ? 0 : w);
      if (!shown && !prefersReducedMotion()) rect.transition().delay(i * 160).duration(600).ease(d3.easeCubicOut).attr('width', w);
      text(g, width, y + rowH / 2 + 4, `${s.value < 0 ? '−' : ''}${fmt(Math.abs(s.value))}`, { size: 12, anchor: 'end', color: s.kind === 'total' ? '--ink' : '--ink-2', weight: s.kind === 'total' ? 500 : 400 });
      // Removed rows sit at the right end of the bar, so their share is written to the left of it.
      if (s.kind === 'out') text(g, x0 - 8, y + rowH / 2 + 4, pct(Math.abs(s.value) / c.source_rows, 1), { size: 11, anchor: 'end' });
      if (s.kind === 'part') text(g, x1 + 8, y + rowH / 2 + 4, `${pct(s.value / c.accepted_rows, 1)} des lignes retenues`, { size: 11 });
    });
    shown = true;
  }
  whenVisible(plot, () => { observeWidth(plot, draw); onThemeChange(() => draw(plot.clientWidth)); });
}

/* ==================================================== Figure 3 · cohorts */
function cohorts(el) {
  const plot = el.querySelector('.fig__plot');
  const controls = el.querySelector('.fig__controls');
  const tip = tooltip(plot);
  const svg = d3.select(plot).append('svg').attr('role', 'img').attr('aria-label', "Triangle de cohortes : part des clients de chaque mois d'arrivée qui achètent de nouveau les mois suivants.");
  const rows = data.cohorts;
  let mode = 'rate', width = 0, shown = false;
  function draw() {
    svg.selectAll('*').remove();
    const narrow = width < 640;
    const labelW = narrow ? 52 : 96, top = 30, gap = 2;
    const cw = (width - labelW - (narrow ? 0 : 60)) / 12 - gap;
    const ch = narrow ? 22 : 30;
    const height = top + rows.length * (ch + gap) + 6;
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);
    const accent = css('--retail'), base = css('--paper-3');
    const scale = d3.scaleLinear().domain([0, 0.4]).range([base, accent]).interpolate(d3.interpolateLab).clamp(true);
    const g = svg.append('g');
    text(g, labelW, 10, 'Mois après le premier achat', { size: 10 });
    for (let a = 0; a < 12; a++) text(g, labelW + a * (cw + gap) + cw / 2, 24, a === 0 ? 'M0' : `+${a}`, { size: 10, anchor: 'middle' });
    if (!narrow) text(g, width, 24, 'clients', { size: 10, anchor: 'end' });
    rows.forEach((c, r) => {
      const y = top + r * (ch + gap);
      text(g, 0, y + ch / 2 + 4, narrow ? mShort(c.month) : mLong(c.month), { size: narrow ? 10 : 12, color: '--ink-2', mono: narrow });
      if (!narrow) text(g, width, y + ch / 2 + 4, fmt(c.size), { size: 11, anchor: 'end' });
      c.retention.forEach((v, a) => {
        const x = labelW + a * (cw + gap);
        if (v == null) {
          g.append('rect').attr('x', x).attr('y', y).attr('width', cw).attr('height', ch).attr('rx', 2).attr('fill', 'none').attr('stroke', css('--rule')).attr('stroke-dasharray', '2 3');
          return;
        }
        const cell = g.append('g');
        const rect = cell.append('rect').attr('x', x).attr('y', y).attr('width', cw).attr('height', ch).attr('rx', 2).attr('fill', a === 0 ? css('--ink') : scale(v));
        const label = mode === 'rate' ? (a === 0 ? '100' : fmt(v * 100, 0)) : fmt(Math.round(v * c.size));
        if (cw > 30) text(cell, x + cw / 2, y + ch / 2 + 4, label, { size: narrow ? 9 : 11, anchor: 'middle', color: a === 0 || v > 0.3 ? '--paper' : '--ink', mono: true });
        cell.on('pointermove', ev => { const [px, py] = d3.pointer(ev, plot); tip.show(`<b>Arrivés en ${mLong(c.month)}</b> · ${fmt(c.size)} clients<br><span class="mono">${a === 0 ? 'mois du premier achat' : `${a} mois plus tard`} : ${pct(v, 1)}, soit ${fmt(Math.round(v * c.size))} clients</span>`, px, py); })
          .on('pointerleave', () => tip.hide());
        if (!shown && !prefersReducedMotion()) cell.attr('opacity', 0).transition().delay(100 + (a + r) * 40).duration(380).attr('opacity', 1);
      });
    });
    shown = true;
  }
  segmented(controls, [{ value: 'rate', label: 'Part de la cohorte (%)' }, { value: 'count', label: 'Nombre de clients' }], mode, v => { mode = v; shown = true; draw(); }, 'Choisir la valeur affichée');
  whenVisible(plot, () => { observeWidth(plot, w => { width = w; draw(); }); onThemeChange(draw); });
}

/* ======================================================== Figure 4 · RFM */
function rfm(el) {
  const plot = el.querySelector('.fig__plot');
  const legendEl = el.querySelector('[data-legend]');
  const tip = tooltip(plot);
  const svg = d3.select(plot).append('svg').attr('role', 'img').attr('aria-label', 'Nuage des 4 297 clients identifiés : jours depuis le dernier achat, nombre de commandes et montant, coloré par segment.');
  const names = data.segments.map(s => s.name);
  const pts = data.customers.map(([recency, frequency, money, seg]) => ({ recency, frequency, money, seg: names[seg] }));
  let shown = false, active = null;
  function draw(width) {
    svg.selectAll('*').remove();
    const height = Math.max(300, Math.min(440, width * 0.46));
    const M = { t: 12, r: 12, b: 34, l: 46 };
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);
    const x = d3.scaleLinear().domain([0, 370]).range([M.l, width - M.r]);
    const y = d3.scaleLog().domain([1, 220]).range([height - M.b, M.t]);
    const r = d3.scaleSqrt().domain([0, d3.max(pts, p => p.money)]).range([1.6, width < 600 ? 10 : 16]);
    const g = svg.append('g');
    for (const v of [1, 2, 3, 5, 10, 20, 50, 100, 200]) {
      g.append('line').attr('x1', M.l).attr('x2', width - M.r).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', css('--rule'));
      text(g, M.l - 8, y(v) + 4, fmt(v), { size: 10, anchor: 'end' });
    }
    for (const v of [0, 30, 60, 90, 180, 270, 365]) text(g, x(v), height - 16, `${v} j`, { size: 10, anchor: v === 0 ? 'start' : 'middle' });
    text(g, width - M.r, height - 2, 'jours depuis le dernier achat', { size: 10, anchor: 'end' });
    text(g, M.l, M.t - 2, 'commandes', { size: 10 });
    for (const v of [30, 60, 90]) g.append('line').attr('x1', x(v)).attr('x2', x(v)).attr('y1', M.t).attr('y2', height - M.b).attr('stroke', css('--rule-2')).attr('stroke-dasharray', '3 3');
    const gp = svg.append('g');
    const sorted = [...pts].sort((a, b) => b.money - a.money);
    // Deterministic jitter so that customers with the same small order count do not overlap exactly.
    let seed = 7;
    const jitter = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 4294967296 - 0.5) * 0.64; };
    const dots = gp.selectAll('circle').data(sorted).enter().append('circle')
      .attr('cx', p => x(p.recency)).attr('cy', p => y(Math.max(1, p.frequency + (p.frequency < 6 ? jitter() : 0))))
      .attr('r', p => r(p.money)).attr('fill', p => css(SEG_COLORS[p.seg])).attr('fill-opacity', 0.55).attr('stroke', css('--paper')).attr('stroke-width', 0.6)
      .on('pointermove', (ev, p) => { const [px, py] = d3.pointer(ev, plot); tip.show(`<b>${p.seg}</b><br><span class="mono">dernier achat il y a ${p.recency} j · ${p.frequency} commande${p.frequency > 1 ? 's' : ''} · ${fmt(p.money)} £</span>`, px, py); })
      .on('pointerleave', () => tip.hide());
    if (!shown && !prefersReducedMotion()) dots.attr('r', 0).transition().delay((_, i) => 200 + (i % 400) * 2).duration(500).attr('r', p => r(p.money));
    const apply = () => dots.attr('fill-opacity', p => (active == null || p.seg === active ? 0.6 : 0.06));
    apply();
    shown = true;
    legendEl.innerHTML = '';
    legendEl.classList.add('legend');
    for (const s of data.segments) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'icon-btn';
      b.setAttribute('aria-pressed', String(active === s.name));
      b.innerHTML = `<i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${css(SEG_COLORS[s.name])}"></i>${s.name} · ${fmt(s.count)}`;
      b.addEventListener('click', () => { active = active === s.name ? null : s.name; draw(plot.clientWidth); });
      legendEl.appendChild(b);
    }
  }
  whenVisible(plot, () => { observeWidth(plot, draw); onThemeChange(() => draw(plot.clientWidth)); });
}

/* ============================================== Figure 5 · segment shares */
function shares(el) {
  const plot = el.querySelector('.fig__plot');
  const legendEl = el.querySelector('[data-legend]');
  const svg = d3.select(plot).append('svg').attr('role', 'img').attr('aria-label', 'Part des clients et part des achats de chaque segment.');
  const total = d3.sum(data.segments, s => s.count), money = d3.sum(data.segments, s => s.monetary);
  let shown = false;
  function draw(width) {
    svg.selectAll('*').remove();
    const narrow = width < 560;
    const labelW = narrow ? 120 : 150, rowH = 44;
    const height = data.segments.length * rowH;
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);
    const x = d3.scaleLinear().domain([0, 0.75]).range([labelW, width - 52]);
    data.segments.forEach((s, i) => {
      const y = i * rowH;
      const g = svg.append('g');
      text(g, 0, y + 20, s.name, { size: 13, color: '--ink', mono: false, weight: 500 });
      const bars = [[s.count / total, css('--data-muted'), 8], [s.monetary / money, css(SEG_COLORS[s.name]), 22]];
      bars.forEach(([v, color, dy], k) => {
        const rect = g.append('rect').attr('x', labelW).attr('y', y + dy).attr('height', 11).attr('rx', 1.5).attr('fill', color).attr('width', !shown && !prefersReducedMotion() ? 0 : x(v) - labelW);
        if (!shown && !prefersReducedMotion()) rect.transition().delay(i * 90 + k * 180).duration(600).ease(d3.easeCubicOut).attr('width', x(v) - labelW);
        text(g, x(v) + 6, y + dy + 10, pct(v, 0), { size: 11, color: k ? '--ink' : '--ink-3', weight: k ? 500 : 400 });
      });
    });
    shown = true;
    legend(legendEl, [{ label: 'Part des clients identifiés', color: css('--data-muted'), kind: 'sq' }, { label: 'Part des achats (barre colorée)', color: css('--retail'), kind: 'sq' }]);
  }
  whenVisible(plot, () => { observeWidth(plot, draw); onThemeChange(() => draw(plot.clientWidth)); });
}

const FIGS = { monthly, cleaning, cohorts, rfm, shares };
document.querySelectorAll('[data-fig]').forEach(el => FIGS[el.dataset.fig]?.(el));
