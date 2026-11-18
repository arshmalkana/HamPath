// `pnpm dev`: start Postgres + Mailpit (Docker), migrate and (first run) seed/import/load the
// database, then run the API (:4000) and the web app (:3000) together. Ctrl+C stops both.
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url))).replace(/^[a-z]:/, (d) => d.toUpperCase());
const pnpm = process.env.npm_execpath; // the pnpm that launched us
const runPnpm = (args) => (pnpm ? [process.execPath, [pnpm, ...args]] : ["pnpm", args]);

function step(label, cmd, args) {
  console.log(`\n▸ ${label}`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" && cmd === "pnpm" });
  if (r.status !== 0) {
    console.error(`\n✗ ${label} failed.`);
    process.exit(r.status ?? 1);
  }
}

step("Starting Postgres and Mailpit (docker compose)", "docker", ["compose", "up", "-d", "--wait", "db", "mailpit"]);
step("Preparing the database", ...runPnpm(["--filter", "@hampath/db", "ensure"]));

console.log("\n▸ API on http://127.0.0.1:4000 · web on http://localhost:3000 · mail on http://localhost:8025\n");
const pnpmCmd = pnpm ? `"${process.execPath}" "${pnpm}"` : "pnpm";
const child = spawn(
  process.execPath,
  [
    path.join(root, "node_modules", "concurrently", "dist", "bin", "index.js"),
    "--names", "api,web", "--prefix-colors", "yellow,cyan", "--kill-others-on-fail",
    `${pnpmCmd} --filter @hampath/api dev`,
    `${pnpmCmd} --filter @hampath/web dev`,
  ],
  { cwd: root, stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
