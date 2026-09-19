import { el, button, field } from '../components/dom.js';
import { toggle } from '../components/toggle.js';
import { dropdown } from '../components/dropdown.js';
import { dialog } from '../components/dialog.js';
import { pasteDialog } from '../components/paste-dialog.js';
import { createRuleCard } from '../components/rule-card.js';
import { createRuleEditor } from '../components/rule-editor.js';
import { groupToLegacyJson, ruleToLegacyJson } from '../../core/legacy-xswitch-adapter.js';
import { normalizePastedGroup, normalizePastedInput } from '../../core/import-format.js';

export function rulesView(ctx) {
  const { ui, state } = ctx;
  const view = el('div', { class: 'space-y-4' });
  const search = el('input', { id: 'rule-search', class: 'input', type: 'search', value: ui.search, placeholder: '搜索名称、匹配地址、目标地址', 'aria-label': '搜索规则',
    onInput: (event) => { ui.search = event.target.value; ctx.render(); } });
  const filters = el('div', { class: 'flex gap-1', role: 'group', 'aria-label': '规则筛选' });
  for (const [value, label] of [['all', '全部'], ['enabled', '启用'], ['disabled', '已停用']]) filters.append(button(label, () => { ui.filter = value; ctx.render(); },
    ui.filter === value ? 'border-primary bg-primary-soft text-primary font-medium' : 'text-text-secondary', { 'aria-pressed': ui.filter === value ? 'true' : 'false' }));

  const openCreateGroupDialog = async ({ initialPaste = false } = {}) => {
    let clipboardText = '';
    if (initialPaste) {
      try { clipboardText = (await navigator.clipboard?.readText()) || ''; } catch {
        /* ignore clipboard read error */
      }
    }
    const result = await pasteDialog({
      title: initialPaste ? '粘贴新建规则组' : '新建规则组',
      showNameInput: true,
      initialText: clipboardText,
      confirmLabel: '创建',
    });
    if (!result) return;
    await ctx.guard(async () => {
      if (result.text?.trim()) {
        const payloadInput = normalizePastedGroup(result.text, result.name);
        await ctx.change('CONFIG_IMPORT', { input: payloadInput });
        ctx.toast({
          message: `已创建规则组「${result.name || result.inferredName || '新建规则组'}」（含 ${result.count} 条规则）`,
        });
      } else {
        const name = result.name?.trim() || '新建规则组';
        await ctx.change('GROUP_CREATE', { name });
        ctx.toast({ message: `已创建规则组「${name}」` });
      }
    });
  };

  const createGroup = () => openCreateGroupDialog({ initialPaste: false });
  const pasteCreateGroup = () => openCreateGroupDialog({ initialPaste: true });

  const copyRule = async (rule) => {
    try {
      const json = ruleToLegacyJson(rule);
      await navigator.clipboard.writeText(JSON.stringify(json, null, 2));
      ctx.toast({ message: `已复制规则「${rule.name}」到剪贴板` });
    } catch (err) {
      ctx.toast({ type: 'error', message: '复制失败: ' + err.message });
    }
  };

  const copyGroup = async (group) => {
    try {
      const json = groupToLegacyJson(group);
      await navigator.clipboard.writeText(JSON.stringify(json, null, 2));
      ctx.toast({ message: `已复制「${group.name}」规则组到剪贴板` });
    } catch (err) {
      ctx.toast({ type: 'error', message: '复制失败: ' + err.message });
    }
  };

  const pasteIntoGroup = async (group) => {
    let clipboardText = '';
    try { clipboardText = (await navigator.clipboard?.readText()) || ''; } catch {
      /* ignore clipboard read error */
    }
    const result = await pasteDialog({
      title: `粘贴规则到「${group.name}」`,
      showNameInput: false,
      initialText: clipboardText,
      confirmLabel: '导入',
    });
    if (!result || !result.text?.trim()) return;
    await ctx.guard(async () => {
      const normalized = normalizePastedInput(result.text);
      await ctx.change('CONFIG_IMPORT', {
        input: normalized,
        groupId: group.id,
        conflict: 'both',
      });
      ui.collapsed.delete(group.id);
      ctx.toast({ message: `已向「${group.name}」导入 ${result.count} 条规则` });
    });
  };

  view.append(search, el('div', { class: 'flex items-center justify-between gap-2' }, filters,
    el('div', { class: 'flex items-center gap-1.5' },
      button('+ 规则组', createGroup),
      button('粘贴新建', pasteCreateGroup, 'border-primary/60 text-primary hover:bg-primary-soft text-xs')
    )));

  if (!state.groups.length || !state.groups.some((g) => g.rules.length)) view.append(el('section', { class: 'panel space-y-3 p-5 text-center' },
    el('h2', { class: 'text-sm font-semibold' }, '还没有转发规则'), el('p', { class: 'muted text-xs leading-6' }, '创建第一条规则，让请求转发到本地或其他环境。'),
    el('div', { class: 'flex flex-wrap items-center justify-center gap-2' },
      button('添加规则', () => ctx.guard(async () => {
        let groupId = state.groups[0]?.id;
        if (!groupId) groupId = (await ctx.change('GROUP_CREATE', { name: '默认规则' }, false)).group.id;
        ui.editing = { groupId, rule: { type: 'redirect' }, revision: ctx.state.revision }; ctx.render();
      }), 'btn-primary'),
      button('粘贴新建规则组', pasteCreateGroup, 'btn')
    ),
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
      button(el('span', { class: 'min-w-0 break-words text-left font-medium' }, `${expanded ? '▾' : '▸'} ${group.name}`, el('span', { class: 'muted ml-2 text-[10px]' }, `${group.rules.length} 条`)),
        () => { if (expanded) ui.collapsed.add(group.id); else ui.collapsed.delete(group.id); ctx.render(); }, 'min-w-0 border-0 bg-transparent px-0 text-text-primary hover:text-primary', { 'aria-expanded': String(expanded) }),
      el('div', { class: 'flex shrink-0 items-center gap-2' }, toggle(`${group.name} 规则组启用`, group.enabled, (enabled) => ctx.guard(() => ctx.change('GROUP_UPDATE', { groupId: group.id, enabled }))),
        dropdown(`${group.name} 规则组操作`, [
          ['重命名', rename],
          ['复制', () => copyGroup(group)],
          ['粘贴规则', () => pasteIntoGroup(group)],
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
          copy: copyRule,
          exportRule: ctx.exportRule,
          remove: (rule) => ctx.guard(async () => {
            const result = await ctx.change('RULE_DELETE', { ruleId: rule.id });
            ctx.toast({ message: `已删除「${rule.name}」`, action: { label: '撤销', run: () => ctx.change('BACKUP_RESTORE', { backupId: result.backupId, expectedRevision: result.revision }) } });
          }),
        }));
        if (ui.testing === rule.id) section.append(testEditor(ctx, rule));
      }
      if (ui.editing?.groupId === group.id && !ui.editing.rule?.id) section.append(editor(ctx));
      else section.append(el('div', { class: 'flex flex-wrap gap-2' },
        ...[['redirect', '+ 请求转发'], ['cors', '+ 允许跨域']].map(([type, label]) => button(label, () => {
          ui.editing = { groupId: group.id, rule: { type }, revision: state.revision }; ctx.render();
        }, 'border-dashed border-border-strong/60 bg-transparent text-text-secondary hover:border-primary hover:text-primary')),
        button('+ 粘贴导入', () => pasteIntoGroup(group),
          'border-dashed border-border-strong/60 bg-transparent text-text-secondary hover:border-primary hover:text-primary')
      ));
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
