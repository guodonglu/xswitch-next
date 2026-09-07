import { afterEach, describe, expect, it, vi } from 'vitest';
import { serviceHarness } from './helpers/service-harness';
import { handleMcp } from '../src/services/mcp-api.js';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
async function createBridge() {
  const h = serviceHarness(); await h.service.initialize();
  let listener: any;
  const posted: any[] = [];
  const port = { onMessage: { addListener: (fn: any) => { listener = fn; } },
    onDisconnect: { addListener: vi.fn() }, disconnect: vi.fn(), postMessage: (m: any) => posted.push(m) };
  vi.stubGlobal('chrome', { permissions: { contains: async () => true },
    runtime: { connectNative: () => port, getManifest: () => ({ version: 'test' }) } });
  const bridge = await import('../src/mcp-bridge');
  bridge.configureMcpBridge((method, params) => handleMcp(h.service, method, params));
  bridge.setMcpBridgeEnabled(true);
  await vi.waitFor(() => expect(listener).toBeTypeOf('function'));
  async function send(method: string, params = {}) {
    const id = crypto.randomUUID(); listener({ type: 'request', id, method, params });
    await vi.waitFor(() => expect(posted.some((m) => m.id === id)).toBe(true));
    return posted.find((m) => m.id === id);
  }
  return { ...h, send, bridge };
}
describe('MCP bridge through shared service', () => {
  it('backs up agent changes and preserves unmodified rules and stable IDs', async () => {
    const h = await createBridge();
    const added = await h.send('upsert_rule_group', { name: 'AI', active: true, proxy: [['https://a.com/(.*)', 'http://localhost/$1']], cors: ['api.com'] });
    expect(added.result).toMatchObject({ applied: true, backup_id: expect.any(String) });
    const group = added.result.group;
    const updated = await h.send('upsert_rule_group', { group_id: group.id, proxy: [['https://a.com/(.*)', 'http://localhost:3000/$1']] });
    expect(updated.result.group.rules[0].id).toBe(group.rules[0].id);
    expect(updated.result.group.rules[1]).toEqual(group.rules[1]);
    expect(h.document().history[0].source).toBe('agent');
  });
  it('returns an error and rolls back when Chrome rejects application', async () => {
    const h = await createBridge(); const before = h.document();
    h.dnr.updateDynamicRules.mockRejectedValueOnce(new Error('Chrome apply failed'));
    const response = await h.send('upsert_rule_group', { name: 'Broken', active: true, proxy: [['a', 'b']] });
    expect(response.error).toContain('已自动回滚'); expect(h.document()).toEqual(before);
  });
  it('restores latest agent backup and backs up the restore', async () => {
    const h = await createBridge(); const added = await h.send('upsert_rule_group', { name: 'Undo', proxy: [] });
    const result = await h.send('restore_backup');
    expect(result.result.restored_backup_id).toBe(added.result.backup_id);
    expect(h.document().config.groups).toHaveLength(1);
    expect(h.document().backups).toHaveLength(2);
  });
  it('preserves old reads and global option tools', async () => {
    const h = await createBridge();
    await h.send('set_extension_enabled', { enabled: false });
    await h.send('set_options', { clear_cache_enabled: false });
    const state = await h.send('get_state');
    expect(state.result).toMatchObject({ extension_enabled: false, options: { clear_cache_enabled: false } });
    expect((await h.send('list_backups')).result.backups).toHaveLength(2);
  });
  it('does not claim a native port proves an end-to-end connection', async () => {
    const h = await createBridge(); expect(h.bridge.getMcpStatus().connected).toBe(false);
    await h.send('get_state'); expect(h.bridge.getMcpStatus().connected).toBe(true);
  });
});
