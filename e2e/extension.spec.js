import { test, expect, chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

let context; let page; let extensionId; let profile;
test.beforeAll(async () => {
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'xswitch-next-e2e-'));
  const extension = path.resolve('dist');
  const cached = process.env.XSWITCH_TEST_CHROME ?? path.resolve('.xdev/browsers/chromium-1243/chrome-win64/chrome.exe');
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    ...(fs.existsSync(cached) ? { executablePath: cached } : {}),
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker');
  extensionId = new URL(worker.url()).host;
  page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/pages/sidepanel/index.html`);
});
test.afterAll(async () => { await context?.close(); /* Keep the isolated profile for diagnosing failed browser runs. */ });

test('opens the extension page with a working shared service and side-panel action behavior', async () => {
  await expect(page.getByRole('heading', { name: 'XSwitch Next' })).toBeVisible();
  const result = await page.evaluate(async () => ({
    manifest: chrome.runtime.getManifest(),
    behavior: await chrome.sidePanel.getPanelBehavior(),
    state: await chrome.runtime.sendMessage({ type: 'STATE_GET' }),
  }));
  expect(result.manifest.action.default_popup).toBeUndefined();
  expect(result.behavior.openPanelOnActionClick).toBe(true);
  expect(result.state.success).toBe(true);
  expect(result.state.data.applyError).toBeNull();
});

test('creates a rule through the form, tests it, redirects real traffic, and undoes deletion', async () => {
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/plain'); res.end(req.url === '/target.js' ? 'redirect-target' : 'source-content'); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await page.getByRole('button', { name: '+ 请求转发', exact: true }).click();
    await page.getByLabel('规则名称', { exact: true }).fill('本地 JS 验收');
    await page.getByLabel('匹配地址', { exact: true }).fill(`${base}/source.js`);
    await page.getByLabel('转发到', { exact: true }).fill(`${base}/target.js`);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    const card = page.getByRole('article').filter({ hasText: '本地 JS 验收' });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: '测试', exact: true }).click();
    await page.getByLabel('测试 URL', { exact: true }).fill(`${base}/source.js`);
    await page.getByRole('button', { name: '运行测试' }).click();
    await expect(page.getByText('✓ 匹配成功', { exact: true })).toBeVisible();
    const traffic = await context.newPage();
    await traffic.goto(`${base}/source.js`);
    await expect(traffic.locator('body')).toHaveText('redirect-target'); await traffic.close();
    await card.getByLabel('本地 JS 验收 更多操作').click();
    await card.getByRole('button', { name: '删除', exact: true }).click();
    await expect(card).toHaveCount(0);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await expect(card).toBeVisible();
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});

test('previews imports before committing and supports all narrow layouts and dark mode', async () => {
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '导入导出', exact: true }).click();
  await page.getByLabel('选择配置文件').setInputFiles({ name: 'legacy.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ '0': { cors: ['api.example.com'] } })) });
  await expect(page.getByLabel('导入预览')).toBeVisible();
  await expect(page.getByText('1 个规则组 · 0 条转发规则 · 1 条跨域规则')).toBeVisible();
  await page.getByRole('button', { name: '合并', exact: true }).click();
  await expect(page.getByLabel('导入预览')).toHaveCount(0);
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '设置', exact: true }).click();
  await page.getByLabel('主题', { exact: true }).selectOption('dark');
  await expect(page.locator('html')).toHaveClass('dark');
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '规则', exact: true }).click();
  for (const width of [320, 360, 400, 480, 600]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/sidepanel-dark-${width}.png`, fullPage: true });
  }
});

async function api(type, payload = {}) {
  const result = await page.evaluate(({ type, payload }) => chrome.runtime.sendMessage({ type, payload }), { type, payload });
  if (!result.success) throw new Error(result.error); return result.data;
}

test('persists configuration across worker restart and keeps the Agent disconnected without a host', async () => {
  const before = await api('STATE_GET');
  const session = await context.newCDPSession(page);
  await session.send('ServiceWorker.enable');
  await session.send('ServiceWorker.stopAllWorkers');
  await session.detach();
  const after = await api('STATE_GET');
  expect(after.config).toEqual(before.config); expect(after.applyError).toBeNull();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: 'Agent', exact: true }).click();
  await expect(page.getByText('○ MCP 未连接', { exact: true })).toBeVisible();
});

test('applies regex captures and independent CORS to real browser requests', async () => {
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/plain'); res.end(req.url); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let traffic;
  try {
    const state = await api('STATE_GET'); const groupId = state.groups[0].id;
    const created = await api('RULE_CREATE', { groupId, type: 'redirect', name: 'Regex Capture',
      source: `^${base.replaceAll('.', '\\.')}/old/(.*)$`, matchMode: 'regex', destination: `${base}/new/$1` });
    traffic = await context.newPage(); await traffic.goto(`${base}/old/demo.js`);
    await expect(traffic.locator('body')).toHaveText('/new/demo.js');
    await api('RULE_CREATE', { groupId, type: 'cors', source: 'localhost', name: 'Local CORS' });
    await traffic.goto(`${base}/origin`);
    const cross = await traffic.evaluate(async (url) => ({ text: await (await fetch(url)).text() }), `http://localhost:${server.address().port}/cross`);
    expect(cross.text).toBe('/cross');
    await api('RULE_UPDATE', { ruleId: created.rule.id, enabled: false });
    await traffic.goto(`${base}/old/demo.js`); await expect(traffic.locator('body')).toHaveText('/old/demo.js');
  } finally { await traffic?.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});

test('handles 500 rules, long URLs, light mode, invalid import and form validation', async () => {
  const config = (await api('STATE_GET')).config;
  config.groups = [{ id: 'group_bulk', name: '大量规则 · 中文', enabled: true, createdAt: 0, updatedAt: 0,
    rules: Array.from({ length: 500 }, (_, i) => ({ id: `rule_bulk_${i}`, type: 'redirect', name: `本地资源 ${i}`, enabled: true,
      match: { mode: 'contains', value: `https://example.com/${i}/${'long-path-'.repeat(12)}.js` },
      destination: { value: `http://127.0.0.1:3000/${i}.js` }, options: { cors: false }, createdAt: 0, updatedAt: 0 })) }];
  const input = { format: 'xswitch-next', version: 1, config };
  await api('CONFIG_IMPORT', { input, mode: 'overwrite' });
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(500);
  await page.getByLabel('搜索规则', { exact: true }).fill('/499/');
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '设置', exact: true }).click();
  await page.getByLabel('主题', { exact: true }).selectOption('light');
  await expect(page.locator('html')).not.toHaveClass('dark');
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '规则', exact: true }).click();
  for (const width of [320, 400, 600]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/sidepanel-light-${width}.png`, fullPage: true });
  }
  await page.getByRole('article').getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('匹配方式', { exact: true }).selectOption('regex');
  await page.getByLabel('匹配地址', { exact: true }).fill('(?<=foo)bar');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('RE2');
  expect((await api('STATE_GET')).config.groups[0].rules).toHaveLength(500);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '导入导出', exact: true }).click();
  await page.getByLabel('选择配置文件').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(page.locator('#toasts')).toContainText('JSONC');
});
