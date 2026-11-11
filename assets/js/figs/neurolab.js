import * as d3 from '../../vendor/d3.mjs';
import { css, fmt, pct, onThemeChange, observeWidth, prefersReducedMotion, tooltip, whenVisible } from '../site.js';
import { segmented, legend, PLAY, PAUSE } from './ui.js';

const data = await fetch(new URL('../../../data/figures/neurolab.json', import.meta.url)).then(r => r.json());
const CLASSES = [
  { key: 'left_hand', label: 'Main gauche', short: 'Gauche', arrow: 'left' },
  { key: 'right_hand', label: 'Main droite', short: 'Droite', arrow: 'right' },
  { key: 'feet', label: 'Pieds', short: 'Pieds', arrow: 'down' },
  { key: 'tongue', label: 'Langue', short: 'Langue', arrow: 'up' },
];
const MODELS = { baseline: 'Référence', bandpower: 'Puissance spectrale + LDA', csp: 'CSP + LDA' };
const summary = Object.fromEntries(data.summary.map(s => [s.model, s]));

// Approximate 10-20 positions of the 22 electrodes, head radius 1, nose up.
const POS = {
  Fz: [0, -0.5], FC3: [-0.5, -0.25], FC1: [-0.25, -0.25], FCz: [0, -0.25], FC2: [0.25, -0.25], FC4: [0.5, -0.25],
  C5: [-0.75, 0], C3: [-0.5, 0], C1: [-0.25, 0], Cz: [0, 0], C2: [0.25, 0], C4: [0.5, 0], C6: [0.75, 0],
  CP3: [-0.5, 0.25], CP1: [-0.25, 0.25], CPz: [0, 0.25], CP2: [0.25, 0.25], CP4: [0.5, 0.25],
  P1: [-0.25, 0.5], Pz: [0, 0.5], P2: [0.25, 0.5], POz: [0, 0.75],
};
const CHANNELS = ['C3', 'Cz', 'C4'];
// Relative mu amplitude during imagery (1 = rest). A simplified textbook picture, not fitted to the data.
const ERD = {
  rest: { C3: 1, Cz: 1, C4: 1 },
  left_hand: { C3: 1.1, Cz: 0.92, C4: 0.36 },
  right_hand: { C3: 0.36, Cz: 0.92, C4: 1.1 },
  feet: { C3: 1.05, Cz: 0.42, C4: 1.05 },
  tongue: { C3: 0.66, Cz: 1, C4: 0.66 },
};

