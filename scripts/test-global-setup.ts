/**
 * Vitest global setup: build a fresh test database (DATABASE_URL_TEST, default hampath_test on the
 * docker compose Postgres), run migrations, seed, import the bank and load content. Every run
 * starts from the same state; the dev database is never touched.
 */
import { readFileSync } from "node:fs";
import pg from "pg";
import { BANK_PATH } from "@hampath/content";
import { createPool, importBank, loadContent, migrate, seed } from "@hampath/db";
import { TEST_DATABASE_URL } from "./test-env.ts";

export default async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);
  if (!/_test$/.test(dbName)) throw new Error(`Refusing to recreate '${dbName}': test database names must end in _test`);

  const admin = new pg.Client({ connectionString: Object.assign(new URL(url), { pathname: "/postgres" }).toString() });
  try {
    await admin.connect();
  } catch (e) {
    throw new Error(`Cannot reach Postgres for tests at ${url.host}. Start it with: pnpm db:up\n${(e as Error).message}`);
  }
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const pool = createPool(TEST_DATABASE_URL);
  try {
    await migrate(pool);
    await seed(pool);
    await importBank(pool, readFileSync(BANK_PATH), { sourceFile: "content/bank/amat_basic_quest_delim.txt" });
    await loadContent(pool);
  } finally {
    await pool.end();
  }
}
