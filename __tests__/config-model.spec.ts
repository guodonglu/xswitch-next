import { describe, expect, it } from 'vitest';
import { createConfig, createRule } from '../src/core/config-model.js';
import { validateConfig, validateRegex, rulePattern } from '../src/core/config-validator.js';
import {
  importLegacyConfig, exportLegacyConfig, internalRuleToLegacy,
  legacyGroupToInternal, internalGroupToLegacy,
} from '../src/core/legacy-xswitch-adapter.js';

describe('internal configuration', () => {
  it('creates independent groups and globally unique stable IDs', () => {
    const a = createConfig();
    const b = createConfig();
    expect(a.groups[0].id).not.toBe(b.groups[0].id);
    a.groups[0].rules.push(createRule('redirect', { source: 'a', destination: 'b' }));
    expect(b.groups[0].rules).toEqual([]);
    expect(validateConfig(a)).toBe(a);
    expect(a.groups[0].rules[0].id).toMatch(/^rule_[0-9a-f-]{36}$/);
  });

  it('rejects duplicated IDs across groups and rules', () => {
    const config = createConfig();
    const rule = createRule('cors', { source: 'api.example.com' });
    rule.id = config.groups[0].id;
    config.groups[0].rules.push(rule);
    expect(() => validateConfig(config)).toThrow('重复 ID');
  });

  it.each([2, null, '1'])('rejects unsupported version %s', (version) => {
    expect(() => validateConfig({ ...createConfig(), version })).toThrow('版本');
  });

  it('supports literal metacharacters and regex as explicit independent modes', () => {
    const rule = createRule('redirect', { source: 'https://a.com/[x]?v=1', destination: '' });
    expect(new RegExp(rulePattern(rule)).test(rule.match.value)).toBe(true);
    expect(rule.options.cors).toBe(false);
    expect(rulePattern(rule)).toContain('\\[');
  });

  it.each(['(', '(?<=a)b', 'a(?=b)', '(a)\\1'])('rejects invalid or unsupported regex %s', (source) => {
    expect(() => validateRegex(source)).toThrow();
  });

  it('retains invalid legacy patterns for recovery but blocks activation with the rule name', () => {
    const config = importLegacyConfig({ proxy: [['(', 'x']] });
    expect(() => validateConfig(config)).not.toThrow();
    expect(() => validateConfig(config, { forApply: true })).toThrow('规则「(」');
    config.groups[0].enabled = false;
    expect(() => validateConfig(config, { forApply: true })).not.toThrow();
  });

  it('does not require an absolute replacement URL because legacy supports substring replacement', () => {
    const config = importLegacyConfig({ proxy: [['.min', ''], ['alinw', 'g']] });
    expect(() => validateConfig(config, { forApply: true })).not.toThrow();
  });
});

