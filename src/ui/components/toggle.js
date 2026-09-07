import { el } from './dom.js';
export function toggle(label, checked, change) {
  const input = el('input', { type: 'checkbox', class: 'peer sr-only', role: 'switch', 'aria-label': label, checked,
    onChange: () => change(input.checked) });
  return el('label', { class: 'relative inline-flex shrink-0 cursor-pointer items-center' }, input,
    el('span', { class: 'h-5 w-9 rounded-full bg-zinc-300 transition-colors duration-150 peer-checked:bg-indigo-600 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-500 dark:bg-zinc-700' }),
    el('span', { class: 'pointer-events-none absolute left-0.5 h-4 w-4 rounded-full bg-white transition-transform duration-150 peer-checked:translate-x-4' }));
}
