import { createConfig, createGroup, createRule, newId } from '../core/config-model.js';
import { validateConfig, validateRule, assertObject } from '../core/config-validator.js';
import { importLegacyConfig, legacyRuleToInternal, internalGroupToLegacy } from '../core/legacy-xswitch-adapter.js';
import { compileConfig, validateDnr, replaceDnr, stableJson, simulateUrl } from '../core/dnr-adapter.js';
import { previewImport, mergeImport, exportConfig } from '../core/import-format.js';

export const STATE_KEY = 'xswitchNextState';
export const LEGACY_SNAPSHOT_KEY = 'xswitchNextLegacySnapshot';
const clone = (value) => structuredClone(value);
const defaultPreferences = { theme: 'light', mcpEnabled: true, enableOnStartup: false };
const legacyEnabled = (value) => value !== 'disabled';

export function migrateLegacy(raw) {
  let config;
  if (raw.config_for_shown !== undefined || raw.config !== undefined) {
    const shown = raw.config_for_shown ?? raw.config;
    if (typeof shown === 'string' || Array.isArray(shown?.proxy) || Array.isArray(shown?.cors)) {
      config = importLegacyConfig(typeof shown === 'string' && !shown.trim() ? {} : shown);
    } else {
      const items = raw.tab_list ?? Object.keys(shown).map((id) => ({ id, name: id === '0' ? '默认规则' : id, active: true }));
      config = importLegacyConfig({ type: 'xswitch-rules', version: 1,
        items: items.map((item) => ({ ...item, active: item.id === '0' || (raw.active_keys ?? items.filter((i) => i.active).map((i) => i.id)).includes(item.id) })),
        rules: Object.fromEntries(items.map((item) => [item.id, shown[item.id] === '' ? {} : (shown[item.id] ?? {})])) });
    }
  } else config = createConfig();
  config.enabled = legacyEnabled(raw.disabled);
  config.options = { clearCache: legacyEnabled(raw.clearCacheEnabled), corsEnabled: legacyEnabled(raw.corsEnabled) };
  return config;
}

export class RuleService {
  constructor({ storage, dnr, syncStorage, onChange = () => {} }) {
    this.storage = storage; this.dnr = dnr; this.syncStorage = syncStorage; this.onChange = onChange;
    this.queue = Promise.resolve(); this.ready = null; this.document = null; this.applyError = null;
  }

  async initialize() {
    if (!this.ready) this.ready = this.load().catch((error) => { this.ready = null; throw error; });
    await this.ready;
  }

  async load() {
    const raw = await this.storage.get(null);
    let doc = raw[STATE_KEY];
    if (!doc) {
      const legacy = raw.config_for_shown === undefined && raw.config === undefined && this.syncStorage
        ? { ...await this.syncStorage.get(null), ...raw } : raw;
      // Snapshot before parsing: even invalid JSONC remains recoverable and downloadable.
      if (!raw[LEGACY_SNAPSHOT_KEY]) await this.storage.set({ [LEGACY_SNAPSHOT_KEY]: legacy });
      const config = migrateLegacy(legacy);
      doc = { config, preferences: { ...defaultPreferences, mcpEnabled: legacyEnabled(legacy.mcpEnabled),
        theme: ['light', 'dark'].includes(legacy.theme_mode) ? legacy.theme_mode : 'system' },
        revision: 0, history: [], backups: [], pending: null };
      for (const old of legacy.mcpBackups ?? []) {
        try {
          const previous = importLegacyConfig(old.state.rules);
          previous.enabled = old.state.extension_enabled;
          previous.options = { clearCache: old.state.clear_cache_enabled, corsEnabled: old.state.cors_enabled };
          if (old.status === 'pending') doc.config = previous;
          doc.backups.push({ id: old.id, timestamp: Date.parse(old.created_at), source: 'agent', action: old.operation, config: previous });
        } catch { /* Original snapshot retains unsupported historical backup entries. */ }
      }
      await this.storage.set({ [STATE_KEY]: doc });
    }
    validateConfig(doc.config);
    if (doc.pending) {
      await replaceDnr(this.dnr, doc.pending.dnr);
      doc = { ...doc, config: doc.pending.config, pending: null };
      await this.storage.set({ [STATE_KEY]: doc });
    }
    this.document = doc;
    try {
      const entries = compileConfig(doc.config);
      await validateDnr(entries, this.dnr);
      await replaceDnr(this.dnr, entries.map((entry) => entry.dnr));
      this.applyError = null;
    } catch (error) { this.applyError = error.message; }
  }

