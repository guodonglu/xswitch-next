import { el, button } from './dom.js';
export function showToast({ type = 'info', message, action }) {
  const host = document.querySelector('#toasts');
  const toast = el('div', { class: `panel flex items-center justify-between gap-3 p-3 text-xs shadow-lg ${type === 'error' ? 'border-red-400 text-red-700 dark:text-red-300' : ''}` },
    el('span', { class: 'min-w-0 break-words leading-5' }, message));
  if (action) toast.append(button(action.label, async () => {
    try { await action.run(); toast.remove(); } catch (error) { showToast({ type: 'error', message: error.message }); }
  }));
  toast.append(button('×', () => toast.remove(), '', { 'aria-label': '关闭通知' }));
  host.append(toast);
  if (type !== 'error') setTimeout(() => toast.remove(), action ? 12000 : 5000);
}
