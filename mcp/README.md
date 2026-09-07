# XSwitch Next MCP

Local stdio MCP server → socket/named pipe → Native Messaging → shared extension RuleService.

From the repository root:

```sh
npm ci
npm run mcp:install-host -- --extension-id <32-character-extension-id>
```

The installer bundles and copies the runtime to `~/.xswitch/runtime`, then prints the client configuration. Use the emitted absolute Node and server paths. Windows registers `com.xswitch.mcp` under the current user's browser registry key and launches a quoted `.cmd` wrapper; macOS/Linux register a shell launcher. `--browser edge|chromium` selects another browser. `--user-data-dir` supports custom profiles on macOS/Linux; Windows still requires registry registration. `--no-register` generates files without Windows registry writes for testing.

Run `npm run mcp:install-host -- --uninstall` to remove the corresponding registration. Runtime files remain available for inspection. Existing upstream host registration uses the same name, so installing this fork updates that bridge.

The server exposes the original seven tools and nineteen V2 tools. See [docs/mcp.md](../docs/mcp.md). Use the repository Skill, read state before changing rules, test after changing them, and retain the returned backup ID.

This package is private until a release/publishing workflow is deliberately configured; do not install an unrelated upstream npm package as a substitute.
