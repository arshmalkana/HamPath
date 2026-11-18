/**
 * CI content check (SPEC §8). Exit code 1 on any error.
 *   pnpm check:content            # Phase 0/1: authored lessons must be complete
 *   pnpm check:content -- --strict  # launch gate: all 100 lessons, 100% coverage
 */
import { readFileSync } from "node:fs";
import { BANK_PATH, parseBank, readContentTree, validateContent } from "../index.ts";

const strict = process.argv.includes("--strict");
const bank = parseBank(readFileSync(BANK_PATH));
const tree = readContentTree();
const result = validateContent(bank, tree, { strict });
const t = result.totals;

console.log(`Bank: ${t.questions} questions in ${t.lessons} lessons (sha256 ${bank.sha256.slice(0, 12)}…)`);
console.log(`Authored lessons: ${t.authoredLessons}/${t.lessons}`);
console.log(`Taught on a card: ${t.taught}/${t.questions} · Why not? complete: ${t.whyNotComplete}/${t.questions}`);
const calcs = result.lessons.flatMap((l) => l.questions).filter((q) => q.calc === "verified").length;
console.log(`Calculations reproduced by ham-sim: ${calcs}`);
for (const w of result.warnings) console.log(`warning: ${w}`);
for (const e of result.errors) console.error(`error: ${e}`);
if (result.errors.length) {
  console.error(`\n✗ ${result.errors.length} content error(s)`);
  process.exit(1);
}
console.log("\n✓ content checks passed");
