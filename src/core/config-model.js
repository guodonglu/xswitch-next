/** Versioned business data. No Chrome or UI dependencies. */
export const CONFIG_VERSION = 1;
export const newId = (kind) => `${kind}_${crypto.randomUUID()}`;

export function createGroup(name = '默认规则') {
  const now = Date.now();
  return { id: newId('group'), name, enabled: true, createdAt: now, updatedAt: now, rules: [] };
}

export function createConfig() {
  return {
    version: CONFIG_VERSION,
    enabled: true,
    options: { clearCache: true, corsEnabled: true },
    groups: [createGroup()],
  };
}

export function createRule(type, input = {}) {
  const now = Date.now();
  const rule = {
    id: newId('rule'), type,
    name: input.name ?? (type === 'redirect' ? '请求转发' : '允许跨域'),
    enabled: input.enabled ?? true,
    match: { mode: input.matchMode ?? 'contains', value: input.source ?? '' },
    createdAt: now, updatedAt: now,
  };
  if (type === 'redirect') {
    rule.destination = { value: input.destination ?? '' };
    rule.options = { cors: input.enableCors ?? false };
  }
  return rule;
}
