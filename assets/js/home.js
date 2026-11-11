import * as d3 from '../vendor/d3.mjs';
import { css, fmt, pct, onThemeChange, observeWidth, prefersReducedMotion, tooltip, whenVisible } from './site.js';

const ACCENT = { gridpulse: '--grid', retailscope: '--retail', flowlens: '--flow', neurolab: '--neuro' };
const MARKS = {
  gridpulse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 16C4.5 16 5.5 9 8.5 9c2 0 2.2 3.2 4.1 3.2 2.2 0 2.8-6.7 5.4-6.7 2.3 0 2.8 7 3.5 10.5"/><g fill="currentColor" stroke="none"><circle cx="3" cy="20.5" r="1"/><circle cx="7.5" cy="20.5" r="1"/><circle cx="12" cy="20.5" r="1"/><circle cx="16.5" cy="20.5" r="1"/><circle cx="21" cy="20.5" r="1"/></g></svg>',
  retailscope: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="8" y="2.5" width="4.5" height="4.5" rx="1" opacity=".7"/><rect x="13.5" y="2.5" width="4.5" height="4.5" rx="1" opacity=".45"/><rect x="19" y="2.5" width="4.5" height="4.5" rx="1" opacity=".22"/><rect x="2.5" y="8" width="4.5" height="4.5" rx="1"/><rect x="8" y="8" width="4.5" height="4.5" rx="1" opacity=".7"/><rect x="13.5" y="8" width="4.5" height="4.5" rx="1" opacity=".45"/><rect x="2.5" y="13.5" width="4.5" height="4.5" rx="1"/><rect x="8" y="13.5" width="4.5" height="4.5" rx="1" opacity=".7"/><rect x="2.5" y="19" width="4.5" height="4.5" rx="1"/></svg>',
  flowlens: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12H6"/><path d="M6 12C8 7.6 9.8 6 12 6s4 1.6 6 6"/><path d="M6 12c2 4.4 3.8 6 6 6s4-1.6 6-6"/><path d="M18 12h3.5"/><circle cx="12" cy="6" r="2.3" fill="currentColor" stroke="none"/></svg>',
  neurolab: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13.2" r="8.4"/><path d="M10 5.05 12 2.6l2 2.45"/><g fill="currentColor" stroke="none"><circle cx="7.6" cy="13.2" r="1.7"/><circle cx="16.4" cy="13.2" r="1.7"/><circle cx="12" cy="13.2" r="1.15"/><circle cx="12" cy="8.9" r="1.15"/><circle cx="12" cy="17.5" r="1.15"/></g></svg>',
};
const NAMES = { gridpulse: 'GridPulse', retailscope: 'RetailScope', flowlens: 'FlowLens', neurolab: 'NeuroLab' };
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const monthLabel = m => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;

const data = await fetch('data/figures/home.json').then(r => r.json());

