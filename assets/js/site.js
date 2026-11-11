// Shared behaviour for every portfolio page: theme, header, reveals, figure helpers.

const root = document.documentElement;
const KEY = 'bc-theme';
const systemDark = matchMedia('(prefers-color-scheme: dark)');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

root.classList.add('js');

/* ------------------------------------------------------------------ Theme */
function storedTheme() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
function saveTheme(value) {
  try { value ? localStorage.setItem(KEY, value) : localStorage.removeItem(KEY); } catch { /* private mode */ }
}
export function currentTheme() {
  const explicit = root.dataset.theme;
  if (explicit === 'light' || explicit === 'dark') return explicit;
  return systemDark.matches ? 'dark' : 'light';
}
const listeners = new Set();
export function onThemeChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emitTheme() { for (const fn of listeners) fn(currentTheme()); }

function applyTheme(value) {
  if (value === 'light' || value === 'dark') root.dataset.theme = value;
  else delete root.dataset.theme;
  updateToggle();
  emitTheme();
}
const LABELS = { auto: 'Thème : automatique', light: 'Thème : clair', dark: 'Thème : sombre' };
function updateToggle() {
  const state = root.dataset.theme || 'auto';
  for (const button of document.querySelectorAll('.theme-toggle')) {
    button.setAttribute('aria-label', `${LABELS[state]}. Changer de thème`);
    button.title = LABELS[state];
  }
}
// First click always produces a visible change: auto -> opposite of system -> the other -> auto.
function nextTheme() {
  const state = root.dataset.theme || 'auto';
  const opposite = systemDark.matches ? 'light' : 'dark';
  const same = systemDark.matches ? 'dark' : 'light';
  if (state === 'auto') return opposite;
  if (state === opposite) return same;
  return null;
}
for (const button of document.querySelectorAll('.theme-toggle')) {
  button.addEventListener('click', () => {
    const value = nextTheme();
    saveTheme(value);
    applyTheme(value);
  });
}
systemDark.addEventListener('change', () => { if (!root.dataset.theme) emitTheme(); });
updateToggle();

/* ----------------------------------------------------------------- Header */
const header = document.querySelector('.site-header');
if (header) {
  const update = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  update();
  addEventListener('scroll', update, { passive: true });
}

/* ---------------------------------------------------------------- Helpers */
export const prefersReducedMotion = () => reduced.matches;
export const css = name => getComputedStyle(root).getPropertyValue(name).trim();

export function whenVisible(element, fn, { threshold = 0.25, rootMargin = '0px 0px -8% 0px' } = {}) {
  if (!('IntersectionObserver' in window)) { fn(); return; }
  const io = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { io.disconnect(); fn(); break; }
  }, { threshold, rootMargin });
  io.observe(element);
}

export function observeWidth(element, fn) {
  let last = -1, frame = 0;
  const run = () => {
    frame = 0;
    const width = Math.round(element.getBoundingClientRect().width);
    if (width !== last && width > 0) { last = width; fn(width); }
  };
  if ('ResizeObserver' in window) new ResizeObserver(() => { if (!frame) frame = requestAnimationFrame(run); }).observe(element);
  else addEventListener('resize', () => { if (!frame) frame = requestAnimationFrame(run); });
  run();
}

const nf = new Map();
export function fmt(value, digits = 0) {
  if (value == null || !Number.isFinite(value)) return '—';
  const key = digits;
  if (!nf.has(key)) nf.set(key, new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }));
  return nf.get(key).format(value);
}
export const pct = (value, digits = 0) => (value == null ? '—' : `${fmt(value * 100, digits)} %`);

/** Positions a .tip element inside a relatively positioned container. */
export function tooltip(container) {
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'status');
  container.appendChild(tip);
  return {
    show(html, x, y) {
      tip.innerHTML = html;
      tip.classList.add('is-on');
      const box = container.getBoundingClientRect();
      const w = tip.offsetWidth, h = tip.offsetHeight;
      let left = x + 14, top = y - h - 10;
      if (left + w > box.width) left = Math.max(0, x - w - 14);
      if (top < 0) top = y + 16;
      tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
      tip.style.left = '0'; tip.style.top = '0';
    },
    hide() { tip.classList.remove('is-on'); },
  };
}

/* ----------------------------------------------------------------- Reveal */
const revealTargets = document.querySelectorAll('.reveal');
if (revealTargets.length) {
  if (!('IntersectionObserver' in window) || reduced.matches) revealTargets.forEach(el => el.classList.add('is-visible'));
  else {
    const io = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); }
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    revealTargets.forEach(el => io.observe(el));
  }
}
