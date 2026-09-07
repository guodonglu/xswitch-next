# XSwitch Next

A lightweight request redirect tool built for developers and AI agents.

一个本地优先、无需手写 JSON 的 Chrome 请求转发工具，基于 [yize/XSwitch](https://github.com/yize/xswitch) 构建。

- **请求转发与允许跨域**：包含匹配、正则捕获组、独立跨域规则。
- **Side Panel**：原生 HTML + JavaScript ES Modules + Tailwind，无 Vue、React、Ant Design、Monaco。
- **规则组**：创建、编辑、复制、开关、搜索、筛选、排序、单条测试和删除撤销。
- **Agent / MCP**：七个原版工具兼容，新增语义化规则接口；与界面共用业务服务。
- **AI Skill**：先读取、最小修改、避免重复、修改后验证。
- **导入导出**：单条、单组、完整 Next 配置、原版 XSwitch；预览、合并/覆盖与冲突处理。
- **可追踪与恢复**：最近 50 条操作记录、10 个完整快照、写入失败回滚、Service Worker 重启恢复。
- **外观**：跟随系统、浅色、深色，支持 320–600 px 侧栏。

## 安装开发版

需要 Node.js 20.19+（推荐 22 LTS）和 Chrome 116+，也可使用支持 Side Panel 的 Chromium/Edge。

```sh
npm ci
npm run build
```

打开 `chrome://extensions`，启用开发者模式，选择“加载已解压的扩展程序”，加载本仓库 `dist` 目录。点击工具栏图标即可打开 Side Panel；扩展设置入口也打开相同界面。

添加规则后保存，后台完成校验和应用后才显示“已生效”。新建的包含匹配规则将整个请求重定向到填写的目标 URL；从原版导入的规则保留原版字符串替换语义。

## 连接 AI Agent

在 **Agent → 复制 Agent 配置 Prompt** 中复制指令，粘贴给 Codex、Claude Code、Qoder、OpenCode 等具备本机操作能力的客户端。该指令使用本 Fork 的安装器和当前扩展 ID。

手动安装：

```sh
npm run mcp:install-host -- --extension-id <当前扩展ID>
# Edge: 追加 --browser edge；Chromium: 追加 --browser chromium
```

安装器支持 Windows、macOS、Linux，将运行时复制到 `~/.xswitch/runtime` 并输出 stdio MCP 配置。Windows 使用当前用户注册表，无需管理员权限。测试可使用 `--no-register`，不更改注册表。安装前核对已有 `com.xswitch.mcp` 注册；同一身份用于兼容原版，安装新运行时会更新它。

将 [skills/xswitch/SKILL.md](skills/xswitch/SKILL.md) 放入你的 Agent 支持的 Skill 目录。随后可以说：

> 把 https://a.com/test.js 代理到 http://localhost:3000/test.js。

> 给 api.example.com 开跨域。

> 撤销刚才 AI 对 XSwitch 的修改。

## 导入与兼容

选择配置文件后会显示规则数量和冲突预览，再决定合并或覆盖。

- Next 完整格式保留业务配置、规则名称、稳定 ID 和启用状态；不包含操作历史或客户端偏好。
- 原版导出按钮生成原版导入 UI 可接受的 `xswitch-rules` JSONC 分组文件。
- “原版 JSON 映射”输出 `{ "0": { "proxy": [], "cors": [] } }`，适合旧工作流。
- 原版没有单条停用状态，兼容导出会省略停用规则。无法保留的 Next 特有正则语义会报错而非静默改写。需要无损备份请使用 Next 格式。
- 首次运行会保存迁移前的原始数据，可从“导入导出”页面下载。JSONC 注释留在原始快照中，不进入业务模型。

## 网络行为与边界

继续使用 Chrome declarativeNetRequest 和原版转发/响应头生成器。列表靠前的启用规则具有更高优先级；浏览器对后续重定向重新匹配。这不是把所有规则依次应用一次的字符串解释器。

规则测试显示当前配置下单次请求的匹配与目标，不能证明目标服务在线。真实网络行为还受浏览器缓存、站点 Service Worker 和浏览器限制影响。Chrome 对正则编译内存和规则数量有配额，不支持的表达式会在保存时显示具体规则错误。

跨域响应头沿用原版能力，通配符不能替代携带凭证请求所需的服务端来源授权。缓存选项沿用原版行为：请求时清理近期浏览器 HTTP 缓存。

新增权限只有 `sidePanel`，用于工具栏打开侧栏。没有新增主机范围、账号系统、云同步、抓包、Mock 或页面自动化权限。

## 开发与验证

```sh
npm test
npm run lint
npm run build
npm run build:mcp
npx playwright install chromium
npm run test:e2e
```

E2E 使用独立临时浏览器配置；不会操作日常浏览器数据。可用 `XSWITCH_TEST_CHROME` 指定兼容的 Chrome for Testing 可执行文件。

架构：[architecture.md](docs/architecture.md) · 迁移记录：[migration.md](docs/migration.md) · MCP 协议：[mcp.md](docs/mcp.md) · 验收：[acceptance.md](docs/acceptance.md) · 原计划：[development-plan.md](docs/development-plan.md)

## License

MIT，保留原作者与上游版权声明，见 [LICENCE.md](LICENCE.md)。
