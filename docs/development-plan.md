# XSwitch Fork 开发计划

## 1. 项目目标

Fork 原版 XSwitch，在保留原项目核心网络转发能力和兼容性的基础上，将其重构为一个：

> 面向开发者、支持 AI Agent 自动操作、拥有现代化 Side Panel UI、无需手写 JSON 的请求转发工具。

核心目标：

1. 保留 XSwitch 原有 URL 转发能力。
2. 保留 CORS、缓存控制、分组、总开关等已有能力。
3. 保留并增强 MCP / Agent 操作能力。
4. 提供配套 Agent Skill，让 Agent 能理解用户自然语言并自动配置插件。
5. Popup 改为 Chrome Side Panel。
6. UI 不再直接展示 `proxy`、`cors` JSON。
7. 用户通过表单、卡片、开关操作规则。
8. 前端 UI 不使用 Vue / React / Ant Design。
9. UI 使用原生 HTML + JavaScript ES Modules。
10. 样式统一使用 Tailwind CSS。
11. 支持深色模式。
12. 支持单条规则、单个规则组导出。
13. 支持完整配置导入导出。
14. 支持导入和导出原版 XSwitch 格式。
15. Agent 修改配置必须可追踪、可验证、可回滚。
16. 不破坏现有网络转发核心能力。

---

# 2. 开发原则

## 2.1 不做无意义的底层重写

原项目已经存在：

- Manifest V3
- Chrome Storage
- declarativeNetRequest
- URL redirect
- CORS Header 修改
- Service Worker
- Native Messaging
- MCP
- MCP 修改前备份
- MCP 回滚

这些能力优先复用。

第一阶段不要为了“代码统一”把已经工作的网络核心全部重新实现。

重点重构：
```
配置模型
↓
配置适配层
↓
Side Panel UI
↓
MCP API
↓
Agent Skill
```

---

# 3. 技术栈

## Extension

继续使用：
```
Chrome Manifest V3
Vite
CRXJS
Chrome Extension APIs
chrome.storage
chrome.declarativeNetRequest
chrome.sidePanel
chrome.runtime
chrome.nativeMessaging
```

## UI

必须使用：
```
HTML
JavaScript ES Modules
Tailwind CSS
```

禁止：
```
Vue
React
Angular
Ant Design
Element Plus
其他重量级 UI Framework
```

图标优先使用：
```
inline SVG
```

不要为了图标引入大型运行时依赖。

## Core

原项目已经稳定的 TypeScript Core 可以暂时保留：
```
background.ts
declarative-net-request.ts
mcp-bridge.ts
chrome-storage.ts
```

UI 与 Core 通过明确的 message API 通信。

不要让 Side Panel 直接操作底层 storage 数据结构。

后续若有必要，再独立进行 TypeScript → JavaScript 迁移。

---

# 4. 总体架构

目标架构：
```
┌─────────────────────────┐
│       Side Panel        │
│                         │
│ HTML + JS + Tailwind    │
└────────────┬────────────┘
             │
             │ chrome.runtime
             ▼
┌─────────────────────────┐
│    Extension Service    │
│                         │
│ Rule Service            │
│ Config Service          │
│ Import/Export Service   │
│ History Service         │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│   Internal Data Model   │
└──────┬────────────┬─────┘
       │            │
       ▼            ▼
Legacy Adapter    DNR Adapter
       │            │
       ▼            ▼
XSwitch JSON     Chrome DNR
       
       
AI Agent
   │
   ▼
MCP Server
   │
   ▼
Native Messaging
   │
   ▼
Extension Service
```

关键原则：

> UI、Agent、Legacy XSwitch JSON 都不能直接成为真正的数据源。

统一使用新的 Internal Data Model。

---

# 5. 新的数据模型

不要继续把：
```json
{
  "proxy": [],
  "cors": []
}
```

作为 UI 层的数据模型。

建立统一结构。

