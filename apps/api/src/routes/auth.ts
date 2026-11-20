import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { tx, type Pool } from "@hampath/db";
import {
  HttpError,
  MAGIC_LINK_MINUTES,
  accountForVerifiedEmail,
  cookieOptions,
  createGuest,
  endSession,
  getUserById,
  randomToken,
  requireUser,
  safeRedirect,
  sha256,
  startSession,
  userFromRequest,
} from "../auth.ts";
import { env, googleEnabled } from "../env.ts";
import { magicLinkMail, sendMail } from "../mailer.ts";

const OAUTH_COOKIE = "hp_oauth";
const MAX_LINKS_PER_HOUR = 5;

const Token = z.string().min(20).max(200);
const VerifyBody = z.strictObject({ token: Token });
const GoogleCallbackQuery = z.object({
  code: z.string().max(2048).optional(),
  state: z.string().max(200).optional(),
  error: z.string().max(200).optional(),
});

const MagicLinkBody = z.strictObject({
  email: z
    .email()
    .max(254)
    .transform((e) => e.trim().toLowerCase()),
  redirect: z.string().max(500).optional(),
});

/** Amateur call signs: 1–3 char prefix containing a letter, one digit, 1–4 letter suffix (VA3RAC, VE7XYZ, K1ABC). */
export const CALL_SIGN_RE = /^(?=[A-Z0-9]{0,2}[A-Z])[A-Z0-9]{1,3}[0-9][A-Z]{1,4}$/;

