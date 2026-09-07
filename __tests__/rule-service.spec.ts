import { describe, expect, it } from 'vitest';
import { serviceHarness } from './helpers/service-harness';
import { STATE_KEY, LEGACY_SNAPSHOT_KEY } from '../src/services/rule-service.js';
import { compileConfig, simulateUrl } from '../src/core/dnr-adapter.js';
import { importLegacyConfig } from '../src/core/legacy-xswitch-adapter.js';

async function initialized() {
  const h = serviceHarness(); const state = await h.service.state();
  return { ...h, groupId: state.groups[0].id };
}
describe('shared transactional service', () => {
  it('creates a backup, verifies DNR, records provenance and survives restart', async () => {
    const h = await initialized();
    const result = await h.service.execute('RULE_CREATE', { groupId: h.groupId, type: 'redirect', source: 'a.com/a.js', destination: 'http://localhost:3000/a.js' }, 'agent');
    expect(result).toMatchObject({ success: true, applied: true, backupId: expect.any(String) });
    expect(h.document().history[0].source).toBe('agent');
    expect(h.document().backups[0].config.groups[0].rules).toEqual([]);
    expect(h.rules()[0].action.redirect.url).toBe('http://localhost:3000/a.js');
    expect((await h.restart().state()).groups[0].rules[0].id).toBe(result.rule.id);
  });
  it('serializes concurrent agent and UI writes without losing a rule', async () => {
    const h = await initialized();
    await Promise.all(Array.from({ length: 8 }, (_, i) => h.service.execute('RULE_CREATE', {
      groupId: h.groupId, type: 'cors', source: `api${i}.com`,
    }, i % 2 ? 'agent' : 'user')));
    expect((await h.service.state()).groups[0].rules).toHaveLength(8);
    expect(h.document().revision).toBe(8);
  });
  it('rejects stale revisions rather than overwriting newer changes', async () => {
    const h = await initialized(); await h.service.execute('CONFIG_ENABLED', { enabled: false });
    await expect(h.service.execute('CONFIG_ENABLED', { enabled: true, expectedRevision: 0 })).rejects.toThrow('更新');
    expect(h.document().config.enabled).toBe(false);
  });
  it('rejects unsupported RE2 with the concrete rule name before writing', async () => {
    const h = await initialized(); h.dnr.isRegexSupported.mockResolvedValue({ isSupported: false });
    await expect(h.service.execute('RULE_CREATE', { groupId: h.groupId, name: '无法应用', type: 'cors', source: 'api.com' })).rejects.toThrow('无法应用');
    expect(h.document().config.groups[0].rules).toEqual([]);
  });
  it('rolls back DNR update failures and continues serving writes', async () => {
    const h = await initialized(); const before = h.document();
    h.dnr.updateDynamicRules.mockRejectedValueOnce(new Error('quota'));
    await expect(h.service.execute('RULE_CREATE', { groupId: h.groupId, type: 'cors', source: 'a.com' })).rejects.toThrow('已自动回滚');
    expect(h.document()).toEqual(before); expect(h.rules()).toEqual([]);
    await h.service.execute('GROUP_CREATE', { name: 'Still works' });
  });
  it('rolls back a mismatched DNR readback', async () => {
    const h = await initialized();
    h.dnr.getDynamicRules.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 999, condition: {}, action: {} }]);
    await expect(h.service.execute('GROUP_CREATE', { name: 'Fail' })).rejects.toThrow('已自动回滚');
    expect(h.document().config.groups).toHaveLength(1);
  });
  it('rolls back a commit storage failure after successful DNR application', async () => {
    const h = await initialized(); const realSet = h.storage.set.getMockImplementation()!;
    h.storage.set.mockImplementationOnce(realSet).mockRejectedValueOnce(new Error('disk'));
    await expect(h.service.execute('RULE_CREATE', { groupId: h.groupId, type: 'cors', source: 'a.com' })).rejects.toThrow('已自动回滚');
    expect(h.rules()).toEqual([]); expect(h.document().config.groups[0].rules).toEqual([]);
  });
  it('recovers a durable pending transaction before accepting reads or writes', async () => {
    const h = await initialized(); const before = h.document().config;
    h.data[STATE_KEY].pending = { id: 'interrupted', config: before, dnr: [] };
    h.data[STATE_KEY].config.enabled = false;
    const recovered = await h.restart().state();
    expect(recovered.config).toEqual(before); expect(h.document().pending).toBeNull();
  });
  it('backs up restore itself, allowing redo', async () => {
    const h = await initialized(); const added = await h.service.execute('GROUP_CREATE', { name: 'Undo' }, 'agent');
    const undo = await h.service.execute('BACKUP_RESTORE', { backupId: added.backupId });
    expect((await h.service.state()).groups).toHaveLength(1);
    await h.service.execute('BACKUP_RESTORE', { backupId: undo.backupId });
    expect((await h.service.state()).groups).toHaveLength(2);
  });
  it('migrates local JSONC without discarding the original document', async () => {
    const raw = { config_for_shown: { '0': '{/* Keep */"proxy":[["a","b"]]}' }, tab_list: [{ id: '0', name: '旧规则', active: false }], disabled: 'disabled' };
    const h = serviceHarness(raw); const state = await h.service.state();
    expect(state.enabled).toBe(false); expect(state.groups[0].enabled).toBe(true);
    expect(h.data[LEGACY_SNAPSHOT_KEY]).toEqual(raw);
  });
  it('keeps malformed migration data and does not overwrite business state', async () => {
    const h = serviceHarness({ config_for_shown: '{ broken' });
    await expect(h.service.state()).rejects.toThrow('JSONC');
    expect(h.data[LEGACY_SNAPSHOT_KEY].config_for_shown).toBe('{ broken');
    expect(h.data[STATE_KEY]).toBeUndefined();
  });
  it('limits history to 50 and full snapshots to 10', async () => {
    const h = await initialized();
    for (let i = 0; i < 55; i++) await h.service.execute('CONFIG_ENABLED', { enabled: i % 2 === 0 });
    expect(h.document().history).toHaveLength(50); expect(h.document().backups).toHaveLength(10);
  });
});

