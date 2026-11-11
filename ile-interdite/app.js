// Interface of L'Île interdite. Every rule lives in the Java engine (compiled by TeaVM):
// this file turns clicks into text commands and draws the snapshot the engine returns.

const $ = selector => document.querySelector(selector);
const SVG = 'http://www.w3.org/2000/svg';
const KEY = 'island-expedition-v2';
const MAX_HISTORY = 5000;
const HELI = 4;
const SAND = 5;

const CARDS = [
  { short: 'Feu', name: 'Cristal du feu', glyph: 'fire' },
  { short: 'Vent', name: 'Statue du vent', glyph: 'wind' },
  { short: 'Marées', name: 'Calice des marées', glyph: 'tide' },
  { short: 'Terre', name: 'Pierre de la terre', glyph: 'earth' },
  { short: 'Hélicoptère', name: 'Hélicoptère', glyph: 'heli' },
  { short: 'Sable', name: 'Sacs de sable', glyph: 'sand' },
  { short: 'Montée des eaux', name: 'Montée des eaux', glyph: 'rise' },
];
const TALENTS = {
  EXPLORER: 'Se déplace et assèche aussi en diagonale.',
  ENGINEER: 'Assèche deux tuiles d’affilée pour une action.',
  PILOT: 'Une fois par tour, vole vers n’importe quelle tuile.',
  DIVER: 'Traverse les tuiles inondées ou englouties.',
  MESSENGER: 'Donne une carte relique à distance.',
  NAVIGATOR: 'Déplace un équipier d’une ou deux tuiles.',
};
const GLYPHS = {
  fire: '<path d="M12 3c.5 3.5 5 5.5 5 10.5a5 5 0 0 1-10 0c0-2.6 1.4-4.2 2.6-5.3.1 2 .8 3.2 2 3.8C12.9 9.3 11.6 6.5 12 3Z"/>',
  wind: '<path d="M3 8.5h10.5a2.75 2.75 0 1 0-2.75-2.75M3 12.5h15a3 3 0 1 1-3 3M3 16.5h6"/>',
  tide: '<path d="M6.5 4h11l-.9 5.3a4.7 4.7 0 0 1-9.2 0ZM12 14.3V19M8 20h8"/>',
  earth: '<path d="M3.5 18.5 8.5 7l4 5.6 2.6-3.6 5.4 9.5Z"/>',
  heli: '<path d="M4 5.5h16M12 5.5V9M17 12h4M8.5 18.5h9M10 15v3.5M15 15v3.5"/><rect x="7" y="9" width="10" height="6" rx="3"/>',
  sand: '<rect x="4" y="13" width="16" height="6" rx="3"/><rect x="7" y="7" width="10" height="6" rx="3"/>',
  rise: '<path d="M3 18c1.5 0 2.3-1.4 4.5-1.4S10.5 18 12 18s2.3-1.4 4.5-1.4S19.5 18 21 18M12 13.5V4M8.5 7.5 12 4l3.5 3.5"/>',
  port: '<circle cx="12" cy="12" r="8.5"/><path d="M9.2 8.2v7.6M14.8 8.2v7.6M9.2 12h5.6"/>',
};
const glyph = (name, size = 24) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[name]}</svg>`;
const WAVE = '<svg viewBox="0 0 16 10" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M1 6c1.5 0 2-1.5 3.5-1.5S6.5 6 8 6s2-1.5 3.5-1.5S13.5 6 15 6"/></svg>';
const STATE_NAMES = ['sèche', 'inondée', 'engloutie'];
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const join = items => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} et ${items.at(-1)}`);

