# Architecture and upstream baseline

Upstream: https://github.com/yize/xswitch, commit `3dce9f528ca658981ec47ffac6969f6ef462ec9f`.
Development branch: `feature/xswitch-next`. The local repository retains upstream history; no remote GitHub fork has been published.

## Existing implementation

- `chrome-storage.ts` stores parsed groups in `config`, JSONC in `config_for_shown`, ordered metadata in `tab_list`, and enabled groups in `active_keys`. The misleading `disabled` key contains `enabled` when the extension is on. Storage is local (the boolean constant selects sync only when true).
- Importing the storage module starts legacy sync migration. Several callback wrappers do not propagate failures. Popup and options call storage directly.
- `background.ts` observes storage and independently applies DNR. Default group `0` is always merged, irrespective of `active_keys`. Cache control removes the previous week's browser HTTP cache during requests, with a concurrent-clear guard.
- `declarative-net-request.ts` already serializes atomic remove/add calls. Literal source strings become escaped regex filters; sources containing backslash, brackets, parentheses, asterisk, dollar or caret are inferred as regex. Legacy `??` is escaped for combo URLs; destination capture references become DNR backreferences.
- Redirect priority is currently always 1. Array order is preserved in generation but Chrome tie-breaking is not a sequential rewrite interpreter. Documentation claiming all rules run in sequence must not become a false verification promise.
- Invalid JS regex is silently skipped; RE2 validation is absent. CORS uses `||domain` URL filters and wildcard response headers. Wildcard origin plus credentials does not make credentialed browser requests work universally.
- MCP uses stdio -> local socket/named pipe -> Native Messaging -> extension. Mutations have a serial queue and ten local snapshots with pending/committed/recovered states. Verification checks storage shape, not installed DNR. Background application can race with this separate mutation path.
- Both existing pages load Vue and Ant Design; Popup additionally loads Monaco. Keep these until their replacement is functional.

## Target boundaries

Side Panel and MCP transport call one extension service. The service owns internal config, validation, durable transaction recovery, backups, history and DNR application/readback. Internal configuration is the only business data source. Legacy documents remain an import/export boundary.

Preserve existing DNR conversion helpers and transport framing. Add explicit match modes and deterministic priorities in the adapter, with tests documenting any deliberate behavior change. Report rule simulation separately from actual browser request verification.

Only the Side Panel permission is planned. Do not add host permissions. Do not add cloud services, accounts, mock responses, CDP or network monitoring.

## Implemented runtime (Next)

`src/services/runtime-service.js` constructs the shared `RuleService`. Background runtime messages and the Native Messaging transport both delegate to it. The previous storage observer/independent MCP writer are removed from the active runtime. `chrome-storage.ts` remains only as the upstream compatibility test fixture; no new page imports it.

`xswitchNextState` contains versioned business config, revision, preferences, ten backups, fifty history entries and an optional recovery journal. `xswitchNextLegacySnapshot` retains the original unmodified storage payload. UUIDs identify groups, rules and operations; transient DNR numeric IDs never drive UI identity.

The DNR adapter reuses upstream action/header generators, gives list order explicit priority, preserves imported replacement semantics, uses URL filters for ordinary new literal redirects, validates RE2 and compares installed rules before acknowledging a write. New forms, test results and import previews all use runtime messages. The only browser permission addition is `sidePanel`.

The UI consists of small DOM component functions and four views: rules, Agent, import/export and settings. There is no framework runtime, JSON editor or editor worker. Source maps and UI dependencies are excluded from the production bundle by Vite's normal build behavior.

Chrome API references: [Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel), [declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest), [Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).
