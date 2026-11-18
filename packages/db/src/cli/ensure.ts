/**
 * Used by `pnpm dev`: migrate, and on an empty database run the full setup
 * (seed → import the bank → load content). Safe to run every time.
 */
import "../index.ts";
import { readFileSync } from "node:fs";
import { BANK_PATH } from "@hampath/content";
import { importBank } from "../import/bank.ts";
import { loadContent } from "../import/content.ts";
import { migrate } from "../migrate.ts";
import { createPool } from "../pool.ts";
import { seed } from "../seed.ts";

const pool = createPool();
try {
  await migrate(pool);
  const { rows } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM question");
  if (!rows[0]?.n) {
    console.log("Empty database: seeding, importing the bank and loading content…");
    const s = await seed(pool);
    const d = await importBank(pool, readFileSync(BANK_PATH), {
      sourceFile: "content/bank/amat_basic_quest_delim.txt",
    });
    const c = await loadContent(pool);
    console.log(`Ready: ${s.lessons} lessons, ${d.questionCount} questions, ${c.lessons.length} authored lesson(s)`);
  } else {
    // Content edits are picked up on every start.
    await seed(pool);
    await loadContent(pool);
    console.log("Database ready");
  }
} finally {
  await pool.end();
}
