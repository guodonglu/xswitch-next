import { internalGroupToLegacy } from '../core/legacy-xswitch-adapter.js';

/** Transport boundary only. All business mutations are delegated to RuleService. */
export async function handleMcp(service, method, params = {}, agent = {}) {
  const write = (action, payload) => service.execute(action, payload, 'agent');
  if (method.startsWith('v2_')) {
    const tool = method.slice(3);
    const reads = ['list_rule_groups', 'get_rule_group', 'list_rules', 'get_rule'];
    if (reads.includes(tool)) {
      const state = await service.state();
      const group = params.groupId ? state.groups.find((g) => g.id === params.groupId) : null;
      if (params.groupId && !group) throw new Error('规则组不存在');
      if (tool === 'list_rule_groups') return { groups: state.groups.map(({ rules, ...g }) => ({ ...g, ruleCount: rules.length })), revision: state.revision };
      if (tool === 'get_rule_group') { if (!group) throw new Error('需要 groupId'); return { group }; }
      if (tool === 'list_rules') return { rules: (group ? [group] : state.groups).flatMap((g) => g.rules.map((r) => ({ ...r, groupId: g.id }))) };
      const rule = state.groups.flatMap((g) => g.rules).find((r) => r.id === params.ruleId);
      if (!rule) throw new Error('规则不存在'); return { rule };
    }
    if (tool === 'test_rule' || tool === 'test_url') return service.execute('RULE_TEST', params, 'agent');
    if (tool === 'export_configuration') return service.execute('CONFIG_EXPORT', params, 'agent');
    if (tool === 'preview_configuration_import') return service.execute('IMPORT_PREVIEW', params, 'agent');
    if (tool === 'import_configuration') return write('CONFIG_IMPORT', params);
    if (tool === 'create_redirect_rule' || tool === 'create_cors_rule') return write('RULE_CREATE', { ...params, type: tool === 'create_redirect_rule' ? 'redirect' : 'cors' });
    if (tool === 'update_redirect_rule' || tool === 'update_cors_rule') {
      const state = await service.state();
      const rule = state.groups.flatMap((g) => g.rules).find((r) => r.id === params.ruleId);
      if (!rule || rule.type !== (tool === 'update_redirect_rule' ? 'redirect' : 'cors')) throw new Error('规则不存在或类型不匹配');
      return write('RULE_UPDATE', params);
    }
    const actions = { delete_rule: 'RULE_DELETE', set_rule_enabled: 'RULE_UPDATE', set_group_enabled: 'GROUP_UPDATE',
      create_rule_group: 'GROUP_CREATE', update_rule_group: 'GROUP_UPDATE', delete_rule_group: 'GROUP_DELETE' };
    if (actions[tool]) return write(actions[tool], params);
    throw new Error(`未知 MCP V2 工具: ${tool}`);
  }
  switch (method) {
    case 'get_state': {
      const state = await service.state();
      return { ...state, agent, extension_enabled: state.enabled,
        options: { ...state.options, clear_cache_enabled: state.options.clearCache,
          cors_enabled: state.options.corsEnabled, mcp_enabled: state.preferences.mcpEnabled },
        groups: state.groups.map((group) => {
          let config;
          try { config = internalGroupToLegacy(group); } catch { config = null; }
          return { ...group, active: group.enabled, config };
        }) };
    }
    case 'list_backups': return { backups: (await service.state()).backups.map((backup) => ({ ...backup,
      created_at: new Date(backup.timestamp).toISOString(), operation: backup.action, status: 'committed', group_count: backup.groupCount })) };
    case 'upsert_rule_group': return write('LEGACY_UPSERT', params);
    case 'delete_rule_group':
      if (params.group_id === '0') throw new Error('默认分组 "0" 不能通过旧接口删除');
      return write('GROUP_DELETE', { groupId: params.group_id });
    case 'set_extension_enabled': return write('CONFIG_ENABLED', params);
    case 'set_options': return write('OPTIONS_SET', { clearCache: params.clear_cache_enabled, corsEnabled: params.cors_enabled });
    case 'restore_backup': return write('BACKUP_RESTORE', { backupId: params.backup_id, agentOnly: !params.backup_id });
    default: throw new Error(`不支持的 MCP 方法: ${method}`);
  }
}