const ui = {
  board: $('#plateau'),
  turn: $('#turn'),
  turnTitle: $('#turn-title'),
  turnDetail: $('#turn-detail'),
  tools: [...document.querySelectorAll('.tool')],
  navTool: $('.tool[data-mode="nav"]'),
  capture: $('#capture-button'),
  end: $('#end-button'),
  pause: $('#pause-button'),
  context: $('#context'),
  contextText: $('#context-text'),
  contextOptions: $('#context-options'),
  contextCancel: $('#context-cancel'),
  message: $('#message'),
  waterValue: $('#water-value'),
  gauge: $('#water-gauge'),
  waterNote: $('#water-note'),
  relicsValue: $('#relics-value'),
  relics: $('#relics'),
  teamValue: $('#team-value'),
  team: $('#team'),
  decks: $('#decks'),
  journal: $('#journal'),
  saveNote: $('#save-note'),
  setup: $('#setup-dialog'),
  setupForm: $('#setup-form'),
  setupError: $('#setup-error'),
  seedInput: $('#seed-input'),
  rules: $('#rules-dialog'),
  confirm: $('#confirm-dialog'),
};

let engine = null;
let snap = null;
let config = null;
let history = [];
let mode = 'move';
let card = null; // { kind: 'give' | 'sand' | 'heli' | 'choose', player, code, passengers }
let navPlayer = -1;
let lastTurn = 0;
let focusId = -1;
let storage = true;
const tiles = [];

const live = () => snap && snap.phase !== 'WON' && snap.phase !== 'LOST';
const roleName = i => snap.players[i].name;
const playerLabel = i => `joueur ${i + 1} (${roleName(i)})`;

/* Save and replay ---------------------------------------------------------- */
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 2, config, history }));
    storage = true;
  } catch {
    storage = false;
  }
}

function validSeed(value) {
  return Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
}

function restore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw || raw.length > 400000) return false;
    const data = JSON.parse(raw);
    if (data?.version !== 2 || !Array.isArray(data.history) || data.history.length > MAX_HISTORY) return false;
    const { seed, players, difficulty } = data.config ?? {};
    if (!validSeed(seed) || ![2, 3, 4].includes(players) || ![1, 2, 3, 4].includes(difficulty)) return false;
    let state = JSON.parse(engine.reset(seed, players, difficulty));
    for (const entry of data.history) {
      if (typeof entry !== 'string' || entry.length > 100 || !/^[a-z]+(:-?\d+){0,3}$/.test(entry)) return false;
      state = JSON.parse(engine.command(entry));
      if (!state.accepted) return false;
    }
    config = { seed, players, difficulty };
    history = data.history.slice();
    snap = state;
    return true;
  } catch {
    return false;
  }
}

function newGame(seed, players, difficulty) {
  config = { seed, players, difficulty };
  history = [];
  snap = JSON.parse(engine.reset(seed, players, difficulty));
  card = null;
  navPlayer = -1;
  mode = 'move';
  lastTurn = snap.turn;
  focusId = snap.players[snap.active].tile;
  save();
  render();
  say(snap.message);
}

const randomSeed = () => crypto.getRandomValues(new Int32Array(1))[0];

/* Commands ----------------------------------------------------------------- */
function act(text, onAccepted) {
  snap = JSON.parse(engine.command(text));
  if (snap.accepted) {
    if (history.length < MAX_HISTORY) history.push(text);
    save();
    onAccepted?.();
  }
  if (snap.turn !== lastTurn) {
    lastTurn = snap.turn;
    mode = 'move';
    navPlayer = -1;
  }
  if (!live() || snap.phase === 'RESCUE') clearCard(false);
  render();
  say(snap.message, !snap.accepted);
}

let sayToggle = false;
function say(text, refused = false) {
  ui.message.classList.toggle('is-refused', refused);
  // An identical message is changed by an invisible character so it is announced again.
  sayToggle = ui.message.textContent.replace('​', '') === text ? !sayToggle : false;
  ui.message.textContent = sayToggle ? `${text}​` : text;
}

function clearCard(rerender = true) {
  card = null;
  if (rerender) render();
}

function setMode(next) {
  if (!live() || snap.paused) return;
  if (next === 'nav' && snap.players[snap.active].role !== 'NAVIGATOR') return;
  mode = next;
  navPlayer = -1;
  card = null;
  render();
  if (next === 'nav') say('Choisissez l’équipier à guider, puis sa destination.');
}

