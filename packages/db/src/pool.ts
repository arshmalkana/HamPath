import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.ts";

export type Pool = pg.Pool;
export type Client = pg.PoolClient;

export const DEFAULT_DATABASE_URL = "postgres://hampath:hampath@127.0.0.1:5433/hampath";
export const databaseUrl = () => process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

export function createPool(url = databaseUrl()): pg.Pool {
  return new pg.Pool({ connectionString: url, max: 10 });
}

/** Typed Drizzle handle over a pool (used for simple reads/writes; complex reporting stays in SQL). */
export function createDb(pool: pg.Pool) {
  return drizzle(pool, { schema, casing: "snake_case" });
}
export type Db = ReturnType<typeof createDb>;

/** Run `fn` in a transaction; rolls back on throw. */
export async function tx<T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

/** Thrown inside tx() to roll back (a dry run) while still returning a result. */
export class DryRunRollback<T> extends Error {
  constructor(public readonly result: T) {
    super("dry run");
  }
}
