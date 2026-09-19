import { assertObject, validateConfig, validateRule } from './config-validator.js';
import { createConfig, createGroup, newId } from './config-model.js';
import { importLegacyConfig, exportLegacyConfig, parseLegacyJson } from './legacy-xswitch-adapter.js';
export function detectImportFormat(input) {
  const value = parseLegacyJson(input); assertObject(value, '导入文件');
  if (value.format !== undefined) {
    if (value.version !== 1) throw new Error('不支持的导入版本');
    if (!['xswitch-next', 'xswitch-next-rule', 'xswitch-next-group'].includes(value.format)) throw new Error('未知文件格式');
    return value.format;
  }
  return 'xswitch-legacy';
}
export function parseImport(input) {
  if (typeof input === 'string' && new TextEncoder().encode(input).length > 2 * 1024 * 1024) throw new Error('导入文件超过 2 MiB');
  const value = parseLegacyJson(input); const format = detectImportFormat(value);
  let config;
  if (format === 'xswitch-legacy') config = importLegacyConfig(value);
  else if (format === 'xswitch-next') config = structuredClone(value.config);
  else {
    config = createConfig(); config.groups = [];
    if (format === 'xswitch-next-group') config.groups.push(structuredClone(value.group));
    else { validateRule(value.rule); const group = createGroup('导入的规则'); group.rules.push(structuredClone(value.rule)); config.groups.push(group); }
  }
  validateConfig(config); return { format, config };
}
const key = (rule) => `${rule.type}\u0000${rule.match.value}`;
export function previewImport(input, current, groupId) {
  const parsed = parseImport(input); const rules = parsed.config.groups.flatMap((group) => group.rules);
  const existing = new Set(current.groups.filter((g) => !groupId || g.id === groupId).flatMap((g) => g.rules).map(key));
  let conflicts = 0;
  for (const rule of rules) { if (existing.has(key(rule))) conflicts++; existing.add(key(rule)); }
  return { ...parsed, summary: { groups: parsed.config.groups.length, redirects: rules.filter((r) => r.type === 'redirect').length,
    cors: rules.filter((r) => r.type === 'cors').length, conflicts } };
}
export function mergeImport(current, incoming, { mode = 'merge', conflict = 'keep', groupId } = {}) {
  if (!['merge', 'overwrite'].includes(mode) || !['keep', 'replace', 'both'].includes(conflict)) throw new Error('未知导入策略');
  validateConfig(incoming);
  const result = structuredClone(mode === 'overwrite' ? incoming : current);
  if (mode === 'overwrite') return result;
  const target = groupId ? result.groups.find((g) => g.id === groupId) : null;
  if (groupId && !target) throw new Error('目标规则组不存在');
  const existing = new Map();
  for (const group of target ? [target] : result.groups) for (const rule of group.rules) {
    if (!existing.has(key(rule))) existing.set(key(rule), { group, rule });
  }
  for (const imported of incoming.groups) {
    const group = target ?? { ...structuredClone(imported), id: newId('group'), rules: [] };
    if (!target) delete group.legacy;
    for (const entry of imported.rules) {
      const duplicate = existing.get(key(entry)); if (duplicate && conflict === 'keep') continue;
      const rule = structuredClone(entry); rule.id = newId('rule');
      if (duplicate && conflict === 'replace') {
        rule.id = duplicate.rule.id; duplicate.group.rules.splice(duplicate.group.rules.indexOf(duplicate.rule), 1, rule);
        existing.set(key(rule), { group: duplicate.group, rule }); continue;
      }
      if (duplicate) rule.name += '（导入副本）';
      group.rules.push(rule); existing.set(key(rule), { group, rule });
    }
    if (!target && (group.rules.length || imported.rules.length === 0)) result.groups.push(group);
  }
  return validateConfig(result);
}
export function exportConfig(config, { scope = 'all', id, legacy = false, envelope = true } = {}) {
  validateConfig(config); if (legacy) return exportLegacyConfig(config, { envelope });
  if (scope === 'rule') {
    const rule = config.groups.flatMap((g) => g.rules).find((r) => r.id === id); if (!rule) throw new Error('规则不存在');
    return { format: 'xswitch-next-rule', version: 1, rule: structuredClone(rule) };
  }
  if (scope === 'group') {
    const group = config.groups.find((g) => g.id === id); if (!group) throw new Error('规则组不存在');
    return { format: 'xswitch-next-group', version: 1, group: structuredClone(group) };
  }
  if (scope !== 'all') throw new Error('未知导出范围');
  return { format: 'xswitch-next', version: 1, exportedAt: new Date().toISOString(), config: structuredClone(config) };
}

export function normalizePastedInput(raw) {
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('粘贴内容为空');

  let parsed;
  try {
    parsed = parseLegacyJson(trimmed, '粘贴内容');
  } catch (err) {
    const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 2 && (lines[0].startsWith('http') || lines[0].includes('/'))) {
      return JSON.stringify({ proxy: [[lines[0], lines[1]]] });
    }
    throw err;
  }

  if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === 'string' && typeof parsed[1] === 'string') {
    return JSON.stringify({ proxy: [parsed] });
  }

  if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((item) => Array.isArray(item) && item.length === 2 && typeof item[0] === 'string' && typeof item[1] === 'string')) {
    return JSON.stringify({ proxy: parsed });
  }

  if (typeof parsed === 'string' && parsed.length > 0 && !parsed.includes('\n')) {
    return JSON.stringify({ cors: [parsed] });
  }

  if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((item) => typeof item === 'string')) {
    return JSON.stringify({ cors: parsed });
  }

  return trimmed;
}

export function inspectPastedInput(raw) {
  try {
    const normalized = normalizePastedInput(raw);
    const parsed = parseImport(normalized);
    const rules = parsed.config.groups.flatMap((g) => g.rules);
    const redirects = rules.filter((r) => r.type === 'redirect').length;
    const cors = rules.filter((r) => r.type === 'cors').length;
    const firstGroup = parsed.config.groups[0];
    const groupName = firstGroup?.name && firstGroup.name !== '默认规则' && firstGroup.name !== '导入的规则' ? firstGroup.name : '';
    return {
      valid: true,
      normalized,
      count: rules.length,
      redirects,
      cors,
      groupName,
      summary: `${rules.length} 条规则（${redirects} 条转发，${cors} 条跨域）`,
    };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

export function normalizePastedGroup(raw, customName) {
  const normalized = normalizePastedInput(raw);
  const parsed = parseImport(normalized);
  const rules = parsed.config.groups.flatMap((g) => g.rules);
  const name = customName?.trim() || parsed.config.groups[0]?.name || '新建规则组';
  return JSON.stringify({
    format: 'xswitch-next-group',
    version: 1,
    group: {
      name,
      enabled: true,
      rules,
    },
  });
}

