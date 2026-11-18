import { existsSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@hampath/content";
import * as schema from "./schema.ts";

const envFile = path.join(REPO_ROOT, ".env");
if (existsSync(envFile) && !process.env.HAMPATH_ENV_LOADED) {
  process.loadEnvFile(envFile);
  process.env.HAMPATH_ENV_LOADED = "1";
}

export { schema };
export * from "./import/bank.ts";
export * from "./import/content.ts";
export * from "./seed.ts";

export * from "./pool.ts";
export { migrate } from "./migrate.ts";