/* Targets: which tiles the current choice can use, read from the snapshot. */
function passengersMask() {
  if (!card?.passengers) return 0;
  let mask = 0;
  for (const p of card.passengers) mask |= 1 << p;
  return mask;
}

function targets() {
  const set = new Set();
  if (!live() || snap.paused) return set;
  if (snap.phase === 'RESCUE') {
    for (const t of snap.tiles) if (t.rescue) set.add(t.id);
    return set;
  }
  if (card?.kind === 'sand') {
    for (const t of snap.tiles) if (t.state === 1) set.add(t.id);
    return set;
  }
  if (card?.kind === 'heli') {
    const first = [...(card.passengers ?? [])][0];
    const origin = first === undefined ? -1 : snap.players[first].tile;
    if (origin >= 0) for (const t of snap.tiles) if (t.state < 2 && t.id !== origin) set.add(t.id);
    return set;
  }
  if (snap.phase !== 'ACTION') return set;
  if (mode === 'move') for (const t of snap.tiles) if (t.move) set.add(t.id);
  if (mode === 'shore') for (const t of snap.tiles) if (t.shore) set.add(t.id);
  if (mode === 'nav' && navPlayer >= 0) for (const id of snap.players[navPlayer].navigate) set.add(id);
  return set;
}

function onTile(id) {
  focusId = id;
  if (!live()) return say('La partie est terminée. Le plateau reste consultable ; lancez une nouvelle expédition pour rejouer.');
  if (snap.phase === 'RESCUE') return act(`rescue:${id}`);
  if (card?.kind === 'sand') return act(`sand:${card.player}:${id}`, () => (card = null));
  if (card?.kind === 'heli') {
    const mask = passengersMask();
    if (!mask) return say('Cochez au moins un passager avant de choisir la destination.', true);
    return act(`heli:${card.player}:${id}:${mask}`, () => (card = null));
  }
  if (snap.phase === 'DISCARD') return say(`Choisissez d’abord une carte à défausser dans la main du ${playerLabel(snap.pendingPlayer)}.`, true);
  if (mode === 'nav') {
    if (navPlayer < 0) return say('Choisissez d’abord l’équipier à guider.', true);
    return act(`nav:${navPlayer}:${id}`);
  }
  act(`${mode === 'shore' ? 'shore' : 'move'}:${id}`);
}

function onCard(player, code) {
  if (!live()) return;
  if (snap.phase === 'DISCARD' && player === snap.pendingPlayer) {
    if (code === HELI || code === SAND) {
      card = { kind: 'choose', player, code };
      render();
      return;
    }
    return act(`discard:${player}:${code}`);
  }
  if (code === SAND) card = { kind: 'sand', player, code };
  else if (code === HELI) card = { kind: 'heli', player, code, passengers: new Set() };
  else card = { kind: 'give', player, code };
  render();
}

/* Rendering ---------------------------------------------------------------- */
function buildBoard() {
  ui.board.replaceChildren();
  tiles.length = 0;
  for (const t of snap.tiles) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tile';
    button.dataset.id = String(t.id);
    button.style.gridColumn = String(t.x + 1);
    button.style.gridRow = String(t.y + 1);
    button.innerHTML = '<span class="tile-name"></span><span class="tile-glyph"></span><span class="tile-foot"><span class="tile-state"></span><span class="pawns"></span></span>';
    button.addEventListener('click', () => onTile(t.id));
    button.addEventListener('focus', () => (focusId = t.id));
    ui.board.append(button);
    tiles[t.id] = button;
  }
}