function text(g, x, y, value, { size = 11, anchor = 'start', color = '--ink-3', weight = 400, mono = true } = {}) {
  return g.append('text').attr('x', x).attr('y', y).attr('font-size', size).attr('font-weight', weight).attr('text-anchor', anchor).attr('fill', css(color)).attr('class', mono ? 'mono' : null).text(value);
}
function arrowPath(dir, cx, cy, s) {
  const a = { right: 0, down: 90, left: 180, up: 270 }[dir];
  return `<g transform="translate(${cx},${cy}) rotate(${a}) scale(${s})"><path d="M-10 0H8M2-6l7 6-7 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const rowNorm = m => m.map(row => { const t = d3.sum(row); return row.map(v => v / t); });

/* --------------------------------------------------------- Signal model */
// Synthetic EEG for C3, Cz, C4. "raw" adds drift, line noise and broadband noise; "clean" keeps 8-30 Hz components.
function generator(seed = 3) {
  const rand = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
  const phase = { C3: rand() * 6, Cz: rand() * 6, C4: rand() * 6 };
  const bphase = { C3: rand() * 6, Cz: rand() * 6, C4: rand() * 6 };
  const amp = { C3: 1, Cz: 1, C4: 1 };
  let t = 0;
  return {
    get t() { return t; },
    step(dt, target) {
      t += dt;
      const out = {};
      for (const ch of CHANNELS) {
        amp[ch] += (target[ch] - amp[ch]) * Math.min(1, dt / 0.35);
        const f = 10 + 0.4 * Math.sin(0.9 * t + phase[ch]);
        phase[ch] += 2 * Math.PI * f * dt;
        bphase[ch] += 2 * Math.PI * 21 * dt;
        const clean = amp[ch] * Math.sin(phase[ch]) + 0.28 * (0.6 + 0.4 * amp[ch]) * Math.sin(bphase[ch]);
        const raw = clean + 0.8 * Math.sin(2 * Math.PI * 0.35 * t + phase.Cz * 0.1 + CHANNELS.indexOf(ch)) + 0.18 * Math.sin(2 * Math.PI * 50 * t) + 0.32 * gauss();
        out[ch] = { clean, raw, amp: amp[ch] };
      }
      return out;
    },
  };
}

/* ======================================================= Figure 1 · pipeline */
function pipeline(el) {
  const plot = el.querySelector('.fig__plot');
  const controls = el.querySelector('.fig__controls');
  const tallyEl = el.querySelector('[data-readout]');
  const svg = d3.select(plot).append('svg').attr('role', 'img').attr('aria-label', "Animation : une flèche indique le mouvement à imaginer, le rythme à 10 Hz faiblit au-dessus du cortex moteur opposé, la puissance du signal filtré baisse sur l'électrode concernée, puis le classifieur choisit une classe selon les fréquences réelles de sa matrice de confusion.");
  const conf = rowNorm(summary.csp.confusion);
  const FS = 120, WINDOW = 2.4, N = Math.round(FS * WINDOW);
  const buffers = Object.fromEntries(CHANNELS.map(ch => [ch, { raw: new Float32Array(N), clean: new Float32Array(N) }]));
  const gen = generator(11);
  const rand = rng(2024);
  let running = !prefersReducedMotion(), visible = false, raf = 0, layout = null;
  let trial = null, forced = null, tally = { n: 0, ok: 0 };
  const PHASES = { fixation: 1.2, imagery: 3.6, decision: 2.2 };

  const playBtn = document.createElement('button');
  playBtn.type = 'button'; playBtn.className = 'icon-btn';
  const syncPlay = () => { playBtn.innerHTML = running ? `${PAUSE}Pause` : `${PLAY}Lecture`; playBtn.setAttribute('aria-pressed', String(running)); };
  playBtn.addEventListener('click', () => { running = !running; syncPlay(); running ? start() : stop(); });
  const picker = segmented(controls, CLASSES.map((c, i) => ({ value: i, label: c.label })), -1, v => { forced = v; newTrial(v); if (!running) { running = true; syncPlay(); start(); } }, 'Choisir le mouvement imaginé');
  controls.appendChild(playBtn); syncPlay();

  function sample(probs) {
    let r = rand();
    for (let i = 0; i < probs.length; i++) if ((r -= probs[i]) <= 0) return i;
    return probs.length - 1;
  }
  function newTrial(cls = null) {
    const c = cls ?? Math.floor(rand() * 4);
    trial = { cls: c, t: 0, phase: 'fixation', pred: sample(conf[c]), counted: false, power: null };
    picker.set(c);
  }
  function target() {
    if (!trial || trial.phase === 'fixation') return ERD.rest;
    return ERD[CLASSES[trial.cls].key];
  }

  function build(width) {
    svg.selectAll('*').remove();
    const narrow = width < 760;
    const L = {};
    let height;
    if (narrow) {
      const r = Math.min(92, width * 0.27);
      L.cue = { x: width / 2, y: 50 };
      L.head = { cx: width / 2, cy: 86 + r * 1.14, r };
      L.sig = { x: 8, y: L.head.cy + r + 58, w: width - 16, h: 210 };
      L.pow = { x: 8, y: L.sig.y + L.sig.h + 60, w: width - 16, h: 80 };
      L.dec = { x: 8, y: L.pow.y + L.pow.h + 48, w: width - 16, h: 110 };
      height = L.dec.y + L.dec.h + 36;
    } else {
      const colW = width / 100;
      L.head = { cx: colW * 11, cy: 216, r: Math.min(100, colW * 9.5) };
      L.cue = { x: colW * 11, y: 58 };
      L.sig = { x: colW * 25, y: 70, w: colW * 36, h: 270 };
      L.pow = { x: colW * 65, y: 110, w: colW * 13, h: 190 };
      L.dec = { x: colW * 82, y: 110, w: colW * 18, h: 190 };
      height = 380;
    }
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);
    const accent = css('--neuro');
    const steps = svg.append('g');
    const top = 18;
    const stepLabels = narrow
      ? [['1 · Électrodes', 8, top], ['2 · Signal filtré 8-30 Hz', 8, L.sig.y - 16], ['3 · Puissance par électrode', 8, L.pow.y - 18], ['4 · Décision', 8, L.dec.y - 18]]
      : [['1 · Électrodes', L.head.cx - L.head.r, top], ['2 · Signal filtré 8-30 Hz', L.sig.x, top], ['3 · Puissance', L.pow.x, top], ['4 · Décision', L.dec.x, top]];
    for (const [label, x, y] of stepLabels) text(steps, x, y, label, { size: 12, color: '--ink', weight: 600, mono: false });

    // Cue box
    const cue = svg.append('g').attr('class', 'cue').style('color', css('--ink'));
    L.cueSel = cue;

    // Head
    const head = svg.append('g');
    const { cx, cy, r } = L.head;
    head.append('circle').attr('cx', cx).attr('cy', cy).attr('r', r).attr('fill', 'none').attr('stroke', css('--rule-2')).attr('stroke-width', 1.5);
    head.append('path').attr('d', `M${cx - r * 0.12},${cy - r * 0.99} L${cx},${cy - r * 1.14} L${cx + r * 0.12},${cy - r * 0.99}`).attr('fill', 'none').attr('stroke', css('--rule-2')).attr('stroke-width', 1.5);
    text(head, cx - r - 6, cy + 4, 'G', { size: 10, anchor: 'end' });
    text(head, cx + r + 6, cy + 4, 'D', { size: 10 });
    L.dots = Object.entries(POS).map(([name, [px, py]]) => {
      const big = CHANNELS.includes(name);
      const c = head.append('circle').attr('cx', cx + px * r).attr('cy', cy + py * r).attr('r', big ? 8 : 5).attr('stroke', css('--paper')).attr('stroke-width', 1.5);
      return { name, c, px, py, big };
    });
    // Labels drawn last, with a halo in the paper colour so they stay legible over neighbouring electrodes.
    for (const d of L.dots.filter(e => e.big)) {
      text(head, cx + d.px * r, cy + d.py * r + 21, d.name, { size: 11, anchor: 'middle', color: '--ink', weight: 500 })
        .attr('stroke', css('--paper')).attr('stroke-width', 3.5).attr('paint-order', 'stroke').attr('stroke-linejoin', 'round');
    }

    // Signals
    const sig = svg.append('g');
    const rowH = L.sig.h / 3;
    L.traces = CHANNELS.map((ch, i) => {
      const y0 = L.sig.y + rowH * (i + 0.5);
      sig.append('line').attr('x1', L.sig.x + 30).attr('x2', L.sig.x + L.sig.w).attr('y1', y0).attr('y2', y0).attr('stroke', css('--rule'));
      const label = text(sig, L.sig.x, y0 + 4, ch, { size: 11, color: '--ink-2' });
      const raw = sig.append('polyline').attr('fill', 'none').attr('stroke', css('--data-muted')).attr('stroke-width', 1).attr('opacity', 0.55);
      const clean = sig.append('polyline').attr('fill', 'none').attr('stroke', accent).attr('stroke-width', 1.6).attr('stroke-linejoin', 'round');
      return { ch, y0, raw, clean, label, amp: rowH * 0.3 };
    });
    text(sig, L.sig.x + L.sig.w, L.sig.y + L.sig.h + 16, `${WINDOW} dernières secondes`, { size: 10, anchor: 'end' });
    const leg = sig.append('g');
    leg.append('line').attr('x1', L.sig.x + 30).attr('x2', L.sig.x + 48).attr('y1', L.sig.y + L.sig.h + 12).attr('y2', L.sig.y + L.sig.h + 12).attr('stroke', css('--data-muted'));
    text(leg, L.sig.x + 54, L.sig.y + L.sig.h + 16, 'brut', { size: 10 });
    leg.append('line').attr('x1', L.sig.x + 92).attr('x2', L.sig.x + 110).attr('y1', L.sig.y + L.sig.h + 12).attr('y2', L.sig.y + L.sig.h + 12).attr('stroke', accent).attr('stroke-width', 1.6);
    text(leg, L.sig.x + 116, L.sig.y + L.sig.h + 16, 'filtré', { size: 10 });

    // Power bars
    const pow = svg.append('g');
    const pr = L.pow.h / 3;
    L.bars = CHANNELS.map((ch, i) => {
      const y = L.pow.y + pr * i + pr * 0.2;
      text(pow, L.pow.x, y + pr * 0.38, ch, { size: 11, color: '--ink-2' });
      const x0 = L.pow.x + 30, w = L.pow.w - 34;
      pow.append('rect').attr('x', x0).attr('y', y).attr('width', w).attr('height', pr * 0.5).attr('fill', css('--paper-3')).attr('rx', 2);
      const bar = pow.append('rect').attr('x', x0).attr('y', y).attr('height', pr * 0.5).attr('fill', accent).attr('rx', 2);
      pow.append('line').attr('x1', x0 + w * 0.62).attr('x2', x0 + w * 0.62).attr('y1', y - 3).attr('y2', y + pr * 0.5 + 3).attr('stroke', css('--ink')).attr('stroke-width', 1.2);
      return { bar, x0, w };
    });
    text(pow, L.pow.x + 30 + (L.pow.w - 34) * 0.62, L.pow.y + L.pow.h + 4, 'repos', { size: 10, anchor: 'middle' });

    // Decision bars
    const dec = svg.append('g');
    const dr = L.dec.h / 4;
    L.dec.sel = CLASSES.map((c, i) => {
      const y = L.dec.y + dr * i + dr * 0.2;
      const lab = text(dec, L.dec.x, y + dr * 0.36, c.short, { size: 11, color: '--ink-2', mono: false });
      const x0 = L.dec.x + (narrow ? 64 : 58), w = L.dec.w - (narrow ? 110 : 96);
      dec.append('rect').attr('x', x0).attr('y', y).attr('width', w).attr('height', dr * 0.5).attr('fill', css('--paper-3')).attr('rx', 2);
      const bar = dec.append('rect').attr('x', x0).attr('y', y).attr('height', dr * 0.5).attr('width', 0).attr('fill', css('--ink-3')).attr('rx', 2);
      const val = text(dec, x0 + w + 6, y + dr * 0.38, '', { size: 10 });
      return { lab, bar, x0, w, val };
    });
    L.verdict = text(dec, L.dec.x, L.dec.y + L.dec.h + 8, '', { size: 12, color: '--ink', weight: 600, mono: false });
    L.note = text(dec, L.dec.x, L.dec.y + L.dec.h + 24, '', { size: 10 });
    layout = { ...L, narrow, width, height };
    paint(true);
  }

  function powerOf(buf) {
    let s = 0;
    for (let i = N - FS; i < N; i++) s += buf.clean[i] * buf.clean[i];
    return Math.sqrt(s / FS);
  }
  function paint(full = false) {
    if (!layout) return;
    const L = layout, accent = css('--neuro');
    // Traces
    const xs = d3.scaleLinear().domain([0, N - 1]).range([L.sig.x + 30, L.sig.x + L.sig.w]);
    for (const tr of L.traces) {
      const b = buffers[tr.ch];
      let raw = '', clean = '';
      for (let i = 0; i < N; i += 1) {
        const x = xs(i).toFixed(1);
        raw += `${x},${(tr.y0 - b.raw[i] * tr.amp * 0.62).toFixed(1)} `;
        clean += `${x},${(tr.y0 - b.clean[i] * tr.amp).toFixed(1)} `;
      }
      tr.raw.attr('points', raw);
      tr.clean.attr('points', clean);
    }
    // Power and electrodes
    const p = Object.fromEntries(CHANNELS.map(ch => [ch, powerOf(buffers[ch])]));
    const rest = 0.74;
    L.bars.forEach((b, i) => b.bar.attr('width', Math.max(2, Math.min(b.w, (p[CHANNELS[i]] / rest) * b.w * 0.62))));
    const scale = d3.scaleLinear().domain([0.25, 1.1]).range([css('--paper-3'), accent]).interpolate(d3.interpolateLab).clamp(true);
    for (const d of L.dots) {
      const w = CHANNELS.map(ch => { const [x, y] = POS[ch]; return 1 / (0.04 + (d.px - x) ** 2 + (d.py - y) ** 2); });
      const v = d3.sum(CHANNELS, (ch, k) => (p[ch] / rest) * w[k]) / d3.sum(w);
      d.c.attr('fill', scale(v));
    }
    for (const tr of L.traces) tr.label.attr('fill', p[tr.ch] / rest < 0.7 ? accent : css('--ink-2')).attr('font-weight', p[tr.ch] / rest < 0.7 ? 600 : 400);
    // Cue
    const cueKey = trial ? `${trial.cls}-${trial.phase === 'fixation'}` : 'none';
    if (full || cueKey !== L.cueKey) {
      L.cueKey = cueKey;
      const cls = trial ? CLASSES[trial.cls] : null;
      const showArrow = trial && trial.phase !== 'fixation';
      const { x, y } = L.cue;
      L.cueSel.html(`<rect x="${x - 70}" y="${y - 22}" width="140" height="44" rx="3" fill="${css('--paper-2')}" stroke="${css('--rule')}"/>` +
        (showArrow ? arrowPath(cls.arrow, x - 38, y, 1) + `<text x="${x - 16}" y="${y + 5}" font-size="13" font-weight="500" fill="${css('--ink')}">${cls.label}</text>` : `<path d="M${x - 8},${y}h16M${x},${y - 8}v16" stroke="${css('--ink')}" stroke-width="2" stroke-linecap="round"/>`));
    }
    // Decision
    const deciding = trial && trial.phase === 'decision';
    const k = deciding ? Math.min(1, trial.t / 0.7) : 0;
    L.dec.sel.forEach((row, i) => {
      const prob = trial ? conf[trial.cls][i] : 0;
      row.bar.attr('width', row.w * prob * d3.easeCubicOut(k)).attr('fill', deciding && i === trial.pred ? accent : css('--ink-3'));
      row.val.text(deciding ? pct(prob, 0) : '');
      row.lab.attr('fill', deciding && i === trial.pred ? accent : css('--ink-2')).attr('font-weight', deciding && i === trial.pred ? 600 : 400);
    });
    if (deciding && trial.t > 0.7) {
      const ok = trial.pred === trial.cls;
      L.verdict.text(`Prédit : ${CLASSES[trial.pred].label.toLowerCase()} ${ok ? '✓' : '✗'}`).attr('fill', ok ? accent : css('--ink'));
      L.note.text(ok ? 'classe correcte' : `la bonne réponse était : ${CLASSES[trial.cls].label.toLowerCase()}`);
    } else { L.verdict.text(''); L.note.text(''); }
  }

  function advance(dt) {
    if (!trial) newTrial(forced);
    trial.t += dt;
    const dur = PHASES[trial.phase];
    if (trial.t >= dur) {
      trial.t = 0;
      if (trial.phase === 'fixation') trial.phase = 'imagery';
      else if (trial.phase === 'imagery') trial.phase = 'decision';
      else { forced = null; newTrial(); }
    }
    if (trial.phase === 'decision' && !trial.counted && trial.t > 0.7) {
      trial.counted = true; tally.n++; if (trial.pred === trial.cls) tally.ok++;
      tallyEl.innerHTML = `<span>Essais simulés <b>${tally.n}</b></span><span>Bien classés <b>${tally.ok}</b> (${pct(tally.ok / tally.n, 0)})</span><span>Sur la vraie session de test : <b>${pct(summary.csp.balanced, 1)}</b></span>`;
    }
    const steps = Math.round(dt * FS);
    for (let s = 0; s < steps; s++) {
      const out = gen.step(1 / FS, target());
      for (const ch of CHANNELS) {
        const b = buffers[ch];
        b.raw.copyWithin(0, 1); b.clean.copyWithin(0, 1);
        b.raw[N - 1] = out[ch].raw; b.clean[N - 1] = out[ch].clean;
      }
    }
  }
  function start() {
    cancelAnimationFrame(raf);
    if (!running || !visible || prefersReducedMotion()) return;
    let last = performance.now();
    raf = requestAnimationFrame(function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      advance(dt); paint();
      raf = requestAnimationFrame(loop);
    });
  }
  function stop() { cancelAnimationFrame(raf); }

  // Prefill the buffers so the figure is never empty, then show a static imagery state if motion is reduced.
  newTrial(0);
  trial.phase = 'imagery';
  for (let i = 0; i < 4 * FS; i++) advance(1 / FS);
  if (prefersReducedMotion()) { trial.phase = 'decision'; trial.t = 1; }
  tallyEl.innerHTML = `<span>La prédiction affichée est tirée des fréquences réelles de CSP + LDA sur la session de test : ${pct(summary.csp.balanced, 1)} de bonnes réponses en moyenne.</span>`;
  observeWidth(plot, build);
  onThemeChange(() => build(plot.clientWidth));
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); }, { threshold: 0.15 }).observe(plot);
  else { visible = true; start(); }
}

/* ===================================================== Figure 2 · mu rhythm */
function mu(el) {
  const plot = el.querySelector('.fig__plot');
  const controls = el.querySelector('.fig__controls');
  const readout = el.querySelector('[data-readout]');
  const svg = d3.select(plot).append('svg').attr('role', 'img');
  const STATES = [{ value: 'rest', label: 'Repos' }, { value: 'left_hand', label: 'Imaginer la main gauche' }, { value: 'right_hand', label: 'Imaginer la main droite' }];
  let state = 'rest', width = 0;
  const series = Object.fromEntries(STATES.map(s => {
    const g = generator(5);
    const out = { C3: [], C4: [] };
    for (let i = 0; i < 300; i++) { const o = g.step(1 / 150, ERD[s.value]); if (i >= 60) { out.C3.push(o.C3.clean); out.C4.push(o.C4.clean); } }
    return [s.value, out];
  }));
  function draw(animate) {
    const narrow = width < 600;
    const height = narrow ? 300 : 240;
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);
    const headW = narrow ? 0 : 170;
    const x = d3.scaleLinear().domain([0, series.rest.C3.length - 1]).range([headW + 40, width - 90]);
    const rows = [{ ch: 'C3', y: height * 0.3, side: 'gauche' }, { ch: 'C4', y: height * 0.72, side: 'droit' }];
    const accent = css('--neuro');
    const t = animate && !prefersReducedMotion() ? d3.transition().duration(700).ease(d3.easeCubicInOut) : null;
    if (svg.select('.static').empty()) svg.append('g').attr('class', 'static');
    const st = svg.select('.static');
    st.selectAll('*').remove();
    if (!narrow) {
      const cx = 80, cy = height / 2, r = 62;
      st.append('circle').attr('cx', cx).attr('cy', cy).attr('r', r).attr('fill', 'none').attr('stroke', css('--rule-2')).attr('stroke-width', 1.5);
      st.append('path').attr('d', `M${cx - 8},${cy - r + 1} L${cx},${cy - r - 9} L${cx + 8},${cy - r + 1}`).attr('fill', 'none').attr('stroke', css('--rule-2')).attr('stroke-width', 1.5);
      for (const [ch, dx] of [['C3', -0.5], ['C4', 0.5]]) {
        const v = ERD[state][ch];
        st.append('circle').attr('cx', cx + dx * r).attr('cy', cy).attr('r', 9).attr('fill', d3.interpolateLab(css('--paper-3'), accent)(Math.min(1, v / 1.1)));
        text(st, cx + dx * r, cy + 26, ch, { size: 10, anchor: 'middle', color: '--ink-2' });
      }
      text(st, cx, cy + r + 22, 'vue de dessus', { size: 10, anchor: 'middle' });
    }
    rows.forEach(rw => {
      st.append('line').attr('x1', headW + 40).attr('x2', width - 90).attr('y1', rw.y).attr('y2', rw.y).attr('stroke', css('--rule'));
      text(st, headW, rw.y + 4, rw.ch, { size: 12, color: '--ink', weight: 500 });
      text(st, headW, rw.y + 18, `hém. ${rw.side}`, { size: 9 });
    });
    const line = d3.line().x((_, i) => x(i)).y(v => v).curve(d3.curveMonotoneX);
    const amp = height * 0.12;
    const lines = svg.selectAll('path.trace').data(rows, r => r.ch);
    const merged = lines.enter().append('path').attr('class', 'trace').attr('fill', 'none').attr('stroke-width', 1.7).merge(lines).attr('stroke', accent);
    const d = rw => line(series[state][rw.ch].map(v => rw.y - v * amp));
    (t ? merged.transition(t) : merged).attr('d', d);
    const bars = svg.selectAll('g.pw').data(rows, r => r.ch);
    const be = bars.enter().append('g').attr('class', 'pw');
    be.append('rect').attr('class', 'bg'); be.append('rect').attr('class', 'fg'); be.append('text').attr('class', 'mono');
    const bm = be.merge(bars);
    bm.select('.bg').attr('x', width - 70).attr('y', r => r.y - 6).attr('width', 64).attr('height', 12).attr('rx', 2).attr('fill', css('--paper-3'));
    const fg = bm.select('.fg').attr('x', width - 70).attr('y', r => r.y - 6).attr('height', 12).attr('rx', 2).attr('fill', accent);
    (t ? fg.transition(t) : fg).attr('width', r => 64 * Math.min(1, ERD[state][r.ch] ** 2 / 1.21));
    bm.select('text').attr('x', width - 70).attr('y', r => r.y - 12).attr('font-size', 10).attr('fill', css('--ink-3')).text('puissance');
    const s = ERD[state];
    readout.innerHTML = state === 'rest'
      ? '<span>Au repos, C3 et C4 oscillent avec la même amplitude, autour de 10 Hz.</span>'
      : `<span>Le rythme faiblit sur <b>${state === 'left_hand' ? 'C4' : 'C3'}</b>, au-dessus de l'hémisphère opposé à la main imaginée : puissance divisée par ${fmt(1 / (Math.min(s.C3, s.C4) ** 2), 0)} dans ce schéma.</span>`;
    svg.attr('aria-label', `Signaux synthétiques des électrodes C3 et C4, état : ${STATES.find(x2 => x2.value === state).label}.`);
  }
  segmented(controls, STATES, state, v => { state = v; draw(true); }, "Choisir l'état");
  whenVisible(plot, () => { observeWidth(plot, w => { width = w; draw(false); }); onThemeChange(() => draw(false)); });
}

