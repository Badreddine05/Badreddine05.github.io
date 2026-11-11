// REBOUND interface. The OCaml engine (globalThis.BreakoutCore, compiled by js_of_ocaml)
// owns physics, collisions, score and states; this script reads input, sends elapsed
// time and draws the snapshot it receives. Trails and particles are decoration only.
(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const W = 1000;
  const H = 640;
  const MARGIN = 24;
  const LEVEL_NAMES = ['Prise d’élan', 'Décalage', 'Onde', 'Bastion', 'Dernière orbite'];
  const DIFFICULTY = { calm: 'Calme', normal: 'Normal', expert: 'Expert' };
  const MODE = { solid: 'Classique', split: 'Héritage · 2024' };
  const PADDLE = { calm: 176, normal: 144, expert: 118 };
  const RECORD_KEY = 'rebound-records-v1';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const number = new Intl.NumberFormat('fr-FR');
  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

  const canvas = $('#arena');
  const frameBox = $('#arena-frame');
  const ctx = canvas.getContext('2d');
  const ui = {
    overlay: $('#overlay'),
    kicker: $('#panel-kicker'),
    title: $('#panel-title'),
    text: $('#panel-text'),
    options: $('#options'),
    optionNote: $('#option-note'),
    primary: $('#panel-primary'),
    secondary: $('#panel-secondary'),
    readyHint: $('#ready-hint'),
    launch: $('#launch-button'),
    holdLeft: $('#hold-left'),
    holdRight: $('#hold-right'),
    score: $('#score'),
    pips: $('#lives-pips'),
    livesText: $('#lives-text'),
    level: $('#level'),
    levelName: $('#level-name'),
    combo: $('#combo'),
    record: $('#record'),
    message: $('#message'),
    pause: $('#pause-button'),
    menu: $('#menu-button'),
    rules: $('#rules-dialog'),
    confirm: $('#confirm-dialog'),
    build: $('#build-line'),
  };
  const gameSection = $('#jeu');

  /* Records, per difficulty and paddle mode, on this device only. --------- */
  function loadRecords() {
    try {
      const raw = JSON.parse(localStorage.getItem(RECORD_KEY) || '{}');
      const clean = {};
      for (const d of Object.keys(DIFFICULTY)) for (const m of Object.keys(MODE)) {
        const value = Number(raw?.[`${d}:${m}`]);
        clean[`${d}:${m}`] = Number.isSafeInteger(value) && value > 0 ? value : 0;
      }
      return clean;
    } catch {
      return {};
    }
  }
  const records = loadRecords();
  const recordKey = s => `${s.difficulty}:${s.mode}`;
  function saveRecords() {
    try {
      localStorage.setItem(RECORD_KEY, JSON.stringify(records));
    } catch {
      /* Storage unavailable: records last for this visit. */
    }
  }

  /* Engine ---------------------------------------------------------------- */
  const core = globalThis.BreakoutCore;
  let snap = null;
  let last = 0;
  let recordAtStart = 0;
  let userEngaged = false;
  const parse = text => JSON.parse(text);
  const send = name => {
    userEngaged = true;
    const before = snap;
    snap = parse(core.command(name));
    onSnapshot(before);
  };

  /* Input ------------------------------------------------------------------ */
  const keys = { left: false, right: false };
  let holdAxis = 0;
  let pointerX = Number.NaN;
  let dragging = false;
  let press = null;
  const axis = () => (holdAxis !== 0 ? holdAxis : (keys.right ? 1 : 0) - (keys.left ? 1 : 0));
  const live = () => snap && (snap.phase === 'ready' || snap.phase === 'playing');

  function toLogical(clientX) {
    const rect = canvas.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * W;
  }
  function releaseAll() {
    keys.left = keys.right = false;
    holdAxis = 0;
    dragging = false;
    ui.holdLeft.classList.remove('is-down');
    ui.holdRight.classList.remove('is-down');
  }
  function capture(element, event) {
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      /* The pointer is already gone: the gesture simply ends at pointerup. */
    }
  }
  function pauseIfPlaying() {
    releaseAll();
    if (snap?.phase === 'playing') send('pause');
  }

  /* Rendering ------------------------------------------------------------ */
  let palette = {};
  let scale = 1;
  function readPalette() {
    const style = getComputedStyle(document.documentElement);
    const get = name => style.getPropertyValue(name).trim();
    palette = {
      arena: get('--arena'),
      wall: get('--wall'),
      rule: get('--rule-2'),
      ink: get('--ink'),
      ink3: get('--ink-3'),
      paper: get('--paper'),
      accent: get('--rebound'),
      bricks: [0, 1, 2, 3, 4].map(i => get(`--brick-${i}`)),
    };
    palette.pipOn = palette.bricks.map(hex => (luminance(hex) > 0.3 ? palette.ink : palette.paper));
  }
  function luminance(hex) {
    const v = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
    if (!v) return 0;
    const lin = c => {
      const s = parseInt(c, 16) / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(v[1]) + 0.7152 * lin(v[2]) + 0.0722 * lin(v[3]);
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    scale = width / W;
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  const trail = [];
  const particles = [];
  function spawnParticles(brick, now) {
    if (reducedMotion.matches) return;
    const cx = brick.x + brick.w / 2;
    const cy = brick.y + brick.h / 2;
    for (let i = 0; i < 7; i++) {
      const angle = (Math.PI * 2 * i) / 7 + Math.random() * 0.6;
      const speed = 90 + Math.random() * 120;
      particles.push({ x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 40, born: now, color: palette.bricks[brick.color] ?? palette.accent });
    }
  }

  function draw(now) {
    if (!snap) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = palette.wall;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = palette.arena;
    ctx.fillRect(MARGIN, MARGIN, W - 2 * MARGIN, H - MARGIN);
    ctx.strokeStyle = palette.rule;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(MARGIN, H);
    ctx.lineTo(MARGIN, MARGIN);
    ctx.lineTo(W - MARGIN, MARGIN);
    ctx.lineTo(W - MARGIN, H);
    ctx.stroke();

    for (const brick of snap.bricks) {
      if (brick.hp <= 0) continue;
      roundRect(brick.x, brick.y, brick.w, brick.h, 3);
      ctx.fillStyle = palette.bricks[brick.color] ?? palette.accent;
      ctx.fill();
      if (brick.maxHp > 1) {
        // Remaining hits as dots: filled for each point of armour left.
        const pip = palette.pipOn[brick.color] ?? palette.paper;
        const cy = brick.y + brick.h / 2;
        const gap = 11;
        const start = brick.x + brick.w / 2 - ((brick.maxHp - 1) * gap) / 2;
        for (let i = 0; i < brick.maxHp; i++) {
          ctx.beginPath();
          ctx.arc(start + i * gap, cy, 3.2, 0, Math.PI * 2);
          if (i < brick.hp) {
            ctx.fillStyle = pip;
            ctx.fill();
          } else {
            ctx.strokeStyle = pip;
            ctx.lineWidth = 1.4;
            ctx.stroke();
          }
        }
      }
    }

    const life = 520;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const age = now - p.born;
      if (age > life) {
        particles.splice(i, 1);
        continue;
      }
      const t = age / 1000;
      ctx.globalAlpha = 1 - age / life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x + p.vx * t - 3, p.y + p.vy * t + 160 * t * t - 3, 6, 6);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = palette.ink;
    const y = snap.paddleY;
    if (snap.mode === 'split') {
      for (const [dx, w] of [[0, 40], [70, 60], [160, 40]]) {
        roundRect(snap.paddleX + dx, y, w, 14, 7);
        ctx.fill();
      }
    } else {
      roundRect(snap.paddleX, y, snap.paddleWidth, 14, 7);
      ctx.fill();
    }

    const ball = snap.ball;
    if (!reducedMotion.matches && snap.phase === 'playing') {
      trail.push([ball.x, ball.y]);
      if (trail.length > 9) trail.shift();
      trail.forEach(([x, yy], i) => {
        ctx.globalAlpha = (i / trail.length) * 0.22;
        ctx.beginPath();
        ctx.arc(x, yy, ball.radius * (0.55 + (0.45 * i) / trail.length), 0, Math.PI * 2);
        ctx.fillStyle = palette.ink;
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    } else {
      trail.length = 0;
    }
    if (ball.y - ball.radius <= H) {
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius + 2, 0, Math.PI * 2);
      ctx.fillStyle = palette.arena;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fillStyle = palette.ink;
      ctx.fill();
    }
  }

  /* Loop: real seconds between frames; the engine clamps and fixes the step. */
  function frame(now) {
    if (live()) {
      const dt = last ? (now - last) / 1000 : 0;
      if (dt > 0) {
        const before = snap;
        snap = parse(core.step(dt, axis(), pointerX));
        onSnapshot(before, now);
      }
    }
    last = now;
    draw(now);
    requestAnimationFrame(frame);
  }

  /* State changes: HUD, announcements, panel. ----------------------------- */
  const cache = {};
  const setText = (key, el, value) => {
    if (cache[key] !== value) {
      cache[key] = value;
      el.textContent = value;
    }
  };
  function announce(text) {
    ui.message.textContent = text;
  }

  function onSnapshot(before, now = performance.now()) {
    const s = snap;
    if (before && before.level === s.level && s.phase !== 'menu') {
      const previous = new Map(before.bricks.map(b => [b.id, b.hp]));
      for (const brick of s.bricks) if (brick.hp === 0 && (previous.get(brick.id) ?? 0) > 0) spawnParticles(brick, now);
    }
    const key = recordKey(s);
    if (s.phase !== 'menu' && s.score > (records[key] ?? 0)) records[key] = s.score;
    setText('score', ui.score, number.format(s.score));
    if (cache.lives !== s.lives) {
      cache.lives = s.lives;
      ui.pips.replaceChildren(...[0, 1, 2].map(i => {
        const pip = document.createElement('i');
        if (i < s.lives) pip.className = 'on';
        return pip;
      }));
      ui.livesText.textContent = plural(s.lives, 'vie', 'vies');
    }
    setText('level', ui.level, `${s.level} sur ${s.levelCount}`);
    setText('levelName', ui.levelName, LEVEL_NAMES[s.level - 1] ?? '');
    setText('combo', ui.combo, s.combo > 1 ? `${s.combo} briques` : String(s.combo));
    setText('record', ui.record, records[key] ? number.format(records[key]) : 'aucun');

    if (before) {
      if (s.lives < before.lives && s.phase === 'ready') announce(`Balle perdue. Il reste ${plural(s.lives, 'vie', 'vies')}. Espace ou Lancer pour repartir.`);
      if (s.phase !== before.phase) announcePhase(s, before);
    }
    if (s.phase !== cache.phase) {
      cache.phase = s.phase;
      if (s.phase === 'won' || s.phase === 'lost' || s.phase === 'menu') saveRecords();
      showPanel();
    }
  }

  function announcePhase(s, before) {
    switch (s.phase) {
      case 'ready':
        if (before.phase === 'menu' || before.phase === 'won' || before.phase === 'lost' || before.phase === 'paused') announce(`Niveau ${s.level}, ${LEVEL_NAMES[s.level - 1]}. Espace ou Lancer pour envoyer la balle.`);
        else if (before.phase === 'level_clear') announce(`Niveau ${s.level}, ${LEVEL_NAMES[s.level - 1]}. La balle part un peu plus vite.`);
        break;
      case 'playing':
        announce(before.phase === 'paused' ? 'Reprise.' : 'Balle lancée.');
        break;
      case 'paused':
        announce('Partie en pause.');
        break;
      case 'level_clear':
        announce(`Niveau ${s.level} terminé, 500 points de bonus.`);
        break;
      case 'won':
        announce(`Campagne terminée. Score final ${number.format(s.score)}.`);
        break;
      case 'lost':
        announce(`Plus de vies. Score final ${number.format(s.score)}.`);
        break;
      default:
    }
  }

  let primaryAction = null;
  let secondaryAction = null;
  function finalLine(s) {
    const beat = s.score > recordAtStart && s.score > 0;
    return `${number.format(s.score)} points, ${plural(s.broken, 'brique cassée', 'briques cassées')}, meilleur combo : ${s.bestCombo}.${beat ? ' Nouveau record sur cet appareil.' : ''}`;
  }
  function panelContent() {
    const s = snap;
    const setting = `${DIFFICULTY[s.difficulty]} · ${MODE[s.mode]}`;
    switch (s.phase) {
      case 'menu':
        return { kicker: 'Nouvelle partie', title: 'Régler la partie', text: 'Trois vies pour cinq niveaux.', options: true, primary: ['Jouer', startFromMenu] };
      case 'paused':
        return { kicker: `Pause · niveau ${s.level}`, title: 'Partie en pause', text: 'La balle et la raquette sont figées.', primary: ['Reprendre', () => { send('resume'); focusArena(); }], secondary: ['Revenir au menu', askMenu] };
      case 'level_clear':
        return { kicker: `Niveau ${s.level} terminé · ${LEVEL_NAMES[s.level - 1]}`, title: 'Toutes les briques sont tombées', text: `Bonus de 500 points. Niveau suivant : ${LEVEL_NAMES[s.level]}.`, primary: ['Niveau suivant', () => { send('next'); focusArena(); }] };
      case 'won':
        return { kicker: `Campagne terminée · ${setting}`, title: 'Les cinq niveaux sont passés', text: finalLine(s), primary: ['Rejouer', restart], secondary: ['Changer les réglages', () => send('menu')] };
      case 'lost':
        return { kicker: `Partie terminée · ${setting}`, title: 'Plus de vies', text: `Au niveau ${s.level}, ${LEVEL_NAMES[s.level - 1]}. ${finalLine(s)}`, primary: ['Rejouer', restart], secondary: ['Changer les réglages', () => send('menu')] };
      default:
        return null;
    }
  }

  function updateControls() {
    const s = snap;
    ui.pause.disabled = !(s.phase === 'playing' || s.phase === 'paused');
    ui.pause.textContent = s.phase === 'paused' ? 'Reprendre' : 'Pause';
    ui.launch.disabled = s.phase !== 'ready';
    ui.readyHint.hidden = s.phase !== 'ready';
    frameBox.classList.toggle('is-live', live());
  }

  function showPanel() {
    updateControls();
    const content = panelContent();
    if (!content) {
      ui.overlay.hidden = true;
      primaryAction = secondaryAction = null;
      if (ui.overlay.contains(document.activeElement) || document.activeElement === document.body) focusArena();
      return;
    }
    ui.kicker.textContent = content.kicker;
    ui.title.textContent = content.title;
    ui.text.textContent = content.text ?? '';
    ui.options.hidden = !content.options;
    if (content.options) {
      setRadio('difficulty', snap.difficulty);
      setRadio('mode', snap.mode);
      updateOptionNote();
    }
    [ui.primary.textContent, primaryAction] = content.primary;
    ui.secondary.hidden = !content.secondary;
    if (content.secondary) [ui.secondary.textContent, secondaryAction] = content.secondary;
    ui.overlay.hidden = false;
    if (userEngaged && !document.querySelector('dialog[open]')) ui.primary.focus({ preventScroll: true });
  }

  const radioValue = name => ui.options.querySelector(`input[name="${name}"]:checked`)?.value;
  function setRadio(name, value) {
    const input = ui.options.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  }
  function updateOptionNote() {
    const d = radioValue('difficulty') ?? 'normal';
    const m = radioValue('mode') ?? 'solid';
    const record = records[`${d}:${m}`];
    const paddle = m === 'split' ? 'trois segments de 40, 60 et 40, deux trous de 30' : `raquette de ${PADDLE[d]} unités`;
    ui.optionNote.textContent = `${paddle} · record ${record ? number.format(record) : 'aucun'}`;
  }
  ui.options.addEventListener('change', updateOptionNote);

  function startFromMenu() {
    const d = radioValue('difficulty') ?? 'normal';
    const m = radioValue('mode') ?? 'solid';
    userEngaged = true;
    snap = parse(core.configure(d, m));
    recordAtStart = records[`${d}:${m}`] ?? 0;
    send('start');
    focusArena();
  }
  function restart() {
    recordAtStart = records[recordKey(snap)] ?? 0;
    send('restart');
    focusArena();
  }
  // Keep the arena in view and, on phones where the paddle buttons sit below it, those too.
  function focusArena() {
    canvas.focus({ preventScroll: true });
    const arena = canvas.getBoundingClientRect();
    const touch = document.querySelector('.touch-controls').getBoundingClientRect();
    const bottom = touch.top > arena.bottom ? touch.bottom : arena.bottom;
    let delta = 0;
    if (arena.top < 0) delta = arena.top - 12;
    else if (bottom > innerHeight) delta = Math.min(arena.top - 12, bottom - innerHeight + 12);
    if (delta) scrollBy({ top: delta, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  }

  ui.primary.addEventListener('click', () => primaryAction?.());
  ui.secondary.addEventListener('click', () => secondaryAction?.());

  /* Dialogs --------------------------------------------------------------- */
  let dialogReturn = null;
  function openDialog(dialog, opener) {
    pauseIfPlaying();
    dialogReturn = opener ?? document.activeElement;
    dialog.showModal();
  }
  for (const dialog of [ui.rules, ui.confirm]) {
    dialog.addEventListener('close', () => {
      const target = dialogReturn && document.contains(dialogReturn) && !dialogReturn.closest('[hidden]') ? dialogReturn : ui.overlay.hidden ? canvas : ui.primary;
      target.focus({ preventScroll: true });
      dialogReturn = null;
    });
    dialog.addEventListener('click', event => {
      if (event.target === dialog || event.target.closest('[data-close]')) dialog.close();
    });
  }
  function askMenu() {
    openDialog(ui.confirm, ui.menu);
  }
  $('#rules-button').addEventListener('click', event => openDialog(ui.rules, event.currentTarget));
  $('#confirm-menu').addEventListener('click', () => {
    dialogReturn = null;
    ui.confirm.close();
    send('menu');
  });
  ui.menu.addEventListener('click', () => {
    if (['ready', 'playing', 'paused', 'level_clear'].includes(snap.phase)) askMenu();
    else send('menu');
  });
  ui.pause.addEventListener('click', () => {
    if (snap.phase === 'playing') send('pause');
    else if (snap.phase === 'paused') {
      send('resume');
      focusArena();
    }
  });
  ui.launch.addEventListener('click', () => {
    if (snap.phase === 'ready') send('launch');
    focusArena();
  });

  /* Keyboard -------------------------------------------------------------- */
  const LEFT = new Set(['ArrowLeft', 'a', 'A', 'q', 'Q']);
  const RIGHT = new Set(['ArrowRight', 'd', 'D']);
  addEventListener('keydown', event => {
    if (!snap || event.altKey || event.ctrlKey || event.metaKey) return;
    if (document.querySelector('dialog[open]')) return;
    const target = event.target instanceof Element ? event.target : document.body;
    if (target.closest('input, select, textarea, [contenteditable="true"]')) return;
    const onControl = target !== canvas && target.closest('button, a');
    if (LEFT.has(event.key) || RIGHT.has(event.key)) {
      if (!live()) return;
      if (target !== document.body && !gameSection.contains(target)) return;
      event.preventDefault();
      keys[LEFT.has(event.key) ? 'left' : 'right'] = true;
      pointerX = Number.NaN;
      return;
    }
    if (event.key === ' ') {
      if (event.repeat || onControl) return;
      if (snap.phase === 'ready' && (target === document.body || gameSection.contains(target))) {
        event.preventDefault();
        send('launch');
      }
      return;
    }
    if (event.key === 'p' || event.key === 'P' || event.key === 'Escape') {
      if (event.repeat) return;
      if (snap.phase === 'playing') {
        event.preventDefault();
        send('pause');
      } else if (snap.phase === 'paused') {
        event.preventDefault();
        send('resume');
        focusArena();
      }
      return;
    }
    if (event.key === 'Enter' && !event.repeat && !ui.overlay.hidden && primaryAction && !onControl) {
      event.preventDefault();
      primaryAction();
    }
  });
  addEventListener('keyup', event => {
    if (LEFT.has(event.key)) keys.left = false;
    if (RIGHT.has(event.key)) keys.right = false;
  });

  /* Pointer: the paddle follows the pointer; a short tap or click launches. */
  canvas.addEventListener('pointerdown', event => {
    if (!live()) return;
    if (event.pointerType !== 'mouse') {
      capture(canvas, event);
      dragging = true;
    }
    pointerX = toLogical(event.clientX);
    press = { x: event.clientX, at: performance.now() };
  });
  canvas.addEventListener('pointermove', event => {
    if (!live()) return;
    if (event.pointerType === 'mouse' || dragging) pointerX = toLogical(event.clientX);
  });
  const endPress = event => {
    if (press && snap?.phase === 'ready' && event.type === 'pointerup' && Math.abs(event.clientX - press.x) < 12 && performance.now() - press.at < 300) send('launch');
    press = null;
    if (event.pointerType !== 'mouse') {
      dragging = false;
      pointerX = Number.NaN;
    }
  };
  for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, endPress);

  /* Held paddle buttons, for touch and keyboard alike. -------------------- */
  for (const [button, direction] of [[ui.holdLeft, -1], [ui.holdRight, 1]]) {
    const start = () => {
      holdAxis = direction;
      pointerX = Number.NaN;
      button.classList.add('is-down');
    };
    const stop = () => {
      if (holdAxis === direction) holdAxis = 0;
      button.classList.remove('is-down');
    };
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      capture(button, event);
      start();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, stop);
    button.addEventListener('keydown', event => {
      if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
        event.preventDefault();
        start();
      }
    });
    button.addEventListener('keyup', event => {
      if (event.key === ' ' || event.key === 'Enter') stop();
    });
    button.addEventListener('blur', stop);
    button.addEventListener('contextmenu', event => event.preventDefault());
  }

  /* Pause when hidden or unfocused; never resume on return. --------------- */
  document.addEventListener('visibilitychange', () => {
    last = 0;
    if (document.hidden) {
      pauseIfPlaying();
      saveRecords();
    }
  });
  addEventListener('blur', pauseIfPlaying);
  addEventListener('pagehide', saveRecords);

  /* Theme toggle shared with the portfolio ------------------------------- */
  const THEME_KEY = 'bc-theme';
  const THEME_NAMES = { auto: 'automatique', light: 'clair', dark: 'sombre' };
  const THEME_SHORT = { auto: 'Auto', light: 'Clair', dark: 'Sombre' };
  const THEME_NEXT = { auto: 'light', light: 'dark', dark: 'auto' };
  (function setupTheme(button) {
    let theme = 'auto';
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === 'light' || stored === 'dark') theme = stored;
    } catch { /* keep auto */ }
    const apply = () => {
      const root = document.documentElement;
      if (theme === 'auto') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', theme);
      for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
        const scheme = meta.getAttribute('data-scheme');
        meta.setAttribute('media', theme === 'auto' ? `(prefers-color-scheme: ${scheme})` : scheme === theme ? 'all' : 'not all');
      }
      button.dataset.mode = theme;
      button.querySelector('.theme-label').textContent = THEME_SHORT[theme];
      button.setAttribute('aria-label', `Thème ${THEME_NAMES[theme]}. Passer au thème ${THEME_NAMES[THEME_NEXT[theme]]}.`);
      button.title = `Thème : ${THEME_NAMES[theme]}`;
      requestAnimationFrame(readPalette);
    };
    apply();
    button.addEventListener('click', () => {
      theme = THEME_NEXT[theme];
      try {
        if (theme === 'auto') localStorage.removeItem(THEME_KEY);
        else localStorage.setItem(THEME_KEY, theme);
      } catch { /* the choice lasts for this page */ }
      apply();
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => requestAnimationFrame(readPalette));
  })($('#theme-button'));

  /* Boot ------------------------------------------------------------------ */
  new ResizeObserver(resize).observe(canvas);
  readPalette();
  resize();
  if (!core || typeof core.step !== 'function') {
    $('#engine-error').hidden = false;
    for (const control of document.querySelectorAll('#panel-primary, #launch-button, #pause-button, #menu-button, .hold')) control.disabled = true;
    ui.overlay.hidden = true;
    return;
  }
  snap = parse(core.snapshot());
  onSnapshot(null);
  announce('Choisissez une difficulté et une raquette, puis Jouer.');
  fetch('build-info.json')
    .then(response => (response.ok ? response.json() : null))
    .then(info => {
      if (info?.commit && /^[0-9a-f]{40}$/.test(info.commit)) {
        ui.build.innerHTML = `Page assemblée depuis le commit <code>${info.commit.slice(0, 7)}</code> du dépôt.`;
      }
    })
    .catch(() => {});
  requestAnimationFrame(now => {
    last = now;
    frame(now);
  });
})();
