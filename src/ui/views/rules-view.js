import { el, button, field } from '../components/dom.js';
import { toggle } from '../components/toggle.js';
import { dropdown } from '../components/dropdown.js';
import { dialog } from '../components/dialog.js';
import { createRuleCard } from '../components/rule-card.js';
import { createRuleEditor } from '../components/rule-editor.js';

export function rulesView(ctx) {
  const { ui, state } = ctx;
  const view = el('div', { class: 'space-y-4' });
  const search = el('input', { id: 'rule-search', class: 'input', type: 'search', value: ui.search, placeholder: '搜索名称、匹配地址、目标地址', 'aria-label': '搜索规则',
    onInput: (event) => { ui.search = event.target.value; ctx.render(); } });
  const filters = el('div', { class: 'flex gap-1', role: 'group', 'aria-label': '规则筛选' });
  for (const [value, label] of [['all', '全部'], ['enabled', '启用'], ['disabled', '已停用']]) filters.append(button(label, () => { ui.filter = value; ctx.render(); },
    ui.filter === value ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : '', { 'aria-pressed': ui.filter === value ? 'true' : 'false' }));
  view.append(search, el('div', { class: 'flex items-center justify-between gap-2' }, filters,
    button('+ 规则组', () => ctx.guard(async () => { const name = await dialog({ title: '新建规则组', inputValue: '', confirmLabel: '创建' }); if (name) await ctx.change('GROUP_CREATE', { name }); }))));
  if (!state.groups.length || !state.groups.some((g) => g.rules.length)) view.append(el('section', { class: 'panel space-y-3 p-5 text-center' },
    el('h2', { class: 'text-sm font-semibold' }, '还没有转发规则'), el('p', { class: 'muted text-xs leading-6' }, '创建第一条规则，让请求转发到本地或其他环境。'),
    button('添加规则', () => ctx.guard(async () => {
      let groupId = state.groups[0]?.id;
      if (!groupId) groupId = (await ctx.change('GROUP_CREATE', { name: '默认规则' }, false)).group.id;
      ui.editing = { groupId, rule: { type: 'redirect' }, revision: ctx.state.revision }; ctx.render();
    }), 'btn-primary'),
    state.agent?.connected && el('p', { class: 'muted text-xs' }, '也可以告诉 AI Agent：“把 example.com/app.js 转发到 localhost:3000”')));
  let visible = 0;
  for (const group of state.groups) {
    const filtered = group.rules.filter((rule) => {
      const effective = state.enabled && group.enabled && rule.enabled && (rule.type !== 'cors' || state.options.corsEnabled);
      return (ui.filter === 'all' || (ui.filter === 'enabled' ? effective : !effective))
        && `${rule.name} ${rule.match.value} ${rule.destination?.value ?? ''}`.toLowerCase().includes(ui.search.toLowerCase());
    });
    if (!filtered.length && (ui.search || ui.filter !== 'all')) continue;
    visible += filtered.length;
    const expanded = !ui.collapsed.has(group.id);
    const section = el('section', { class: 'space-y-2', 'data-group-id': group.id });
    const rename = () => ctx.guard(async () => { const name = await dialog({ title: '重命名规则组', inputValue: group.name }); if (name) await ctx.change('GROUP_UPDATE', { groupId: group.id, name }); });
    section.append(el('div', { class: 'flex items-center justify-between gap-2 py-1' },
      button(el('span', { class: 'min-w-0 break-words text-left' }, `${expanded ? '▾' : '▸'} ${group.name}`, el('span', { class: 'muted ml-2 text-[10px]' }, `${group.rules.length} 条`)),
        () => { if (expanded) ui.collapsed.add(group.id); else ui.collapsed.delete(group.id); ctx.render(); }, 'min-w-0 border-0 bg-transparent px-0 dark:bg-transparent', { 'aria-expanded': String(expanded) }),
      el('div', { class: 'flex shrink-0 items-center gap-2' }, toggle(`${group.name} 规则组启用`, group.enabled, (enabled) => ctx.guard(() => ctx.change('GROUP_UPDATE', { groupId: group.id, enabled }))),
        dropdown(`${group.name} 规则组操作`, [
          ['重命名', rename], ['复制', () => ctx.guard(() => ctx.change('GROUP_COPY', { groupId: group.id }))],
          ['导入', () => ctx.navigateImport(group.id)], ['导出', () => ctx.exportGroup(group)],
          ['上移', () => ctx.guard(() => ctx.change('GROUP_MOVE', { groupId: group.id, direction: -1 }))],
          ['下移', () => ctx.guard(() => ctx.change('GROUP_MOVE', { groupId: group.id, direction: 1 }))],
          ['删除', () => ctx.guard(async () => { if (await dialog({ title: '删除规则组', message: `「${group.name}」包含 ${group.rules.length} 条规则。确定删除？`, danger: true, confirmLabel: '删除' })) await ctx.change('GROUP_DELETE', { groupId: group.id }); })],
        ]))));
    if (expanded) {
      for (const rule of filtered) {
        if (ui.editing?.rule?.id === rule.id) section.append(editor(ctx));
        else section.append(createRuleCard(rule, {
          change: (action, payload) => ctx.guard(() => ctx.change(action, payload)),
          edit: () => { ui.editing = { rule, groupId: group.id, revision: state.revision }; ctx.render(); },
          test: () => { ui.testing = ui.testing === rule.id ? null : rule.id; ctx.render(); },
          exportRule: ctx.exportRule,
          remove: (rule) => ctx.guard(async () => {
            const result = await ctx.change('RULE_DELETE', { ruleId: rule.id });
            ctx.toast({ message: `已删除「${rule.name}」`, action: { label: '撤销', run: () => ctx.change('BACKUP_RESTORE', { backupId: result.backupId, expectedRevision: result.revision }) } });
          }),
        }));
        if (ui.testing === rule.id) section.append(testEditor(ctx, rule));
      }
      if (ui.editing?.groupId === group.id && !ui.editing.rule?.id) section.append(editor(ctx));
      else section.append(el('div', { class: 'flex flex-wrap gap-2' }, ...[['redirect', '+ 请求转发'], ['cors', '+ 允许跨域']].map(([type, label]) => button(label, () => {
        ui.editing = { groupId: group.id, rule: { type }, revision: state.revision }; ctx.render();
      }, 'border-dashed bg-transparent dark:bg-transparent'))));
    }
    view.append(section);
  }
  if (!visible && (ui.search || ui.filter !== 'all')) view.append(el('p', { class: 'muted py-8 text-center text-sm' }, '没有符合条件的规则'));
  return view;
}
function editor(ctx) {
  return createRuleEditor({ ...ctx.ui.editing,
    save: async (action, payload) => { await ctx.change(action, payload, false); ctx.ui.editing = null; ctx.render(); },
    cancel: () => { ctx.ui.editing = null; ctx.render(); } });
}
function testEditor(ctx, rule) {
  const input = el('input', { class: 'input font-mono', type: 'url', required: true, placeholder: 'https://example.com/app.js', 'aria-label': '测试 URL' });
  const output = el('div', { class: 'break-all font-mono text-xs leading-6', role: 'status' });
  const form = el('form', { class: 'panel space-y-3 p-3', onSubmit: (event) => {
    event.preventDefault(); ctx.guard(async () => {
      const result = await ctx.request('RULE_TEST', { ruleId: rule.id, url: input.value, ignoreEnabled: true });
      output.replaceChildren(el('p', {}, result.matched ? '✓ 匹配成功' : '未命中此规则'),
        result.matched && el('p', {}, `${result.url} → ${result.finalUrl}`),
        el('p', { class: 'muted font-sans' }, '仅测试匹配逻辑，不改变规则启用状态。'));
    });
  } }, field('测试 URL', input), el('button', { type: 'submit', class: 'btn' }, '运行测试'), output);
  return form;
}
