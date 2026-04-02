import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const envDir = process.env.DLENS_INGEST_CORE_DIR?.trim();
const candidates = [
  envDir || null,
  path.resolve(repoRoot, "..", "dlens-ingest-core")
].filter(Boolean);

const found = candidates.find((candidate) => {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
});

if (found) {
  console.log(`ingest-core checkout found: ${found}`);
  console.log("Full pipeline dev is available if that backend is configured and running.");
  process.exit(0);
}

console.log("Full pipeline unavailable: no local ingest-core checkout was found.");
console.log("Extension-only dev still works: typecheck, tests, build, compare UI, and summary work without the backend checkout.");
console.log("To enable full pipeline dev, set DLENS_INGEST_CORE_DIR or place the backend checkout at ../dlens-ingest-core.");