建议：
```yaml
{
  version: 1,

  enabled: true,

  options: {
    clearCache: true,
    corsEnabled: true
  },

  groups: [
    {
      id: "group_xxx",
      name: "默认规则",
      enabled: true,
      createdAt: 0,
      updatedAt: 0,

      rules: []
    }
  ]
}
```

## Redirect Rule
```yaml
{
  id: "rule_xxx",

  type: "redirect",

  name: "本地 JS",

  enabled: true,

  match: {
    mode: "contains",
    value: "g.alicdn.com/test.js"
  },

  destination: {
    value: "http://127.0.0.1:3000/test.js"
  },

  options: {
    cors: false
  },

  createdAt: 0,
  updatedAt: 0
}
```

支持：
```
contains
regex
```

后续再考虑：
```
exact
prefix
wildcard
```

第一版不要过度设计。

---

# 6. CORS 数据模型

为了完整兼容原版 XSwitch，不能强制认为 CORS 一定依附于 Redirect Rule。

因此支持独立规则：
```bash
{
  id: "rule_xxx",

  type: "cors",

  name: "测试接口跨域",

  enabled: true,

  match: {
    value: "api.example.com"
  }
}
```

但 UI 不显示：
```
cors
proxy
```

面向用户显示：
```
请求转发
允许跨域
```

---

# 7. Legacy XSwitch Adapter

建立：
```
legacy-xswitch-adapter
```

职责：
```
原 XSwitch JSON
      ⇅
Internal Config
```

必须同时提供：
```scss
importLegacyConfig()

exportLegacyConfig()

legacyGroupToInternal()

internalGroupToLegacy()

legacyRuleToInternal()

internalRuleToLegacy()
```

原格式：
```json
{
  "0": {
    "proxy": [
      [
        "source",
        "target"
      ]
    ],
    "cors": [
      "api.example.com"
    ]
  }
}
```

转换后：
```
Group
 ├─ Redirect Rule
 └─ CORS Rule
```

---

# 8. 兼容原则

这是整个项目的重要要求。

以下配置：
```json
{
  "proxy": [
    [
      "https://a.com/(.*)",
      "http://127.0.0.1/$1"
    ]
  ]
}
```

经过：
```
Legacy Import
→ Internal Model
→ Legacy Export
```

不能破坏：
```
匹配字符串
目标字符串
正则表达式
捕获组
规则顺序
分组
CORS
```

必须为转换器写 Unit Test。

---

# 9. Side Panel 改造

删除：
```
default_popup
```

Manifest 增加：
```
sidePanel permission
side_panel.default_path
```

点击浏览器插件图标：
```
直接打开 Side Panel
```

通过：
```php
chrome.sidePanel.setPanelBehavior({
  openPanelOnActionClick: true
})
```

实现。

原 Popup 后续删除。

Options Page 可以保留，但建议最终将主要配置统一到 Side Panel。

---

# 10. Side Panel 信息架构

Side Panel 不要做成 JSON 编辑器。

建议结构：
```css
┌──────────────────────────────┐
│ XSwitch Next        ● 已启用 │
│ 5 条规则            Agent ●  │
├──────────────────────────────┤
│ 🔍 搜索规则                  │
│                              │
│ [全部] [启用] [已停用]       │
├──────────────────────────────┤
│ 默认规则                 ⋯   │
│ 3 条规则              [ON]   │
│                              │
│ ┌──────────────────────────┐ │
│ │ 请求转发             ON │ │
│ │                          │ │
│ │ g.alicdn.com/test.js     │ │
│ │          ↓               │ │
│ │ 127.0.0.1:3000/test.js   │ │
│ │                          │ │
│ │ 跨域 ✓      编辑   ⋯     │ │
│ └──────────────────────────┘ │
│                              │
│ + 添加规则                   │
├──────────────────────────────┤
│ 规则   Agent   导入导出  设置│
└──────────────────────────────┘
```

---

# 11. 页面导航

底部导航：
```
规则
Agent
导入导出
设置
```

不要设计过多一级菜单。