describe('legacy adapter', () => {
  it.each([
    { '0': { proxy: [['https://a.com/(.*)', 'http://127.0.0.1/$1']], cors: ['api.example.com'] } },
    { '0': { proxy: [['(.*)/??(.*)', '$1/??$2'], ['.min', ''], ['alinw', 'g']] }, '12': { cors: ['(.*).b.com'] } },
    { '0': { proxy: [], cors: [] }, '3': {} },
    { '0': { proxy: [['', ''], ['https://a.com', 'data:text/javascript,alert(1)']] } },
  ])('preserves source, target, captures, ordering, groups and independent CORS: %j', (legacy) => {
    expect(exportLegacyConfig(importLegacyConfig(legacy))).toEqual(legacy);
  });

  it('keeps the original regex heuristic, including literal dots, plus and question mark', () => {
    const config = importLegacyConfig({ proxy: [['a.com+x?', 'b'], ['a(.*)', '$1']] });
    expect(config.groups[0].rules.map((rule) => rule.match.mode)).toEqual(['contains', 'regex']);
  });

  it('converts legacy combo syntax for application without changing stored source', () => {
    const config = importLegacyConfig({ proxy: [['(.*)/??(.*)', '$1/??$2']] });
    expect(rulePattern(config.groups[0].rules[0])).toBe('(.*)/\\?\\?(.*)');
    expect(config.groups[0].rules[0].match.value).toBe('(.*)/??(.*)');
  });

  it('reads actual upstream JSONC envelopes preserving item order, names and activation', () => {
    const config = importLegacyConfig({
      type: 'xswitch-rules', version: 1,
      items: [{ id: '9', name: '中文组', active: false }, { id: '0', name: 'Default', active: true }],
      rules: { '9': '{ /* hello */ "proxy": [["a", "b"],],}', '0': '{"cors":["api.com"]}' },
    });
    expect(config.groups.map((group) => group.name)).toEqual(['中文组', 'Default']);
    expect(config.groups[0].enabled).toBe(false);
    const exported = exportLegacyConfig(config, { envelope: true });
    expect(exported.items.map((item) => item.id)).toEqual(['9', '0']);
    expect(exported.items[0].active).toBe(false);
    expect(importLegacyConfig(exported).groups[0].rules[0].destination.value).toBe('b');
  });

  it('does not mutate its input', () => {
    const legacy = { '0': { proxy: [['a', 'b']], cors: [] } };
    const before = structuredClone(legacy);
    const config = importLegacyConfig(legacy);
    config.groups[0].rules[0].destination.value = 'changed';
    exportLegacyConfig(config);
    expect(legacy).toEqual(before);
  });

  it('does not re-enable disabled groups/rules in a bare map', () => {
    const config = importLegacyConfig({ '0': { proxy: [['a', 'b'], ['c', 'd']] }, '1': { cors: ['api.com'] } });
    config.groups[0].rules[0].enabled = false;
    config.groups[1].enabled = false;
    expect(exportLegacyConfig(config)).toEqual({ '0': { proxy: [['c', 'd']] } });
  });

  it.each([
    null, [], { '0': { proxy: 'wrong' } }, { cors: [null] },
    { proxy: [['a']] }, { proxy: [['a', 1]] }, { '0': { unexpected: [] } },
    '{"proxy": [}', { type: 'xswitch-rules', version: 2, items: [], rules: {} },
  ])('rejects malformed data instead of silently discarding entries: %j', (value) => {
    expect(() => importLegacyConfig(value)).toThrow();
  });

  it('supports direct group conversion', () => {
    const group = legacyGroupToInternal({ cors: ['api.com'] }, { id: 'team', name: 'Team', active: true });
    expect(group.legacy.id).toBe('team');
    expect(internalGroupToLegacy(group)).toEqual({ cors: ['api.com'] });
  });

  it('escapes explicit literals when upstream would infer a regex', () => {
    const rule = createRule('redirect', { source: 'a[1].js', destination: 'b' });
    expect(internalRuleToLegacy(rule)).toEqual(['^.*a\\[1\\]\\.js.*$', 'b']);
  });

  it('forces explicit regex export without adding a capturing group', () => {
    const rule = createRule('redirect', { source: 'a|b', destination: 'x', matchMode: 'regex' });
    expect(internalRuleToLegacy(rule)[0]).toBe('(?:a|b)');
  });

  it('preserves otherwise dangerous object keys as data', () => {
    const config = importLegacyConfig(JSON.parse('{"__proto__":{"proxy":[["a","b"]]}}'));
    expect(Object.hasOwn(exportLegacyConfig(config), '__proto__')).toBe(true);
    expect({}.polluted).toBeUndefined();
  });

  it('rejects exports whose explicit regex semantics upstream cannot preserve', () => {
    const redirect = createRule('redirect', { source: 'a??', destination: 'b', matchMode: 'regex' });
    const cors = createRule('cors', { source: 'api.*', matchMode: 'regex' });
    expect(() => internalRuleToLegacy(redirect)).toThrow('Next');
    expect(() => internalRuleToLegacy(cors)).toThrow('Next');
  });
});
