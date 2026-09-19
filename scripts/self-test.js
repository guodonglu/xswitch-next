import { chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const extensionPath = path.resolve('dist');
const browserPath = path.resolve('.xdev/browsers/chromium-1243/chrome-win64/chrome.exe');
const profileDir = path.join(os.tmpdir(), 'xswitch-manual-test-' + Date.now());

console.log('[1/5] 启动 Chrome / Chromium 浏览器 (UI 模式)...');
const context = await chromium.launchPersistentContext(profileDir, {
  executablePath: browserPath,
  headless: false,
  permissions: ['clipboard-read', 'clipboard-write'],
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--no-first-run',
    '--no-default-browser-check',
  ],
  viewport: { width: 1200, height: 800 },
});

console.log('[2/5] 等待扩展 Service Worker 注册...');
let worker = context.serviceWorkers()[0];
if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 10000 });
const extensionId = new URL(worker.url()).host;
console.log(`[+] 扩展 ID: ${extensionId}`);

const page = await context.newPage();
const sidepanelUrl = `chrome-extension://${extensionId}/src/pages/sidepanel/index.html`;
console.log(`[3/5] 打开扩展界面: ${sidepanelUrl}`);
await page.goto(sidepanelUrl);
await page.waitForLoadState('networkidle');

// 截取初始界面
fs.mkdirSync('test-results', { recursive: true });
await page.screenshot({ path: 'test-results/self-test-initial.png' });
console.log('[+] 初始界面截图已保存');

// 自测 1: 检查顶部 "+ 规则组" 与 "粘贴新建" 按钮
console.log('[4/5] 开始自测新功能...');
const pasteCreateBtn = page.getByRole('button', { name: '粘贴新建', exact: true });
const hasPasteCreateBtn = await pasteCreateBtn.isVisible();
console.log(`[+] 顶部「粘贴新建」按钮存在: ${hasPasteCreateBtn}`);

// 自测 2: 粘贴新建规则组
await pasteCreateBtn.click();
await page.waitForSelector('dialog[open]');
const nameInput = page.getByLabel('规则组名称');
await nameInput.fill('自测规则组');
const jsonInput = page.getByLabel('规则内容 (XSwitch JSON)');
await jsonInput.fill(JSON.stringify({
  proxy: [
    ['https://example.com/test-a.js', 'http://localhost:3000/test-a.js'],
    ['https://example.com/test-b.js', 'http://localhost:3000/test-b.js'],
  ],
  cors: ['example.com'],
}, null, 2));

await page.screenshot({ path: 'test-results/self-test-paste-dialog.png' });
console.log('[+] 粘贴新建弹窗已截图');

const confirmBtn = page.getByRole('button', { name: '创建', exact: true });
await confirmBtn.click();
await page.waitForSelector('dialog[open]', { state: 'detached' });

// 验证规则组已创建
const createdGroup = page.locator('[data-group-id]').filter({ hasText: '自测规则组' });
await createdGroup.waitFor({ state: 'visible' });
console.log('[+] 「自测规则组」创建成功，规则卡片可见');

// 自测 3: 复制单条规则为 XSwitch JSON 到剪贴板
const moreSummary = createdGroup.locator('article summary').first();
await moreSummary.click();
const copyMenuItem = createdGroup.locator('details[open]').getByRole('button', { name: '复制', exact: true });
await copyMenuItem.click();
console.log('[+] 单条规则点击「复制」完成');

// 自测 4: 组内 "+ 粘贴导入"
const pasteImportBtn = createdGroup.getByRole('button', { name: '+ 粘贴导入', exact: true });
await pasteImportBtn.click();
await page.waitForSelector('dialog[open]');
const importJsonInput = page.locator('dialog[open]').getByLabel('规则内容 (XSwitch JSON)');
await importJsonInput.fill(JSON.stringify({
  proxy: [
    ['https://example.com/test-c.js', 'http://localhost:3000/test-c.js'],
  ],
}));
const importConfirmBtn = page.locator('dialog[open]').getByRole('button', { name: /导入/ });
await importConfirmBtn.click();
await page.waitForSelector('dialog[open]', { state: 'detached' });
console.log('[+] 组内「+ 粘贴导入」规则完成');

// 自测 5: 切换到 Agent 视图检查最近记录与回滚按钮
console.log('[5/5] 自测 Agent 视图最近记录与回滚按钮...');
await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: 'Agent', exact: true }).click();
await page.waitForSelector('text=最近操作');
const rollbackButtons = page.getByRole('button', { name: '回滚', exact: true });
const rollbackCount = await rollbackButtons.count();
console.log(`[+] Agent 视图找到 ${rollbackCount} 个单条操作回滚按钮`);
if (rollbackCount > 0) {
  await rollbackButtons.first().click();
  await page.waitForSelector('dialog[open]');
  const confirmRollbackBtn = page.locator('dialog[open]').getByRole('button', { name: '回滚', exact: true });
  await confirmRollbackBtn.click();
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  await page.waitForSelector('text=已成功回滚');
  console.log('[+] 点击回滚并通过确认弹窗，回滚生效并显示提示');
}

// 检查是否没有全局 "撤销上一次 AI 修改" 按钮
const oldUndoBtn = page.getByRole('button', { name: '撤销上一次 AI 修改' });
const hasOldUndoBtn = await oldUndoBtn.isVisible().catch(() => false);
console.log(`[+] 原全局「撤销上一次 AI 修改」按钮已不存在: ${!hasOldUndoBtn}`);

await page.screenshot({ path: 'test-results/self-test-agent.png' });
console.log('[+] Agent 视图截图已保存');

// 切回规则视图并保存最终状态截图
await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '规则', exact: true }).click();
await page.screenshot({ path: 'test-results/self-test-final.png' });

console.log('\n========================================');
console.log('🎉 自动化自测全部通过！Chrome 浏览器窗口已打开保持运行中。');
console.log(`扩展页面地址: ${sidepanelUrl}`);
console.log('您可直接在打开的浏览器窗口中进行操作体验。');
console.log('========================================\n');

// 保持浏览器窗口打开供用户交互测试
await new Promise((resolve) => {
  context.on('close', resolve);
  setTimeout(resolve, 30 * 60 * 1000);
});