/* =============================================================== Figure 0 */
function hero() {
  const el = document.querySelector('[data-hero]');
  const textEl = document.querySelector('[data-hero-text]');
  const pager = document.querySelector('[data-hero-pager]');
  if (!el) return;
  const shapes = data.morph;
  const s = data.stats;
  const caption = {
    gridpulse: sh => `<strong>GridPulse</strong> · Consommation électrique moyenne, heure par heure, des jours ouvrés de janvier 2024 : de ${fmt(sh.min, 1)} GW la nuit à ${fmt(sh.max, 1)} GW en début de soirée.`,
    retailscope: sh => `<strong>RetailScope</strong> · Chiffre d'affaires net mensuel d'un e-commerçant britannique, de décembre 2010 à novembre 2011 : de ${fmt(sh.min, 2)} à ${fmt(sh.max, 2)} million de livres.`,
    flowlens: () => `<strong>FlowLens</strong> · Durée de traitement de ${fmt(s.flowlensCompleted)} demandes de prêt terminées, de 0 à 60 jours. La moitié est close en moins de ${fmt(s.flowlensMedian, 1)} jours.`,
    neurolab: () => `<strong>NeuroLab</strong> · Signal synthétique (aucun enregistrement réel) : un rythme à 10 Hz qui faiblit quand une personne imagine un mouvement de la main.`,
  };
  const ends = { gridpulse: ['0 h', '23 h'], retailscope: ['déc. 2010', 'nov. 2011'], flowlens: ['0 jour', '60 jours'], neurolab: ['0 s', '2 s'] };

  const svg = d3.select(el).append('svg').attr('aria-hidden', 'true');
  const area = svg.append('path').attr('class', 'hero-area');
  const line = svg.append('path').attr('fill', 'none').attr('stroke-width', 2).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
  const base = svg.append('line').attr('stroke-width', 1);
  const left = svg.append('text').attr('class', 'mono').attr('font-size', 11);
  const right = svg.append('text').attr('class', 'mono').attr('font-size', 11).attr('text-anchor', 'end');

  let index = 0, current = shapes[0].values.slice(), width = 0, height = 0, timer = null, anim = null;
  const n = current.length;
  const x = d3.scaleLinear().domain([0, n - 1]);
  const y = d3.scaleLinear().domain([0, 1]);
  const lineGen = d3.line().x((_, i) => x(i)).y(v => y(v)).curve(d3.curveCatmullRom.alpha(0.5));
  const areaGen = d3.area().x((_, i) => x(i)).y1(v => y(v)).curve(d3.curveCatmullRom.alpha(0.5));
  let color = css(ACCENT[shapes[0].id]);

  function paint() {
    line.attr('d', lineGen(current)).attr('stroke', color);
    area.attr('d', areaGen.y0(height - 22)(current)).attr('fill', color).attr('fill-opacity', 0.08);
  }
  function layout(w) {
    width = w; height = el.clientHeight;
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    x.range([0, width]);
    y.range([height - 30, 8]);
    base.attr('x1', 0).attr('x2', width).attr('y1', height - 22).attr('y2', height - 22).attr('stroke', css('--rule'));
    left.attr('x', 0).attr('y', height - 4).attr('fill', css('--ink-3'));
    right.attr('x', width).attr('y', height - 4).attr('fill', css('--ink-3'));
    paint();
  }
  function labels(sh) {
    left.text(ends[sh.id][0]); right.text(ends[sh.id][1]);
    textEl.innerHTML = caption[sh.id](sh);
    document.documentElement.style.setProperty('--dot', `var(${ACCENT[sh.id]})`);
    pager.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(i === index)));
  }
  function go(i, instant = prefersReducedMotion()) {
    index = (i + shapes.length) % shapes.length;
    const sh = shapes[index];
    const from = current.slice(), to = sh.values;
    const c0 = color, c1 = css(ACCENT[sh.id]);
    labels(sh);
    if (anim) anim.stop();
    if (instant) { current = to.slice(); color = c1; paint(); return; }
    const ease = d3.easeCubicInOut, ci = d3.interpolateRgb(c0, c1);
    anim = d3.timer(elapsed => {
      const t = Math.min(1, elapsed / 1100), k = ease(t);
      // Points travel with a slight left-to-right delay, which reads as a wave rather than a cross-fade.
      for (let j = 0; j < n; j++) {
        const local = Math.min(1, Math.max(0, (t * 1.35 - (j / n) * 0.35)));
        current[j] = from[j] + (to[j] - from[j]) * ease(local);
      }
      color = ci(k);
      paint();
      if (t >= 1) { anim.stop(); current = to.slice(); color = c1; paint(); }
    });
  }
  shapes.forEach((sh, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = MARKS[sh.id];
    b.style.color = `var(${ACCENT[sh.id]})`;
    b.setAttribute('aria-label', `Afficher la forme de ${NAMES[sh.id]}`);
    b.addEventListener('click', () => { go(i); restart(); });
    pager.appendChild(b);
  });
  let hovering = false, visible = true;
  const tick = () => { if (!hovering && visible && !document.hidden) go(index + 1); };
  function restart() { clearInterval(timer); if (!prefersReducedMotion()) timer = setInterval(tick, 5200); }
  el.parentElement.addEventListener('pointerenter', () => { hovering = true; });
  el.parentElement.addEventListener('pointerleave', () => { hovering = false; });
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(el);
  observeWidth(el, layout);
  labels(shapes[0]);
  onThemeChange(() => { color = css(ACCENT[shapes[index].id]); layout(el.clientWidth); });
  restart();
}

