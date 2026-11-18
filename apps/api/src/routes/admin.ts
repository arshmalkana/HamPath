import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { BankParseError, importBank, type Pool } from "@hampath/db";
import { HttpError, userFromRequest } from "../auth.ts";
import { env } from "../env.ts";

/** An admin session, or the x-admin-token header for scripts/CI. */
async function requireAdmin(pool: Pool, req: FastifyRequest) {
  const user = await userFromRequest(pool, req);
  if (user && !user.isGuest && user.role === "admin") return;
  const given = String(req.headers["x-admin-token"] ?? "");
  const want = env.adminToken;
  const usable = want.length >= 16 && !(env.production && want.startsWith("change-me"));
  const ok = usable && given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want));
  if (!ok) throw new HttpError(403, "Admin role or x-admin-token required");
}

export function adminRoutes(app: FastifyInstance, pool: Pool) {
  /**
   * Import a new ISED bank file (body: the raw semicolon-delimited text, Content-Type text/plain)
   * and return the diff against the current version. ?dry_run=true previews without writing.
   */
  app.post<{ Querystring: { dry_run?: string; source?: string } }>(
    "/admin/import-bank",
    { bodyLimit: 10 * 1024 * 1024 },
    async (req) => {
      await requireAdmin(pool, req);
      if (typeof req.body !== "string" || req.body.length === 0) {
        throw new HttpError(400, "Send the bank file as the text/plain request body");
      }
      try {
        return await importBank(pool, req.body, {
          sourceFile: req.query.source ?? "upload",
          dryRun: req.query.dry_run === "true",
        });
      } catch (e) {
        if (e instanceof BankParseError) throw new HttpError(422, e.message, { errors: e.errors });
        throw e;
      }
    },
  );
}
