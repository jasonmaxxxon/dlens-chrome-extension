#!/usr/bin/env node
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";

const BLOCK_SIZE = 32768;

function parseArgs(argv) {
  const result = {
    chromeBase: path.join(homedir(), "Library", "Application Support", "Google", "Chrome"),
    profileDirectory: "Default",
    extensionId: "hihgplinfhopjpjonkcdbbmkoklombkj",
    out: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--chrome-base") {
      result.chromeBase = argv[++index];
    } else if (arg === "--profile-directory") {
      result.profileDirectory = argv[++index];
    } else if (arg === "--extension-id") {
      result.extensionId = argv[++index];
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
  node scripts/qa-storage-probe.mjs --out docs/qa/assets/YYYY-MM-DD/runN/storage-probe.json

Options:
  --profile-directory <name>  Chrome profile directory. Default: Default
  --extension-id <id>         Extension id. Default: hihgplinfhopjpjonkcdbbmkoklombkj
  --chrome-base <path>        Chrome user-data root. Default: ~/Library/Application Support/Google/Chrome
  --out <path>                Write JSON evidence to this path. If omitted, prints JSON only.

This is read-only. It parses LevelDB write-ahead .log files, not compressed .ldb
SSTables, so it is a current-log probe rather than a complete chrome.storage
export.
`);
}

function* readPhysicalRecords(buffer) {
  let fragments = [];
  for (let blockStart = 0; blockStart < buffer.length; blockStart += BLOCK_SIZE) {
    let offset = blockStart;
    const blockEnd = Math.min(blockStart + BLOCK_SIZE, buffer.length);
    while (offset + 7 <= blockEnd) {
      const length = buffer.readUInt16LE(offset + 4);
      const type = buffer[offset + 6];
      offset += 7;
      if (length === 0 && type === 0) {
        break;
      }
      if (offset + length > blockEnd) {
        break;
      }
      const data = buffer.subarray(offset, offset + length);
      offset += length;
      if (type === 1) {
        yield data;
      } else if (type === 2) {
        fragments = [data];
      } else if (type === 3) {
        fragments.push(data);
      } else if (type === 4) {
        fragments.push(data);
        yield Buffer.concat(fragments);
        fragments = [];
      }
    }
  }
}

function readVarint32(buffer, offset) {
  let result = 0;
  let shift = 0;
  for (let index = offset; index < buffer.length && index < offset + 5; index += 1) {
    const byte = buffer[index];
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return [result, index + 1];
    }
    shift += 7;
  }
  return null;
}

function parseWriteBatch(buffer) {
  if (buffer.length < 12) {
    return [];
  }
  let offset = 12;
  const entries = [];
  while (offset < buffer.length) {
    const tag = buffer[offset];
    offset += 1;
    if (tag !== 0 && tag !== 1) {
      break;
    }
    const keyLength = readVarint32(buffer, offset);
    if (!keyLength) break;
    offset = keyLength[1];
    const key = buffer.subarray(offset, offset + keyLength[0]).toString("utf8");
    offset += keyLength[0];
    let value = null;
    if (tag === 1) {
      const valueLength = readVarint32(buffer, offset);
      if (!valueLength) break;
      offset = valueLength[1];
      value = buffer.subarray(offset, offset + valueLength[0]).toString("utf8");
      offset += valueLength[0];
    }
    entries.push({ tag: tag === 1 ? "put" : "delete", key, value });
  }
  return entries;
}

async function readLogEntries(storageDir) {
  const files = (await readdir(storageDir))
    .filter((file) => file.endsWith(".log"))
    .sort();
  const entries = [];
  for (const file of files) {
    const buffer = await readFile(path.join(storageDir, file));
    let recordCount = 0;
    for (const record of readPhysicalRecords(buffer)) {
      recordCount += 1;
      for (const entry of parseWriteBatch(record)) {
        if (entry.key.startsWith("dlens:")) {
          entries.push({ ...entry, file });
        }
      }
    }
    entries.push({ tag: "meta", key: `__log:${file}`, value: null, file, recordCount });
  }
  return entries;
}

function parseJsonValue(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function summarizeSession(session, activeSessionId) {
  const items = Array.isArray(session.items) ? session.items : [];
  const statuses = {};
  const backend = {
    withJobId: 0,
    withCaptureId: 0,
    withLastError: 0,
    withLatestCapture: 0
  };
  const recentItems = items.slice(-5).map((item) => ({
    id: item.id,
    status: item.status ?? null,
    source: item.source ?? null,
    title: item.descriptor?.text ? item.descriptor.text.slice(0, 80) : item.canonicalTargetUrl ?? null,
    selectedAt: item.selectedAt ?? null,
    savedAt: item.savedAt ?? null,
    queuedAt: item.queuedAt ?? null,
    completedAt: item.completedAt ?? null,
    jobId: item.jobId ?? null,
    captureId: item.captureId ?? null,
    lastErrorKind: item.lastErrorKind ?? null,
    lastError: item.lastError ? String(item.lastError).slice(0, 240) : null
  }));
  for (const item of items) {
    const status = item.status ?? "unknown";
    statuses[status] = (statuses[status] ?? 0) + 1;
    if (item.jobId) backend.withJobId += 1;
    if (item.captureId) backend.withCaptureId += 1;
    if (item.lastError) backend.withLastError += 1;
    if (item.latestCapture) backend.withLatestCapture += 1;
  }
  return {
    id: session.id,
    name: session.name,
    mode: session.mode,
    isActive: session.id === activeSessionId,
    topicId: session.topicId ?? null,
    items: items.length,
    statuses,
    backend,
    createdAt: session.createdAt ?? null,
    updatedAt: session.updatedAt ?? null,
    recentItems
  };
}

function summarizeTabUi(key, value) {
  return {
    key,
    popupOpen: value.popupOpen ?? null,
    currentMainPage: value.currentMainPage ?? null,
    popupPage: value.popupPage ?? null,
    selectionMode: value.selectionMode ?? null,
    collectModeBannerVisible: value.collectModeBannerVisible ?? null,
    activeItemId: value.activeItemId ?? null,
    activeSessionId: value.activeSessionId ?? null,
    activeFolderId: value.activeFolderId ?? null,
    currentPreviewUrl: value.currentPreview?.post_url ?? value.currentPreview?.url ?? null,
    hoveredTargetUrl: value.hoveredTarget?.post_url ?? value.hoveredTarget?.url ?? null,
    error: value.error ?? null
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const storageDir = path.join(
    args.chromeBase,
    args.profileDirectory,
    "Local Extension Settings",
    args.extensionId
  );
  const entries = await readLogEntries(storageDir);
  const latest = new Map();
  for (const entry of entries) {
    if (entry.tag === "put") {
      latest.set(entry.key, entry);
    } else if (entry.tag === "delete") {
      latest.delete(entry.key);
    }
  }
  const globalEntry = latest.get("dlens:v0:global-state") ?? null;
  const globalState = parseJsonValue(globalEntry?.value);
  const tabEntries = [...latest.entries()]
    .filter(([key]) => key.startsWith("dlens:v0:tab-ui:"))
    .map(([key, entry]) => ({ key, value: parseJsonValue(entry.value), file: entry.file }))
    .filter((entry) => entry.value);
  const sessions = Array.isArray(globalState?.sessions)
    ? globalState.sessions.map((session) => summarizeSession(session, globalState.activeSessionId))
    : [];
  const activeSession = sessions.find((session) => session.isActive) ?? null;
  const productLikeSessions = sessions.filter((session) =>
    session.mode === "product" || /product/i.test(session.name ?? "")
  );
  const evidence = {
    generatedAt: new Date().toISOString(),
    cwd: process.cwd(),
    type: "dlens-storage-log-probe",
    note: "Read-only LevelDB write-ahead log probe. It does not decode compressed .ldb SSTables and does not modify chrome.storage.",
    chrome: {
      profileDirectory: args.profileDirectory,
      extensionId: args.extensionId,
      storageDir
    },
    source: {
      logFiles: entries.filter((entry) => entry.tag === "meta").map((entry) => ({
        file: entry.file,
        recordCount: entry.recordCount
      })),
      dlensKeysInLatestLog: [...latest.keys()].sort()
    },
    globalState: globalState
      ? {
        activeSessionId: globalState.activeSessionId ?? null,
        settings: {
          ingestBaseUrl: globalState.settings?.ingestBaseUrl ?? null,
          aiProvider: globalState.settings?.aiProvider ?? globalState.settings?.provider ?? null,
          hasProductProfile: Boolean(globalState.settings?.productProfile)
        },
        sessions,
        activeSession,
        productLikeSessions
      }
      : null,
    tabUi: tabEntries.map((entry) => summarizeTabUi(entry.key, entry.value)),
    consistency: {
      activeSessionExists: Boolean(activeSession),
      productSessionCount: sessions.filter((session) => session.mode === "product").length,
      productNamedNonProductSessions: sessions
        .filter((session) => session.mode !== "product" && /product/i.test(session.name ?? ""))
        .map((session) => ({ id: session.id, name: session.name, mode: session.mode, items: session.items })),
      tabsWithSelectionMode: tabEntries
        .map((entry) => summarizeTabUi(entry.key, entry.value))
        .filter((tab) => tab.selectionMode || tab.collectModeBannerVisible)
    }
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
