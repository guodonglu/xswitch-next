import { ALL_URLS, MILLISECONDS_PER_WEEK, BLUE_ICON_PATH, GREY_ICON_PATH } from './constants';
import { ruleService } from './services/runtime-service.js';
import { handleMcp } from './services/mcp-api.js';
import { configureMcpBridge, getMcpStatus, setMcpBridgeEnabled, reconnectMcpBridge } from './mcp-bridge';
let runtimeConfig = { enabled: false, options: { clearCache: false } };
let clearRunning = false;
const notify = () => { chrome.runtime.sendMessage({ type: 'STATE_CHANGED' }).catch(() => {}); };
async function refresh() {
  try {
    const state = await ruleService.state(); runtimeConfig = state.config;
    setMcpBridgeEnabled(state.preferences.mcpEnabled);
    await chrome.action.setIcon({ path: state.enabled && !state.applyError ? BLUE_ICON_PATH : GREY_ICON_PATH });
    await chrome.action.setBadgeText({ text: state.applyError ? 'ERR' : state.enabled ? String(state.activeRuleCount) : 'OFF' });
    await chrome.action.setBadgeBackgroundColor({ color: state.applyError ? '#dc2626' : '#4f46e5' });
  } catch (error) { console.error('[XSwitch Next]', error); await chrome.action.setBadgeText({ text: 'ERR' }); }
}
configureMcpBridge(async (method, params) => {
  const result = await handleMcp(ruleService, method, params, getMcpStatus()); await refresh(); notify(); return result;
}, notify);
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('')) || !request?.type || request.type === 'STATE_CHANGED') return false;
  void (async () => {
    if (request.type === 'AGENT_RECONNECT') {
      const state = await ruleService.state(); if (!state.preferences.mcpEnabled) throw new Error('请先开启 MCP 连接');
      reconnectMcpBridge(); return getMcpStatus();
    }
    const result = await ruleService.execute(request.type, request.payload ?? {}, 'user');
    if (request.type === 'STATE_GET') return { ...result, agent: getMcpStatus() };
    await refresh(); return result;
  })().then((data) => sendResponse({ success: true, data })).catch((error) => sendResponse({ success: false, error: error.message }));
  return true;
});
chrome.webRequest.onBeforeRequest.addListener(() => {
  if (!runtimeConfig.enabled || !runtimeConfig.options.clearCache || clearRunning) return;
  clearRunning = true;
  chrome.browsingData.removeCache({ since: Date.now() - MILLISECONDS_PER_WEEK }, () => { clearRunning = false; });
  return undefined;
}, { urls: [ALL_URLS] });
chrome.runtime.onStartup.addListener(() => {
  void ruleService.state().then(async (state: any) => {
    if (state.preferences.enableOnStartup && !state.enabled) await ruleService.execute('CONFIG_ENABLED', { enabled: true }, 'user');
    await refresh();
  });
});
void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
void refresh();
