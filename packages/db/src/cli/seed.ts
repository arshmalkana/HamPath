/** Seed sections, labs and lessons (titles and labs from docs/coverage/section-*.md). */
import "../index.ts";
import { createPool } from "../pool.ts";
import { seed } from "../seed.ts";

const pool = createPool();
try {
  const r = await seed(pool);
  console.log(`Seeded ${r.sections} sections, ${r.lessons} lessons, ${r.labs} labs`);
} finally {
  await pool.end();
}