function tileLabel(t, isTarget) {
  const parts = [t.name, STATE_NAMES[t.state]];
  if (t.id === snap.landing) parts.push('héliport');
  if (t.treasure >= 0) parts.push(`site du ${CARDS[t.treasure].name}${snap.treasures[t.treasure] ? ', relique déjà récupérée' : ''}`);
  const here = snap.players.map((p, i) => (p.tile === t.id ? `joueur ${i + 1}` : null)).filter(Boolean);
  if (here.length) parts.push(here.length > 1 ? `${join(here)} présents` : `${here[0]} présent`);
  if (isTarget) parts.push('action possible');
  return parts.join(', ');
}

function renderBoard() {
  const targetSet = targets();
  const actor = snap.phase === 'ACTION' ? snap.active : snap.pendingPlayer;
  for (const t of snap.tiles) {
    const button = tiles[t.id];
    const isTarget = targetSet.has(t.id);
    button.classList.toggle('is-flooded', t.state === 1);
    button.classList.toggle('is-sunk', t.state === 2);
    button.classList.toggle('is-target', isTarget);
    button.setAttribute('aria-label', tileLabel(t, isTarget));
    button.title = t.name;
    button.querySelector('.tile-name').textContent = t.name;
    const g = t.id === snap.landing ? 'port' : t.treasure >= 0 ? CARDS[t.treasure].glyph : '';
    const glyphSlot = button.querySelector('.tile-glyph');
    if (glyphSlot.dataset.glyph !== g) {
      glyphSlot.dataset.glyph = g;
      glyphSlot.innerHTML = g ? glyph(g) : '';
    }
    glyphSlot.classList.toggle('is-relic', t.treasure >= 0 && !snap.treasures[t.treasure]);
    const stateSlot = button.querySelector('.tile-state');
    const stateKey = String(t.state);
    if (stateSlot.dataset.state !== stateKey) {
      stateSlot.dataset.state = stateKey;
      stateSlot.innerHTML = t.state === 1 ? `${WAVE}<span class="tile-state-text">inondée</span>` : t.state === 2 ? '<span class="tile-state-text">engloutie</span>' : '';
    }
    const pawns = button.querySelector('.pawns');
    const markup = snap.players.map((p, i) => (p.tile === t.id ? `<span class="pawn${i === actor && live() ? ' is-active' : ''}" aria-hidden="true">${i + 1}</span>` : '')).join('');
    if (pawns.innerHTML !== markup) pawns.innerHTML = markup;
  }
  // Roving tab stop: the focused tile, else the acting player's tile.
  const stop = focusId >= 0 ? focusId : snap.players[Math.max(0, actor)].tile;
  for (const button of tiles) button.tabIndex = Number(button.dataset.id) === stop ? 0 : -1;
}

function renderTurn() {
  const over = !live();
  ui.turn.classList.toggle('is-over', over);
  const pending = snap.pendingPlayer;
  const pausedPrefix = snap.paused ? 'En pause. ' : '';
  if (snap.phase === 'WON') {
    ui.turnTitle.textContent = 'Expédition réussie';
    ui.turnDetail.textContent = `Les quatre reliques sont sauvées, en ${plural(snap.turn, 'tour', 'tours')}.`;
  } else if (snap.phase === 'LOST') {
    const found = snap.treasures.filter(Boolean).length;
    ui.turnTitle.textContent = 'Expédition perdue';
    ui.turnDetail.textContent = `Au tour ${snap.turn}, avec ${found} relique${found > 1 ? 's' : ''} sur 4.`;
  } else if (snap.phase === 'DISCARD') {
    ui.turnTitle.textContent = 'Main pleine';
    ui.turnDetail.textContent = `${pausedPrefix}Le ${playerLabel(pending)} défausse une carte ou joue une carte spéciale.`;
  } else if (snap.phase === 'RESCUE') {
    ui.turnTitle.textContent = 'Sauvetage';
    ui.turnDetail.textContent = `${pausedPrefix}Le ${playerLabel(pending)} doit quitter sa tuile engloutie : choisissez une tuile marquée.`;
  } else {
    const p = snap.players[snap.active];
    ui.turnTitle.textContent = `Tour ${snap.turn} · ${p.name}`;
    const extra = [];
    if (snap.engineerBonus) extra.push('un assèchement gratuit reste possible');
    if (p.role === 'PILOT') extra.push(snap.pilotUsed ? 'vol du tour déjà utilisé' : 'vol du tour disponible');
    ui.turnDetail.innerHTML = '';
    ui.turnDetail.append(`${pausedPrefix}Joueur ${snap.active + 1} · `);
    const strong = document.createElement('strong');
    strong.textContent = plural(snap.actions, 'action restante', 'actions restantes');
    ui.turnDetail.append(strong, extra.length ? ` · ${extra.join(' · ')}` : '');
  }
}