/* ==================================================== Figure 3 · protocol */
function protocol(el) {
  const plot = el.querySelector('.fig__plot');
  const svg = d3.select(plot).append('svg').attr('role', 'img').attr('aria-label', "Déroulé d'un essai : croix de fixation, flèche indiquant le mouvement à 2 secondes, imagination jusqu'à 6 secondes, pause. La fenêtre analysée va de 2 à 6 secondes.");
  let shown = false;
  function draw(width) {
    svg.selectAll('*').remove();
    const narrow = width < 600;
    const height = narrow ? 250 : 210;
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);
    const x = d3.scaleLinear().domain([0, 8]).range([8, width - 8]);
    const accent = css('--neuro');
    const segs = [
      { a: 0, b: 2, label: 'Croix de fixation', fill: css('--paper-3') },
      { a: 2, b: 3.25, label: 'Flèche', fill: d3.interpolateLab(css('--paper'), accent)(0.55) },
      { a: 3.25, b: 6, label: 'Imagination du mouvement', fill: d3.interpolateLab(css('--paper'), accent)(0.3) },
      { a: 6, b: 8, label: 'Pause', fill: css('--paper-2') },
    ];
    const y = 46, h = 34;
    segs.forEach((s, i) => {
      const r = svg.append('rect').attr('x', x(s.a)).attr('y', y).attr('height', h).attr('fill', s.fill).attr('width', !shown && !prefersReducedMotion() ? 0 : x(s.b) - x(s.a) - 2).attr('rx', 2);
      if (!shown && !prefersReducedMotion()) r.transition().delay(i * 220).duration(500).ease(d3.easeCubicOut).attr('width', x(s.b) - x(s.a) - 2);
      if (!narrow || s.b - s.a > 1.5) text(svg, x(s.a) + 8, y + h / 2 + 4, s.label, { size: 12, color: '--ink', mono: false });
    });
    for (let s = 0; s <= 8; s++) text(svg, x(s), y + h + 18, `${s} s`, { size: 10, anchor: s === 0 ? 'start' : s === 8 ? 'end' : 'middle' });
    const by = 20;
    svg.append('path').attr('d', `M${x(2)},${by + 10}V${by}H${x(6)}V${by + 10}`).attr('fill', 'none').attr('stroke', accent).attr('stroke-width', 1.6);
    text(svg, (x(2) + x(6)) / 2, by - 6, 'fenêtre analysée, de 2 à 6 s', { size: 11, anchor: 'middle', color: '--neuro', weight: 500 });
    // Sessions
    const sy = narrow ? 140 : 132, half = (width - 24) / 2;
    const blocks = [
      { x: 8, label: 'Session T', sub: `${fmt(summary.csp.train / 9)} essais · apprentissage`, strong: false },
      { x: 16 + half, label: 'Session E', sub: `${fmt(summary.csp.test / 9)} essais · test, un autre jour`, strong: true },
    ];
    blocks.forEach(b => {
      svg.append('rect').attr('x', b.x).attr('y', sy).attr('width', half).attr('height', narrow ? 76 : 62).attr('rx', 3).attr('fill', b.strong ? css('--neuro-soft') : css('--paper-2')).attr('stroke', b.strong ? accent : css('--rule'));
      text(svg, b.x + 12, sy + 24, b.label, { size: 13, color: '--ink', weight: 600, mono: false });
      text(svg, b.x + 12, sy + 44, b.sub, { size: 11 });
      if (narrow) text(svg, b.x + 12, sy + 62, 'par participant', { size: 11 });
    });
    text(svg, 8, height - 2, `9 participants · 22 électrodes à ${data.protocol.sampling_rate_hz} Hz · 72 essais par classe et par session`, { size: 10 });
    shown = true;
  }
  whenVisible(plot, () => { observeWidth(plot, draw); onThemeChange(() => draw(plot.clientWidth)); });
}

