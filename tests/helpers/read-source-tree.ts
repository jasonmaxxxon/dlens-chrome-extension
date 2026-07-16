import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export type SourceFileEntry = {
  relativePath: string;
  source: string;
};

/**
 * Recursively walks `root`, reading every .ts/.tsx file into memory.
 * `relativePath` always uses forward slashes and is relative to `root`,
 * regardless of platform path separators.
 */
export function readSourceTree(root: URL): SourceFileEntry[] {
  const rootPath = fileURLToPath(root);
  const entries: SourceFileEntry[] = [];

  function walk(dirPath: string, relativeDir: string): void {
    for (const dirent of readdirSync(dirPath, { withFileTypes: true })) {
      const entryPath = join(dirPath, dirent.name);
      const relativePath = relativeDir ? `${relativeDir}/${dirent.name}` : dirent.name;

      if (dirent.isDirectory()) {
        walk(entryPath, relativePath);
        continue;
      }

      if (dirent.isFile() && /\.(ts|tsx)$/.test(dirent.name)) {
        entries.push({ relativePath, source: readFileSync(entryPath, "utf8") });
      }
    }
  }

  walk(rootPath, "");

  return entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