const ProfileBody = z
  .strictObject({
    display_name: z.string().trim().min(1).max(60).nullable().optional(),
    call_sign: z
      .string()
      .trim()
      .transform((s) => s.toUpperCase())
      .refine((s) => s === "" || CALL_SIGN_RE.test(s), "Not a valid amateur call sign (e.g. VA3RAC)")
      .transform((s) => (s === "" ? null : s))
      .nullable()
      .optional(),
    locale: z.enum(["en", "fr"]).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "Nothing to update");

export function authRoutes(app: FastifyInstance, pool: Pool) {
  app.get("/auth/providers", async () => ({ magicLink: true, google: googleEnabled() }));

  app.post("/auth/guest", async (req, reply) => {
    const existing = await userFromRequest(pool, req);
    if (existing) return { user: existing };
    const user = await createGuest(pool);
    await startSession(pool, req, reply, user.id);
    return { user };
  });

  app.post("/auth/logout", async (req, reply) => {
    await endSession(pool, req, reply);
    return { ok: true };
  });

  /** E-mail a single-use sign-in link. Always 202, so the response never reveals whether an account exists. */
  app.post("/auth/magic-link", async (req, reply) => {
    const body = MagicLinkBody.parse(req.body);
    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM auth_token WHERE email = $1 AND created_at > now() - interval '1 hour'`,
      [body.email],
    );
    if ((rows[0]?.n ?? 0) >= MAX_LINKS_PER_HOUR)
      throw new HttpError(429, "Too many sign-in links requested. Try again later.");
    const token = randomToken();
    await pool.query(
      `INSERT INTO auth_token (token_hash, email, redirect_to, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
      [sha256(token), body.email, safeRedirect(body.redirect), MAGIC_LINK_MINUTES],
    );
    // The link opens a confirm page; only its POST signs in. Mail scanners that fetch links (and
    // anyone who sends a victim a link) can't consume the token or plant a session with a GET.
    // The token rides in the URL fragment, which browsers never send to a server, so it stays out
    // of proxy and access logs.
    const link = `${env.appOrigin}/sign-in/confirm#token=${token}`;
    await sendMail(magicLinkMail(body.email, link, MAGIC_LINK_MINUTES));
    return reply.status(202).send({ sent: true });
  });

  /** Links from older e-mails pointed here: send them to the confirm page without using the token. */
  app.get<{ Querystring: { token?: string } }>("/auth/magic-link/verify", async (req, reply) => {
    const token = Token.safeParse(req.query.token);
    if (!token.success) return reply.redirect("/sign-in?error=expired", 303);
    return reply.redirect(`/sign-in/confirm#token=${encodeURIComponent(token.data)}`, 303);
  });

  /** Use a sign-in link (POSTed by the confirm page). */
  app.post("/auth/magic-link/verify", async (req, reply) => {
    const { token } = VerifyBody.parse(req.body);
    const current = await userFromRequest(pool, req);
    const userId = await tx(pool, async (c) => {
      const { rows } = await c.query<{ email: string; redirect_to: string | null }>(
        `UPDATE auth_token SET used_at = now()
          WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
          RETURNING email, redirect_to`,
        [sha256(token)],
      );
      const t = rows[0];
      if (!t) return null;
      return { id: await accountForVerifiedEmail(c, t.email, current), redirect: t.redirect_to };
    });
    if (!userId) throw new HttpError(410, "This sign-in link has expired or was already used. Ask for a new one.");
    await startSession(pool, req, reply, userId.id);
    return { redirect: safeRedirect(userId.redirect) };
  });

  // ---- Google (OpenID Connect, authorization code + PKCE) --------------------------------
  const redirectUri = () => `${env.appOrigin}/api/v1/auth/google/callback`;

  app.get<{ Querystring: { redirect?: string } }>("/auth/google/start", async (req, reply) => {
    if (!googleEnabled()) throw new HttpError(404, "Google sign-in is not configured");
    const state = randomToken();
    const verifier = randomToken();
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    reply.setCookie(OAUTH_COOKIE, JSON.stringify({ state, verifier, redirect: safeRedirect(req.query.redirect) }), {
      ...cookieOptions(new Date(Date.now() + 10 * 60_000)),
      path: "/api/v1/auth/google",
    });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: env.google.clientId,
      redirect_uri: redirectUri(),
      response_type: "code",
      scope: "openid email profile",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return reply.redirect(url.toString(), 302);
  });

  app.get("/auth/google/callback", async (req, reply) => {
    if (!googleEnabled()) throw new HttpError(404, "Google sign-in is not configured");
    const q = GoogleCallbackQuery.safeParse(req.query);
    if (!q.success) return reply.redirect("/sign-in?error=google", 303);
    const query = q.data;
    let saved: { state: string; verifier: string; redirect: string } | null = null;
    try {
      saved = JSON.parse(req.cookies[OAUTH_COOKIE] ?? "null");
    } catch {
      saved = null;
    }
    reply.clearCookie(OAUTH_COOKIE, { path: "/api/v1/auth/google" });
    if (query.error || !query.code || !saved || saved.state !== query.state) {
      return reply.redirect("/sign-in?error=google", 303);
    }
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: query.code,
        client_id: env.google.clientId,
        client_secret: env.google.clientSecret,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
        code_verifier: saved.verifier,
      }),
    });
    if (!tokenRes.ok) return reply.redirect("/sign-in?error=google", 303);
    const { access_token } = (await tokenRes.json()) as { access_token?: string };
    const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${access_token}` },
    });
    const info = (await infoRes.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string };
    if (!infoRes.ok || !info.sub || !info.email || !info.email_verified)
      return reply.redirect("/sign-in?error=google", 303);

    const current = await userFromRequest(pool, req);
    const userId = await tx(pool, async (c) => {
      const linked = await c.query<{ user_id: string }>(
        `SELECT user_id FROM oauth_account WHERE provider = 'google' AND provider_user_id = $1`,
        [info.sub],
      );
      if (linked.rows[0]) return linked.rows[0].user_id;
      const id = await accountForVerifiedEmail(c, info.email!.toLowerCase(), current, info.name ?? null);
      await c.query(
        `INSERT INTO oauth_account (provider, provider_user_id, user_id, email) VALUES ('google', $1, $2, $3)`,
        [info.sub, id, info.email],
      );
      return id;
    });
    await startSession(pool, req, reply, userId);
    return reply.redirect(safeRedirect(saved.redirect), 303);
  });

  // ---- Profile -----------------------------------------------------------------------------
  app.get("/me", async (req) => ({ user: await requireUser(pool, req) }));

  app.patch("/me", async (req) => {
    const user = await requireUser(pool, req);
    const body = ProfileBody.parse(req.body);
    const sets: string[] = [];
    const vals: unknown[] = [user.id];
    const col = { display_name: "display_name", call_sign: "call_sign", locale: "locale" } as const;
    for (const k of Object.keys(col) as (keyof typeof col)[]) {
      if (body[k] !== undefined) {
        vals.push(body[k]);
        sets.push(`${col[k]} = $${vals.length}`);
      }
    }
    await pool.query(`UPDATE "user" SET ${sets.join(", ")} WHERE id = $1`, vals);
    return { user: await getUserById(pool, user.id) };
  });
}
