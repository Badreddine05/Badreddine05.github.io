import * as d3 from '../../vendor/d3.mjs';
import { css, fmt, pct, onThemeChange, observeWidth, prefersReducedMotion, tooltip, whenVisible } from '../site.js';
import { segmented, legend, PLAY, PAUSE } from './ui.js';

const data = await fetch(new URL('../../../data/figures/flowlens.json', import.meta.url)).then(r => r.json());
const L = data.labels;
const OUTCOMES = [
  { key: 'pending', label: 'À financer', color: () => css('--flow') },
  { key: 'denied', label: 'Refus', color: () => css('--retail') },
  { key: 'cancelled', label: 'Annulation', color: () => css('--data-muted') },
];
// State colours: preparation steps in grey, verification loop in ink and orange, outcomes as above.
const stateColor = i => (i <= 4 ? css('--ink-3') : i === 5 ? css('--ink') : i === 6 ? css('--grid') : i === 7 ? css('--flow') : i === 8 ? css('--retail') : css('--data-muted'));
const days = v => `${fmt(v, 1)} j`;

function text(g, x, y, value, { size = 11, anchor = 'start', color = '--ink-3', weight = 400, mono = true } = {}) {
  return g.append('text').attr('x', x).attr('y', y).attr('font-size', size).attr('font-weight', weight).attr('text-anchor', anchor).attr('fill', css(color)).attr('class', mono ? 'mono' : null).text(value);
}

