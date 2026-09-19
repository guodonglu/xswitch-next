import { parse } from 'jsonc-parser';
import { createConfig, createGroup, createRule } from './config-model.js';
import { assertObject, escapeRegex, validateConfig } from './config-validator.js';

const inferredRegex = (value) => /\\|\[|]|\(|\)|\*|\$|\^/i.test(value);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function parseLegacyJson(value, location = '配置') {
  if (typeof value !== 'string') return value;
  const errors = [];
  const result = parse(value, errors, { allowTrailingComma: true });
  if (errors.length) throw new Error(`${location}: JSONC 无法解析（位置 ${errors[0].offset}）`);
  return result;
}

export function legacyRuleToInternal(value, type = 'redirect') {
  if (type === 'redirect') {
    if (!Array.isArray(value) || value.length !== 2 || !value.every((part) => typeof part === 'string')) {
      throw new Error('请求转发规则必须是两个字符串组成的数组');
    }
    const rule = createRule(type, {
      name: value[0] || '请求转发', source: value[0], destination: value[1],
      matchMode: inferredRegex(value[0]) ? 'regex' : 'contains',
    });
    rule.legacy = { comboSyntax: true };
    return rule;
  }
  if (type !== 'cors' || typeof value !== 'string') throw new Error('跨域规则必须是字符串');
  const rule = createRule('cors', { name: value || '允许跨域', source: value });
  // Upstream CORS always uses a domain-anchored urlFilter, not its redirect regex heuristic.
  rule.legacy = { domainFilter: true };
  return rule;
}

export function internalRuleToLegacy(rule) {
  if (rule.type === 'cors') {
    if (rule.match.mode === 'regex' && !rule.legacy?.domainFilter) {
      throw new Error(`规则「${rule.name}」的跨域正则需要 Next 格式保留`);
    }
    return rule.match.value;
  }
  let source = rule.match.value;
  if (!rule.legacy?.comboSyntax) {
    if (rule.match.mode === 'contains' && /\$[0-9]/.test(rule.destination.value)) {
      throw new Error(`规则「${rule.name}」的目标包含字面量捕获标记，需要 Next 格式保留`);
    }
    if (rule.match.mode === 'regex' && source.includes('??')) {
      throw new Error(`规则「${rule.name}」包含原版会改写的 ?? 正则语法，需要 Next 格式保留`);
    }
    if (rule.match.mode === 'contains') source = `^.*${escapeRegex(source)}.*$`;
    else if (rule.match.mode === 'regex' && !inferredRegex(source)) source = `(?:${source})`;
  }
  return [source, rule.destination.value];
}

export function legacyGroupToInternal(value, metadata = {}) {
  const parsed = parseLegacyJson(value, `分组 ${metadata.id ?? '0'}`);
  assertObject(parsed, '分组');
  for (const key of Object.keys(parsed)) {
    if (!['proxy', 'cors'].includes(key)) throw new Error(`分组包含不支持的字段: ${key}`);
  }
  const group = createGroup(metadata.name ?? '默认规则');
  group.enabled = metadata.active ?? true;
  group.legacy = { id: metadata.id ?? '0', fields: Object.keys(parsed) };
  for (const [field, type] of [['proxy', 'redirect'], ['cors', 'cors']]) {
    if (!own(parsed, field)) continue;
    if (!Array.isArray(parsed[field])) throw new Error(`${field}: 必须是数组`);
    parsed[field].forEach((entry, index) => {
      try { group.rules.push(legacyRuleToInternal(entry, type)); }
      catch (error) { throw new Error(`分组 ${metadata.id ?? '0'} ${field}[${index}]: ${error.message}`); }
    });
  }
  return group;
}

export function internalGroupToLegacy(group, { includeDisabled = false } = {}) {
  const result = {};
  for (const field of group.legacy?.fields ?? ['proxy', 'cors']) result[field] = [];
  for (const rule of group.rules) {
    if (!includeDisabled && !rule.enabled) continue;
    const field = rule.type === 'redirect' ? 'proxy' : 'cors';
    (result[field] ??= []).push(internalRuleToLegacy(rule));
    if (rule.type === 'redirect' && rule.options.cors) {
      // A URL/domain can be represented by upstream's CORS domain filter.
      let target;
      try { target = new URL(rule.destination.value); } catch {
        throw new Error(`规则「${rule.name}」的跨域目标无法导出到原版格式`);
      }
      if (!target.hostname || /\$[0-9]|[*^|]/.test(rule.destination.value)) throw new Error(`规则「${rule.name}」需要 Next 格式保留跨域设置`);
      (result.cors ??= []).push(`${target.host}${target.pathname}${target.search}|`);
    }
  }
  return result;
}

