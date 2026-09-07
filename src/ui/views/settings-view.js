import { el, field, button } from '../components/dom.js';
import { toggle } from '../components/toggle.js';
export function settingsView(ctx) {
  const view = el('div', { class: 'space-y-5' });
  const select = el('select', { class: 'input', 'aria-label': '主题' },
    ...[['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']].map(([value, name]) => el('option', { value }, name)));
  select.value = ctx.state.preferences.theme;
  select.onchange = () => ctx.guard(() => ctx.change('PREFERENCES_SET', { theme: select.value }));
  view.append(el('section', { class: 'panel space-y-4 p-4' }, el('h2', { class: 'text-sm font-semibold' }, '外观'), field('主题', select)));
  const behavior = el('section', { class: 'panel space-y-5 p-4' }, el('h2', { class: 'text-sm font-semibold' }, '行为'));
  for (const [label, hint, checked, action, key] of [
    ['启动时启用', '浏览器启动时开启总开关', ctx.state.preferences.enableOnStartup, 'PREFERENCES_SET', 'enableOnStartup'],
    ['禁用缓存', '请求时清理近期 HTTP 缓存，沿用原版行为', ctx.state.options.clearCache, 'OPTIONS_SET', 'clearCache'],
    ['跨域支持', '应用已配置的允许跨域规则', ctx.state.options.corsEnabled, 'OPTIONS_SET', 'corsEnabled'],
    ['允许 AI Agent 连接', '通过本机 MCP 配置规则', ctx.state.preferences.mcpEnabled, 'PREFERENCES_SET', 'mcpEnabled'],
  ]) behavior.append(el('div', { class: 'flex items-center justify-between gap-4' },
    el('div', {}, el('p', { class: 'text-xs font-medium' }, label), el('p', { class: 'muted mt-1 text-[11px] leading-5' }, hint)),
    toggle(label, checked, (value) => ctx.guard(() => ctx.change(action, { [key]: value })))));
  view.append(behavior, el('p', { class: 'muted text-xs leading-6' }, '跨域规则沿用原版响应头修改方式；需要携带 Cookie 的接口仍需服务端允许对应来源。'));
  view.append(el('section', { class: 'panel space-y-3 p-4' }, el('h2', { class: 'text-sm font-semibold' }, 'Agent 与数据'),
    el('div', { class: 'flex flex-wrap gap-2' }, button('连接 AI Agent', () => { ctx.ui.view = 'agent'; ctx.render(); }),
      button('导入、导出与恢复备份', () => ctx.navigateImport()))));
  return view;
}
