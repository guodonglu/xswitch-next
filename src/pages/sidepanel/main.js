import '../../styles/tailwind.css';
import { request } from '../../services/extension-api.js';
import { applyTheme } from '../../services/theme-service.js';
import { el, button, icon } from '../../ui/components/dom.js';
import { toggle } from '../../ui/components/toggle.js';
import { showToast } from '../../ui/components/toast.js';
import { rulesView } from '../../ui/views/rules-view.js';
import { settingsView } from '../../ui/views/settings-view.js';
import { importExportView } from '../../ui/views/import-export-view.js';
import { exportFile, downloadJson } from '../../services/import-export-service.js';
import { agentView } from '../../ui/views/agent-view.js';

const app = document.querySelector('#app');
const ui = { view: 'rules', search: '', filter: 'all', collapsed: new Set(), editing: null, testing: null, busy: false };
let state; let queuedRefresh = false;
const ctx = { ui, get state() { return state; }, render, request, toast: showToast,
  guard: async (run) => { try { return await run(); } catch (error) { showToast({ type: 'error', message: error.message }); } },
  change: async (type, payload, rerender = true) => {
    if (ui.busy) throw new Error('正在保存，请稍后重试');
    ui.busy = true; setStatus('保存中…');
    try {
      const result = await request(type, { expectedRevision: state.revision, ...payload });
      state = await request('STATE_GET'); applyTheme(state.preferences.theme);
      if (rerender) render(); setStatus('已生效'); return result;
    } catch (error) {
      // Revert optimistic native checkbox state as well as the service transaction.
      try { state = await request('STATE_GET'); } catch { /* Keep the last acknowledged state offline. */ }
      if (!ui.editing) render(); setStatus('保存失败'); throw error;
    }
    finally { ui.busy = false; }
  },
  exportRule: (rule) => ctx.guard(() => exportFile(rule.name, { scope: 'rule', id: rule.id })),
  exportGroup: (group) => ctx.guard(() => exportFile(group.name, { scope: 'group', id: group.id })),
  navigateImport: (groupId) => { ui.importGroupId = groupId; ui.importPreview = null; ui.view = 'transfer'; render(); },
};
function setStatus(text) { const status = document.querySelector('#save-status'); if (status) status.textContent = text; }
function render() {
  if (!state) return;
  const focus = document.activeElement; const focusId = focus?.id; const start = focus?.selectionStart; const end = focus?.selectionEnd;
  const scroll = window.scrollY;
  const header = el('header', { class: 'sticky top-0 z-10 border-b border-border bg-surface/95 px-4 py-4 backdrop-blur' },
    el('div', { class: 'flex items-center justify-between gap-3' },
      el('div', { class: 'flex items-center gap-2.5' }, el('span', { class: 'flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white shadow-sm' }, icon('rules')),
        el('div', {}, el('h1', { class: 'text-sm font-semibold tracking-tight' }, 'XSwitch Next'), el('p', { class: 'muted mt-0.5 text-[10px]' }, 'REQUEST REDIRECT'))),
      el('div', { class: 'flex items-center gap-2 text-xs' }, el('span', {}, state.enabled ? '已启用' : '已停用'),
        toggle('总开关', state.enabled, (enabled) => ctx.guard(() => ctx.change('CONFIG_ENABLED', { enabled }))))),
    el('div', { class: 'muted mt-3 flex items-center justify-between text-[11px]' },
      el('span', {}, `${state.activeRuleCount} 条启用规则`), el('span', { id: 'save-status', role: 'status' }, ''),
      button(`${state.agent?.connected ? '●' : '○'} Agent`, () => { ui.view = 'agent'; render(); }, 'border-0 bg-transparent p-0 text-[11px]', { id: 'agent-status' })));
  const main = el('main', { class: 'space-y-4 p-4 pb-24', id: 'main-content' });
  if (state.applyError) main.append(el('div', { class: 'panel border-error/50 bg-error/10 p-3 text-xs leading-6 text-error', role: 'alert' }, '规则无法应用：', state.applyError));
  if (ui.view === 'rules') main.append(rulesView(ctx));
  else if (ui.view === 'settings') main.append(settingsView(ctx));
  else if (ui.view === 'transfer') main.append(importExportView(ctx));
  else if (ui.view === 'agent') main.append(agentView(ctx));
  else main.append(el('h2', { class: 'font-semibold' }, ui.view === 'agent' ? 'AI Agent' : '导入导出'));
  const nav = el('nav', { class: 'fixed inset-x-0 bottom-0 z-10 mx-auto grid max-w-2xl grid-cols-4 border-t border-border bg-surface/95 px-2 py-2 backdrop-blur', 'aria-label': '主导航' });
  for (const [value, label] of [['rules', '规则'], ['agent', 'Agent'], ['transfer', '导入导出'], ['settings', '设置']]) nav.append(
    button(el('span', { class: 'flex flex-col items-center gap-1' }, icon(value), el('span', {}, label)),
      () => { ui.view = value; ui.editing = null; render(); }, `border-0 text-[11px] ${ui.view === value ? 'bg-primary-soft text-primary font-medium' : 'bg-transparent text-text-secondary hover:text-text-primary'}`, { 'aria-current': ui.view === value ? 'page' : undefined }));
  app.replaceChildren(el('div', { class: 'mx-auto min-h-screen max-w-2xl' }, header, main, nav));
  if (focusId) { const target = document.getElementById(focusId); target?.focus({ preventScroll: true }); if (start !== null && start !== undefined && target?.setSelectionRange) target.setSelectionRange(start, end); }
  if (ui.editing && document.activeElement === document.body) document.querySelector('[aria-label="规则编辑器"] input')?.focus({ preventScroll: true });
  window.scrollTo(0, scroll);
}
async function load() {
  try {
    const next = await request('STATE_GET');
    const changed = !state || state.revision !== next.revision || state.applyError !== next.applyError
      || JSON.stringify(state.preferences) !== JSON.stringify(next.preferences);
    const agentChanged = JSON.stringify(state?.agent) !== JSON.stringify(next.agent);
    state = next; applyTheme(state.preferences.theme);
    if ((changed || (agentChanged && ui.view === 'agent')) && !ui.editing && !document.querySelector('dialog[open]')) render();
    const indicator = document.querySelector('#agent-status'); if (indicator) indicator.textContent = `${state.agent?.connected ? '●' : '○'} Agent`;
  }
  catch (error) {
    if (state) return showToast({ type: 'error', message: error.message });
    app.replaceChildren(el('main', { class: 'space-y-4 p-5' }, el('h1', { class: 'font-semibold' }, '无法读取配置'),
      el('p', { class: 'break-words text-sm leading-6' }, error.message), button('重试', load),
      button('导出原始数据', () => ctx.guard(async () => downloadJson('xswitch-recovery', await request('LEGACY_SNAPSHOT_EXPORT'))))));
  }
}
chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'STATE_CHANGED' || queuedRefresh) return;
  queuedRefresh = true; setTimeout(() => { queuedRefresh = false; if (!ui.busy) void load(); }, 150);
});
void load();
