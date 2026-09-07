import { describe, expect, it } from 'vitest';
import { serviceHarness } from './helpers/service-harness';
import { handleMcp } from '../src/services/mcp-api.js';
import { V2_TOOLS } from '../mcp/tools-v2.js';
import { createConfig, createRule } from '../src/core/config-model.js';
import { exportConfig } from '../src/core/import-format.js';

const mutations = V2_TOOLS.filter((tool) => !tool[3]).map((tool) => tool[0]);
async function scenario() {
  const h = serviceHarness(); const state = await h.service.state(); const groupId = state.groups[0].id;
  const redirect = await h.service.execute('RULE_CREATE', { groupId, type: 'redirect', source: 'a.com/app.js', destination: 'http://localhost/app.js' });
  const cors = await h.service.execute('RULE_CREATE', { groupId, type: 'cors', source: 'api.com' });
  const sample = createConfig(); sample.groups[0].rules.push(createRule('cors', { source: 'imported.com' }));
  const params = {
    create_redirect_rule: { groupId, source: 'b.com', destination: 'http://localhost/b' },
    update_redirect_rule: { ruleId: redirect.rule.id, destination: 'http://localhost:5000/app.js' },
    create_cors_rule: { groupId, source: 'another.com' }, update_cors_rule: { ruleId: cors.rule.id, source: 'other.com' },
    delete_rule: { ruleId: cors.rule.id }, set_rule_enabled: { ruleId: cors.rule.id, enabled: false },
    set_group_enabled: { groupId, enabled: false }, create_rule_group: { name: 'AI Group' },
    update_rule_group: { groupId, name: 'Renamed' }, delete_rule_group: { groupId },
    import_configuration: { input: JSON.stringify(exportConfig(sample)), mode: 'merge', expectedRevision: 2 },
  };
  return { ...h, params, groupId, redirect, cors };
}
describe('MCP V2 mutation contract', () => {
  it.each(mutations)('%s records an agent backup, verifies DNR and returns operation info', async (name) => {
    const h = await scenario(); const before = h.document().config;
    const result = await handleMcp(h.service, `v2_${name}`, h.params[name]);
    expect(result).toMatchObject({ success: true, applied: true, backupId: expect.any(String), operationId: expect.any(String) });
    expect(h.document().backups[0].config).toEqual(before);
    expect(h.document().history[0]).toMatchObject({ source: 'agent', backupId: result.backupId });
    expect(h.dnr.getDynamicRules).toHaveBeenCalled();
  });
  it.each(mutations)('%s rolls back if DNR application fails', async (name) => {
    const h = await scenario(); const before = h.document(); const rules = h.rules();
    h.dnr.updateDynamicRules.mockRejectedValueOnce(new Error('failure injection'));
    await expect(handleMcp(h.service, `v2_${name}`, h.params[name])).rejects.toThrow('已自动回滚');
    expect(h.document()).toEqual(before); expect(h.rules()).toEqual(rules);
  });
  it('reads, tests, exports and previews without creating history', async () => {
    const h = await scenario();
    expect((await handleMcp(h.service, 'v2_list_rule_groups')).groups).toHaveLength(1);
    expect((await handleMcp(h.service, 'v2_get_rule_group', { groupId: h.groupId })).group.id).toBe(h.groupId);
    expect((await handleMcp(h.service, 'v2_list_rules', { groupId: h.groupId })).rules).toHaveLength(2);
    expect((await handleMcp(h.service, 'v2_get_rule', { ruleId: h.redirect.rule.id })).rule.id).toBe(h.redirect.rule.id);
    expect((await handleMcp(h.service, 'v2_test_url', { url: 'https://a.com/app.js' })).finalUrl).toBe('http://localhost/app.js');
    expect((await handleMcp(h.service, 'v2_test_rule', { ruleId: h.redirect.rule.id, url: 'https://a.com/app.js' })).matched).toBe(true);
    const exported = await handleMcp(h.service, 'v2_export_configuration');
    expect((await handleMcp(h.service, 'v2_preview_configuration_import', { input: JSON.stringify(exported) })).summary.conflicts).toBe(2);
    expect(h.document().history).toHaveLength(2);
  });
});
