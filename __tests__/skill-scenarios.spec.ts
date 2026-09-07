import { describe, expect, it } from 'vitest';
import { serviceHarness } from './helpers/service-harness';
import { handleMcp } from '../src/services/mcp-api.js';

// Executable tool traces for the seven plan scenarios. These verify the workflow's
// observable effects, not a claim that every third-party agent follows the skill.
describe('Agent Skill scenarios', () => {
  it('handles redirect, disable, CORS, local-group enable, undo, list and legacy export with minimal changes', async () => {
    const h = serviceHarness(); const trace: string[] = [];
    const call = async (method: string, params = {}) => { trace.push(method); return handleMcp(h.service, method, params); };
    const read = () => call('get_state');
    // 1: 把 https://a.com/test.js 代理到 http://localhost:3000/test.js
    let state = await read(); const groupId = state.groups[0].id;
    const created = await call('v2_create_redirect_rule', { groupId, source: 'https://a.com/test.js', destination: 'http://localhost:3000/test.js', expectedRevision: state.revision });
    expect((await call('v2_test_rule', { ruleId: created.rule.id, url: 'https://a.com/test.js' })).finalUrl).toBe('http://localhost:3000/test.js');
    expect(created.rule.options.cors).toBe(false);
    // 2: 把刚才规则关掉
    state = await read();
    await call('v2_set_rule_enabled', { ruleId: created.rule.id, enabled: false, expectedRevision: state.revision });
    expect((await call('v2_test_url', { url: 'https://a.com/test.js' })).matched).toBe(false);
    // 3: 给 api.example.com 开跨域
    state = await read();
    const cors = await call('v2_create_cors_rule', { groupId, source: 'api.example.com', expectedRevision: state.revision });
    expect((await call('v2_test_rule', { ruleId: cors.rule.id, url: 'https://api.example.com/data' })).matched).toBe(true);
    // 4: 把所有本地开发规则打开
    state = await read();
    const enabled = await call('v2_set_rule_enabled', { ruleId: created.rule.id, enabled: true, expectedRevision: state.revision });
    expect((await call('v2_test_url', { url: 'https://a.com/test.js' })).matched).toBe(true);
    // 5: 撤销刚才 AI 对 XSwitch 的修改
    await read(); await call('restore_backup', { backup_id: enabled.backupId });
    expect((await read()).groups[0].rules.find((r) => r.id === created.rule.id).enabled).toBe(false);
    expect((await read()).groups[0].rules.find((r) => r.id === cors.rule.id)).toBeTruthy();
    // 6: 查看现在有哪些转发 — read only
    const revision = h.document().revision;
    await read(); expect((await call('v2_list_rules')).rules.filter((r) => r.type === 'redirect')).toHaveLength(1);
    // 7: 把当前 XSwitch 配置导成原版格式 — read only
    await read(); const exported = await call('v2_export_configuration', { legacy: true, envelope: true });
    expect(exported.type).toBe('xswitch-rules'); expect(h.document().revision).toBe(revision);
    expect(trace[0]).toBe('get_state');
    expect(h.document().config.groups).toHaveLength(1);
    expect(h.document().config.groups[0].rules.map((r) => r.id)).toEqual([created.rule.id, cors.rule.id]);
  });
});