/* ========================================================= Thumbnails */
function frame(container, height) {
  container.style.position = 'relative';
  const svg = d3.select(container).insert('svg', 'figcaption').attr('role', 'img');
  return { svg, tip: tooltip(container), height };
}

function retailThumb(container) {
  const cohorts = data.thumbs.retailscope;
  const { svg, tip } = frame(container);
  svg.attr('aria-label', "Triangle de cohortes : part des clients actifs chaque mois après leur premier achat, de décembre 2010 à novembre 2011.");
  let shown = false;
  const draw = width => {
    svg.selectAll('*').remove();
    const labelW = 58, top = 18, gap = 2;
    const cw = Math.min(40, (width - labelW) / 12) - gap;
    const ch = 16;
    const height = top + cohorts.length * (ch + gap) + 4;
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);
    const accent = css('--retail'), empty = css('--paper-3');
    const scale = d3.scaleLinear().domain([0, 0.5]).range([empty, accent]).interpolate(d3.interpolateRgb).clamp(true);
    const g = svg.append('g');
    for (let a = 0; a < 12; a += 1) g.append('text').attr('class', 'mono').attr('font-size', 10).attr('fill', css('--ink-3')).attr('x', labelW + a * (cw + gap) + cw / 2).attr('y', 11).attr('text-anchor', 'middle').text(a === 0 ? 'M0' : `+${a}`);
    cohorts.forEach((c, r) => {
      const yy = top + r * (ch + gap);
      g.append('text').attr('class', 'mono').attr('font-size', 10).attr('fill', css('--ink-3')).attr('x', 0).attr('y', yy + ch - 4).text(monthLabel(c.month));
      c.retention.forEach((v, a) => {
        if (v == null) return;
        const rect = g.append('rect').attr('x', labelW + a * (cw + gap)).attr('y', yy).attr('width', cw).attr('height', ch).attr('rx', 1.5)
          .attr('fill', a === 0 ? accent : scale(v))
          .on('pointermove', ev => {
            const [px, py] = d3.pointer(ev, container);
            tip.show(`<b>Arrivés en ${monthLabel(c.month)}</b> · ${fmt(c.size)} clients<br><span class="mono">${a === 0 ? 'mois du premier achat' : `${a} mois plus tard`} : ${pct(v, 0)}</span>`, px, py);
          })
          .on('pointerleave', () => tip.hide());
        if (!shown && !prefersReducedMotion()) rect.attr('opacity', 0).transition().delay(120 + (a + r) * 35).duration(420).ease(d3.easeCubicOut).attr('opacity', 1);
      });
    });
    shown = true;
  };
  whenVisible(container, () => { observeWidth(container, draw); onThemeChange(() => draw(container.clientWidth)); });
}