function renderToolbar() {
  const acting = live() && !snap.paused && snap.phase === 'ACTION';
  const isNavigator = snap.players[snap.active].role === 'NAVIGATOR';
  ui.navTool.hidden = !isNavigator;
  if (mode === 'nav' && !isNavigator) mode = 'move';
  for (const tool of ui.tools) {
    tool.setAttribute('aria-checked', String(tool.dataset.mode === mode));
    tool.disabled = !acting;
  }
  ui.capture.disabled = !(acting && snap.canCapture);
  ui.end.disabled = !acting;
  ui.pause.disabled = !live();
  ui.pause.textContent = snap.paused ? 'Reprendre' : 'Pause';
  ui.pause.setAttribute('aria-pressed', String(snap.paused));
}

function option(label, onClick, primary = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = primary ? 'button primary' : 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function renderContext() {
  const box = ui.contextOptions;
  box.replaceChildren();
  let text = '';
  if (!live() || snap.paused || snap.phase === 'RESCUE') card = null;
  if (card?.kind === 'choose') {
    text = `${CARDS[card.code].name} du ${playerLabel(card.player)} : la défausser ou la jouer ?`;
    box.append(
      option('Défausser', () => act(`discard:${card.player}:${card.code}`, () => (card = null))),
      option('Jouer la carte', () => {
        card = card.code === SAND ? { kind: 'sand', player: card.player, code: SAND } : { kind: 'heli', player: card.player, code: HELI, passengers: new Set() };
        render();
      }, true),
    );
  } else if (card?.kind === 'give') {
    text = `Donner ${CARDS[card.code].name} à :`;
    snap.players.forEach((p, i) => {
      if (i !== card.player) box.append(option(`${i + 1} · ${p.name}`, () => act(`give:${i}:${card.code}`, () => (card = null))));
    });
  } else if (card?.kind === 'sand') {
    text = `Sacs de sable du ${playerLabel(card.player)} : choisissez une tuile inondée.`;
  } else if (card?.kind === 'heli') {
    text = `Hélicoptère du ${playerLabel(card.player)} : cochez les passagers, partis d’une même tuile, puis choisissez la destination.`;
    snap.players.forEach((p, i) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = card.passengers.has(i);
      input.addEventListener('change', () => {
        if (input.checked) card.passengers.add(i);
        else card.passengers.delete(i);
        renderBoard();
      });
      label.append(input, `${i + 1} · ${p.name}`);
      box.append(label);
    });
    box.append(option('Quitter l’île', () => act(`escape:${card.player}`, () => (card = null))));
  } else if (mode === 'nav' && live() && snap.phase === 'ACTION') {
    if (navPlayer < 0) {
      text = 'Guider quel équipier ?';
      snap.players.forEach((p, i) => {
        if (i !== snap.active) box.append(option(`${i + 1} · ${p.name}`, () => {
          navPlayer = i;
          render();
          say(`Choisissez une tuile marquée pour le ${playerLabel(i)}.`);
        }));
      });
    } else {
      text = `Guider le ${playerLabel(navPlayer)} : choisissez une tuile marquée, à une ou deux cases.`;
    }
  }
  ui.contextText.textContent = text;
  ui.context.hidden = !text;
}