  serialize(task) {
    const result = this.queue.then(task, task);
    this.queue = result.catch(() => {});
    return result;
  }

  async state() {
    await this.initialize(); await this.queue;
    return clone({ ...this.document.config, config: this.document.config,
      preferences: this.document.preferences, revision: this.document.revision,
      history: this.document.history, applyError: this.applyError,
      activeRuleCount: this.document.config.enabled ? this.document.config.groups.filter((g) => g.enabled)
        .reduce((n, g) => n + g.rules.filter((r) => r.enabled && (r.type !== 'cors' || this.document.config.options.corsEnabled)).length, 0) : 0,
      backups: this.document.backups.map(({ config, ...metadata }) => ({ ...metadata, groupCount: config.groups.length })) });
  }

  async transact(action, payload, source, mutate) {
    await this.initialize();
    return this.serialize(async () => {
      if (!['user', 'agent', 'import'].includes(source)) throw new Error('未知操作来源');
      assertObject(payload, 'payload');
      const before = clone(this.document);
      if (payload.expectedRevision !== undefined && payload.expectedRevision !== before.revision) throw new Error('配置已被其他操作更新，请刷新后重试');
      const next = clone(before.config);
      const data = await mutate(next, before);
      validateConfig(next);
      if (data?.rule && (action === 'RULE_CREATE' || (action === 'RULE_UPDATE'
          && ['source', 'matchMode', 'destination', 'enableCors'].some((key) => payload[key] !== undefined)))) {
        const probe = clone(next); probe.enabled = true; probe.options.corsEnabled = true;
        for (const g of probe.groups) { g.enabled = true; for (const r of g.rules) r.enabled = r.id === data.rule.id; }
        await validateDnr(compileConfig(probe), this.dnr);
      }
      const entries = compileConfig(next);
      await validateDnr(entries, this.dnr);
      const installed = await this.dnr.getDynamicRules();
      const id = newId('operation'); const backupId = newId('backup'); const timestamp = Date.now();
      const pending = { id, config: before.config, dnr: installed };
      await this.storage.set({ [STATE_KEY]: { ...before, pending } });
      try {
        await replaceDnr(this.dnr, entries.map((entry) => entry.dnr));
        const change = { type: action, group: data?.group?.name, rule: data?.rule?.name,
          match: data?.rule?.match?.value, destination: data?.rule?.destination?.value, enabled: data?.rule?.enabled };
        const history = { id, source, action, timestamp, description: [action, change.group, change.rule].filter(Boolean).join(' · '), backupId, change };
        const backup = { id: backupId, timestamp, source, action, operationId: id, config: before.config };
        const committed = { ...before, config: next, pending: null, revision: before.revision + 1,
          history: [history, ...before.history].slice(0, 50), backups: [backup, ...before.backups].slice(0, 10) };
        await this.storage.set({ [STATE_KEY]: committed });
        const readback = (await this.storage.get(STATE_KEY))[STATE_KEY];
        if (stableJson(readback) !== stableJson(committed)) throw new Error('配置读取校验失败');
        this.document = committed; this.applyError = null;
        this.onChange();
        return { ...data, success: true, applied: true, operationId: id, change, backupId,
          backup_id: backupId, rollback_available: true, revision: committed.revision };
      } catch (error) {
        try {
          await replaceDnr(this.dnr, installed);
          await this.storage.set({ [STATE_KEY]: before });
          this.document = before;
        } catch (rollbackError) {
          this.ready = null;
          throw new Error(`操作失败且回滚未完成，重启后恢复。${error.message}；${rollbackError.message}`);
        }
        throw new Error(`操作失败，已自动回滚：${error.message}`);
      }
    });
  }