/* ================================================== Figure 4 · participants */
function participants(el) {
  const plot = el.querySelector('.fig__plot');
  const controls = el.querySelector('.fig__controls');
  const legendEl = el.querySelector('[data-legend]');
  const tip = tooltip(plot);
  const svg = d3.select(plot).append('svg').attr('role', 'img').attr('aria-label', 'Précision équilibrée de chaque participant sur la session de test, pour la référence, la puissance spectrale et CSP.');
  const rec = (s, m) => data.records.find(r => r.subject === s && r.model === m);
  const rows = data.subjects.map(s => ({ s, base: rec(s, 'baseline'), band: rec(s, 'bandpower'), csp: rec(s, 'csp') }));
  let order = 'subject', width = 0, shown = false;
  function draw(animate) {
    const narrow = width < 560;
    const rowH = 30, top = 22, M = { l: narrow ? 40 : 96, r: 16 };
    const sorted = order === 'subject' ? rows : [...rows].sort((a, b) => b.csp.balanced - a.csp.balanced);
    const all = [...sorted, { s: 'mean' }];
    const height = top + all.length * rowH + 22;
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);
    const x = d3.scaleLinear().domain([0, 1]).range([M.l, width - M.r]);
    const accent = css('--neuro');
    svg.selectAll('.grid').remove();
    const grid = svg.insert('g', ':first-child').attr('class', 'grid');
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      grid.append('line').attr('x1', x(v)).attr('x2', x(v)).attr('y1', top - 6).attr('y2', height - 22).attr('stroke', v === 0.25 ? css('--ink-3') : css('--rule')).attr('stroke-dasharray', v === 0.25 ? '3 3' : null);
      text(grid, x(v), height - 6, `${v * 100} %`, { size: 10, anchor: 'middle' });
    }
    text(grid, x(0.25) + 4, top - 10, 'hasard', { size: 10 });
    const t = animate && !prefersReducedMotion() ? d3.transition().duration(600).ease(d3.easeCubicInOut) : null;
    const yOf = i => top + i * rowH + rowH / 2;
    const groups = svg.selectAll('g.row').data(all, d => d.s);
    const enter = groups.enter().append('g').attr('class', 'row').attr('transform', (_, i) => `translate(0,${yOf(i)})`);
    enter.append('text').attr('class', 'lab');
    enter.append('line').attr('class', 'link');
    enter.append('circle').attr('class', 'band');
    enter.append('circle').attr('class', 'csp');
    enter.append('text').attr('class', 'val mono');
    const merged = enter.merge(groups);
    (t ? merged.transition(t) : merged).attr('transform', (_, i) => `translate(0,${yOf(i)})`);
    merged.each(function (d) {
      const g = d3.select(this);
      const band = d.s === 'mean' ? summary.bandpower.balanced : d.band.balanced;
      const cspv = d.s === 'mean' ? summary.csp.balanced : d.csp.balanced;
      const strong = d.s === 'mean';
      g.select('.lab').attr('x', 0).attr('y', 4).attr('font-size', strong ? 12 : 12).attr('font-weight', strong ? 600 : 400).attr('fill', css('--ink')).text(d.s === 'mean' ? (narrow ? 'Moy.' : 'Moyenne') : narrow ? `P${d.s}` : `Participant ${d.s}`);
      const line = g.select('.link').attr('y1', 0).attr('y2', 0).attr('stroke', cspv >= band ? accent : css('--ink-3')).attr('stroke-width', strong ? 3 : 2).attr('stroke-opacity', 0.6);
      const c1 = g.select('.band').attr('cy', 0).attr('r', strong ? 6 : 5).attr('fill', css('--paper')).attr('stroke', css('--ink')).attr('stroke-width', 1.8);
      const c2 = g.select('.csp').attr('cy', 0).attr('r', strong ? 7 : 5.5).attr('fill', accent);
      g.select('.val').attr('x', width - M.r).attr('y', 4).attr('text-anchor', 'end').attr('font-size', 10).attr('fill', css('--ink-3')).text(narrow ? '' : '');
      if (!shown && !prefersReducedMotion()) {
        line.attr('x1', x(0.25)).attr('x2', x(0.25)); c1.attr('cx', x(0.25)); c2.attr('cx', x(0.25));
        const tt = d3.transition().delay(200 + all.indexOf(d) * 70).duration(800).ease(d3.easeCubicOut);
        line.transition(tt).attr('x1', x(band)).attr('x2', x(cspv)); c1.transition(tt).attr('cx', x(band)); c2.transition(tt).attr('cx', x(cspv));
      } else { line.attr('x1', x(band)).attr('x2', x(cspv)); c1.attr('cx', x(band)); c2.attr('cx', x(cspv)); }
      g.on('pointermove', ev => {
        const [px, py] = d3.pointer(ev, plot);
        const k = d.s === 'mean' ? null : d;
        tip.show(`<b>${d.s === 'mean' ? 'Moyenne des 9 participants' : `Participant ${d.s}`}</b><br><span class="mono">Puissance spectrale ${pct(band, 1)}${k ? ` · κ ${fmt(k.band.kappa, 2)}` : ''}<br>CSP ${pct(cspv, 1)}${k ? ` · κ ${fmt(k.csp.kappa, 2)}` : ''}</span>`, px, py);
      }).on('pointerleave', () => tip.hide());
    });
    shown = true;
    legend(legendEl, [{ label: MODELS.bandpower, color: css('--ink'), kind: 'sq' }, { label: MODELS.csp, color: accent, kind: 'sq' }, { label: 'Référence (classe majoritaire) : 25 %', color: css('--ink-3'), kind: 'dash' }]);
  }
  segmented(controls, [{ value: 'subject', label: 'Par participant' }, { value: 'score', label: 'Par score CSP' }], order, v => { order = v; draw(true); }, 'Trier');
  whenVisible(plot, () => { observeWidth(plot, w => { width = w; svg.selectAll('g.row').remove(); draw(false); }); onThemeChange(() => draw(false)); });
}

