// Small UI helpers shared by the case-study figures.
import { currentTheme } from '../site.js';

/** Segmented control. options: [{ value, label }]. Returns { set(value) }. */
export function segmented(container, options, initial, onChange, label = 'Choisir') {
  const group = document.createElement('div');
  group.className = 'seg';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  const buttons = options.map(opt => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = opt.label;
    if (opt.title) b.title = opt.title;
    b.addEventListener('click', () => { set(opt.value); onChange(opt.value); });
    group.appendChild(b);
    return { b, value: opt.value };
  });
  function set(value) { for (const { b, value: v } of buttons) b.setAttribute('aria-pressed', String(v === value)); }
  set(initial);
  container.appendChild(group);
  return { set };
}

/** Legend items: [{ label, color, kind: 'line' | 'sq' | 'dash' }]. */
export function legend(container, items) {
  container.innerHTML = '';
  container.classList.add('legend');
  for (const item of items) {
    const span = document.createElement('span');
    const i = document.createElement('i');
    if (item.kind && item.kind !== 'line') i.className = item.kind;
    i.style.color = item.color;
    if (item.kind === 'sq') i.style.background = item.color;
    span.append(i, document.createTextNode(item.label));
    container.appendChild(span);
  }
}

/** A canvas sized for the device pixel ratio. */
export function hiDpiCanvas(canvas, width, height) {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ctx;
}

/** Picks a colour from a { light, dark } pair according to the active theme. */
export const themed = pair => (currentTheme() === 'dark' ? pair.dark : pair.light);

export const ARROW = '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 11 11 5M6 5h5v5"/></svg>';
export const PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><path d="M5 3.5v9l7-4.5z"/></svg>';
export const PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><path d="M4.5 3.5h2.5v9H4.5zM9 3.5h2.5v9H9z"/></svg>';
