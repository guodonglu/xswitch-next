import { el, button } from './dom.js';
import { toggle } from './toggle.js';
import { dropdown } from './dropdown.js';
export function createRuleCard(rule, actions) {
  const card = el('article', { class: `panel min-w-0 p-3 ${rule.enabled ? '' : 'opacity-65'}`, 'data-rule-id': rule.id },
    el('div', { class: 'mb-2 flex items-center justify-between gap-2' },
      el('div', { class: 'min-w-0' }, el('h3', { class: 'break-words text-sm font-medium' }, rule.name),
        el('p', { class: 'muted mt-0.5 text-[11px]' }, rule.type === 'redirect' ? '请求转发' : '允许跨域')),
      toggle(`${rule.name} 启用`, rule.enabled, (enabled) => actions.change('RULE_UPDATE', { ruleId: rule.id, enabled }))));
  card.append(el('p', { class: 'break-all font-mono text-xs leading-5', title: rule.match.value }, rule.match.value));
  if (rule.type === 'redirect') card.append(el('span', { class: 'my-1 block text-indigo-500', 'aria-hidden': 'true' }, '↓'),
    el('p', { class: 'break-all font-mono text-xs leading-5 text-indigo-600 dark:text-indigo-300' }, rule.destination.value || '（空字符串替换）'));
  card.append(el('div', { class: 'mt-3 flex flex-wrap items-center justify-between gap-2' },
    el('div', { class: 'muted flex gap-2 text-[10px]' }, rule.match.mode === 'regex' && el('span', { class: 'rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-300' }, 'Regex'),
      rule.options?.cors && el('span', {}, '允许跨域 ✓')),
    el('div', { class: 'flex items-center gap-1' }, button('测试', () => actions.test(rule)), button('编辑', () => actions.edit(rule)),
      dropdown(`${rule.name} 更多操作`, [
        ['复制', () => actions.change('RULE_COPY', { ruleId: rule.id })],
        ['导出', () => actions.exportRule(rule)],
        ['上移', () => actions.change('RULE_MOVE', { ruleId: rule.id, direction: -1 })],
        ['下移', () => actions.change('RULE_MOVE', { ruleId: rule.id, direction: 1 })],
        ['删除', () => actions.remove(rule)],
      ]))));
  return card;
}
