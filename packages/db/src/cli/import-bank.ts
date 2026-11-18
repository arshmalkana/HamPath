/**
 * Import the ISED question bank.
 *   pnpm import:bank                       # content/bank/amat_basic_quest_delim.txt
 *   pnpm import:bank -- path/to/file.txt   # a new ISED release
 *   pnpm import:bank -- --dry-run          # preview the diff, change nothing
 */
import "../index.ts";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BANK_PATH, REPO_ROOT } from "@hampath/content";
import { createPool } from "../pool.ts";
import { BankParseError, importBank } from "../import/bank.ts";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const file = path.resolve(args.find((a) => !a.startsWith("--")) ?? BANK_PATH);
const pool = createPool();

try {
  const diff = await importBank(pool, readFileSync(file), {
    sourceFile: path.relative(REPO_ROOT, file).replaceAll("\\", "/"),
    dryRun,
  });
  const head = dryRun ? "Dry run (nothing written)" : `Imported as bank_version ${diff.bankVersion}`;
  console.log(`${head}: ${diff.questionCount} questions, sha256 ${diff.sha256.slice(0, 12)}…`);
  console.log(`  added ${diff.added.length} · changed ${diff.changed.length} · retired ${diff.retired.length} · unchanged ${diff.unchanged}`);
  for (const c of diff.changed.slice(0, 20)) console.log(`  changed ${c.id}: ${c.fields.join(", ")}`);
  for (const r of diff.retired.slice(0, 20)) console.log(`  retired ${r}`);
  if (diff.lessonsNeedingReview.length) {
    console.log(`  lessons flagged for card review: ${diff.lessonsNeedingReview.join(", ")}`);
  }
} catch (e) {
  if (e instanceof BankParseError) {
    console.error(e.errors.join("\n"));
    process.exitCode = 1;
  } else throw e;
} finally {
  await pool.end();
}
