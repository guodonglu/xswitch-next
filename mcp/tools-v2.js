import { z } from 'zod';
const id = z.string().min(1);
const revision = z.number().int().nonnegative().optional();
const ruleFields = { name: z.string().min(1).optional(), source: z.string().min(1),
  matchMode: z.enum(['contains', 'regex']).optional(), enabled: z.boolean().optional(), expectedRevision: revision };
const redirectFields = { ...ruleFields, destination: z.string(), enableCors: z.boolean().optional() };
const partial = (fields) => Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, schema.optional()]));
export const V2_TOOLS = [
  ['list_rule_groups', 'List rule groups in order', {}, true],
  ['get_rule_group', 'Read one rule group', { groupId: id }, true],
  ['list_rules', 'List rules, optionally in one group', { groupId: id.optional() }, true],
  ['get_rule', 'Read one rule by stable ID', { ruleId: id }, true],
  ['create_redirect_rule', 'Create one request redirect; read state first and test after writing', { groupId: id, ...redirectFields }, false],
  ['update_redirect_rule', 'Update only supplied redirect fields; preserve other rules', { ruleId: id, ...partial(redirectFields) }, false],
  ['create_cors_rule', 'Create an independent allow-cross-origin rule', { groupId: id, ...ruleFields }, false],
  ['update_cors_rule', 'Update only supplied cross-origin rule fields', { ruleId: id, ...partial(ruleFields) }, false],
  ['delete_rule', 'Delete one rule with backup', { ruleId: id, expectedRevision: revision }, false],
  ['set_rule_enabled', 'Enable or disable one rule', { ruleId: id, enabled: z.boolean(), expectedRevision: revision }, false],
  ['set_group_enabled', 'Enable or disable one group', { groupId: id, enabled: z.boolean(), expectedRevision: revision }, false],
  ['create_rule_group', 'Create a named rule group', { name: z.string().min(1), expectedRevision: revision }, false],
  ['update_rule_group', 'Rename or toggle a group without replacing its rules', { groupId: id, name: z.string().min(1).optional(), enabled: z.boolean().optional(), expectedRevision: revision }, false],
  ['delete_rule_group', 'Delete a group with backup', { groupId: id, expectedRevision: revision }, false],
  ['test_rule', 'Simulate one rule against a URL; ignoreEnabled tests disabled rules without enabling them', { ruleId: id, url: z.string().url(), ignoreEnabled: z.boolean().optional() }, true],
  ['test_url', 'Simulate all active matches and first-priority redirect for a URL', { url: z.string().url() }, true],
  ['export_configuration', 'Export Next or original XSwitch JSON without changing rules', { legacy: z.boolean().optional(), envelope: z.boolean().optional(), scope: z.enum(['all', 'group', 'rule']).optional(), id: id.optional() }, true],
  ['preview_configuration_import', 'Validate an explicitly requested configuration import without changing state', { input: z.string(), groupId: id.optional() }, true],
  ['import_configuration', 'Only for an explicit user import request: apply a previously previewed import; supply its revision', { input: z.string(), mode: z.enum(['merge', 'overwrite']), conflict: z.enum(['keep', 'replace', 'both']).optional(), groupId: id.optional(), expectedRevision: z.number().int().nonnegative() }, false],
];
export function registerV2Tools(mcp, bridge, wrap) {
  for (const [name, description, inputSchema, readOnly] of V2_TOOLS) mcp.registerTool(name, {
    title: description, description, inputSchema,
    annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly, openWorldHint: false, idempotentHint: readOnly },
  }, wrap((input) => bridge.call(`v2_${name}`, input)));
}