Side Panel 宽度有限。

---

# 12. 规则主页

顶部：
```
XSwitch
总开关
Agent 连接状态
当前启用规则数
```

第二部分：
```
搜索
筛选
```

支持：
```
按名称
按 URL
按目标地址
```

---

# 13. Rule Group UI

规则组使用折叠结构。

例如：
```
▼ 飞猪本地开发

  4 条规则

  ● 开启
```

操作：
```
启用
禁用
重命名
复制
导入
导出
删除
```

支持拖动排序可以放到 Phase 2。

第一版支持简单：
```
上移
下移
```

即可。

---

# 14. Redirect Rule Card

展示：
```yaml
请求转发                         ON

g.alicdn.com/foo.js

              ↓

http://127.0.0.1:3000/foo.js

允许跨域 ✓

[编辑] [...]
```

不要展示：
```
proxy
[
  [...]
]
```

用户完全不需要知道内部 JSON。

---

# 15. 编辑 Redirect Rule

点击编辑后使用 Inline Editor 或 Drawer。

Side Panel 本身已经是侧栏，因此不推荐再次使用大 Drawer。

建议 inline editor：
```markdown
规则名称
[________________]

匹配地址
[________________]

匹配方式
[包含 ▼]

转发到
[________________]

☑ 允许跨域

[取消] [保存]
```

---

# 16. 新建规则

点击：
```
+ 添加规则
```

弹出轻量菜单：
```
请求转发
允许跨域
```

不要让用户先选择：
```
proxy
cors
```

---

# 17. 自动识别匹配模式

用户输入：
```
https://example.com/foo.js
```

默认：
```
包含匹配
```

用户可以主动切换：
```
正则表达式
```

正则模式显示：
```
Regex
```

标识。

保存之前进行：
```
RegExp syntax validation
RE2 compatibility validation
```

发现明显问题直接 UI 提示。

---

# 18. Rule Test

给每条规则提供：
```
测试
```

输入 URL：
```
https://example.com/test.js
```

返回：
```yaml
✓ 匹配成功

原地址
https://example.com/test.js

转发后
http://127.0.0.1:3000/test.js
```

如果不匹配：
```
未命中此规则
```

该能力同时暴露给 MCP。

---

# 19. 自动保存

普通操作：
```
开关
重命名
编辑
新增
```

保存后立即生效。

状态提示：
```
保存中…
已生效
保存失败
```

失败时：
```
恢复旧配置
展示错误
```

不要出现“UI 显示保存成功但 DNR 实际失败”的状态。

---

# 20. Undo

删除规则以后显示：
```
已删除「本地 JS」

[撤销]
```

持续几秒。

同时底层保留配置快照。

---

# 21. Agent 页面

新增独立：
```
Agent
```

页面。

展示：
```yaml
AI Agent

● MCP 已连接

最近操作

20:31
Codex 添加规则：
g.alicdn.com/foo.js
→ localhost:3000/foo.js

20:28
Claude 修改规则：
API 本地代理
```

提供：
```
复制 Agent 配置 Prompt
MCP 状态
重新连接
查看操作历史
撤销上一次 AI 修改
```

---

# 22. Agent 操作原则

AI Agent 不应该直接修改 storage。

流程必须：
```sql
Agent
 ↓
MCP Tool
 ↓
Native Messaging
 ↓
Extension Rule Service
 ↓
Validation
 ↓
Backup
 ↓
Write Internal Config
 ↓
Generate DNR
 ↓
Apply
 ↓
Verify
 ↓
Return Result
```

---

# 23. MCP API V2

不要让 AI 直接操作：
```
proxy
cors
```

对 Agent 提供语义化 API。

推荐：

## 状态
```
get_xswitch_state
```

返回：
```
enabled
options
groups
agent connection
active rule count
```

---

## 获取规则
```
list_rule_groups
get_rule_group
list_rules
get_rule
```

---

## 创建转发
```
create_redirect_rule
```