  async preferences(payload) {
    await this.initialize();
    return this.serialize(async () => {
      const preferences = { ...this.document.preferences };
      if (payload.theme !== undefined) {
        if (!['system', 'light', 'dark'].includes(payload.theme)) throw new Error('未知主题');
        preferences.theme = payload.theme;
      }
      for (const key of ['mcpEnabled', 'enableOnStartup']) if (payload[key] !== undefined) {
        if (typeof payload[key] !== 'boolean') throw new Error(`${key}: 必须是布尔值`);
        preferences[key] = payload[key];
      }
      const next = { ...this.document, preferences };
      await this.storage.set({ [STATE_KEY]: next }); this.document = next; this.onChange();
      return clone(preferences);
    });
  }

  async execute(action, payload = {}, source = 'user') {
    if (action === 'STATE_GET') return this.state();
    if (action === 'CONFIG_EXPORT') {
      const exported = exportConfig((await this.state()).config, payload);
      if (payload.legacy) await validateDnr(compileConfig(importLegacyConfig(exported)), this.dnr);
      return exported;
    }
    if (action === 'IMPORT_PREVIEW') {
      const state = await this.state();
      return { ...previewImport(payload.input, state.config, payload.groupId), revision: state.revision };
    }
    if (action === 'LEGACY_SNAPSHOT_EXPORT') return (await this.storage.get(LEGACY_SNAPSHOT_KEY))[LEGACY_SNAPSHOT_KEY];
    if (action === 'PREFERENCES_SET') {
      if (source === 'agent') throw new Error('Agent 不能更改连接权限或外观设置');
      return this.preferences(payload);
    }
    if (action === 'RULE_TEST') {
      const state = await this.state();
      const config = clone(state.config);
      if (payload.ruleId && !config.groups.some((g) => g.rules.some((r) => r.id === payload.ruleId))) throw new Error('规则不存在');
      if (payload.ignoreEnabled && payload.ruleId) {
        config.enabled = true; config.options.corsEnabled = true;
        for (const g of config.groups) { g.enabled = true; for (const r of g.rules) r.enabled = r.id === payload.ruleId; }
      }
      return simulateUrl(config, payload.url, payload);
    }
    return this.transact(action, payload, action === 'CONFIG_IMPORT' && source === 'user' ? 'import' : source, (config, before) => {
      const group = () => {
        const found = config.groups.find((g) => g.id === payload.groupId || g.legacy?.id === payload.groupId);
        if (!found) throw new Error('规则组不存在'); return found;
      };
      const findRule = () => {
        for (const g of config.groups) {
          const rule = g.rules.find((r) => r.id === payload.ruleId);
          if (rule) return { group: g, rule };
        }
        throw new Error('规则不存在');
      };
      const touch = (item) => { item.updatedAt = Date.now(); };
      switch (action) {
        case 'CONFIG_IMPORT': {
          const parsed = previewImport(payload.input, config, payload.groupId);
          Object.assign(config, mergeImport(config, parsed.config, payload));
          return { imported: parsed.summary };
        }
        case 'CONFIG_ENABLED': config.enabled = payload.enabled; return { extension_enabled: config.enabled };
        case 'OPTIONS_SET':
          for (const key of ['clearCache', 'corsEnabled']) if (payload[key] !== undefined) config.options[key] = payload[key];
          return { options: config.options };
        case 'GROUP_CREATE': {
          const created = createGroup(payload.name); config.groups.push(created); return { group: created };
        }
        case 'GROUP_UPDATE': {
          const g = group(); for (const key of ['name', 'enabled']) if (payload[key] !== undefined) g[key] = payload[key];
          touch(g); return { group: g };
        }
        case 'GROUP_DELETE': { const g = group(); config.groups = config.groups.filter((item) => item !== g); return { group: g }; }
        case 'GROUP_COPY': {
          const g = clone(group()); g.id = newId('group'); delete g.legacy; g.name += '（副本）';
          g.rules.forEach((r) => { r.id = newId('rule'); }); touch(g); config.groups.push(g); return { group: g };
        }
        case 'GROUP_MOVE': { const g = group(); move(config.groups, g, payload.direction); return { group: g }; }
        case 'RULE_CREATE': {
          const g = group(); const rule = createRule(payload.type, payload); validateRule(rule, { forApply: true });
          g.rules.push(rule); touch(g); return { group: { id: g.id, name: g.name }, rule };
        }
        case 'RULE_UPDATE': {
          const { group: g, rule } = findRule();
          if (payload.name !== undefined) rule.name = payload.name;
          if (payload.source !== undefined) rule.match.value = payload.source;
          if (payload.matchMode !== undefined) rule.match.mode = payload.matchMode;
          if (payload.source !== undefined || payload.matchMode !== undefined) delete rule.legacy;
          if (payload.destination !== undefined && rule.type === 'redirect') rule.destination.value = payload.destination;
          if (payload.enableCors !== undefined && rule.type === 'redirect') rule.options.cors = payload.enableCors;
          if (payload.enabled !== undefined) rule.enabled = payload.enabled;
          validateRule(rule, { forApply: true }); touch(rule); touch(g);
          return { group: { id: g.id, name: g.name }, rule };
        }
        case 'RULE_DELETE': { const { group: g, rule } = findRule(); g.rules = g.rules.filter((r) => r !== rule); touch(g); return { rule }; }
        case 'RULE_COPY': {
          const { group: g, rule } = findRule(); const copied = clone(rule); copied.id = newId('rule'); copied.name += '（副本）';
          g.rules.splice(g.rules.indexOf(rule) + 1, 0, copied); touch(g); return { rule: copied };
        }
        case 'RULE_MOVE': { const { group: g, rule } = findRule(); move(g.rules, rule, payload.direction); touch(g); return { rule }; }
        case 'CONFIG_CLEAR': config.groups = []; return {};
        case 'BACKUP_RESTORE': {
          const backup = payload.backupId ? before.backups.find((b) => b.id === payload.backupId)
            : before.backups.find((b) => !payload.agentOnly || b.source === 'agent');
          if (!backup) throw new Error('没有可恢复的备份');
          Object.assign(config, clone(backup.config)); return { restored_backup_id: backup.id };
        }
        case 'LEGACY_UPSERT': {
          let g = payload.group_id ? config.groups.find((g) => g.id === payload.group_id || g.legacy?.id === payload.group_id) : null;
          if (payload.group_id && !g) throw new Error('规则组不存在');
          if (!g) { if (!payload.name) throw new Error('创建分组需要 name'); g = createGroup(payload.name); g.enabled = false; config.groups.push(g); }
          if (payload.name !== undefined) g.name = payload.name;
          if (payload.active !== undefined) g.enabled = payload.active;
          for (const [key, type] of [['proxy', 'redirect'], ['cors', 'cors']]) if (payload[key] !== undefined) {
            if (!Array.isArray(payload[key])) throw new Error(`${key}: 必须是数组`);
            const old = g.rules.filter((r) => r.type === type); const consumed = new Set();
            const rules = payload[key].map((entry) => {
              const r = legacyRuleToInternal(entry, type);
              const existing = old.find((candidate) => !consumed.has(candidate.id) && candidate.match.value === r.match.value);
              if (existing) {
                consumed.add(existing.id); r.id = existing.id; r.name = existing.name; r.createdAt = existing.createdAt;
                r.enabled = existing.enabled;
                if (r.options) r.options.cors = existing.options.cors;
              }
              return r;
            });
            // Retain untouched categories at their relative slots, including interleaved CORS.
            const kept = []; let index = 0; let lastSlot = -1;
            for (const oldRule of g.rules) {
              if (oldRule.type !== type) kept.push(oldRule);
              else { if (index < rules.length) kept.push(rules[index++]); lastSlot = kept.length; }
            }
            kept.splice(lastSlot < 0 ? kept.length : lastSlot, 0, ...rules.slice(index)); g.rules = kept;
          }
          touch(g); return { group: { ...g, active: g.enabled, config: internalGroupToLegacy(g) } };
        }
        default: throw new Error(`未知操作: ${action}`);
      }
    });
  }
}

function move(items, item, direction) {
  if (![-1, 1].includes(direction)) throw new Error('排序方向无效');
  const index = items.indexOf(item); const next = index + direction;
  if (next >= 0 && next < items.length) [items[index], items[next]] = [items[next], items[index]];
}
