import { describe, expect, it } from 'vitest';
import { createConfig, createRule } from '../src/core/config-model.js';
import { importLegacyConfig, exportLegacyConfig } from '../src/core/legacy-xswitch-adapter.js';
import { validateConfig, validateRegex, rulePattern } from '../src/core/config-validator.js';
import { simulateUrl } from '../src/core/dnr-adapter.js';
import { serviceHarness } from './helpers/service-harness';

describe('legacy activation and export regressions', () => {
  it('exports an empty default group so upstream does not inject its example rule', () => {
    const config = createConfig(); const exported = exportLegacyConfig(config, { envelope: true });
    expect(exported.items[0].id).toBe('0'); expect(JSON.parse(exported.rules['0']).proxy).toEqual([]);
  });
  it('does not activate disabled default group or disabled CORS in upstream', () => {
    const config = importLegacyConfig({ '0': { proxy: [['a', 'b']], cors: ['api.com'] } });
    config.groups[0].enabled = false;
    expect(JSON.parse(exportLegacyConfig(config, { envelope: true }).rules['0'])).toEqual({ proxy: [], cors: [] });
    config.groups[0].enabled = true; config.options.corsEnabled = false;
    expect(JSON.parse(exportLegacyConfig(config, { envelope: true }).rules['0']).cors).toEqual([]);
  });
  it('exports new contains rules as full-URL replacement without retaining source query suffixes', () => {
    const config = createConfig(); config.groups[0].rules.push(createRule('redirect', { source: 'a.com/app.js', destination: 'http://localhost/app.js' }));
    const restored = importLegacyConfig(exportLegacyConfig(config));
    expect(simulateUrl(restored, 'https://a.com/app.js?v=2').finalUrl).toBe('http://localhost/app.js');
  });
  it('allows literal backslashes followed by digits', () => {
    const rule = createRule('redirect', { source: 'file\\1.js', destination: 'http://localhost/a.js' });
    expect(() => validateRegex(rulePattern(rule))).not.toThrow();
  });
  it('exports attached CORS without broadening it to unrelated target paths', () => {
    const config = createConfig();
    config.groups[0].rules.push(createRule('redirect', { source: 'example.com/app.js', destination: 'http://localhost:3000/app.js', enableCors: true }));
    const restored = importLegacyConfig(exportLegacyConfig(config));
    expect(simulateUrl(restored, 'http://localhost:3000/app.js').matches.some((m) => m.type === 'modifyHeaders')).toBe(true);
    expect(simulateUrl(restored, 'http://localhost:3000/private').matches.some((m) => m.type === 'modifyHeaders')).toBe(false);
  });
  it('rejects untrusted legacy metadata fields before export', () => {
    const config = createConfig(); config.groups[0].legacy = { id: '0', fields: ['__proto__'] };
    expect(() => validateConfig(config)).toThrow('无效字段');
  });
  it('checks Chrome RE2 even when saving into a disabled group', async () => {
    const h = serviceHarness(); const state = await h.service.state(); const groupId = state.groups[0].id;
    await h.service.execute('GROUP_UPDATE', { groupId, enabled: false });
    h.dnr.isRegexSupported.mockResolvedValue({ isSupported: false });
    await expect(h.service.execute('RULE_CREATE', { groupId, type: 'cors', source: 'api.com' })).rejects.toThrow('RE2');
    expect(h.document().config.groups[0].rules).toEqual([]);
  });
});
