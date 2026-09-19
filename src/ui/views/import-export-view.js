import { el, button, field } from '../components/dom.js';
import { dialog } from '../components/dialog.js';
import { exportFile, downloadJson } from '../../services/import-export-service.js';
export function importExportView(ctx) {
  const view = el('div', { class: 'space-y-4' });
  const input = el('input', { type: 'file', accept: '.json,.jsonc,application/json', class: 'input text-xs', 'aria-label': '选择配置文件' });
  input.onchange = () => ctx.guard(async () => {
    const file = input.files[0]; if (!file) return; if (file.size > 2 * 1024 * 1024) throw new Error('文件超过 2 MiB');
    const text = await file.text(); const preview = await ctx.request('IMPORT_PREVIEW', { input: text, groupId: ctx.ui.importGroupId });
    ctx.ui.importPreview = { ...preview, text }; ctx.render();
  });
  view.append(el('section', { class: 'panel space-y-3 p-4' }, el('h2', { class: 'text-sm font-semibold' }, '导入配置'),
    el('p', { class: 'muted text-xs leading-6' }, ctx.ui.importGroupId ? '将规则导入所选规则组。' : '自动识别单条规则、规则组、完整配置和原版 XSwitch 文件。'), input));
  if (ctx.ui.importPreview) {
    const p = ctx.ui.importPreview;
    const strategy = el('select', { class: 'input text-xs', 'aria-label': '重复规则处理' },
      el('option', { value: 'keep' }, '保留现有'), el('option', { value: 'replace' }, '使用导入版本'), el('option', { value: 'both' }, '同时保留（自动重命名）'));
    const commit = (mode) => ctx.guard(async () => {
      if (mode === 'overwrite' && !await dialog({ title: '覆盖全部配置', message: '当前全部规则组将由此文件替换。会先创建备份。', danger: true, confirmLabel: '覆盖' })) return;
      await ctx.change('CONFIG_IMPORT', { input: p.text, mode, conflict: strategy.value,
        groupId: mode === 'merge' ? ctx.ui.importGroupId : undefined, expectedRevision: p.revision }, false);
      ctx.ui.importPreview = null; ctx.ui.importGroupId = null; ctx.toast({ message: '配置已导入并生效' }); ctx.render();
    });
    view.append(el('section', { class: 'panel space-y-3 border-primary/50 p-4 shadow-md', 'aria-label': '导入预览' },
      el('h3', { class: 'text-sm font-semibold' }, '即将导入'),
      el('p', { class: 'text-xs leading-6' }, `${p.summary.groups} 个规则组 · ${p.summary.redirects} 条转发规则 · ${p.summary.cors} 条跨域规则`),
      el('p', { class: 'muted text-xs' }, `${p.summary.conflicts} 条重复规则`), field('冲突处理', strategy),
      el('div', { class: 'flex flex-wrap gap-2' }, button('合并', () => commit('merge'), 'btn-primary'),
        !ctx.ui.importGroupId && button('覆盖全部', () => commit('overwrite')),
        button('取消', () => { ctx.ui.importPreview = null; ctx.ui.importGroupId = null; ctx.render(); }))));
  }
  view.append(el('section', { class: 'panel space-y-3 p-4' }, el('h2', { class: 'text-sm font-semibold' }, '导出与兼容'),
    button('导出全部配置', () => ctx.guard(() => exportFile('xswitch-next'))),
    el('p', { class: 'muted text-xs leading-6' }, 'Next 格式保留名称、开关和全部规则。原版格式不支持单条停用规则，因此不包含这些规则；原版分组文件可直接导回原版插件。'),
    el('div', { class: 'flex flex-wrap gap-2' }, button('导出为 XSwitch 格式', () => ctx.guard(() => exportFile('xswitch-legacy', { legacy: true, envelope: true }))),
      button('导出原版 JSON 映射', () => ctx.guard(() => exportFile('xswitch-map', { legacy: true, envelope: false }))))));
  const backups = el('section', { class: 'panel space-y-3 p-4' }, el('h2', { class: 'text-sm font-semibold' }, '备份与恢复'));
  if (!ctx.state.backups.length) backups.append(el('p', { class: 'muted text-xs' }, '修改规则后会自动创建备份。'));
  for (const backup of ctx.state.backups) backups.append(el('div', { class: 'flex items-center justify-between gap-2 border-b border-border pb-2' },
    el('p', { class: 'muted text-[11px] leading-5' }, new Date(backup.timestamp).toLocaleString(), el('span', { class: 'block' }, `${backup.groupCount} 个规则组 · ${backup.source === 'agent' ? 'AI Agent' : '本地操作'}`)),
    button('恢复', () => ctx.guard(async () => {
      if (await dialog({ title: '恢复备份', message: '恢复该时间点的配置。当前状态也会备份。', confirmLabel: '恢复' })) await ctx.change('BACKUP_RESTORE', { backupId: backup.id });
    }))));
  backups.append(button('导出迁移前原始数据', () => ctx.guard(async () => downloadJson('xswitch-before-migration', await ctx.request('LEGACY_SNAPSHOT_EXPORT')))));
  view.append(backups, button('清除所有规则', () => ctx.guard(async () => {
    if (await dialog({ title: '清除所有规则', message: '这会删除全部规则组及规则。可通过备份恢复。', confirmLabel: '清除', danger: true })) await ctx.change('CONFIG_CLEAR', {});
  }), 'border-error/40 text-error hover:bg-error/10'));
  return view;
}