export function importLegacyConfig(input) {
  const value = parseLegacyJson(input);
  assertObject(value, '配置');
  const config = createConfig();
  config.groups = [];
  if (value.type === 'xswitch-rules') {
    if (value.version !== 1 || !Array.isArray(value.items)) throw new Error('无效的 XSwitch 导出版本或分组列表');
    assertObject(value.rules, 'rules');
    const ids = new Set();
    for (const item of value.items) {
      assertObject(item, 'item');
      if (typeof item.id !== 'string' || ids.has(item.id) || typeof item.name !== 'string' || typeof item.active !== 'boolean') {
        throw new Error('无效或重复的 XSwitch 分组元数据');
      }
      ids.add(item.id);
      if (!own(value.rules, item.id)) throw new Error(`缺少分组配置: ${item.id}`);
      config.groups.push(legacyGroupToInternal(value.rules[item.id], item));
    }
  } else if (own(value, 'proxy') || own(value, 'cors')) {
    config.groups.push(legacyGroupToInternal(value));
  } else {
    for (const [id, group] of Object.entries(value)) {
      config.groups.push(legacyGroupToInternal(group, { id, name: id === '0' ? '默认规则' : id }));
    }
  }
  return validateConfig(config);
}

/** The envelope is importable by upstream's actual import UI. Map is the requested legacy JSON. */
export function exportLegacyConfig(config, { envelope = false } = {}) {
  validateConfig(config);
  const items = [];
  const rules = Object.create(null);
  const used = new Set();
  for (const group of config.groups) {
    let id = group.legacy?.id ?? group.id;
    if (used.has(id)) id = group.id;
    used.add(id);
    if (!envelope && (!config.enabled || !group.enabled)) continue;
    const exportedGroup = structuredClone(group);
    if (!config.options.corsEnabled) {
      exportedGroup.rules = exportedGroup.rules.filter((rule) => rule.type !== 'cors');
      exportedGroup.rules.forEach((rule) => { rule.options.cors = false; });
    }
    // Upstream always applies group 0 even when its metadata says inactive.
    if (id === '0' && (!config.enabled || !group.enabled)) exportedGroup.rules = [];
    const converted = internalGroupToLegacy(exportedGroup);
    rules[id] = envelope ? JSON.stringify(converted, null, 2) : converted;
    items.push({ id, name: group.name, active: config.enabled && group.enabled });
  }
  if (envelope && !used.has('0')) {
    items.unshift({ id: '0', name: '默认规则', active: false });
    rules['0'] = '{"proxy":[],"cors":[]}';
  }
  return envelope
    ? { type: 'xswitch-rules', version: 1, exportedAt: new Date().toISOString(), items, rules }
    : rules;
}

export function ruleToLegacyJson(rule) {
  try {
    if (rule.type === 'cors') {
      return { cors: [internalRuleToLegacy(rule)] };
    }
    const result = { proxy: [internalRuleToLegacy(rule)] };
    if (rule.options?.cors) {
      try {
        const target = new URL(rule.destination.value);
        if (target.hostname && !/\$[0-9]|[*^|]/.test(rule.destination.value)) {
          result.cors = [`${target.host}${target.pathname}${target.search}|`];
        }
      } catch {
        /* ignore invalid URL */
      }
    }
    return result;
  } catch {
    return { format: 'xswitch-next-rule', version: 1, rule: structuredClone(rule) };
  }
}

export function groupToLegacyJson(group) {
  try {
    const result = internalGroupToLegacy(group, { includeDisabled: true });
    if (result.cors && result.cors.length === 0 && !group.legacy?.fields?.includes('cors')) {
      delete result.cors;
    }
    if (result.proxy && result.proxy.length === 0 && !group.legacy?.fields?.includes('proxy')) {
      delete result.proxy;
    }
    if (!result.proxy && !result.cors) {
      result.proxy = [];
    }
    return result;
  } catch {
    return { format: 'xswitch-next-group', version: 1, group: structuredClone(group) };
  }
}