参数：
```
{
  groupId,
  name,
  source,
  destination,
  matchMode,
  enableCors,
  enabled
}
```

---

## 修改转发
```
update_redirect_rule
```

---

## CORS
```
create_cors_rule
update_cors_rule
```

---

## 删除
```
delete_rule
```

---

## 开关
```
set_rule_enabled
set_group_enabled
set_xswitch_enabled
```

---

## Group
```
create_rule_group
update_rule_group
delete_rule_group
```

---

## 测试
```
test_rule
test_url
```

其中：
```
test_url
```

返回一个 URL 会命中哪些规则。

例如：
```css
{
  url: "...",

  matches: [
    {
      group: "飞猪",
      rule: "本地 JS",
      before: "...",
      after: "..."
    }
  ],

  finalUrl: "..."
}
```

---

# 24. MCP 兼容策略

第一版不要直接删除旧 MCP Tool。

保留：
```
get_xswitch_state
upsert_xswitch_rule_group
delete_xswitch_rule_group
set_xswitch_enabled
set_xswitch_options
list_xswitch_backups
restore_xswitch_backup
```

增加 V2 语义 Tool。

后续再 deprecated 老接口。

理由：
```
避免已有用户 Agent 配置突然失效
```

---

# 25. Agent Diff

任何 AI 修改返回：
```yaml
{
  success: true,

  change: {
    type: "create",
    group: "飞猪",
    rule: "本地 JS"
  },

  applied: true,

  backupId: "..."
}
```

UI Agent History 同时记录。

---

# 26. Agent Safety

MCP 写入之前：
```markdown
1. 读取当前状态
2. 创建 backup
3. Validation
4. 保存
5. 更新 DNR
6. 验证
```

失败：
```
自动 rollback
```

Agent 不允许：
```
直接覆盖整个 config
```

除非用户明确要求：
```python
import configuration
restore backup
```

---

# 27. Agent Skill

仓库增加：
```
skills/
  xswitch/
    SKILL.md
```

Skill 面向：
```
Codex
Claude Code
Qoder
OpenCode
支持 Skill 的 Agent Harness
```

---

# 28. Skill 目标

用户只需要说：
```
把 g.alicdn.com/foo.js 转发到本地 3000
```

Agent 自动：
```
读取 XSwitch
↓
找到合适 Group
↓
判断 Source
↓
生成 Destination
↓
创建 Redirect Rule
↓
测试规则
↓
返回结果
```

---

# 29. Skill 核心规则

SKILL.md 必须明确：

### 修改前

永远：
```
get_xswitch_state
```

禁止盲写。

### 修改原则

优先：
```
最小修改
```

禁止为了增加一条规则重写整个规则组。

### 已存在规则

如果 source 已存在：
```
不要重复创建
```

应：
```
检查现有目标
```

如果目标一致：
```
只确保 enabled
```

如果不同：
```
修改现有规则
```

---

# 30. Skill 自动推断

用户：
```
把这个 JS 代理到 localhost:8000
```

如果上下文给出：
```
https://g.alicdn.com/project/index.js
```

自动生成：
```yaml
source:
https://g.alicdn.com/project/index.js

destination:
http://127.0.0.1:8000/index.js
```

但是不要在信息不足时乱猜复杂路径。

---

# 31. Skill CORS 行为

用户明确说：
```
解决跨域
允许跨域
开 CORS
```

才默认：
```ini
enableCors = true
```

普通 JS/CSS 静态资源代理：
```
默认 false
```

---

# 32. Skill 正则行为

除非：

1. 用户明确要求正则。
2. 需要匹配一组动态 URL。
3. 普通字符串无法完成需求。

否则：
```
优先 contains
```

避免 Agent 随意生成复杂 Regex。

---

# 33. Skill 验证

创建之后必须调用：
```
test_rule
```

或者：
```
test_url
```

确认匹配。

如果 Agent 有目标页面 URL，也要检查最终 URL。

---

# 34. Skill 回复风格

