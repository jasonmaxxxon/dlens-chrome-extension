import { defineConfig } from "wxt";

const isPrOnlyBuild = process.env.DLENS_EXTENSION_VARIANT === "pr-only";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: ".",
  entrypointsDir: "entrypoints",
  manifest: {
    name: isPrOnlyBuild ? "DLens PR Mode" : "DLens v3",
    version: "0.1.25",
    description: isPrOnlyBuild
      ? "PR Evidence-only Threads capture client for DLens ingest-core."
      : "Thin Threads capture client for DLens ingest-core.",
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
      default_title: isPrOnlyBuild ? "DLens PR Mode" : "DLens"
    },
    side_panel: {
      default_path: "sidepanel/index.html"
    }
  }
});
