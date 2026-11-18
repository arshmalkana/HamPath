/** Validate content/ and load it into PostgreSQL (after db:import-bank). */
import "../index.ts";
import { createPool } from "../pool.ts";
import { ContentInvalidError, loadContent } from "../import/content.ts";

const pool = createPool();
try {
  const r = await loadContent(pool);
  console.log(`Loaded ${r.lessons.length} authored lesson(s); ${r.stubs} minimal lesson(s) (intro + Check)`);
  for (const l of r.lessons) {
    console.log(`  ${l.code}: ${l.cards} cards, ${l.labSteps} lab steps, ${l.whyNot} Why not? notes`);
  }
} catch (e) {
  if (e instanceof ContentInvalidError) {
    console.error(e.errors.map((x) => `error: ${x}`).join("\n"));
    process.exitCode = 1;
  } else throw e;
} finally {
  await pool.end();
}