成功：
```bash
已配置 XSwitch：

g.alicdn.com/foo.js
→ 127.0.0.1:3000/foo.js

规则已启用。
```

不要回复：
```
已经修改 proxy 数组……
cors 写入……
JSON_CONFIG……
```

内部实现细节不需要告诉普通用户。

---

# 35. Skill Undo

用户：
```
撤销刚才 XSwitch 修改
```

Agent：
```
restore_xswitch_backup
```

或者根据 operationId 撤销对应修改。

---

# 36. Import / Export 页面

提供四类功能：
```
导入
导出
兼容 XSwitch
备份
```

---

# 37. 单条规则导出

规则菜单：
```
⋯

复制
导出
删除
```

导出内部格式：
```json
{
  "format": "xswitch-next-rule",
  "version": 1,
  "rule": {}
}
```

文件：
```
rule-name.xswitch.json
```

---

# 38. 单规则组导出

规则组：
```
导出此规则组
```

格式：
```json
{
  "format": "xswitch-next-group",
  "version": 1,
  "group": {}
}
```

---

# 39. 全部导出

格式：
```json
{
  "format": "xswitch-next",
  "version": 1,
  "exportedAt": "...",
  "config": {}
}
```

---

# 40. 原版 XSwitch 兼容导出

提供明确按钮：
```
导出为 XSwitch 格式
```

输出：
```json
{
  "0": {
    "proxy": [],
    "cors": []
  }
}
```

如果有多个 Group：
```
保持原 XSwitch Group 结构
```

规则顺序不得变化。

---

# 41. 自动识别导入格式

用户选择 JSON 后：
```scss
detectImportFormat()
```

自动判断：
```vbnet
XSwitch Next
XSwitch Legacy
Single Rule
Single Group
```

用户不需要先选择格式。

---

# 42. Import Preview

导入前必须 Preview：
```
即将导入：

2 个规则组
13 条转发规则
3 条跨域规则
```

提供：
```
合并
覆盖
取消
```

---

# 43. 冲突策略

合并时：

根据：
```bash
source + type
```

检测明显重复。

出现冲突：
```
保留现有
使用导入版本
同时保留
```

第一版也可以默认：
```
保留现有 + 导入项自动重命名
```

但必须避免静默覆盖。

---

# 44. 设置页面

提供：
```
外观

主题
跟随系统 / 浅色 / 深色


行为

启动时启用
禁用缓存
跨域支持


Agent

MCP
连接状态
复制配置 Prompt


数据

导入
导出
恢复备份
清除所有规则
```

---

# 45. UI Design System

整体目标：
```
现代
简洁
轻量
开发者工具感
高信息密度
不花哨
```

---

# 46. 色彩

优先使用 Tailwind Slate / Zinc 中性色。

例如：
```less
background:
white
zinc-950

surface:
zinc-50
zinc-900

border:
zinc-200
zinc-800
```

Accent：
```
indigo / blue
```

Success：
```
emerald
```

Error：
```
red
```

Warning：
```
amber
```

---

# 47. 圆角

统一：
```
rounded-lg
rounded-xl
```

不要大量：
```
rounded-3xl
```

保持开发工具风格。

---

# 48. 阴影

仅用于：
```
浮层
Dropdown
Toast
确认框
```

普通 Rule Card：
```
border
```

即可，不要所有卡片都有厚重阴影。

---

# 49. 字体

使用系统字体：
```css
font-family:
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

URL 使用：
```
font-mono
```

方便辨认。

---

# 50. Side Panel 响应式

至少适配：
```
320px
360px
400px
480px
600px
```

不要假设 Side Panel 固定宽度。

---

# 51. Dark Mode

使用：
```
prefers-color-scheme
```

并允许：
```
system
light
dark
```

配置保存到 storage。

Tailwind 使用：
```
dark:
```

变体。

---

# 52. Toast

统一实现：
```scss
showToast({
  type,
  message,
  action
})
```

支持：
```
success
error
warning
info
```

---

# 53. Confirm Dialog

删除 Rule Group：
```
此规则组包含 8 条规则。

