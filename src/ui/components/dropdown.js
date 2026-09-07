import { el, button } from './dom.js';
export function dropdown(label, actions) {
  const root = el('details', { class: 'relative' });
  const summary = el('summary', { class: 'btn list-none px-2', 'aria-label': label }, '⋯');
  const menu = el('div', { class: 'panel absolute right-0 top-full z-20 mt-1 flex min-w-32 flex-col gap-1 p-1.5 shadow-lg' });
  for (const [name, run] of actions) menu.append(button(name, () => { root.open = false; run(); }, 'justify-start border-0'));
  root.addEventListener('keydown', (event) => { if (event.key === 'Escape') { root.open = false; summary.focus(); } });
  root.addEventListener('focusout', () => setTimeout(() => { if (!root.contains(document.activeElement)) root.open = false; }, 0));
  root.append(summary, menu); return root;
}
