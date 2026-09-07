---
name: xswitch
description: Configure XSwitch Next request redirects, cross-origin rules, groups, imports, exports, and undo through its local MCP tools when the user asks to proxy a URL, switch a development rule, or manage XSwitch configuration.
---

# XSwitch Next

Use the connected XSwitch MCP tools. Never edit Chrome storage or configuration files to change live rules. If the tools are unavailable, use the extension's Agent page setup prompt to install this fork's local runtime; do not substitute the upstream npm package.

## Read, make the smallest change, verify

1. Call `get_xswitch_state` before any mutation. Keep its revision, group IDs and rule IDs. Check `applyError`, the global switch, group switches and rule switches.
2. Find rules with the same source and type. Use the user's selected group, otherwise an existing suitable development group. Create a named group only if needed. Never rebuild a group or the whole configuration to add a single rule.
3. If source and destination already match, only enable the existing rule when necessary. If the destination differs, call `update_redirect_rule` on that rule. If there are several plausible matches and context does not identify one, ask which rule the user means.
4. Prefer `create_redirect_rule`, `update_redirect_rule`, `create_cors_rule`, `update_cors_rule`, `set_rule_enabled` and `set_group_enabled`. Include `expectedRevision` from the latest read on writes when available. Read again after a revision conflict; do not force an old snapshot over newer changes.
5. After a rule change, call `test_rule` using the concrete source URL, or `test_url` to inspect active matches and the selected destination. For regex rules use a representative real URL. If the destination page URL is known, check that URL too. Confirm `applied: true` on the write response. A simulation is not proof that a remote/local server is reachable.
6. Retain the returned `backupId` and `operationId` in conversation context for undo. Report the source, destination and effective enabled state in ordinary language.

Do not claim a rule is active when its group or the global switch is off. Enable switches only within the requested scope; enabling a group/global switch can activate unrelated rules. If the user's requested change does not authorize that effect, explain the inactive state or ask the one needed question.

## Infer only what the request supports

- Default to `matchMode: "contains"`. Use regex only for an explicit regex request or a dynamic URL family that cannot be expressed with a literal source.
- Ordinary JS/CSS redirects default to `enableCors: false`. Turn it on only when the user asks to allow cross-origin access or solve CORS. An independent API cross-origin request uses `create_cors_rule`.
- If the context identifies `https://g.alicdn.com/project/index.js` and the user says “proxy this JS to localhost:8000”, use that source and `http://127.0.0.1:8000/index.js`. A bare local port implies the source basename, not an invented directory tree. Ask when the filename or a required complex path is unknown.
- Preserve a supplied complete destination and existing capture references. Chrome uses RE2 and the service validates it. If validation fails, explain the named rule error and repair only that rule.
- When the user says “turn off the rule just created”, use the rule ID returned in this conversation after confirming it still exists. When they say “enable all local development rules”, identify the relevant groups from current state and enable their intended rules without changing unrelated groups.

## Undo and transfers

- “Undo my last AI change”: call `get_xswitch_state`, then `restore_xswitch_backup` with the remembered `backup_id`. If the conversation has no ID, omitting it restores the most recent agent snapshot. Restore is a full snapshot: if later unrelated modifications exist, explain that effect before choosing a full restore. The restore itself creates a backup.
- “Export in original XSwitch format”: call `export_configuration` with `legacy: true, envelope: true`. This envelope is accepted by the original import UI. Use `envelope: false` only when the user specifically wants the ID-keyed legacy JSON map. Disabled individual rules and Next-only semantics may require Next format; do not promise lossless legacy export.
- Only an explicit import or restore request authorizes replacing the entire configuration. For import call `preview_configuration_import`, show group/rule/conflict counts, then apply the user's merge/overwrite and conflict choice with `import_configuration` and the preview revision. Never silently overwrite conflicts.
- Read-only requests such as “show current redirects” use state/list tools and must not create backups or modify rules.

Example success reply:

已配置 XSwitch：
`g.alicdn.com/foo.js → http://127.0.0.1:3000/foo.js`
规则已启用，匹配测试通过。

Do not describe storage keys, proxy arrays, or JSON implementation details unless the user asks about them.
