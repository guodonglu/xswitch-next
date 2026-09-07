import { vi } from 'vitest';
import { RuleService, STATE_KEY } from '../../src/services/rule-service.js';
export function serviceHarness(seed: Record<string, any> = {}) {
  const data = structuredClone(seed);
  let rules: any[] = [];
  const storage = {
    get: vi.fn(async (key: string | null) => structuredClone(key ? { [key]: data[key] } : data)),
    set: vi.fn(async (value: any) => { Object.assign(data, structuredClone(value)); }),
  };
  const dnr = {
    isRegexSupported: vi.fn(async () => ({ isSupported: true })),
    getDynamicRules: vi.fn(async () => structuredClone(rules)),
    updateDynamicRules: vi.fn(async ({ addRules }: any) => { rules = structuredClone(addRules); }),
  };
  const service = new RuleService({ storage, dnr });
  return { data, storage, dnr, service, restart: () => new RuleService({ storage, dnr }),
    rules: () => structuredClone(rules), document: () => structuredClone(data[STATE_KEY]) };
}
