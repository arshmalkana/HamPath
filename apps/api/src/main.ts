import { createPool, type Pool } from "@hampath/db";
import { buildApp } from "./app.ts";
import { env } from "./env.ts";
import { initMonitoring } from "./monitoring.ts";

initMonitoring();

const pool = createPool();
const app = await buildApp(pool, { logger: true });
// 127.0.0.1 in development; 0.0.0.0 inside the container (only the web container can reach it).
await app.listen({ port: env.port, host: process.env.API_HOST ?? "127.0.0.1" });

/** Expired sessions and used or stale sign-in tokens serve no purpose; don't keep them. */
async function purgeExpired(db: Pool) {
  try {
    const s = await db.query("DELETE FROM session WHERE expires_at < now()");
    const t = await db.query("DELETE FROM auth_token WHERE expires_at < now() - interval '1 day'");
    if (s.rowCount || t.rowCount)
      app.log.info({ sessions: s.rowCount, tokens: t.rowCount }, "purged expired credentials");
  } catch (e) {
    app.log.error(e, "purge failed");
  }
}
void purgeExpired(pool);
const purge = setInterval(() => void purgeExpired(pool), 6 * 3600_000);
purge.unref();

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    clearInterval(purge);
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
