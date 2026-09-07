export function assertObject(value, location) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${location}: 必须是对象`);
  }
}

function string(value, location, nonempty = false) {
  if (typeof value !== 'string' || (nonempty && !value.trim())) {
    throw new Error(`${location}: 必须是${nonempty ? '非空' : ''}字符串`);
  }
}

function boolean(value, location) {
  if (typeof value !== 'boolean') throw new Error(`${location}: 必须是布尔值`);
}

export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function rulePattern(rule) {
  if (rule.match.mode !== 'regex') return escapeRegex(rule.match.value);
  return rule.legacy?.comboSyntax
    ? rule.match.value.replace(/\?\?/g, '\\?\\?')
    : rule.match.value;
}

/** Syntax only. Chrome isRegexSupported remains the authority for RE2/size limits. */
export function validateRegex(pattern, location = '正则表达式') {
  try { new RegExp(pattern); } catch (error) {
    throw new Error(`${location}: ${error.message}`);
  }
  const tokens = pattern.replace(/\\\\/g, '');
  if (/\(\?(?:[=!]|<[=!])|\\[1-9]|\\k</.test(tokens)) {
    throw new Error(`${location}: Chrome RE2 不支持环视或模式内反向引用`);
  }
}

export function validateRule(rule, { forApply = false } = {}) {
  assertObject(rule, 'rule');
  const label = `规则「${rule.name ?? rule.id ?? '?'}」`;
  string(rule.id, `${label}.id`, true);
  string(rule.name, `${label}.name`, true);
  boolean(rule.enabled, `${label}.enabled`);
  if (!['redirect', 'cors'].includes(rule.type)) throw new Error(`${label}: 未知规则类型`);
  assertObject(rule.match, `${label}.match`);
  if (rule.legacy !== undefined) {
    assertObject(rule.legacy, `${label}.legacy`);
    for (const key of ['comboSyntax', 'domainFilter']) if (rule.legacy[key] !== undefined) boolean(rule.legacy[key], `${label}.legacy.${key}`);
  }
  string(rule.match.value, `${label}.match.value`);
  if (!['contains', 'regex'].includes(rule.match.mode)) throw new Error(`${label}: 未知匹配方式`);
  if (rule.type === 'redirect') {
    assertObject(rule.destination, `${label}.destination`);
    string(rule.destination.value, `${label}.destination.value`);
    assertObject(rule.options, `${label}.options`);
    boolean(rule.options.cors, `${label}.options.cors`);
  }
  for (const field of ['createdAt', 'updatedAt']) {
    if (!Number.isFinite(rule[field]) || rule[field] < 0) throw new Error(`${label}.${field}: 无效时间`);
  }
  // Import may preserve legacy syntax that Chrome cannot activate. Never silently drop it.
  if (forApply && rule.enabled) {
    string(rule.match.value, `${label}.match.value`, true);
    validateRegex(rulePattern(rule), label);
  }
  return rule;
}

export function validateConfig(config, options = {}) {
  assertObject(config, 'config');
  if (config.version !== 1) throw new Error('不支持的配置版本');
  boolean(config.enabled, 'config.enabled');
  assertObject(config.options, 'config.options');
  boolean(config.options.clearCache, 'options.clearCache');
  boolean(config.options.corsEnabled, 'options.corsEnabled');
  if (!Array.isArray(config.groups)) throw new Error('groups: 必须是数组');
  const ids = new Set();
  const unique = (id) => {
    string(id, 'id', true);
    if (ids.has(id)) throw new Error(`重复 ID: ${id}`);
    ids.add(id);
  };
  for (const group of config.groups) {
    assertObject(group, 'group');
    unique(group.id);
    string(group.name, 'group.name', true);
    boolean(group.enabled, 'group.enabled');
    if (group.legacy !== undefined) {
      assertObject(group.legacy, 'group.legacy');
      string(group.legacy.id, 'group.legacy.id', true);
      if (!Array.isArray(group.legacy.fields) || !group.legacy.fields.every((field) => ['proxy', 'cors'].includes(field))) throw new Error('group.legacy.fields: 无效字段');
    }
    for (const key of ['createdAt', 'updatedAt']) {
      if (!Number.isFinite(group[key]) || group[key] < 0) throw new Error(`group.${key}: 无效时间`);
    }
    if (!Array.isArray(group.rules)) throw new Error('group.rules: 必须是数组');
    for (const rule of group.rules) {
      validateRule(rule, { forApply: options.forApply && config.enabled && group.enabled });
      unique(rule.id);
    }
  }
  return config;
}
