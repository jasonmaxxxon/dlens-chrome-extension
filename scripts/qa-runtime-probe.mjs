#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir, platform } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const result = {
    backendUrl: "http://127.0.0.1:8000",
    chromeBase: path.join(homedir(), "Library", "Application Support", "Google", "Chrome"),
    profileDirectory: "Default",
    out: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--backend-url") {
      result.backendUrl = argv[++index];
    } else if (arg === "--chrome-base") {
      result.chromeBase = argv[++index];
    } else if (arg === "--profile-directory") {
      result.profileDirectory = argv[++index];
    } else if (arg === "--out") {
      result.out = argv[++index];
    } else if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return result;
}

function printHelp() {
  console.log(`Usage:
  node scripts/qa-runtime-probe.mjs --profile-directory Default --out docs/qa/assets/YYYY-MM-DD/runN/preflight.json

Options:
  --profile-directory <name>  Chrome profile directory to inspect. Default: Default
  --chrome-base <path>        Chrome user-data root. Default: ~/Library/Application Support/Google/Chrome
  --backend-url <url>         Ingest backend base URL. Default: http://127.0.0.1:8000
  --out <path>                Write JSON evidence to this path. If omitted, prints JSON only.
`);
}

async function pathExists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function runCommand(command, args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: options.timeoutMs ?? 5000,
      maxBuffer: options.maxBuffer ?? 1024 * 1024
    });
    return {
      ok: true,
      stdout: stdout.trim(),
      stderr: stderr.trim()
    };
  } catch (error) {
    return {
      ok: false,
      stdout: typeof error.stdout === "string" ? error.stdout.trim() : "",
      stderr: typeof error.stderr === "string" ? error.stderr.trim() : "",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function queryCookieHosts(cookieDbPath) {
  if (!(await pathExists(cookieDbPath))) {
    return { dbPath: cookieDbPath, exists: false, hosts: [] };
  }
  const query = [
    "select host_key, count(*)",
    "from cookies",
    "where host_key like '%threads%' or host_key like '%instagram%'",
    "group by host_key",
    "order by host_key;"
  ].join(" ");
  const result = await runCommand("sqlite3", [cookieDbPath, query], { timeoutMs: 5000 });
  const hosts = result.ok && result.stdout
    ? result.stdout.split("\n").map((line) => {
      const [host, count] = line.split("|");
      return { host, count: Number(count) };
    })
    : [];
  return {
    dbPath: cookieDbPath,
    exists: true,
    ok: result.ok,
    error: result.ok ? null : result.error,
    hosts
  };
}

async function listChromeTabs() {
  if (platform() !== "darwin") {
    return { ok: false, error: "Chrome tab listing is only implemented for macOS.", tabs: [] };
  }
  const script = `
tell application "Google Chrome"
  set output to ""
  repeat with wIndex from 1 to count windows
    set w to window wIndex
    repeat with tIndex from 1 to count tabs of w
      set t to tab tIndex of w
      set output to output & wIndex & "\t" & tIndex & "\t" & (title of t as text) & "\t" & (URL of t as text) & linefeed
    end repeat
  end repeat
  return output
end tell
`;
  const result = await runCommand("osascript", ["-e", script], { timeoutMs: 5000 });
  const tabs = result.ok && result.stdout
    ? result.stdout.split("\n").filter(Boolean).map((line) => {
      const [windowIndex, tabIndex, title, url] = line.split("\t");
      return {
        windowIndex: Number(windowIndex),
        tabIndex: Number(tabIndex),
        title,
        url,
        isThreads: /^https:\/\/www\.threads\.com\/?/.test(url ?? "")
      };
    })
    : [];
  return {
    ok: result.ok,
    error: result.ok ? null : result.error,
    stderr: result.stderr,
    tabs
  };
}

function parseChromeCommand(command) {
  const userDataDir = command.match(/--user-data-dir=(?:"([^"]+)"|(\S+))/)?.[1] ??
    command.match(/--user-data-dir=(?:"([^"]+)"|(\S+))/)?.[2] ??
    null;
  const profileDirectory = command.match(/--profile-directory=(?:"([^"]+)"|(\S+))/)?.[1] ??
    command.match(/--profile-directory=(?:"([^"]+)"|(\S+))/)?.[2] ??
    null;
  const remoteDebuggingPort = command.match(/--remote-debugging-port=(\d+)/)?.[1] ?? null;
  return {
    userDataDir,
    profileDirectory,
    remoteDebuggingPort: remoteDebuggingPort ? Number(remoteDebuggingPort) : null,
    hasRemoteDebuggingPipe: command.includes("--remote-debugging-pipe"),
    hasDisableExtensions: command.includes("--disable-extensions"),
    hasEnableAutomation: command.includes("--enable-automation"),
    isDevtoolsMcpProfile: userDataDir?.includes(".cache/chrome-devtools-mcp") ?? false,
    isUserChromeProfile: !userDataDir || userDataDir.includes("Library/Application Support/Google/Chrome")
  };
}

async function listChromeBrowserProcesses() {
  if (platform() !== "darwin") {
    return { ok: false, error: "Chrome process inspection is only implemented for macOS.", processes: [] };
  }
  const result = await runCommand("ps", ["-axo", "pid=,command="], { timeoutMs: 5000, maxBuffer: 2 * 1024 * 1024 });
  if (!result.ok) {
    return { ok: false, error: result.error, processes: [] };
  }
  const processes = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/);
      if (!match) return null;
      return { pid: Number(match[1]), command: match[2] };
    })
    .filter(Boolean)
    .filter((entry) => entry.command.startsWith("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"))
    .map((entry) => {
      const parsed = parseChromeCommand(entry.command);
      return {
        pid: entry.pid,
        commandPath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        ...parsed,
        argumentSummary: {
          aboutBlank: entry.command.includes("about:blank"),
          noFirstRun: entry.command.includes("--no-first-run"),
          disableSync: entry.command.includes("--disable-sync")
        }
      };
    });
  return {
    ok: true,
    processes,
    boundary: {
      hasDevtoolsMcpChrome: processes.some((processInfo) => processInfo.isDevtoolsMcpProfile),
      hasUserChrome: processes.some((processInfo) => processInfo.isUserChromeProfile && !processInfo.isDevtoolsMcpProfile),
      userChromeHasRemoteDebugging: processes.some((processInfo) =>
        processInfo.isUserChromeProfile &&
        !processInfo.isDevtoolsMcpProfile &&
        (processInfo.hasRemoteDebuggingPipe || processInfo.remoteDebuggingPort != null)
      )
    }
  };
}

