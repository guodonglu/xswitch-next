import { el, button, field } from './dom.js';
export function dialog({ title, message, inputValue, confirmLabel = '确定', danger = false }) {
  return new Promise((resolve) => {
    const input = inputValue !== undefined ? el('input', { class: 'input', value: inputValue, required: true, maxlength: 200 }) : null;
    const form = el('form', { method: 'dialog', class: 'space-y-4' },
      el('h2', { id: 'dialog-title', class: 'font-semibold' }, title),
      message && el('p', { class: 'muted text-sm leading-6' }, message), input && field('名称', input));
    const modal = el('dialog', { class: 'panel m-auto w-[calc(100%-2rem)] max-w-sm p-5 text-text-primary shadow-xl backdrop:bg-black/60', 'aria-labelledby': 'dialog-title' }, form);
    let answer = null;
    form.append(el('div', { class: 'flex justify-end gap-2' }, button('取消', () => modal.close()),
      button(confirmLabel, () => {
        if (input && !input.value.trim()) { input.reportValidity(); return; }
        answer = input ? input.value.trim() : true; modal.close();
      }, danger ? 'border-error text-error hover:bg-error/10' : 'btn-primary')));
    form.addEventListener('submit', (event) => { event.preventDefault(); if (!input || input.value.trim()) { answer = input ? input.value.trim() : true; modal.close(); } });
    modal.addEventListener('close', () => { modal.remove(); resolve(answer); }, { once: true });
    document.body.append(modal); modal.showModal(); (input ?? form.querySelector('button')).focus();
  });
}
