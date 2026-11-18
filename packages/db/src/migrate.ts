import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate as drizzleMigrate } from "drizzle-orm/node-postgres/migrator";
import type pg from "pg";

export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

/** Apply pending SQL migrations from packages/db/migrations (tracked in drizzle.__drizzle_migrations). */
export async function migrate(pool: pg.Pool): Promise<void> {
  await drizzleMigrate(drizzle(pool), { migrationsFolder: MIGRATIONS_DIR });
}