function gridThumb(container) {
  const { first, daily } = data.thumbs.gridpulse;
  const { svg, tip } = frame(container);
  svg.attr('aria-label', 'Calendrier de la consommation électrique moyenne par jour en France, 2023 et 2024.');
  const start = new Date(first + 'T12:00:00Z');
  const days = daily.map((v, i) => {
    const d = new Date(start.getTime() + i * 86400000);
    return { date: d, value: v == null ? null : v / 10, year: d.getUTCFullYear(), weekday: (d.getUTCDay() + 6) % 7 };
  });
  const fmtDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  let shown = false;
  const draw = width => {
    svg.selectAll('*').remove();
    const labelW = 40, gap = 1.5, top = 16;
    const cell = Math.max(3, Math.floor(((width - labelW) / 53 - gap) * 10) / 10);
    const yearH = 7 * (cell + gap);
    const height = top + 2 * yearH + 14;
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);
    const values = days.map(d => d.value).filter(v => v != null);
    const color = d3.scaleLinear().domain(d3.extent(values)).range([css('--paper-3'), css('--grid')]).interpolate(d3.interpolateRgb);
    const g = svg.append('g');
    ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].forEach((m, i) => g.append('text').attr('class', 'mono').attr('font-size', 10).attr('fill', css('--ink-3')).attr('x', labelW + (i * 53 / 12) * (cell + gap)).attr('y', 10).text(m));
    for (const [k, year] of [2023, 2024].entries()) {
      const y0 = top + k * (yearH + 14);
      g.append('text').attr('class', 'mono').attr('font-size', 10).attr('fill', css('--ink-3')).attr('x', 0).attr('y', y0 + 10).text(year);
      const jan1 = Date.UTC(year, 0, 1, 12);
      const offset = (new Date(jan1).getUTCDay() + 6) % 7;
      for (const d of days.filter(dd => dd.year === year)) {
        const doy = Math.round((d.date.getTime() - jan1) / 86400000);
        const week = Math.floor((doy + offset) / 7);
        const rect = g.append('rect').attr('x', labelW + week * (cell + gap)).attr('y', y0 + d.weekday * (cell + gap)).attr('width', cell).attr('height', cell).attr('rx', 1)
          .attr('fill', d.value == null ? 'none' : color(d.value))
          .on('pointermove', ev => { const [px, py] = d3.pointer(ev, container); tip.show(`<b>${fmtDay.format(d.date)}</b><br><span class="mono">${d.value == null ? 'donnée incomplète' : `${fmt(d.value, 1)} GW en moyenne`}</span>`, px, py); })
          .on('pointerleave', () => tip.hide());
        if (!shown && !prefersReducedMotion()) rect.attr('opacity', 0).transition().delay(80 + week * 18 + k * 300).duration(360).attr('opacity', 1);
      }
    }
    shown = true;
  };
  whenVisible(container, () => { observeWidth(container, draw); onThemeChange(() => draw(container.clientWidth)); });
}

