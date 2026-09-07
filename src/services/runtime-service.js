import { RuleService } from './rule-service.js';

export const ruleService = new RuleService({
  storage: chrome.storage.local,
  syncStorage: chrome.storage.sync,
  dnr: chrome.declarativeNetRequest,
  onChange: () => { chrome.runtime.sendMessage({ type: 'STATE_CHANGED' }).catch(() => {}); },
});
