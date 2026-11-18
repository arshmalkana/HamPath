import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

export const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? "postgres://hampath:hampath@127.0.0.1:5433/hampath_test";