/* =================================================== Figure 5 · confusion */
function confusion(el) {
  const plot = el.querySelector('.fig__plot');
  const controls = el.querySelector('.fig__controls');
  const readout = el.querySelector('[data-readout]');
  const tip = tooltip(plot);
  const svg = d3.select(plot).append('svg').attr('role', 'img');
  let model = 'csp', subject = 'all', width = 0;
  const holder = document.createElement('div');
  holder.style.display = 'flex'; holder.style.flexWrap = 'wrap'; holder.style.gap = '8px';
  controls.appendChild(holder);
  segmented(holder, [{ value: 'bandpower', label: 'Puissance spectrale' }, { value: 'csp', label: 'CSP' }], model, v => { model = v; draw(true); }, 'Choisir le modèle');
  segmented(holder, [{ value: 'all', label: 'Tous' }, ...data.subjects.map(s => ({ value: s, label: `P${s}`, title: `Participant ${s}` }))], subject, v => { subject = v; draw(true); }, 'Choisir le participant');
  function matrix() {
    if (subject === 'all') return summary[model].confusion;
    return data.records.find(r => r.subject === subject && r.model === model).confusion;
  }
  function draw(animate) {
    const narrow = width < 600;
    const m = matrix(), norm = rowNorm(m);
    const labelW = narrow ? 64 : 110, top = narrow ? 44 : 52, recallW = narrow ? 70 : 150;
    const size = Math.min((width - labelW - recallW - 16) / 4, 92);
    const height = top + size * 4 + 34;
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height);
    const accent = css('--neuro');
    const color = d3.scaleLinear().domain([0, 0.7]).range([css('--paper-2'), accent]).interpolate(d3.interpolateLab).clamp(true);
    const t = animate && !prefersReducedMotion() ? d3.transition().duration(500).ease(d3.easeCubicInOut) : null;
    svg.selectAll('.static').remove();
    const st = svg.append('g').attr('class', 'static');
    text(st, labelW, 12, 'classe prédite', { size: 10 });
    CLASSES.forEach((c, j) => text(st, labelW + j * size + size / 2, top - 10, narrow ? c.short : c.label, { size: narrow ? 10 : 12, anchor: 'middle', color: '--ink-2', mono: false }));
    CLASSES.forEach((c, i) => text(st, labelW - 10, top + i * size + size / 2 + 4, narrow ? c.short : c.label, { size: narrow ? 10 : 12, anchor: 'end', color: '--ink-2', mono: false }));
    text(st, 0, top + size * 4 + 24, 'ligne : classe réelle', { size: 10 });
    text(st, width, 12, 'rappel', { size: 10, anchor: 'end' });
    const cells = svg.selectAll('g.cell').data(m.flatMap((row, i) => row.map((v, j) => ({ i, j, v, p: norm[i][j] }))), d => `${d.i}-${d.j}`);
    const ce = cells.enter().append('g').attr('class', 'cell');
    ce.append('rect'); ce.append('text').attr('class', 'mono');
    const cm = ce.merge(cells);
    cm.select('rect').attr('x', d => labelW + d.j * size + 1).attr('y', d => top + d.i * size + 1).attr('width', size - 2).attr('height', size - 2).attr('rx', 3)
      .attr('stroke', d => (d.i === d.j ? css('--ink') : 'none')).attr('stroke-width', 1.4);
    (t ? cm.select('rect').transition(t) : cm.select('rect')).attr('fill', d => color(d.p));
    cm.select('text').attr('x', d => labelW + d.j * size + size / 2).attr('y', d => top + d.i * size + size / 2 + 5).attr('text-anchor', 'middle').attr('font-size', narrow ? 11 : 14).attr('font-weight', d => (d.i === d.j ? 600 : 400))
      .attr('fill', d => (d.p > 0.38 ? css('--paper') : css('--ink'))).text(d => pct(d.p, 0));
    cm.on('pointermove', (ev, d) => { const [px, py] = d3.pointer(ev, plot); tip.show(`<b>${CLASSES[d.i].label} → ${CLASSES[d.j].label}</b><br><span class="mono">${fmt(d.v)} essais sur ${fmt(d3.sum(m[d.i]))}</span>`, px, py); }).on('pointerleave', () => tip.hide());
    const rx = labelW + size * 4 + 16, rw = width - rx - (narrow ? 30 : 46);
    const rec = svg.selectAll('g.recall').data(CLASSES.map((c, i) => norm[i][i]));
    const re = rec.enter().append('g').attr('class', 'recall');
    re.append('rect').attr('class', 'bg'); re.append('rect').attr('class', 'fg'); re.append('text').attr('class', 'mono');
    const rm = re.merge(rec);
    rm.select('.bg').attr('x', rx).attr('y', (_, i) => top + i * size + size / 2 - 5).attr('width', rw).attr('height', 10).attr('rx', 2).attr('fill', css('--paper-3'));
    const fg = rm.select('.fg').attr('x', rx).attr('y', (_, i) => top + i * size + size / 2 - 5).attr('height', 10).attr('rx', 2).attr('fill', accent);
    (t ? fg.transition(t) : fg).attr('width', v => rw * v);
    rm.select('text').attr('x', width).attr('y', (_, i) => top + i * size + size / 2 + 4).attr('text-anchor', 'end').attr('font-size', 11).attr('fill', css('--ink')).text(v => pct(v, 0));
    const acc = d3.sum(m, (row, i) => row[i]) / d3.sum(m.flat());
    const s = subject === 'all' ? summary[model] : data.records.find(r => r.subject === subject && r.model === model);
    readout.innerHTML = `<span>${subject === 'all' ? 'Neuf participants, matrices additionnées' : `Participant ${subject}`} · ${model === 'csp' ? MODELS.csp : MODELS.bandpower}</span><span>Bonnes réponses <b>${pct(acc, 1)}</b></span><span>κ de Cohen <b>${fmt(s.kappa, 2)}</b></span>`;
    svg.attr('aria-label', `Matrice de confusion, ${model === 'csp' ? 'CSP' : 'puissance spectrale'}, ${subject === 'all' ? 'tous les participants' : `participant ${subject}`}.`);
  }
  whenVisible(plot, () => { observeWidth(plot, w => { width = w; draw(false); }); onThemeChange(() => draw(false)); });
}

const FIGS = { pipeline, mu, protocol, participants, confusion };
document.querySelectorAll('[data-fig]').forEach(el => FIGS[el.dataset.fig]?.(el));
