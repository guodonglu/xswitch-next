# Migration plan and compatibility contract

The authoritative requirements are in [development-plan.md](development-plan.md).

Execute Phase 0 through Phase 8 in order, with a separate commit and test/build result for every phase. Keep `main` on the upstream baseline during development.

1. Establish baseline and record current behavior.
2. Implement a versioned internal model and loss-aware legacy conversion before changing the UI.
3. Introduce the shared service, serial writes, durable recovery and verified DNR application.
4. Introduce Side Panel, then rules UI, import/export, MCP V2 and Agent Skill.
5. Remove unused framework/editor dependencies only after all replacement pages work.

Support three existing inputs: a bare `{proxy,cors}` group, an ID-keyed group map, and the actual upstream `xswitch-rules` envelope (`items` metadata plus JSONC `rules`). The envelope is required for group names, activation and explicit ordering; a plain object alone cannot represent all metadata.

Keep source and destination bytes, capture references, legacy regex inference, combo markers, group order and independent CORS entries. New explicit literal modes require escaped patterns on legacy export when legacy inference would otherwise interpret regex metacharacters. Reject malformed input with a location instead of silently dropping rules.

New IDs use UUIDs. Preserve legacy group IDs separately for compatible export. Disabled rules have no equivalent in bare legacy JSON; export must expose this limitation and offer the Next format for a lossless backup. Do not silently re-enable rules.

Migration must retain an untouched snapshot before first write. Invalid old JSONC blocks automatic activation rather than being replaced with an empty configuration. Restart recovery must happen before serving writes.

## Progress

- Phase 0: complete. Node 24.14.1 / npm 11.11.0; npm install succeeded (376 packages, zero reported vulnerabilities). Original tests exposed Windows socket/process-launch assumptions; harness fixes retain all assertions. npm test: 8 files / 34 tests pass. npm run build: pass, 4215 modules; largest UI chunk 3691.70 kB, shared UI chunk 1495.09 kB (uncompressed). No live Chrome acceptance yet.
- Phase 1: complete. Internal config/group/redirect/CORS constructors, UUID identity, structural/application validation and six legacy conversion functions implemented. Three upstream input shapes supported. 69 tests pass across 9 files (35 new model/adapter checks). npm run build passes; existing runtime bundle unchanged because these pure modules are not wired into it yet.
- Phase 2: shared RuleService, serialized transactions, durable pending journal, snapshot/history retention, migration reader, DNR compiler/readback and single-request simulation implemented. Failure-injection tests cover DNR errors, storage errors, readback mismatch, concurrent writes and restart recovery. 84 tests pass. Runtime integration follows with the Side Panel shell.
- Phases 3–8: in progress.

Phase 3: Side Panel manifest/action behavior, shared background runtime, MCP legacy transport delegation, theme/navigation shell integrated. 85 unit/integration tests and build pass. Browser smoke harness added; cached Chromium launch currently fails with Windows `spawn UNKNOWN`, investigating before final acceptance. Only `sidePanel` permission was added, required for the replacement UI; existing host permissions unchanged.

Phase 4: native DOM rule/group UI, inline validation/editor, toggles, copy, ordering, search/filter, per-rule simulation, delete/undo and accessible confirmation dialogs implemented. Settings support persisted theme, cache/CORS, MCP and browser-start preference. 85 tests and build pass. Browser acceptance remains pending runtime repair.

Phase 5: all four Next/legacy import formats, single/group/full exports, upstream-importable envelope, preview, merge/overwrite and keep/replace/both conflicts implemented. 98 tests and build pass. Fresh isolated Chrome for Testing runs successfully: 3 browser tests pass, including form creation, real HTTP redirect, rule simulation, delete/undo, import preview/merge, dark mode and 320/360/400/480/600 px layouts. Fixed toast/nav overlap found by this acceptance run. Existing globally cached Chromium files were left unchanged.

Phase 6: seven existing MCP tools retained plus nineteen semantic V2 tools for rule/group CRUD, toggles, tests, export and previewed import. Every V2 writer is tested for backup/provenance/DNR success and rollback failure handling. Agent UI reports handshake state, history and undo; native host reports disconnection. Windows installer emits a quoted launcher and per-user browser registry registration; tests use --no-register and do not alter the user's registry. 121 unit/integration tests and build pass. Fixed a status-refresh race that could erase an in-progress test result.

Phase 7: skills/xswitch/SKILL.md implements read-before-write, minimal updates, source deduplication, conservative URL inference, explicit CORS/regex choices, verification, snapshot undo and legacy export. Seven requested language scenarios have an executable MCP workflow test that verifies stable IDs and unrelated-rule preservation (not a claim of conformance by every external agent). 122 tests and build pass.

## Phase 1 export semantics

Legacy JSON cannot represent per-rule disable, explicit match modes, internal IDs, or all redirect-attached CORS options. Bare-map export includes only enabled groups/rules and therefore is not a lossless backup of disabled data. The upstream envelope retains group names/order/activation, but disabled individual rules are omitted. New explicit literal patterns are escaped where necessary for upstream regex inference. Use the Next format for full fidelity once Phase 5 is implemented.

JSONC comments are parsed but not round-tripped through the model. Preserve the untouched original migration backup in Phase 2. Invalid legacy regex is structurally importable for inspection/repair; activation validation reports its rule name. JS validation is not a substitute for Chrome's RE2 checker, which belongs in the DNR service.
