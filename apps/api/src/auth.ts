import { createHash, randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Client, Pool } from "@hampath/db";
import { env } from "./env.ts";

export const SESSION_COOKIE = "hp_session";
const SESSION_DAYS = 180;
export const MAGIC_LINK_MINUTES = 15;

export type Role = "learner" | "instructor" | "admin";

export interface SessionUser {
  id: string;
  email: string | null;
  displayName: string | null;
  callSign: string | null;
  locale: "en" | "fr";
  role: Role;
  isGuest: boolean;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = () => randomBytes(32).toString("base64url");

const USER_COLUMNS = `u.id, u.email, u.display_name AS "displayName", u.call_sign AS "callSign", u.locale, u.role,
  u.is_guest AS "isGuest"`;

export async function userFromRequest(pool: Pool, req: FastifyRequest): Promise<SessionUser | null> {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) return null;
  const { rows } = await pool.query<SessionUser>(
    `SELECT ${USER_COLUMNS} FROM session s JOIN "user" u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token)],
  );
  return rows[0] ?? null;
}

export async function getUserById(db: Pool | Client, id: string): Promise<SessionUser> {
  const { rows } = await db.query<SessionUser>(`SELECT ${USER_COLUMNS} FROM "user" u WHERE u.id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, "No such user");
  return rows[0];
}

export const cookieOptions = (expires?: Date) => ({
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.production,
  ...(expires ? { expires } : {}),
});

/** Start a fresh session (the old one, if any, is revoked: no session fixation). */
export async function startSession(pool: Pool, req: FastifyRequest, reply: FastifyReply, userId: string) {
  const old = req.cookies[SESSION_COOKIE];
  if (old) await pool.query("DELETE FROM session WHERE token_hash = $1", [sha256(old)]);
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await pool.query("INSERT INTO session (token_hash, user_id, expires_at) VALUES ($1,$2,$3)", [
    sha256(token),
    userId,
    expires,
  ]);
  reply.setCookie(SESSION_COOKIE, token, cookieOptions(expires));
}

export async function endSession(pool: Pool, req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies[SESSION_COOKIE];
  if (token) await pool.query("DELETE FROM session WHERE token_hash = $1", [sha256(token)]);
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

/** An anonymous learner bound to this browser, so progress is server-side before sign-in. */
export async function createGuest(pool: Pool): Promise<SessionUser> {
  const { rows } = await pool.query<{ id: string }>(`INSERT INTO "user" (is_guest) VALUES (true) RETURNING id`);
  return getUserById(pool, rows[0]!.id);
}

/**
 * Resolve the account for a verified e-mail address at sign-in:
 *  1. an account with that e-mail → that account;
 *  2. else, if this browser has a guest session → the guest becomes the account (progress kept);
 *  3. else → a new account.
 * (A guest signing in to an existing account keeps that account's progress; merging two
 * learners' histories is a Phase 1 item, because attempts are append-only.)
 */
export async function accountForVerifiedEmail(
  c: Client,
  email: string,
  current: SessionUser | null,
  displayName?: string | null,
): Promise<string> {
  const existing = await c.query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [email]);
  if (existing.rows[0]) {
    await c.query(`UPDATE "user" SET email_verified_at = coalesce(email_verified_at, now()) WHERE id = $1`, [
      existing.rows[0].id,
    ]);
    return existing.rows[0].id;
  }
  if (current?.isGuest) {
    await c.query(
      `UPDATE "user" SET email = $2, email_verified_at = now(), is_guest = false,
              display_name = coalesce(display_name, $3) WHERE id = $1`,
      [current.id, email, displayName ?? null],
    );
    return current.id;
  }
  const { rows } = await c.query<{ id: string }>(
    `INSERT INTO "user" (email, email_verified_at, display_name) VALUES ($1, now(), $2) RETURNING id`,
    [email, displayName ?? null],
  );
  return rows[0]!.id;
}

export async function requireUser(pool: Pool, req: FastifyRequest): Promise<SessionUser> {
  const u = await userFromRequest(pool, req);
  if (!u) throw new HttpError(401, "Not signed in. POST /api/v1/auth/guest or sign in.");
  return u;
}

export async function requireRole(pool: Pool, req: FastifyRequest, ...roles: Role[]): Promise<SessionUser> {
  const u = await requireUser(pool, req);
  if (u.isGuest || !roles.includes(u.role)) throw new HttpError(403, `Requires role: ${roles.join(" or ")}`);
  return u;
}

/** Only same-site relative paths are allowed as post-sign-in redirects (no open redirect). */
export function safeRedirect(path: unknown): string {
  return typeof path === "string" && /^\/(?!\/)[\w\-./?=&%#]*$/.test(path) ? path : "/";
}