确定删除？
```

必须确认。

删除单条 Rule：

可以直接删除 + Undo。

---

# 54. 前端目录结构

推荐：
```arduino
src/

  pages/

    sidepanel/
      index.html
      main.js

  ui/

    components/
      rule-card.js
      rule-editor.js
      group-section.js
      toggle.js
      dropdown.js
      toast.js
      dialog.js
      tabs.js

    views/
      rules-view.js
      agent-view.js
      import-export-view.js
      settings-view.js

  services/
      extension-api.js
      rule-service.js
      import-export-service.js
      theme-service.js

  core/
      config-model.js
      config-validator.js
      legacy-xswitch-adapter.js
      import-format.js

  styles/
      tailwind.css

  background.ts
  declarative-net-request.ts
  chrome-storage.ts
  mcp-bridge.ts
```

UI 组件不要实现为复杂 framework。

每个 component：
```javascript
export function createRuleCard() {}
```

或者：
```javascript
export class RuleCard {}
```

保持简单。

---

# 55. UI State

不要引入 Redux / Pinia。

建立简单 Store：
```javascript
const state = {
  config: null,
  activeView: "rules",
  loading: false,
  filter: "",
  agent: {}
}
```

通过：
```
custom events
render functions
```

完成状态同步。

避免构建自己的大型 Framework。

---

# 56. Service Worker API

定义明确消息协议。

例如：
```bash
{
  type: "RULE_CREATE",
  payload: {}
}
```

返回：
```yaml
{
  success: true,
  data: {}
}
```

所有 UI 写操作必须经过 Service。

禁止 Side Panel：
```
chrome.storage.local.set(...)
```

直接修改业务配置。

---

# 57. 网络核心

继续使用：
```
declarativeNetRequest
```

Redirect Rule 转换：
```
Internal Rule
→ DNR redirect
```

CORS Rule：
```
Internal Rule
→ DNR modifyHeaders
```

保存配置和应用 DNR 必须属于一次业务事务。

---

# 58. Rule ID

不要使用数组 index 作为规则 ID。

使用：
```
crypto.randomUUID()
```

例如：
```
rule_6ec2...
group_74ab...
```

DNR 的数字 Rule ID 单独生成。

不要将 Chrome DNR ID 暴露给 UI。

---

# 59. 排序

Internal Model 保存显式数组顺序。

因为 XSwitch 原本规则存在顺序语义。

任何：
```python
import
export
Agent 修改
UI 修改
```

都不能无意改变 Rule 顺序。

---

# 60. Operation History

增加：
```
operation-history
```

保存最近例如：
```
50
```

次操作。

数据：
```bash
{
  id,
  source: "user" | "agent" | "import",
  action,
  timestamp,
  description,
  backupId
}
```

Side Panel Agent 页面展示。

---

# 61. Agent 操作标识

MCP 修改必须：
```ini
source = agent
```

UI 操作：
```ini
source = user
```

导入：
```ini
source = import
```

便于问题追踪。

---

# 62. 第一期不新增的功能

为了控制 Fork 范围，第一期不要做：
```css
Response Body Mock
Request Body Mock
复杂 Header Rewrite
HAR
完整 Network Monitor
抓包
CDP
页面自动化
云同步
账号系统
团队协作
```

当前产品核心保持：

> 简单、快速、Agent 可控制的请求转发工具。

---

# 63. Phase 0：建立 Fork

执行：
```
Fork repository

建立 feature branch