async function probeCdpPorts() {
  const ports = [9222, 9223, 9224, 9333, 9444, 9515];
  const results = [];
  for (const port of ports) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 750);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: controller.signal });
      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      results.push({
        port,
        ok: response.ok,
        httpStatus: response.status,
        browser: json?.Browser ?? null,
        webSocketDebuggerUrl: json?.webSocketDebuggerUrl ? "[present]" : null
      });
    } catch (error) {
      results.push({
        port,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      clearTimeout(timer);
    }
  }
  return results;
}

async function fetchBackendStatus(backendUrl) {
  const statusUrl = new URL("/worker/status", backendUrl).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(statusUrl, { signal: controller.signal });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return {
      ok: response.ok,
      statusUrl,
      httpStatus: response.status,
      bodyText: text.slice(0, 2000),
      bodyJson: json
    };
  } catch (error) {
    return {
      ok: false,
      statusUrl,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timer);
  }
}

async function readBuildManifest() {
  const manifestPath = path.resolve("output/chrome-mv3/manifest.json");
  if (!(await pathExists(manifestPath))) {
    return { exists: false, manifestPath };
  }
  try {
    const manifest = await readJson(manifestPath);
    return {
      exists: true,
      manifestPath,
      name: manifest.name,
      version: manifest.version,
      manifestVersion: manifest.manifest_version
    };
  } catch (error) {
    return {
      exists: true,
      manifestPath,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function collectCodePathHints() {
  const files = [
    "entrypoints/threads.content.ts",
    "src/ui/useInPageCollectorAppState.ts",
    "entrypoints/background.ts",
    "src/state/store-helpers.ts",
    "src/ui/ProductSignalViews.tsx"
  ];
  const hints = {};
  for (const file of files) {
    const text = await readFile(file, "utf8");
    const lines = text.split("\n");
    hints[file] = [];
    lines.forEach((line, index) => {
      if (
        line.includes("event.preventDefault()") ||
        line.includes("event.stopPropagation()") ||
        line.includes("product/analyze-signals") ||
        line.includes("lastError") ||
        line.includes("relevance {score}/5") ||
        line.includes("collected posts") ||
        line.includes("Keep as observation") ||
        line.includes("function formatSubtype")
      ) {
        hints[file].push({
          line: index + 1,
          text: line.trim()
        });
      }
    });
  }
  return hints;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const localStatePath = path.join(args.chromeBase, "Local State");
  const localState = await readJson(localStatePath);
  const profileInfo = localState.profile?.info_cache?.[args.profileDirectory] ?? null;
  const profileRoot = path.join(args.chromeBase, args.profileDirectory);

  const evidence = {
    generatedAt: new Date().toISOString(),
    cwd: process.cwd(),
    chrome: {
      chromeBase: args.chromeBase,
      localStatePath,
      profileDirectory: args.profileDirectory,
      profileInfo,
      cookies: {
        profileRoot: await queryCookieHosts(path.join(profileRoot, "Cookies")),
        network: await queryCookieHosts(path.join(profileRoot, "Network", "Cookies"))
      },
      tabs: await listChromeTabs(),
      processes: await listChromeBrowserProcesses(),
      cdpPorts: await probeCdpPorts()
    },
    backend: await fetchBackendStatus(args.backendUrl),
    build: await readBuildManifest(),
    codePathHints: await collectCodePathHints()
  };

  const output = `${JSON.stringify(evidence, null, 2)}\n`;
  if (args.out) {
    const outPath = path.resolve(args.out);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, output, "utf8");
    console.log(outPath);
  } else {
    process.stdout.write(output);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
