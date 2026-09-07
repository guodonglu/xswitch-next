import { request } from './extension-api.js';
export function downloadJson(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  const safeName = Array.from(name).filter((char) => char.charCodeAt(0) >= 32).join('').replace(/[<>:"/\\|?*]/g, '_');
  anchor.href = url; anchor.download = `${safeName.slice(0, 100) || 'xswitch'}.xswitch.json`;
  document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportFile(name, payload = {}) { downloadJson(name, await request('CONFIG_EXPORT', payload)); }
