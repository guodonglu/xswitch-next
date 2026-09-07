import { generateProxyRules, generateCorsRules } from '../declarative-net-request';
import { rulePattern, escapeRegex, validateConfig } from './config-validator.js';

// Reuse upstream actions/resource types; explicit matching and identity belong here.
export function compileConfig(config) {
  validateConfig(config, { forApply: true });
  if (!config.enabled) return [];
  const entries = [];
  const total = config.groups.reduce((count, group) => count + group.rules.length, 0);
  let order = 0;
  for (const group of config.groups) {
    for (const rule of group.rules) {
      const priority = total - order++ + 1;
      if (!group.enabled || !rule.enabled) continue;
      const add = (dnr) => entries.push({ ruleId: rule.id, ruleName: rule.name, groupId: group.id,
        dnr: { ...dnr, id: entries.length + 1, priority } });
      if (rule.type === 'redirect') {
        // Dummy literal avoids upstream's heuristic skipping a valid explicit literal.
        const dnr = generateProxyRules({ proxy: [['placeholder', rule.destination.value]] })[0];
        dnr.condition.regexFilter = rulePattern(rule);
        // Form-created literal rules point at a complete URL; legacy pairs retain replacement semantics.
        if (!rule.legacy?.comboSyntax && rule.match.mode === 'contains') {
          let destination;
          try { destination = new URL(rule.destination.value); } catch {
            throw new Error(`规则「${rule.name}」: 目标必须是完整的 http(s) URL`);
          }
          if (!['http:', 'https:'].includes(destination.protocol)) throw new Error(`规则「${rule.name}」: 目标必须是 http(s) URL`);
          dnr.action.redirect = { url: destination.href };
          // DNR regexes have a tight compiled-memory limit. Plain URL filters can
          // represent ordinary contains strings exactly without that cost.
          if (!/[*|^]/.test(rule.match.value) && /^[\x20-\x7e]+$/.test(rule.match.value)) {
            delete dnr.condition.regexFilter; dnr.condition.urlFilter = rule.match.value;
          }
        }
        add(dnr);
        if (config.options.corsEnabled && rule.options.cors) {
          const target = rule.destination.value;
          // Match the target template, including capture substitutions, without broadening to an entire domain.
          const targetPattern = target.split(/\$[1-9]/).map(escapeRegex).join('.*');
          const cors = generateCorsRules({ cors: ['placeholder'] })[0];
          cors.condition = { regexFilter: `^(?:${targetPattern})$`, resourceTypes: cors.condition.resourceTypes };
          add(cors);
        }
      } else if (config.options.corsEnabled) {
        const dnr = generateCorsRules({ cors: [rule.match.value] })[0];
        if (!rule.legacy?.domainFilter) {
          dnr.condition = { regexFilter: rulePattern(rule), resourceTypes: dnr.condition.resourceTypes };
        }
        add(dnr);
      }
    }
  }
  return entries;
}

export async function validateDnr(entries, api) {
  for (const { dnr, ruleName } of entries) {
    if (!dnr.condition.regexFilter) continue;
    const result = await api.isRegexSupported({ regex: dnr.condition.regexFilter,
      isCaseSensitive: false, requireCapturing: /\\[1-9]/.test(dnr.action.redirect?.regexSubstitution ?? '') });
    if (!result.isSupported) throw new Error(`规则「${ruleName}」: Chrome RE2 不支持此表达式 (${result.reason ?? '未知原因'})`);
  }
}

export const stableJson = (value) => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);

export function equivalentRules(actual, expected) {
  const normalize = (rules) => rules.map((rule) => ({ ...rule,
    condition: { ...rule.condition, isUrlFilterCaseSensitive: rule.condition.isUrlFilterCaseSensitive ?? false },
  })).sort((a, b) => a.id - b.id);
  return stableJson(normalize(actual)) === stableJson(normalize(expected));
}

export async function replaceDnr(api, rules) {
  const current = await api.getDynamicRules();
  await api.updateDynamicRules({ removeRuleIds: current.map((rule) => rule.id), addRules: rules });
  const installed = await api.getDynamicRules();
  if (!equivalentRules(installed, rules)) throw new Error('DNR 读取校验失败：已安装规则与请求不一致');
}

function conditionMatches(condition, url, resourceType) {
  if (condition.resourceTypes && !condition.resourceTypes.includes(resourceType)) return false;
  if (condition.regexFilter) return new RegExp(condition.regexFilter, 'i').test(url);
  // Upstream domain-anchor filters: wildcard and separator have DNR URL-filter semantics.
  let filter = condition.urlFilter;
  const domainAnchor = filter.startsWith('||');
  if (domainAnchor) filter = filter.slice(2);
  const endAnchor = filter.endsWith('|');
  if (endAnchor) filter = filter.slice(0, -1);
  const pattern = filter.split('*').map((part) => part.split('^').map(escapeRegex).join('(?:[^a-zA-Z0-9_.%-]|$)')).join('.*');
  return new RegExp(`${domainAnchor ? '^[a-z]+://(?:[^/]*\\.)?' : ''}${pattern}${endAnchor ? '$' : ''}`, 'i').test(url);
}

export function simulateUrl(config, url, { ruleId, resourceType = 'xmlhttprequest' } = {}) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('请输入完整 http(s) 测试 URL');
  const entries = compileConfig(config);
  const matches = entries.filter((entry) => (!ruleId || entry.ruleId === ruleId)
    && conditionMatches(entry.dnr.condition, url, resourceType)).map((entry) => {
      const redirect = entry.dnr.action.redirect;
      let after = url;
      if (redirect?.url) after = redirect.url;
      else if (redirect?.regexSubstitution !== undefined) {
        const regex = new RegExp(entry.dnr.condition.regexFilter, 'i');
        after = url.replace(regex, (...args) => redirect.regexSubstitution.replace(/\\(\\|[0-9])/g,
          (_whole, token) => token === '\\' ? '\\' : (args[Number(token)] ?? '')));
      }
      return { groupId: entry.groupId, ruleId: entry.ruleId, rule: entry.ruleName,
        type: entry.dnr.action.type, before: url, after, priority: entry.dnr.priority };
    });
  const winner = matches.find((match) => match.type === 'redirect');
  return { url, matches, matched: matches.length > 0, finalUrl: winner?.after ?? url,
    simulation: true, resourceType, note: '按当前启用状态模拟单次请求；列表靠前规则优先。后续重定向由浏览器重新匹配。' };
}
