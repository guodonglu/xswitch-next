import { describe, expect, it } from 'vitest';
import { createConfig, createRule } from '../src/core/config-model.js';
import { parseImport, detectImportFormat, previewImport, mergeImport, exportConfig } from '../src/core/import-format.js';
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
});
