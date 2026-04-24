import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const wxtBin = path.join(rootDir, "node_modules", "wxt", "bin", "wxt.mjs");
const hiddenOutDir = path.join(rootDir, ".output", "chrome-mv3");
const visibleOutDir = path.join(rootDir, "output", "chrome-mv3");

execFileSync(process.execPath, [wxtBin, "build"], {
  cwd: rootDir,
  stdio: "inherit"
});

if (!existsSync(hiddenOutDir)) {
  throw new Error(`Expected WXT build output at ${hiddenOutDir}`);
}

mkdirSync(path.dirname(visibleOutDir), { recursive: true });
rmSync(visibleOutDir, { recursive: true, force: true });
cpSync(hiddenOutDir, visibleOutDir, { recursive: true });

console.log(`Mirrored unpacked extension to ${visibleOutDir}`);