function renderWater() {
  const level = snap.water;
  ui.waterValue.textContent = `${level} sur 10`;
  ui.gauge.setAttribute('aria-valuenow', String(level));
  ui.gauge.setAttribute('aria-valuetext', `niveau ${level} sur 10, ${plural(snap.floodRate, 'carte', 'cartes')} Inondation par tour`);
  const bands = [[1, 2, '2 cartes'], [3, 5, '3 cartes'], [6, 7, '4 cartes'], [8, 9, '5 cartes'], [10, 10, 'fin']];
  const parts = [];
  for (const [from, to, label] of bands) {
    const current = level >= from && level <= to;
    parts.push(`<span class="gauge-band${current ? ' is-current' : ''}" style="grid-column:${from} / ${to + 1}" aria-hidden="true">${label}</span>`);
  }
  for (let i = 1; i <= 10; i++) {
    parts.push(`<span class="gauge-cell${i <= level ? ' is-filled' : ''}${i === 10 ? ' is-fatal' : ''}" style="grid-column:${i}" aria-hidden="true"></span>`);
    parts.push(`<span class="gauge-num${i === level ? ' is-current' : ''}" style="grid-column:${i}" aria-hidden="true">${i}</span>`);
  }
  const markup = parts.join('');
  if (ui.gauge.innerHTML !== markup) ui.gauge.innerHTML = markup;
  const left = 10 - level;
  ui.waterNote.textContent = `${plural(snap.floodRate, 'carte', 'cartes')} Inondation à chaque fin de tour. ${left > 0 ? `Encore ${plural(left, 'montée', 'montées')} avant le niveau 10, qui fait perdre la partie.` : 'Le niveau 10 est atteint.'}`;
}

function renderRelics() {
  const found = snap.treasures.filter(Boolean).length;
  ui.relicsValue.textContent = `${found} sur 4`;
  ui.relics.innerHTML = CARDS.slice(0, 4).map((c, i) => {
    const sites = snap.tiles.filter(t => t.treasure === i && t.state < 2).length;
    const status = snap.treasures[i] ? 'récupérée' : sites === 0 ? 'ses deux sites ont sombré' : sites === 1 ? 'à récupérer · un seul site reste' : 'à récupérer · deux sites';
    const cls = snap.treasures[i] ? ' is-found' : sites === 0 ? ' is-lost' : '';
    return `<li class="relic${cls}">${glyph(c.glyph)}<span class="relic-name">${c.name}</span><span class="relic-status">${status}</span></li>`;
  }).join('');
}

function cardElement(player, code, interactive) {
  const c = CARDS[code];
  const el = document.createElement(interactive ? 'button' : 'span');
  el.className = `card${code >= HELI ? ' is-special' : ''}`;
  el.innerHTML = `${glyph(c.glyph, 16)}<span>${c.short}</span>`;
  if (interactive) {
    el.type = 'button';
    el.setAttribute('aria-label', `${c.name}, carte du ${playerLabel(player)}`);
    el.setAttribute('aria-pressed', String(card?.player === player && card?.code === code));
    el.addEventListener('click', () => onCard(player, code));
  } else {
    el.title = c.name;
  }
  return el;
}