// Layout of the ten application states, in a 0..6.4 x 0..2 grid.
const FLOW_POS = [[0, 1], [1, 0.3], [2, 1], [3, 1], [4, 1], [5.05, 1], [5.05, 1.85], [6.4, 0.25], [6.4, 1], [6.4, 1.75]];
function flowThumb(container) {
  const { labels, nodes, edges } = data.thumbs.flowlens;
  const { svg, tip } = frame(container);
  svg.attr('aria-label', 'Carte des étapes d\'une demande de prêt, de la création à la décision, avec les transitions observées.');
  let raf = 0, running = false, visible = false, step = null, tokens = [], paths = [];
  const start = () => {
    if (running || !visible || !step || prefersReducedMotion()) return;
    running = true;
    let last = performance.now();
    raf = requestAnimationFrame(function loop(now) {
      if (!running) return;
      step(Math.min(64, now - last));
      last = now;
      raf = requestAnimationFrame(loop);
    });
  };
  const stop = () => { running = false; cancelAnimationFrame(raf); };
  const draw = width => {
    stop();
    svg.selectAll('*').remove();
    const height = Math.max(200, Math.min(260, width * 0.42));
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);
    const px = d3.scaleLinear().domain([0, 6.4]).range([28, width - 28]);
    const py = d3.scaleLinear().domain([0, 2]).range([28, height - 34]);
    const pos = FLOW_POS.map(([a, b]) => [px(a), py(b)]);
    const max = d3.max(edges, e => e[2]);
    const w = d3.scaleSqrt().domain([0, max]).range([0.6, 9]);
    const accent = css('--flow');
    const gEdges = svg.append('g').attr('fill', 'none').attr('stroke', accent);
    paths = edges.filter(e => e[0] !== e[1]).map(([from, to, count]) => {
      const [x1, y1] = pos[from], [x2, y2] = pos[to];
      const back = x2 < x1 || (from === 6 && to === 5);
      const mx = (x1 + x2) / 2, bend = back ? 26 : Math.abs(y2 - y1) < 1 ? -10 * Math.sign(x2 - x1 || 1) * 0 : 0;
      const d = back ? `M${x1},${y1} C${x1 + 30},${y1 + 10} ${x2 + 30},${y2 - 10} ${x2},${y2}` : `M${x1},${y1} C${mx},${y1 + bend} ${mx},${y2 + bend} ${x2},${y2}`;
      const p = gEdges.append('path').attr('d', d).attr('stroke-width', w(count)).attr('stroke-opacity', 0.28)
        .on('pointermove', ev => { const [mx2, my2] = d3.pointer(ev, container); tip.show(`<b>${labels[from]} → ${labels[to]}</b><br><span class="mono">${fmt(count)} passages</span>`, mx2, my2); })
        .on('pointerleave', () => tip.hide());
      return { node: p.node(), count, length: 0 };
    });
    paths.forEach(p => { p.length = p.node.getTotalLength(); });
    const gNodes = svg.append('g');
    const r = d3.scaleSqrt().domain([0, d3.max(nodes)]).range([2.5, 7]);
    // Labels alternate above and below the main line so neighbours never collide.
    const above = new Set([1, 3, 5, 7]);
    nodes.forEach((count, i) => {
      const [cx, cy] = pos[i];
      gNodes.append('circle').attr('cx', cx).attr('cy', cy).attr('r', r(count)).attr('fill', css('--paper')).attr('stroke', accent).attr('stroke-width', 1.6);
      gNodes.append('text').attr('class', 'mono').attr('font-size', width < 520 ? 9 : 10).attr('fill', css('--ink-2'))
        .attr('x', cx).attr('y', cy + (above.has(i) ? -13 : 21)).attr('text-anchor', i >= 7 ? 'end' : i === 0 ? 'start' : 'middle').text(labels[i]);
    });
    const gTokens = svg.append('g').attr('fill', accent);
    tokens = [];
    const total = d3.sum(paths, p => p.count);
    const spawn = () => {
      let pick = Math.random() * total;
      const p = paths.find(q => (pick -= q.count) <= 0) || paths[0];
      tokens.push({ p, t: 0, el: gTokens.append('circle').attr('r', 2.2).node() });
    };
    let acc = 0;
    step = dt => {
      acc += dt;
      while (acc > 70) { acc -= 70; if (tokens.length < 90) spawn(); }
      tokens = tokens.filter(tk => {
        tk.t += dt / 1800;
        if (tk.t >= 1) { tk.el.remove(); return false; }
        const pt = tk.p.node.getPointAtLength(tk.t * tk.p.length);
        tk.el.setAttribute('cx', pt.x); tk.el.setAttribute('cy', pt.y);
        tk.el.setAttribute('opacity', String(Math.sin(Math.PI * tk.t)));
        return true;
      });
    };
    start();
  };
  whenVisible(container, () => {
    visible = true;
    observeWidth(container, draw);
    onThemeChange(() => draw(container.clientWidth));
    if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      visible ? start() : stop();
    }).observe(container);
  }, { threshold: 0.1 });
}

