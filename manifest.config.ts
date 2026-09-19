import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

// XSwitch Manifest V3 定义。CRXJS 会据此生成最终 manifest.json，
// 并把下面指向源码的 html/ts 入口改写成构建产物路径。
export default defineManifest({
  manifest_version: 3,
  name: "XSwitch Next",
  minimum_chrome_version: "116",
  short_name: "xsc",
  description:
    "A tool for redirecting URLs and allowing CORS to make the local development experience easy and happy.",
  version: pkg.version,
  icons: {
    "16": "images/icon_16.png",
    "32": "images/icon_32.png",
    "48": "images/icon_48.png",
    "128": "images/icon_128.png",
  },
  action: {
    default_icon: {
      "16": "images/icon_16.png",
      "32": "images/icon_32.png",
      "48": "images/icon_48.png",
    },
    default_title: "XSwitch Next",
  },
  web_accessible_resources: [
    {
      resources: ["images/*"],
      matches: ["<all_urls>"],
    },
  ],
  options_page: "src/pages/sidepanel/index.html",
  side_panel: { default_path: "src/pages/sidepanel/index.html" },
  background: {
    service_worker: "src/background.ts",
    type: "module",
  },
  permissions: [
    "sidePanel",
    "storage",
    "browsingData",
    "webRequest",
    "declarativeNetRequest",
    "nativeMessaging",
    "clipboardRead",
    "clipboardWrite",
  ],
  host_permissions: ["<all_urls>"],
  commands: {
    _execute_action: {
      suggested_key: {
        windows: "Ctrl+Shift+X",
        mac: "Command+Shift+X",
        default: "Ctrl+Shift+X",
      },
    },
  },
});