function renderTeam() {
  ui.teamValue.textContent = plural(snap.players.length, 'joueur', 'joueurs');
  const items = snap.players.map((p, i) => {
    const li = document.createElement('li');
    const active = live() && snap.phase === 'ACTION' && i === snap.active;
    const pending = live() && snap.pendingPlayer === i && (snap.phase === 'DISCARD' || snap.phase === 'RESCUE');
    li.className = `player${active ? ' is-active' : ''}${pending ? ' is-pending' : ''}`;
    const head = document.createElement('div');
    head.className = 'player-head';
    head.innerHTML = `<span class="pawn${active || pending ? ' is-active' : ''}" aria-hidden="true">${i + 1}</span>`;
    const name = document.createElement('span');
    name.className = 'player-name';
    name.textContent = `Joueur ${i + 1} · ${p.name}`;
    const where = document.createElement('span');
    where.className = 'player-where';
    where.textContent = `sur ${snap.tiles[p.tile].name}`;
    head.append(name, where);
    const talent = document.createElement('p');
    talent.className = 'player-where';
    talent.textContent = TALENTS[p.role] ?? '';
    const hand = document.createElement('div');
    hand.className = 'hand';
    hand.setAttribute('role', 'group');
    hand.setAttribute('aria-label', `Main du joueur ${i + 1}, ${plural(p.hand.length, 'carte', 'cartes')}`);
    const canPlay = live() && !snap.paused && snap.phase !== 'RESCUE';
    for (const code of p.hand) {
      const discarding = snap.phase === 'DISCARD' && i === snap.pendingPlayer;
      const giving = snap.phase === 'ACTION' && i === snap.active && code < HELI;
      hand.append(cardElement(i, code, canPlay && (discarding || giving || code >= HELI)));
    }
    if (!p.hand.length) hand.innerHTML = '<span class="hand-empty">aucune carte</span>';
    li.append(head, talent, hand);
    return li;
  });
  const focusedCard = document.activeElement?.closest?.('.card') ? [...ui.team.querySelectorAll('.card')].indexOf(document.activeElement) : -1;
  ui.team.replaceChildren(...items);
  if (focusedCard >= 0) ui.team.querySelectorAll('.card')[focusedCard]?.focus({ preventScroll: true });
}

function renderSide() {
  renderWater();
  renderRelics();
  renderTeam();
  const d = snap.decks;
  ui.decks.innerHTML = `<dt>Cartes Trésor</dt><dd>${d.treasure} · défausse ${d.treasureDiscard.length}</dd><dt>Cartes Inondation</dt><dd>${d.flood} · défausse ${d.floodDiscard.length}</dd><dt>Graine</dt><dd>${config.seed}</dd>`;
  const journal = snap.journal.map(entry => {
    const li = document.createElement('li');
    li.textContent = entry;
    return li;
  });
  ui.journal.replaceChildren(...journal);
  ui.saveNote.textContent = storage ? `Partie enregistrée dans ce navigateur : ${plural(history.length, 'coup', 'coups')} depuis la graine ${config.seed}.` : 'Enregistrement local indisponible : la partie sera perdue en quittant la page.';
}

function render() {
  if (!snap) return;
  if (!tiles.length) buildBoard();
  renderTurn();
  renderToolbar();
  renderContext();
  renderBoard();
  renderSide();
}

/* Board keyboard: arrows move between existing tiles. --------------------- */
ui.board.addEventListener('keydown', event => {
  const steps = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  const step = steps[event.key];
  if (!step || !snap) return;
  const current = snap.tiles[Number(event.target.dataset?.id ?? focusId)];
  if (!current) return;
  event.preventDefault();
  for (let k = 1; k < 6; k++) {
    const x = current.x + step[0] * k;
    const y = current.y + step[1] * k;
    if (x < 0 || x > 5 || y < 0 || y > 5) break;
    const next = snap.tiles.find(t => t.x === x && t.y === y);
    if (next) {
      focusId = next.id;
      for (const button of tiles) button.tabIndex = -1;
      tiles[next.id].tabIndex = 0;
      tiles[next.id].focus();
      return;
    }
  }
});

/* Toolbar, dialogs and shortcuts ------------------------------------------- */
for (const tool of ui.tools) tool.addEventListener('click', () => setMode(tool.dataset.mode));
ui.capture.addEventListener('click', () => act('capture'));
ui.end.addEventListener('click', () => act('end'));
ui.pause.addEventListener('click', () => act('pause'));
ui.contextCancel.addEventListener('click', () => {
  card = null;
  if (mode === 'nav') {
    mode = 'move';
    navPlayer = -1;
  }
  render();
});