完整运行：
npm install
npm test
npm run build
```

记录当前功能行为。

创建：
```bash
docs/architecture.md
docs/migration.md
docs/mcp.md
```

不要直接开始删 Vue。

---

# 64. Phase 1：Config Model

首先实现：
```
InternalConfig
RedirectRule
CorsRule
RuleGroup
Options
```

然后：
```csharp
legacy → internal
internal → legacy
```

写 Tests。

完成前不要开始 UI 大改。

---

# 65. Phase 2：Service Layer

把：
```
Storage
Rule Validation
DNR Apply
Backup
History
```

封装成统一 Service。

目标：
```scss
ruleService.createRule()
ruleService.updateRule()
ruleService.deleteRule()
ruleService.setEnabled()
```

UI 和 MCP 共用同一个 Service。

这是非常关键的架构要求。

禁止出现：
```
UI 一套更新逻辑
MCP 又一套更新逻辑
```

---

# 66. Phase 3：Side Panel Shell

修改 manifest。

创建：
```bash
sidepanel/index.html
sidepanel/main.js
```

实现：
```
导航
主题
总开关
基础 Layout
```

确认：
```
点击 Extension Icon
→ 打开 Side Panel
```

之后删除 Popup 依赖。

---

# 67. Phase 4：Rules UI

完成：
```
规则组
规则列表
新建
编辑
删除
复制
开关
搜索
筛选
规则测试
```

确保完全不需要编辑 JSON。

---

# 68. Phase 5：Import / Export

完成：
```
单 Rule
单 Group
全部配置
XSwitch Legacy
```

完成自动格式检测和 Preview。

---

# 69. Phase 6：MCP V2

建立语义化 Tools。

所有 MCP Tool 必须复用 Rule Service。

完成：
```bash
read
create
update
delete
enable
disable
test
backup
restore
```

---

# 70. Phase 7：Skill

完成：
```swift
skills/xswitch/SKILL.md
```

至少测试以下自然语言场景：

### Case 1
```yaml
把 https://a.com/test.js
代理到
http://localhost:3000/test.js
```

### Case 2
```
把刚才规则关掉
```

### Case 3
```
给 api.example.com 开跨域
```

### Case 4
```
把所有本地开发规则打开
```

### Case 5
```
撤销刚才 AI 对 XSwitch 的修改
```

### Case 6
```
查看现在有哪些转发
```

### Case 7
```
把当前 XSwitch 配置导成原版格式
```

---

# 71. Phase 8：UI Polish

最后统一处理：
```perl
Spacing
Typography
Dark mode
Hover
Focus
Keyboard navigation
Loading state
Empty state
Error state
Toast
Animation
```

动画只允许：
```
150~200ms
```

的简单过渡。

不要大量 Motion。

---

# 72. Empty State

无规则：
```
还没有转发规则

创建第一条规则，让请求转发到本地或其他环境。

[添加规则]
```

Agent 已连接时：
```
也可以告诉你的 AI Agent：

“把 example.com/app.js 转发到 localhost:3000”
```

这是非常重要的产品引导。

---

# 73. Error State

DNR 应用失败时必须展示具体规则。

例如：
```scss
规则无法应用

正则表达式不受 Chrome RE2 支持：

(foo)(?<=bar)

[编辑规则]
```

禁止只有：
```
配置错误
```

---

# 74. 测试要求

## Unit Tests

至少：
```cpp
Legacy import
Legacy export
Round trip
Redirect validation
Regex handling
Group conversion
CORS conversion
Import format detection
Conflict handling
Rule ordering
```

---

# 75. DNR Tests

确认：
```
字符串匹配
Regex
$1 捕获
Redirect
CORS
Enable/Disable
多个 Group
```

不会破坏原 XSwitch 行为。

---

# 76. MCP Tests

每个 Write Tool：
```
创建 backup
修改 config
成功 apply DNR
返回 operation info
```

失败：
```
rollback
```

---

# 77. Skill 测试

Agent 必须：
```
先读取
再修改
修改最少配置
验证
```

禁止：
```
用户要增加一条规则
Agent 却重建整个配置
```

---

# 78. UI 验收

Chrome Side Panel：
```
320px
400px
600px
```

均可正常使用。

必须检查：
```
长 URL
中文 Rule Name
大量 Rules
Dark Mode
空数据
Import Error
MCP Disconnect
Service Worker Restart
```

---

# 79. 性能目标

Side Panel 打开：
```
不加载 Monaco
不加载 Vue
不加载 Ant Design
```

因此目标 Bundle 明显小于原 UI。

规则数量：
```
500
```

以内 UI 应保持可操作。

列表较大时再考虑：
```
virtual list
```

第一版不用提前实现。

---

# 80. 删除依赖

Side Panel 完成以后移除：
```bash
vue
@vitejs/plugin-vue
vue-tsc
ant-design-vue
@ant-design/icons-vue
monaco-editor
```

前提：

确认没有其他模块依赖它们。

保留：
```
Vite
CRXJS
Tailwind
jsonc-parser
MCP SDK
Zod
Vitest
```

---

# 81. README 重写

README 第一屏直接说明：
```
XSwitch Next