function neuroThumb(container) {
  const { models, subjects } = data.thumbs.neurolab;
  const { svg, tip } = frame(container);
  svg.attr('aria-label', 'Précision équilibrée des neuf participants pour trois méthodes : référence, puissance spectrale, CSP.');
  const short = ['Référence', 'Puissance spectrale', 'CSP'];
  let shown = false;
  const draw = width => {
    svg.selectAll('*').remove();
    const height = 250, m = { t: 16, r: 54, b: 30, l: 44 };
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);
    const x = d3.scalePoint().domain(d3.range(models.length)).range([m.l + 10, width - m.r]);
    const y = d3.scaleLinear().domain([0.2, 0.8]).range([height - m.b, m.t]);
    const accent = css('--neuro');
    const g = svg.append('g');
    for (const v of [0.2, 0.4, 0.6, 0.8]) {
      g.append('line').attr('x1', m.l).attr('x2', width - m.r + 10).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', css('--rule'));
      g.append('text').attr('class', 'mono').attr('font-size', 10).attr('fill', css('--ink-3')).attr('x', m.l - 8).attr('y', y(v) + 3).attr('text-anchor', 'end').text(`${v * 100} %`);
    }
    g.append('line').attr('x1', m.l).attr('x2', width - m.r + 10).attr('y1', y(0.25)).attr('y2', y(0.25)).attr('stroke', css('--ink-3')).attr('stroke-dasharray', '3 3');
    g.append('text').attr('class', 'mono').attr('font-size', 10).attr('fill', css('--ink-3')).attr('x', width - m.r + 10).attr('y', y(0.25) - 6).attr('text-anchor', 'end').text('hasard, 25 %');
    short.forEach((label, i) => g.append('text').attr('font-size', 12).attr('fill', css('--ink-2')).attr('x', x(i)).attr('y', height - 8).attr('text-anchor', i === 0 ? 'start' : i === 2 ? 'end' : 'middle').text(label));
    const line = d3.line().x((_, i) => x(i)).y(v => y(v));
    const draws = [];
    subjects.forEach((vals, s) => {
      const p = g.append('path').attr('d', line(vals)).attr('fill', 'none').attr('stroke', accent).attr('stroke-opacity', 0.32).attr('stroke-width', 1.4)
        .on('pointermove', ev => { p.attr('stroke-opacity', 1); const [px, py] = d3.pointer(ev, container); tip.show(`<b>Participant ${s + 1}</b><br><span class="mono">${vals.map(v => pct(v, 0)).join(' → ')}</span>`, px, py); })
        .on('pointerleave', () => { p.attr('stroke-opacity', 0.32); tip.hide(); });
      draws.push(p);
    });
    const means = models.map(mo => mo.mean);
    const mean = g.append('path').attr('d', line(means)).attr('fill', 'none').attr('stroke', accent).attr('stroke-width', 3).attr('pointer-events', 'none');
    draws.push(mean);
    means.forEach((v, i) => {
      g.append('circle').attr('cx', x(i)).attr('cy', y(v)).attr('r', 4).attr('fill', accent);
      if (i > 0) g.append('text').attr('class', 'mono').attr('font-size', 11).attr('font-weight', 500).attr('fill', accent).attr('x', x(i) + (i === 2 ? 8 : 0)).attr('y', y(v) - 10).attr('text-anchor', i === 2 ? 'start' : 'middle').text(pct(v, 1));
    });
    if (!shown && !prefersReducedMotion()) for (const p of draws) {
      const len = p.node().getTotalLength();
      p.attr('stroke-dasharray', `${len} ${len}`).attr('stroke-dashoffset', len).transition().duration(900).delay(150).ease(d3.easeCubicOut).attr('stroke-dashoffset', 0).on('end', () => p.attr('stroke-dasharray', null));
    }
    shown = true;
  };
  whenVisible(container, () => { observeWidth(container, draw); onThemeChange(() => draw(container.clientWidth)); });
}

hero();
const thumbs = { retailscope: retailThumb, gridpulse: gridThumb, flowlens: flowThumb, neurolab: neuroThumb };
document.querySelectorAll('[data-thumb]').forEach(el => thumbs[el.dataset.thumb]?.(el));
