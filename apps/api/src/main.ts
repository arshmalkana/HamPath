import { createPool } from "@hampath/db";
import { buildApp } from "./app.ts";
import { env } from "./env.ts";

const pool = createPool();
const app = await buildApp(pool, { logger: true });
await app.listen({ port: env.port, host: "127.0.0.1" });

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
