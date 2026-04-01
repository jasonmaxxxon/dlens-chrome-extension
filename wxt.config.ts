import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: ".",
  entrypointsDir: "entrypoints",
  manifest: {
    name: "DLens Chrome Extension v0",
    description: "Thin Threads capture client for DLens ingest-core.",
    permissions: ["storage", "tabs", "activeTab", "sidePanel"],
    host_permissions: [
      "*://www.threads.net/*",
      "*://threads.net/*",
      "*://www.threads.com/*",
      "*://threads.com/*",
      "http://127.0.0.1/*",
      "http://localhost/*",
      "https://generativelanguage.googleapis.com/*",
      "https://api.openai.com/*",
      "https://api.anthropic.com/*"
    ],
    action: {
      default_title: "DLens"
    },
    side_panel: {
      default_path: "sidepanel/index.html"
    }
  }
});