/* ================================================== Figure 1 · process map */
const POS = [[0, 1], [1, 0.25], [2, 1], [3, 1], [4, 1], [5.05, 1], [5.05, 1.9], [6.4, 0.2], [6.4, 1], [6.4, 1.8]];
function processMap(el) {
  const plot = el.querySelector('.fig__plot');
  const controls = el.querySelector('.fig__controls');
  const tip = tooltip(plot);
  const svg = d3.select(plot).append('svg').attr('role', 'img').attr('aria-label', "Carte des dix états d'une demande de prêt et des 21 transitions observées entre eux, épaisseur proportionnelle au nombre de passages.");
  const edges = data.edges.filter(e => e.from !== e.to);
  let running = !prefersReducedMotion(), visible = false, raf = 0, tokens = [], paths = [], focus = null, width = 0;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'icon-btn';
  const syncButton = () => { button.innerHTML = running ? `${PAUSE}Mettre en pause` : `${PLAY}Lancer les dossiers`; button.setAttribute('aria-pressed', String(running)); };
  button.addEventListener('click', () => { running = !running; syncButton(); running ? start() : stop(); });
  controls.appendChild(button); syncButton();

  function start() {
    cancelAnimationFrame(raf);
    if (!running || !visible || prefersReducedMotion()) return;
    let last = performance.now(), acc = 0;
    const gTok = svg.select('.tokens');
    const total = d3.sum(paths, p => p.count);
    raf = requestAnimationFrame(function loop(now) {
      const dt = Math.min(64, now - last); last = now; acc += dt;
      while (acc > 45) {
        acc -= 45;
        if (tokens.length > 160) break;
        let pick = Math.random() * total;
        const p = paths.find(q => (pick -= q.count) <= 0) || paths[0];
        tokens.push({ p, t: 0, el: gTok.append('circle').attr('r', 2.6).attr('fill', css('--flow')).node() });
      }
      tokens = tokens.filter(tk => {
        tk.t += dt / 2200;
        if (tk.t >= 1) { tk.el.remove(); return false; }
        const pt = tk.p.node.getPointAtLength(tk.t * tk.p.length);
        tk.el.setAttribute('cx', pt.x); tk.el.setAttribute('cy', pt.y);
        tk.el.setAttribute('opacity', String(Math.min(1, Math.sin(Math.PI * tk.t) * 1.4) * (focus == null || tk.p.from === focus || tk.p.to === focus ? 1 : 0.15)));
        return true;
      });
      raf = requestAnimationFrame(loop);
    });
  }
  function stop() { cancelAnimationFrame(raf); }

  function draw(w) {
    width = w;
    stop(); tokens = [];
    svg.selectAll('*').remove();
    const narrow = width < 640;
    const height = narrow ? 300 : Math.min(400, Math.max(300, width * 0.34));
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);
    const px = d3.scaleLinear().domain([0, 6.4]).range([narrow ? 18 : 40, width - (narrow ? 18 : 40)]);
    const py = d3.scaleLinear().domain([0, 2]).range([36, height - 44]);
    const pos = POS.map(([a, b]) => [px(a), py(b)]);
    const wScale = d3.scaleSqrt().domain([0, d3.max(edges, e => e.count)]).range([0.8, narrow ? 9 : 14]);
    const gEdges = svg.append('g').attr('fill', 'none');
    paths = edges.map(e => {
      const [x1, y1] = pos[e.from], [x2, y2] = pos[e.to];
      const back = x2 < x1 - 1 || (e.from === 6 && e.to === 5);
      const mx = (x1 + x2) / 2;
      const d = back ? `M${x1},${y1} C${x1 + 46},${y1 + 18} ${x2 + 46},${y2 - 18} ${x2},${y2}` : `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
      const path = gEdges.append('path').attr('d', d).attr('stroke', css('--flow')).attr('stroke-width', wScale(e.count)).attr('stroke-opacity', 0.22).attr('stroke-linecap', 'round')
        .on('pointermove', ev => { const [mx2, my2] = d3.pointer(ev, plot); tip.show(`<b>${L[e.from]} → ${L[e.to]}</b><br><span class="mono">${fmt(e.count)} passages · médiane ${days(e.median)}</span>`, mx2, my2); })
        .on('pointerleave', () => tip.hide());
      return { ...e, node: path.node(), length: path.node().getTotalLength(), sel: path };
    });
    svg.append('g').attr('class', 'tokens').attr('pointer-events', 'none');
    const gNodes = svg.append('g');
    const above = new Set([1, 3, 5, 7]);
    const r = d3.scaleSqrt().domain([0, d3.max(data.nodes, n => n.cases)]).range([4, narrow ? 8 : 11]);
    data.nodes.forEach(n => {
      const [cx, cy] = pos[n.id];
      const g = gNodes.append('g').attr('tabindex', 0).attr('role', 'button').attr('aria-label', `${L[n.id]} : ${fmt(n.cases)} dossiers`).style('cursor', 'pointer');
      g.append('circle').attr('cx', cx).attr('cy', cy).attr('r', r(n.cases)).attr('fill', css('--paper')).attr('stroke', stateColor(n.id)).attr('stroke-width', 2.2);
      const anchor = n.id >= 7 ? 'end' : n.id === 0 ? 'start' : 'middle';
      const ty = cy + (above.has(n.id) ? -r(n.cases) - (narrow ? 8 : 22) : r(n.cases) + 16);
      text(g, cx + (n.id >= 7 ? 8 : 0), ty, L[n.id], { size: narrow ? 10 : 12, anchor, color: '--ink', mono: false, weight: 500 });
      if (!narrow) text(g, cx + (n.id >= 7 ? 8 : 0), ty + 14, `${fmt(n.cases)}`, { size: 10, anchor });
      const set = on => {
        focus = on ? n.id : null;
        for (const p of paths) p.sel.attr('stroke-opacity', focus == null ? 0.22 : p.from === focus || p.to === focus ? 0.55 : 0.06);
      };
      g.on('pointerenter focus', () => set(true)).on('pointerleave blur', () => set(false));
    });
    start();
  }
  observeWidth(plot, draw);
  onThemeChange(() => draw(plot.clientWidth));
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); }, { threshold: 0.1 }).observe(plot);
  else { visible = true; start(); }
}

/* ===================================================== Figure 2 · variants */
function variants(el) {
  const plot = el.querySelector('.fig__plot');
  const legendEl = el.querySelector('[data-legend]');
  const tip = tooltip(plot);
  const svg = d3.select(plot).append('svg').attr('role', 'img').attr('aria-label', 'Les dix parcours les plus fréquents, étape par étape, avec leur nombre de dossiers et leur durée médiane.');
  const list = data.variants;
  const total = data.totals.cases;
  let shown = false;
  function draw(width) {
    svg.selectAll('*').remove();
    const narrow = width < 700;
    const rowH = narrow ? 30 : 34, top = 22;
    const right = narrow ? 92 : 210;
    const maxLen = d3.max(list, v => v.path.length);
    const chipW = (width - right - 8) / maxLen;
    const showLabels = chipW > 74;
    const height = top + list.length * rowH;
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);
    const g = svg.append('g');
    text(g, 0, 12, 'Étapes, dans l\'ordre', { size: 10 });
    text(g, width, 12, narrow ? 'dossiers' : 'dossiers · part · médiane', { size: 10, anchor: 'end' });
    const bar = d3.scaleLinear().domain([0, list[0].count]).range([0, narrow ? 44 : 70]);
    list.forEach((v, row) => {
      const y = top + row * rowH;
      const gr = g.append('g').attr('transform', `translate(0,${y})`);
      v.path.forEach((s, i) => {
        const x = i * chipW;
        const chip = gr.append('g').attr('transform', `translate(${x},4)`);
        const rect = chip.append('rect').attr('width', Math.max(4, chipW - 3)).attr('height', rowH - 10).attr('rx', 3).attr('fill', stateColor(s)).attr('opacity', s <= 4 ? 0.28 : 0.9);
        if (showLabels) text(chip, 7, (rowH - 10) / 2 + 4, L[s], { size: 11, color: s <= 4 ? '--ink' : '--paper', mono: false, weight: 500 });
        chip.on('pointermove', ev => { const [px, py] = d3.pointer(ev, plot); tip.show(`<b>${L[s]}</b><br><span class="mono">étape ${i + 1} sur ${v.path.length}</span>`, px, py); }).on('pointerleave', () => tip.hide());
        if (!shown && !prefersReducedMotion()) rect.attr('transform', 'scale(0,1)').transition().delay(row * 50 + i * 35).duration(380).ease(d3.easeCubicOut).attr('transform', 'scale(1,1)');
      });
      const rx = width - right + 12;
      gr.append('rect').attr('x', rx).attr('y', rowH / 2 - 5).attr('height', 6).attr('width', bar(v.count)).attr('fill', css('--flow')).attr('opacity', 0.75);
      text(gr, rx + (narrow ? 48 : 76), rowH / 2 + 1, fmt(v.count), { size: 11, color: '--ink' });
      if (!narrow) {
        text(gr, width - 52, rowH / 2 + 1, pct(v.count / total, 1), { size: 11, anchor: 'end' });
        text(gr, width, rowH / 2 + 1, days(v.median), { size: 11, anchor: 'end' });
      }
    });
    shown = true;
    legend(legendEl, [
      { label: 'Préparation (création → dossier complet)', color: css('--ink-3'), kind: 'sq' },
      { label: 'Vérification', color: css('--ink'), kind: 'sq' },
      { label: 'Pièces manquantes', color: css('--grid'), kind: 'sq' },
      ...OUTCOMES.map(o => ({ label: o.label, color: o.color(), kind: 'sq' })),
    ]);
  }
  whenVisible(plot, () => { observeWidth(plot, draw); onThemeChange(() => draw(plot.clientWidth)); });
}

/* =================================================== Figure 3 · durations */
function durations(el) {
  const plot = el.querySelector('.fig__plot');
  const controls = el.querySelector('.fig__controls');
  const readout = el.querySelector('[data-readout]');
  const legendEl = el.querySelector('[data-legend]');
  const tip = tooltip(plot);
  const svg = d3.select(plot).append('svg').attr('role', 'img');
  let mode = 'all', width = 0, shown = false;
  const M = { t: 14, r: 10, b: 28, l: 48 };
  const bins = d3.range(61);
  function draw(animate) {
    const keys = mode === 'all' ? OUTCOMES : OUTCOMES.filter(o => o.key === mode);
    const height = Math.max(240, Math.min(320, width * 0.36));
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);
    const rows = bins.map(i => Object.fromEntries([['i', i], ...OUTCOMES.map(o => [o.key, keys.includes(o) ? data.durations[o.key][i] : 0])]));
    const stack = d3.stack().keys(OUTCOMES.map(o => o.key))(rows);
    const x = d3.scaleBand().domain(bins).range([M.l, width - M.r]).paddingInner(0.12);
    const y = d3.scaleLinear().domain([0, d3.max(rows, r => d3.sum(OUTCOMES, o => r[o.key]))]).nice().range([height - M.b, M.t]);
    svg.selectAll('.grid,.axis').remove();
    const grid = svg.insert('g', ':first-child').attr('class', 'grid');
    for (const v of y.ticks(4)) {
      grid.append('line').attr('x1', M.l).attr('x2', width - M.r).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', css('--rule'));
      text(grid, M.l - 8, y(v) + 4, fmt(v), { size: 10, anchor: 'end' });
    }
    const axis = svg.append('g').attr('class', 'axis');
    for (const d of [0, 10, 20, 30, 40, 50, 60]) text(axis, x(d) + x.bandwidth() / 2, height - 8, d === 60 ? '60 j et +' : `${d} j`, { size: 10, anchor: d === 60 ? 'end' : 'middle' });
    const t = animate && !prefersReducedMotion() ? d3.transition().duration(500).ease(d3.easeCubicInOut) : null;
    const layers = svg.selectAll('g.layer').data(stack, d => d.key);
    const enter = layers.enter().append('g').attr('class', 'layer');
    const merged = enter.merge(layers).attr('fill', d => OUTCOMES.find(o => o.key === d.key).color());
    merged.each(function (layer) {
      const rects = d3.select(this).selectAll('rect').data(layer, d => d.data.i);
      const rEnter = rects.enter().append('rect').attr('x', d => x(d.data.i)).attr('width', x.bandwidth()).attr('y', y(0)).attr('height', 0)
        .on('pointermove', (ev, d) => { const [px, py] = d3.pointer(ev, plot); const o = OUTCOMES.find(q => q.key === layer.key); tip.show(`<b>${d.data.i === 60 ? '60 jours et plus' : `${d.data.i} à ${d.data.i + 1} jours`}</b><br><span class="mono">${o.label} : ${fmt(d.data[layer.key])} dossiers</span>`, px, py); })
        .on('pointerleave', () => tip.hide());
      const all = rEnter.merge(rects).attr('x', d => x(d.data.i)).attr('width', x.bandwidth());
      const target = sel => sel.attr('y', d => y(d[1])).attr('height', d => Math.max(0, y(d[0]) - y(d[1])));
      if (!shown && !prefersReducedMotion()) target(all.transition().delay(d => d.data.i * 12).duration(500).ease(d3.easeCubicOut));
      else if (t) target(all.transition(t)); else target(all);
    });
    svg.selectAll('.marks').remove();
    const marks = svg.append('g').attr('class', 'marks');
    const stat = mode === 'all' ? { median: data.totals.median, p90: data.totals.p90 } : data.outcomes[mode];
    for (const [k, v] of [['médiane', stat.median], ['90e centile', stat.p90]]) {
      const xx = M.l + (v / 61) * (width - M.l - M.r);
      marks.append('line').attr('x1', xx).attr('x2', xx).attr('y1', M.t).attr('y2', height - M.b).attr('stroke', css('--ink')).attr('stroke-dasharray', '3 3');
      text(marks, xx + 5, M.t + 10, `${k} ${days(v)}`, { size: 10, color: '--ink' });
    }
    shown = true;
    const n = mode === 'all' ? data.totals.completed : data.outcomes[mode].count;
    readout.innerHTML = `<span><b>${fmt(n)}</b> dossiers terminés</span><span>Médiane <b>${days(stat.median)}</b></span><span>90e centile <b>${days(stat.p90)}</b></span>`;
    svg.attr('aria-label', `Répartition des durées de traitement, ${mode === 'all' ? 'toutes issues' : OUTCOMES.find(o => o.key === mode).label}.`);
    legend(legendEl, OUTCOMES.map(o => ({ label: `${o.label} (${fmt(data.outcomes[o.key].count)})`, color: o.color(), kind: 'sq' })));
  }
  segmented(controls, [{ value: 'all', label: 'Toutes les issues' }, ...OUTCOMES.map(o => ({ value: o.key, label: o.label }))], mode, v => { mode = v; draw(true); }, 'Choisir une issue');
  whenVisible(plot, () => { observeWidth(plot, w => { width = w; draw(false); }); onThemeChange(() => draw(false)); });
}

/* ====================================================== Figure 4 · where time goes */
function timeShare(el) {
  const plot = el.querySelector('.fig__plot');
  const tip = tooltip(plot);
  const svg = d3.select(plot).append('svg').attr('role', 'img').attr('aria-label', "Part du temps calendaire cumulé passé après chaque étape, avant l'étape suivante.");
  const rows = data.timeAfter.filter(t => t.days > 0).slice(0, 6);
  const total = d3.sum(data.timeAfter, t => t.days);
  let shown = false;
  function draw(width) {
    svg.selectAll('*').remove();
    const narrow = width < 560;
    const labelW = narrow ? 118 : 160, rowH = 34;
    const height = rows.length * rowH + 6;
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);
    const x = d3.scaleLinear().domain([0, 1]).range([0, width - labelW - 64]);
    rows.forEach((r, i) => {
      const y = i * rowH;
      const g = svg.append('g').attr('transform', `translate(0,${y})`);
      text(g, 0, rowH / 2 + 4, `après ${L[r.stage].toLowerCase()}`, { size: narrow ? 12 : 13, color: '--ink', mono: false });
      g.append('rect').attr('x', labelW).attr('y', 7).attr('height', rowH - 14).attr('width', x(1)).attr('fill', css('--paper-3')).attr('rx', 2);
      const bar = g.append('rect').attr('x', labelW).attr('y', 7).attr('height', rowH - 14).attr('rx', 2).attr('fill', i === 0 ? css('--flow') : css('--ink-3'))
        .attr('width', !shown && !prefersReducedMotion() ? 0 : x(r.days / total))
        .on('pointermove', ev => { const [px, py] = d3.pointer(ev, plot); tip.show(`<b>Après « ${L[r.stage]} »</b><br><span class="mono">${fmt(r.days)} jours cumulés · ${fmt(r.cases)} dossiers concernés</span>`, px, py); })
        .on('pointerleave', () => tip.hide());
      if (!shown && !prefersReducedMotion()) bar.transition().delay(150 + i * 90).duration(700).ease(d3.easeCubicOut).attr('width', x(r.days / total));
      text(g, labelW + x(1) + 10, rowH / 2 + 4, pct(r.days / total, 1), { size: 12, color: i === 0 ? '--ink' : '--ink-2', weight: i === 0 ? 500 : 400 });
    });
    shown = true;
  }
  whenVisible(plot, () => { observeWidth(plot, draw); onThemeChange(() => draw(plot.clientWidth)); });
}

/* ======================================================= Figure 5 · rework */
function rework(el) {
  const plot = el.querySelector('.fig__plot');
  const legendEl = el.querySelector('[data-legend]');
  const tip = tooltip(plot);
  const svg = d3.select(plot).append('svg').attr('role', 'img').attr('aria-label', 'Issue des dossiers selon qu\'ils sont passés une ou plusieurs fois par la vérification.');
  const groups = [
    { key: 'no', label: 'Une vérification ou aucune', median: data.rework.medianNo },
    { key: 'yes', label: 'Plusieurs vérifications', median: data.rework.medianYes },
  ];
  let shown = false;
  function draw(width) {
    svg.selectAll('*').remove();
    const narrow = width < 560;
    const rowH = 64, top = 4;
    const height = top + groups.length * rowH;
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);
    const x = d3.scaleLinear().domain([0, 1]).range([0, width]);
    groups.forEach((gr, i) => {
      const mix = data.reworkMix[gr.key];
      const y = top + i * rowH;
      const g = svg.append('g').attr('transform', `translate(0,${y})`);
      text(g, 0, 14, `${gr.label} · ${fmt(mix.count)} dossiers`, { size: 13, color: '--ink', mono: false, weight: 500 });
      if (!narrow) text(g, width, 14, `durée médiane ${days(gr.median)}`, { size: 11, anchor: 'end' });
      let acc = 0;
      OUTCOMES.forEach((o, k) => {
        const share = mix[o.key] / mix.count;
        const rect = g.append('rect').attr('y', 24).attr('height', 22).attr('fill', o.color()).attr('x', x(acc)).attr('width', !shown && !prefersReducedMotion() ? 0 : Math.max(0, x(share) - 2))
          .on('pointermove', ev => { const [px, py] = d3.pointer(ev, plot); tip.show(`<b>${o.label}</b><br><span class="mono">${fmt(mix[o.key])} dossiers · ${pct(share, 1)}</span>`, px, py); })
          .on('pointerleave', () => tip.hide());
        if (!shown && !prefersReducedMotion()) rect.transition().delay(200 + i * 200 + k * 120).duration(600).ease(d3.easeCubicOut).attr('width', Math.max(0, x(share) - 2));
        if (share > 0.07) text(g, x(acc) + 6, 39, pct(share, 0), { size: 11, color: o.key === 'cancelled' ? '--ink' : '--paper', weight: 500 });
        acc += share;
      });
      if (narrow) text(g, 0, 60, `durée médiane ${days(gr.median)}`, { size: 11 });
    });
    shown = true;
    legend(legendEl, OUTCOMES.map(o => ({ label: o.label, color: o.color(), kind: 'sq' })));
  }
  whenVisible(plot, () => { observeWidth(plot, draw); onThemeChange(() => draw(plot.clientWidth)); });
}

/* ===================================================== Figure 6 · scenario */
function scenario(el) {
  const plot = el.querySelector('.fig__plot');
  const controls = el.querySelector('.fig__controls');
  const readout = el.querySelector('[data-readout]');
  const legendEl = el.querySelector('[data-legend]');
  const svg = d3.select(plot).append('svg').attr('role', 'img');
  let stage = data.scenario[0].stage, level = 3, width = 0;
  const M = { t: 12, r: 10, b: 28, l: 48 };
  const range = document.createElement('div');
  range.className = 'range';
  range.innerHTML = `<label for="sc-range">Temps retiré après l'étape <output id="sc-out"></output></label><input id="sc-range" type="range" min="0" max="10" step="1" value="${level}">`;
  segmented(controls, data.scenario.map(s => ({ value: s.stage, label: `Après ${L[s.stage].toLowerCase()}` })), stage, v => { stage = v; draw(true); }, "Choisir l'étape");
  controls.appendChild(range);
  const input = range.querySelector('input'), out = range.querySelector('output');
  input.addEventListener('input', () => { level = Number(input.value); draw(true); });
  function draw(animate) {
    const sc = data.scenario.find(s => s.stage === stage);
    const before = sc.levels[0], after = sc.levels[level];
    out.textContent = `${level * 10} %`;
    const height = Math.max(220, Math.min(300, width * 0.32));
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);
    const x = d3.scaleBand().domain(d3.range(61)).range([M.l, width - M.r]).paddingInner(0.12);
    const yMax = Math.max(d3.max(before.hist), d3.max(after.hist));
    const y = d3.scaleLinear().domain([0, yMax]).nice().range([height - M.b, M.t]);
    svg.selectAll('.grid,.axis,.before').remove();
    const grid = svg.insert('g', ':first-child').attr('class', 'grid');
    for (const v of y.ticks(4)) {
      grid.append('line').attr('x1', M.l).attr('x2', width - M.r).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', css('--rule'));
      text(grid, M.l - 8, y(v) + 4, fmt(v), { size: 10, anchor: 'end' });
    }
    const axis = svg.append('g').attr('class', 'axis');
    for (const d of [0, 10, 20, 30, 40, 50, 60]) text(axis, x(d) + x.bandwidth() / 2, height - 8, d === 60 ? '60 j et +' : `${d} j`, { size: 10, anchor: d === 60 ? 'end' : 'middle' });
    const bars = svg.selectAll('rect.after').data(after.hist);
    const t = animate && !prefersReducedMotion() ? d3.transition().duration(450).ease(d3.easeCubicInOut) : null;
    const all = bars.enter().append('rect').attr('class', 'after').attr('y', y(0)).attr('height', 0).merge(bars)
      .attr('x', (_, i) => x(i)).attr('width', x.bandwidth()).attr('fill', css('--flow')).attr('opacity', 0.85);
    (t ? all.transition(t) : all).attr('y', v => y(v)).attr('height', v => y(0) - y(v));
    const line = d3.line().x((_, i) => x(i) + x.bandwidth() / 2).y(v => y(v)).curve(d3.curveStepAfter);
    svg.append('path').attr('class', 'before').attr('d', line(before.hist)).attr('fill', 'none').attr('stroke', css('--ink')).attr('stroke-width', 1.4);
    const gain = before.median - after.median;
    readout.innerHTML = `<span>Médiane <b>${days(before.median)}</b> → <b>${days(after.median)}</b>${level ? ` (−${fmt(gain, 1)} j)` : ''}</span><span>90e centile <b>${days(before.p90)}</b> → <b>${days(after.p90)}</b></span><span><b>${fmt(after.affected)}</b> dossiers concernés</span>`;
    svg.attr('aria-label', `Durées après avoir retiré ${level * 10} % du temps passé après l'étape ${L[stage]}.`);
    legend(legendEl, [{ label: 'Durées dans le scénario', color: css('--flow'), kind: 'sq' }, { label: 'Durées observées', color: css('--ink') }]);
  }
  whenVisible(plot, () => { observeWidth(plot, w => { width = w; draw(false); }); onThemeChange(() => draw(false)); });
}

const FIGS = { map: processMap, variants, durations, time: timeShare, rework, scenario };
document.querySelectorAll('[data-fig]').forEach(el => FIGS[el.dataset.fig]?.(el));
