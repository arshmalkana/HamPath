// Launch Vitest from a cwd with an upper-case drive letter. On Windows, "c:\..." vs "C:\..."
// makes Vitest load two copies of itself ("Vitest failed to find the current suite").
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const fix = (p) => p.replace(/^[a-z]:/, (d) => d.toUpperCase());
const root = fix(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const bin = path.join(root, "node_modules", "vitest", "vitest.mjs");
const r = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { cwd: root, stdio: "inherit" });
process.exit(r.status ?? 1);