describe('DNR adapter and simulation', () => {
  it('retains legacy capture substitution, combo syntax and partial replacement', () => {
    const config = importLegacyConfig({ proxy: [['https://a.com/(.*)', 'http://127.0.0.1/$1']] });
    expect(compileConfig(config)[0].dnr.action.redirect.regexSubstitution).toBe('http://127.0.0.1/\\1');
    expect(simulateUrl(config, 'https://a.com/foo.js').finalUrl).toBe('http://127.0.0.1/foo.js');
  });
  it('assigns unique IDs and explicit priority in group order', () => {
    const config = importLegacyConfig({ '0': { proxy: [['a', 'b']] }, '1': { proxy: [['a', 'c']], cors: ['api.com'] } });
    const entries = compileConfig(config);
    expect(new Set(entries.map((e) => e.dnr.id)).size).toBe(3);
    expect(entries[0].dnr.priority).toBeGreaterThan(entries[1].dnr.priority);
    expect(simulateUrl(config, 'https://a.com').finalUrl).toBe('https://b.com');
  });
  it('honors independent CORS domain matching, global switches and resource types', () => {
    const config = importLegacyConfig({ cors: ['api.com'] });
    expect(simulateUrl(config, 'https://sub.api.com/path').matched).toBe(true);
    expect(simulateUrl(config, 'https://evil.com/api.com').matched).toBe(false);
    expect(simulateUrl(config, 'https://api.com', { resourceType: 'script' }).matched).toBe(false);
    config.options.corsEnabled = false; expect(compileConfig(config)).toEqual([]);
  });
});
