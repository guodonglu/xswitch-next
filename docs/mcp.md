# MCP API and operations

## Transport and installation

The existing `com.xswitch.mcp` Native Messaging host name and local stdio framing are retained. The MCP server communicates over a Unix socket on macOS/Linux or a per-user named pipe on Windows. Native host disconnection is reported to the extension; an allocated port alone is not shown as Agent Connected.

Use the Side Panel Agent setup prompt or `npm run mcp:install-host -- --extension-id <id>`. Runtime copies live in `~/.xswitch/runtime`. Windows registration uses HKCU; no administrator permissions are required. Installer tests pass `--no-register` and leave user registration untouched. `mcp/README.md` describes browser/profile overrides and uninstall behavior.

## Compatibility tools

| Public tool | Behavior |
| --- | --- |
| get_xswitch_state | Current internal config, legacy-compatible group views, global options, revision, history and connection information |
| upsert_xswitch_rule_group | Convert supplied legacy arrays at the boundary; preserve omitted categories and stable matching rule IDs |
| delete_xswitch_rule_group | Delete a non-default group; legacy ID 0 remains protected |
| set_xswitch_enabled | Toggle global request processing |
| set_xswitch_options | Partially change cache/CORS options |
| list_xswitch_backups | Metadata only, with original snake_case aliases |
| restore_xswitch_backup | Restore explicit backup_id or the latest Agent snapshot; back up the restore itself |

## Semantic tools

| Public tools | Parameters |
| --- | --- |
| list_rule_groups, get_rule_group | Optional/required groupId as appropriate |
| list_rules, get_rule | Optional groupId / required ruleId |
| create_redirect_rule | groupId, source, destination; optional name, matchMode, enableCors, enabled, expectedRevision |
| update_redirect_rule | ruleId and only changed fields |
| create_cors_rule, update_cors_rule | groupId or ruleId, source; optional name, matchMode, enabled |
| delete_rule, set_rule_enabled | ruleId; enabled for toggle |
| set_group_enabled | groupId, enabled |
| create_rule_group, update_rule_group, delete_rule_group | name / groupId and changed fields |
| test_rule, test_url | url; ruleId for single rule, optional ignoreEnabled |
| export_configuration | Optional scope all/group/rule, id, legacy, envelope |
| preview_configuration_import | input (JSON/JSONC string), optional groupId |
| import_configuration | Explicit user import only: input, mode merge/overwrite, conflict keep/replace/both, expectedRevision |

The canonical schemas are in `mcp/tools-v2.js`. All mutation handlers call the same RuleService as the UI. No MCP handler writes Chrome storage directly.

## Transaction contract

A serial mutation checks the expected revision, clones and validates current state, validates Chrome RE2 support, and captures actual installed DNR. It persists a pending journal before applying the proposed rules, then reads DNR back and commits config/history/backup in one storage document. A failed apply or readback restores previous DNR and config. An incomplete rollback retains the pending journal for restart recovery.

Successful mutations return `success`, `applied`, `operationId`, `change`, `backupId`, the legacy `backup_id` alias and revision. History records user/agent/import provenance and a summary. Retention is 50 summaries and 10 complete config snapshots, bounded to avoid excessive local storage usage. The original migration snapshot is retained separately.

Undo restores a complete config snapshot, including subsequent changes that were made after that snapshot. UI confirmation explains this effect. For precise undo after concurrent unrelated work, inspect state and choose a minimal semantic edit instead.

## Verification semantics

`test_rule` and `test_url` simulate one browser request and resource type (XHR by default), with explicit list priority. They return matches and finalUrl; they do not fetch the destination. Subsequent redirects are reevaluated by Chrome. `applied` means DNR application/readback succeeded, not that the destination server is reachable.

The local acceptance suite also makes real HTTP redirects and cross-origin browser requests. External Codex/Claude/Qoder/OpenCode setup varies by client and is not claimed as tested solely from the workflow fixture.
