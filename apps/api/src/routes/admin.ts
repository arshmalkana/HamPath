import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { lessonCode } from "@hampath/content";
import { BankParseError, importBank, type Pool } from "@hampath/db";
import { HttpError, userFromRequest } from "../auth.ts";
import { env } from "../env.ts";

/** An admin session, or the x-admin-token header for scripts/CI. Returns the admin, or null for the token. */
export async function requireAdmin(pool: Pool, req: FastifyRequest): Promise<{ id: string } | null> {
  const user = await userFromRequest(pool, req);
  if (user && !user.isGuest && user.role === "admin") return user;
  const given = String(req.headers["x-admin-token"] ?? "");
  const want = env.adminToken;
  const usable = want.length >= 16 && !(env.production && want.startsWith("change-me"));
  const ok = usable && given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want));
  if (!ok) throw new HttpError(403, "Admin role or x-admin-token required");
  return null;
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

  /**
   * Every bank version, newest first, with how many attempts were answered against its options.
   * Options are never edited (a changed one is retired and re-inserted), so each attempt stays tied
   * to the exact wording, and bank version, the learner saw.
   */
  app.get("/admin/bank-versions", async (req) => {
    await requireAdmin(pool, req);
    const { rows } = await pool.query(
      `SELECT bv.id, bv.source_file AS "sourceFile", bv.imported_at AS "importedAt", bv.question_count AS "questionCount",
              bv.added, bv.changed, bv.retired, coalesce(a.n, 0)::int AS attempts
         FROM bank_version bv
         LEFT JOIN (SELECT o.bank_version, count(*) AS n FROM attempt t JOIN option o ON o.id = t.option_id GROUP BY o.bank_version) a
           ON a.bank_version = bv.id
        ORDER BY bv.id DESC`,
    );
    return { versions: rows };
  });

  /** Lessons whose cards need a look after an import (open ones first). */
  app.get("/admin/card-reviews", async (req) => {
    await requireAdmin(pool, req);
    const { rows } = await pool.query<{
      id: number;
      lesson_id: string;
      title: string;
      bank_version: number;
      questions: { id: string; fields: string[] }[];
      created_at: Date;
      resolved_at: Date | null;
    }>(
      `SELECT r.id, r.lesson_id, l.title, r.bank_version, r.questions, r.created_at, r.resolved_at
         FROM card_review r JOIN lesson l ON l.id = r.lesson_id
        ORDER BY r.resolved_at IS NOT NULL, r.created_at DESC LIMIT 200`,
    );
    return {
      reviews: rows.map((r) => ({
        id: r.id,
        lessonId: r.lesson_id,
        code: lessonCode(r.lesson_id),
        title: r.title,
        bankVersion: r.bank_version,
        questions: r.questions,
        createdAt: r.created_at,
        resolvedAt: r.resolved_at,
      })),
    };
  });

  app.post<{ Params: { id: string } }>("/admin/card-reviews/:id/resolve", async (req) => {
    const admin = await requireAdmin(pool, req);
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { rows } = await pool.query<{ lesson_id: string }>(
      "UPDATE card_review SET resolved_at = now(), resolved_by = $2 WHERE id = $1 AND resolved_at IS NULL RETURNING lesson_id",
      [id, admin?.id ?? null],
    );
    if (!rows[0]) throw new HttpError(404, "No open review with that id");
    // The lesson is clear once none of its reviews is open.
    await pool.query(
      `UPDATE lesson SET needs_card_review = false WHERE id = $1
         AND NOT EXISTS (SELECT 1 FROM card_review WHERE lesson_id = $1 AND resolved_at IS NULL)`,
      [rows[0].lesson_id],
    );
    return { resolved: id };
  });
}