A lightweight request redirect tool built for developers and AI agents.
```

核心能力：
```
Request Redirect
CORS
Side Panel
Rule Groups
Agent / MCP
AI Skill
Import / Export
XSwitch Compatibility
```

---

# 82. Agent Setup UX

不要让用户阅读复杂 MCP 文档。

设置页面提供：
```
连接 AI Agent
```

下面：
```markdown
1. 复制配置指令

[复制]

2. 粘贴到 Codex / Claude Code / Qoder

3. Agent 自动完成配置
```

连接成功：
```
● Agent Connected
```

---

# 83. 最重要的架构限制

开发过程中始终遵守：

### 禁止
```javascript
Side Panel 直接修改 storage
MCP 直接修改 storage
Legacy JSON 成为业务数据模型
UI 出现大段 JSON 编辑器
UI 暴露 proxy/cors 字段
UI 与 MCP 分别实现业务逻辑
为了 UI 重写成熟网络核心
```

### 必须
```
Internal Config
统一 Rule Service
统一 Validation
统一 Backup
统一 DNR Apply
Legacy Adapter
Agent Operation History
```

---

# 84. 最终用户体验

普通用户：
```
打开 XSwitch
↓
右侧 Side Panel
↓
添加规则
↓
输入源地址
↓
输入目标地址
↓
保存
```

整个过程不接触 JSON。

---

Agent 用户：
```
用户：
把 g.alicdn.com/project/app.js
代理到我本地 3000 端口

Agent：
读取配置
↓
检查已有规则
↓
创建/修改规则
↓
测试
↓
确认生效
```

最终回复：
```bash
已配置：

g.alicdn.com/project/app.js
→ 127.0.0.1:3000/app.js

规则已启用。
```

---

# 85. 最终定位

这个 Fork 不应该成为另一个复杂的 Requestly。

定位应该保持非常清晰：

> 一个轻量、现代、本地优先、AI Agent 原生可操作的 XSwitch。

核心差异化：
```diff
传统 XSwitch
=
开发者手动写配置


新版本
=
人可以用漂亮的 UI 配置
+
Agent 可以通过 MCP 配置
+
Skill 让 Agent 知道如何正确配置
+
仍然兼容原版 XSwitch
```

---

# 86. Agent 执行要求

实现本计划时：

1. 先完整阅读仓库。
2. 不假设现有实现。
3. 对现有 Storage、DNR、MCP 行为先写分析。
4. 每个阶段单独提交。
5. 禁止一次性重构整个仓库。
6. 每完成一个 Phase 都运行 Tests 和 Build。
7. 保证任意阶段主分支都可以正常构建。
8. Legacy Adapter 必须先于 UI 完成。
9. Rule Service 必须先于 MCP V2 完成。
10. Side Panel 和 MCP 必须共享业务层。
11. 原版 XSwitch 配置必须始终可以导入。
12. Export Legacy 必须能够被原版 XSwitch 重新导入使用。
13. 最终删除不再使用的 Vue / Ant Design / Monaco 依赖。
14. 不扩大 manifest 权限，除非功能确实需要。
15. 如必须增加权限，需要在 PR 中说明原因。













把开发计划写到文件里防止后面忘掉了