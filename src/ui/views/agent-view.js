import { el, button } from '../components/dom.js';
import { dialog } from '../components/dialog.js';

const actionNames = { RULE_CREATE: '添加规则', RULE_UPDATE: '修改规则', RULE_DELETE: '删除规则', RULE_COPY: '复制规则', RULE_MOVE: '调整规则顺序',
  GROUP_CREATE: '创建规则组', GROUP_UPDATE: '修改规则组', GROUP_DELETE: '删除规则组', GROUP_COPY: '复制规则组', GROUP_MOVE: '调整分组顺序',
  CONFIG_ENABLED: '切换总开关', OPTIONS_SET: '修改选项', BACKUP_RESTORE: '恢复备份', CONFIG_IMPORT: '导入配置', LEGACY_UPSERT: '修改原版规则组', CONFIG_CLEAR: '清除规则' };
export function setupPrompt(extensionId) {
  return `请帮我安装并连接 XSwitch Next MCP，只安装和验证，不修改规则。
当前扩展 ID：${extensionId}
本次构建的开发仓库路径：${__XSWITCH_PROJECT_PATH__}
先检查该目录是否包含 mcp/install-host.js 与 skills/xswitch/SKILL.md。若不存在，将 https://github.com/guodonglu/xswitch-next 的 feature/xswitch-next 分支克隆到本机开发目录；不要安装原版 xswitch-mcp 包替代本 Fork。
在仓库执行 npm ci，再执行 npm run mcp:install-host -- --extension-id ${extensionId}（Edge 可加 --browser edge）。
安装器会输出稳定的 Node/server.js 路径。将其添加到当前 AI 客户端的 stdio MCP 配置，名称 xswitch-next，不覆盖其他 MCP。若有同名配置先核对来源。
安装仓库内 skills/xswitch/SKILL.md 到当前客户端支持的 Skill 目录。
连接后调用 get_xswitch_state，确认 MCP V2 工具 create_redirect_rule 和 test_rule 可用。只在客户端必须重启时提示我重启。`;
}
export function agentView(ctx) {
  const agent = ctx.state.agent ?? {};
  const copy = () => ctx.guard(async () => { await navigator.clipboard.writeText(setupPrompt(chrome.runtime.id)); ctx.toast({ message: '配置指令已复制' }); });
  const view = el('div', { class: 'space-y-4' },
    el('section', { class: 'panel space-y-3 p-4' }, el('h2', { class: 'text-sm font-semibold' }, '连接 AI Agent'),
      el('p', { class: `text-xs ${agent.connected ? 'text-emerald-600 dark:text-emerald-400' : 'muted'}` }, agent.connected ? '● MCP 已连接' : '○ MCP 未连接'),
      el('p', { class: 'muted text-xs leading-6' }, '1. 复制配置指令\n2. 粘贴到 Codex / Claude Code / Qoder\n3. 让 Agent 完成安装与连接'),
      el('div', { class: 'flex flex-wrap gap-2' }, button('复制 Agent 配置 Prompt', copy, 'btn-primary'),
        button('重新连接', () => ctx.guard(async () => { await ctx.request('AGENT_RECONNECT'); ctx.toast({ message: '正在重新连接本机服务' }); }))),
      agent.lastError && el('p', { class: 'break-words text-xs leading-5 text-amber-700 dark:text-amber-400' }, '本机桥接尚未就绪，请通过上方配置指令完成安装。')));
  const history = el('section', { class: 'space-y-3' }, el('div', { class: 'flex items-center justify-between gap-2' },
    el('h2', { class: 'text-sm font-semibold' }, '最近操作'), button('撤销上一次 AI 修改', () => ctx.guard(async () => {
      if (await dialog({ title: '撤销 AI 修改', message: '恢复至最近一次 AI 修改前的完整配置；该时间点之后的其他修改也会撤销。当前状态会备份。', confirmLabel: '恢复' })) await ctx.change('BACKUP_RESTORE', { agentOnly: true });
    }))));
  if (!ctx.state.history.length) history.append(el('p', { class: 'muted py-8 text-center text-xs' }, '还没有操作记录。'));
  for (const operation of ctx.state.history) history.append(el('article', { class: 'panel space-y-1.5 p-3' },
    el('div', { class: 'flex items-center justify-between gap-2 text-[10px]' }, el('span', { class: 'text-indigo-600 dark:text-indigo-300' }, operation.source === 'agent' ? 'AI Agent' : operation.source === 'import' ? '配置导入' : '手动操作'),
      el('time', { class: 'muted' }, new Date(operation.timestamp).toLocaleString())),
    el('p', { class: 'break-words text-xs' }, actionNames[operation.action] ?? '更新配置', operation.change?.rule ? `：${operation.change.rule}` : operation.change?.group ? `：${operation.change.group}` : ''),
    operation.change?.match && el('p', { class: 'muted break-all font-mono text-[11px] leading-5' }, operation.change.match,
      operation.change.destination && el('span', { class: 'block' }, `→ ${operation.change.destination}`))));
  view.append(history); return view;
}
