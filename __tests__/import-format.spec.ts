import { describe, expect, it } from 'vitest';
import { createConfig, createRule } from '../src/core/config-model.js';
import { parseImport, detectImportFormat, previewImport, mergeImport, exportConfig, normalizePastedInput, inspectPastedInput, normalizePastedGroup } from '../src/core/import-format.js';
import { ruleToLegacyJson, groupToLegacyJson } from '../src/core/legacy-xswitch-adapter.js';
import { serviceHarness } from './helpers/service-harness';
function sample() {
  const config = createConfig(); config.groups[0].rules.push(createRule('redirect', { source: 'a.com/app.js', destination: 'http://localhost/app.js' })); return config;
}
describe('import / export formats and conflicts', () => {
  it.each(['rule', 'group', 'all'])('round-trips %s without losing internal fields', (scope) => {
    const config = sample(); config.groups[0].rules[0].enabled = false;
    const payload = exportConfig(config, { scope, id: scope === 'rule' ? config.groups[0].rules[0].id : config.groups[0].id });
    expect(detectImportFormat(payload)).toContain('xswitch-next');
    expect(parseImport(payload).config.groups[0].rules[0]).toEqual(config.groups[0].rules[0]);
  });
  it('accepts original legacy map and actual upstream envelope', () => {
    const config = sample();
    expect(parseImport(exportConfig(config, { legacy: true })).config.groups.flatMap((g) => g.rules)).toHaveLength(1);
    expect(parseImport({ '0': { cors: ['api.com'] } }).format).toBe('xswitch-legacy');
  });
  it('reports counts and duplicates before any mutation', () => {
    const config = sample(); const before = structuredClone(config);
    const result = previewImport(exportConfig(config), config);
    expect(result.summary).toEqual({ groups: 1, redirects: 1, cors: 0, conflicts: 1 });
    expect(config).toEqual(before);
  });
  it.each(['keep', 'replace', 'both'])('implements explicit %s conflict policy', (conflict) => {
    const config = sample(); const incoming = structuredClone(config); incoming.groups[0].rules[0].destination.value = 'http://localhost:5000/app.js';
    const merged = mergeImport(config, incoming, { conflict }); const rules = merged.groups.flatMap((g) => g.rules);
    expect(rules).toHaveLength(conflict === 'both' ? 2 : 1);
    expect(rules[0].id).toBe(config.groups[0].rules[0].id);
    expect(rules[0].destination.value).toBe(conflict === 'replace' ? 'http://localhost:5000/app.js' : 'http://localhost/app.js');
    if (conflict === 'both') { expect(rules[1].id).not.toBe(rules[0].id); expect(rules[1].name).toContain('副本'); }
  });
  it('imports into the selected group and preserves existing order', () => {
    const current = sample(); const incoming = sample(); incoming.groups[0].rules[0].match.value = 'other.com';
    const merged = mergeImport(current, incoming, { groupId: current.groups[0].id });
    expect(merged.groups).toHaveLength(1); expect(merged.groups[0].rules.map((r) => r.match.value)).toEqual(['a.com/app.js', 'other.com']);
  });
  it.each([{ format: 'xswitch-next', version: 2 }, { format: 'unknown', version: 1 }, '{broken'])('rejects invalid imports', (input) => {
    expect(() => parseImport(input)).toThrow();
  });
  it('routes import through backup and verified DNR transaction with import provenance', async () => {
    const h = serviceHarness(); await h.service.state();
    const input = exportConfig(sample()); const preview = await h.service.execute('IMPORT_PREVIEW', { input });
    expect(h.document().history).toHaveLength(0);
    const result = await h.service.execute('CONFIG_IMPORT', { input, mode: 'overwrite', expectedRevision: preview.revision });
    expect(result.applied).toBe(true); expect(h.document().history[0].source).toBe('import'); expect(h.rules()).toHaveLength(1);
  });

  describe('clipboard copy and paste normalization', () => {
    it('copies a single redirect rule as original XSwitch JSON', () => {
      const rule = createRule('redirect', { source: 'example.com/app.js', destination: 'http://localhost/app.js' });
      const json = ruleToLegacyJson(rule);
      expect(json).toHaveProperty('proxy');
      expect(json.proxy).toEqual([['^.*example\\.com/app\\.js.*$', 'http://localhost/app.js']]);
    });

    it('copies a single CORS rule as original XSwitch JSON', () => {
      const rule = createRule('cors', { source: 'api.example.com' });
      const json = ruleToLegacyJson(rule);
      expect(json).toEqual({ cors: ['api.example.com'] });
    });

    it('copies a rule group as original XSwitch JSON', () => {
      const config = sample();
      config.groups[0].rules.push(createRule('cors', { source: 'cdn.com' }));
      const json = groupToLegacyJson(config.groups[0]);
      expect(json.proxy).toHaveLength(1);
      expect(json.cors).toEqual(['cdn.com']);
    });

    it('normalizes single rule array [source, destination]', () => {
      const raw = '["https://a.com/test.js", "http://localhost:3000/test.js"]';
      const normalized = normalizePastedInput(raw);
      expect(JSON.parse(normalized)).toEqual({
        proxy: [['https://a.com/test.js', 'http://localhost:3000/test.js']],
      });
      const inspection = inspectPastedInput(raw);
      expect(inspection.valid).toBe(true);
      expect(inspection.count).toBe(1);
      expect(inspection.redirects).toBe(1);
    });

    it('normalizes array of rule arrays [[a, b], [c, d]]', () => {
      const raw = '[["a", "b"], ["c", "d"]]';
      const normalized = normalizePastedInput(raw);
      expect(JSON.parse(normalized)).toEqual({ proxy: [['a', 'b'], ['c', 'd']] });
      const inspection = inspectPastedInput(raw);
      expect(inspection.valid).toBe(true);
      expect(inspection.count).toBe(2);
    });

    it('normalizes JSONC with comments and trailing commas', () => {
      const raw = `{\n  // 注释\n  "proxy": [\n    ["a", "b"],\n  ]\n}`;
      const inspection = inspectPastedInput(raw);
      expect(inspection.valid).toBe(true);
      expect(inspection.count).toBe(1);
    });

    it('packages rules into a new group with custom name', () => {
      const raw = '["https://a.com/1.js", "http://localhost/1.js"]';
      const groupPayload = JSON.parse(normalizePastedGroup(raw, '本地联调'));
      expect(groupPayload.format).toBe('xswitch-next-group');
      expect(groupPayload.group.name).toBe('本地联调');
      expect(groupPayload.group.rules).toHaveLength(1);
    });
  });
});

