/** Apply pending migrations from packages/db/migrations. */
import "../index.ts";
import { migrate } from "../migrate.ts";
import { createPool, databaseUrl } from "../pool.ts";

const pool = createPool();
try {
  await migrate(pool);
  console.log(`Migrations applied to ${databaseUrl().replace(/\/\/[^@]*@/, "//***@")}`);
} finally {
  await pool.end();
}