let dialogReturn = null;
function openDialog(dialog, opener) {
  dialogReturn = opener ?? document.activeElement;
  dialog.showModal();
}
for (const dialog of [ui.setup, ui.rules, ui.confirm]) {
  dialog.addEventListener('close', () => {
    if (dialogReturn && document.contains(dialogReturn)) dialogReturn.focus({ preventScroll: true });
    dialogReturn = null;
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog || event.target.closest('[data-close]')) dialog.close();
  });
}

function openSetup(opener) {
  ui.setupError.hidden = true;
  ui.seedInput.value = '';
  if (config) {
    ui.setupForm.elements.players.value = String(config.players);
    ui.setupForm.elements.difficulty.value = String(config.difficulty);
  }
  openDialog(ui.setup, opener);
}

$('#new-button').addEventListener('click', event => {
  const opener = event.currentTarget;
  if (live() && history.length > 0) openDialog(ui.confirm, opener);
  else openSetup(opener);
});
$('#confirm-new').addEventListener('click', () => {
  const opener = dialogReturn;
  dialogReturn = null;
  ui.confirm.close();
  openSetup(opener);
});
ui.setupForm.addEventListener('submit', event => {
  const raw = ui.seedInput.value.trim();
  const seed = raw === '' ? randomSeed() : Number(raw);
  if (raw !== '' && (!/^-?\d+$/.test(raw) || !validSeed(seed))) {
    event.preventDefault();
    ui.setupError.textContent = 'La graine doit être un nombre entier entre -2 147 483 648 et 2 147 483 647.';
    ui.setupError.hidden = false;
    ui.seedInput.focus();
    return;
  }
  const players = Number(ui.setupForm.elements.players.value);
  const difficulty = Number(ui.setupForm.elements.difficulty.value);
  newGame(seed, players, difficulty);
  dialogReturn = tiles[focusId] ?? null;
});
$('#rules-button').addEventListener('click', event => openDialog(ui.rules, event.currentTarget));

$('#export-button').addEventListener('click', () => {
  const data = { version: 2, config, history, journal: snap.journal, phase: snap.phase, turn: snap.turn };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `ile-interdite-${config.seed}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

addEventListener('keydown', event => {
  if (!snap || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  if (document.querySelector('dialog[open]')) return;
  const target = event.target instanceof Element ? event.target : document.body;
  if (target.closest('input, select, textarea, [contenteditable="true"]')) return;
  const key = event.key.toLowerCase();
  if (key === 'm') setMode('move');
  else if (key === 's') setMode('shore');
  else if (key === 'n') setMode('nav');
  else if (key === 'f' && !ui.end.disabled) act('end');
  else if (key === 'p' && live()) act('pause');
  else if (event.key === 'Escape' && (card || mode === 'nav')) ui.contextCancel.click();
  else return;
  event.preventDefault();
});

/* Theme toggle shared with the portfolio --------------------------------- */
const THEME_KEY = 'bc-theme';
const THEME_NAMES = { auto: 'automatique', light: 'clair', dark: 'sombre' };
const THEME_SHORT = { auto: 'Auto', light: 'Clair', dark: 'Sombre' };
const THEME_NEXT = { auto: 'light', light: 'dark', dark: 'auto' };
function setupTheme(button) {
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
}
setupTheme($('#theme-button'));

/* Boot --------------------------------------------------------------------- */
try {
  engine = await import('./generated/engine.js');
  const restored = restore();
  if (!restored) {
    newGame(randomSeed(), 2, 1);
  } else {
    lastTurn = snap.turn;
    focusId = snap.players[snap.phase === 'ACTION' ? snap.active : Math.max(0, snap.pendingPlayer)]?.tile ?? 0;
  }
  render();
  say(restored ? `Partie reprise au tour ${snap.turn}, depuis la graine ${config.seed}.` : snap.message);
} catch (error) {
  console.error(error);
  $('#engine-error').hidden = false;
  $('#layout').hidden = true;
  for (const button of document.querySelectorAll('#new-button, #pause-button')) button.disabled = true;
}
