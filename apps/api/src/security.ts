/**
 * Request-level protections for the API (see docs/SECURITY.md):
 *
 * - Rate limits per client IP: a global ceiling plus tighter limits on the routes worth abusing
 *   (sign-in links, guest accounts, answers, lab telemetry, class codes, live answers, bank imports).
 * - Cross-site write guard: a POST/PUT/PATCH/DELETE carrying an Origin (or Referer) from another
 *   site is refused, on top of the SameSite=Lax session cookie.
 * - Security headers on every API response, and no caching of personal JSON.
 */
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { SESSION_COOKIE, sha256 } from "./auth.ts";
import { env } from "./env.ts";

/**
 * Per-route limits: [max requests, window]. Routes that need no session (sign-in, guest accounts)
 * count per client IP; everything else counts per session where there is one, so a classroom
 * behind one school address isn't throttled as a single client.
 */
export const IP_ROUTES = new Set([
  "POST /api/v1/auth/magic-link",
  "POST /api/v1/auth/magic-link/verify",
  "POST /api/v1/auth/guest",
  "GET /api/v1/auth/google/start",
  "POST /api/v1/admin/import-bank",
]);
export const ROUTE_LIMITS: Record<string, [number, string]> = {
  // Per address, sized for a classroom behind one school IP; a single inbox is also capped at 5 links an hour.
  "POST /api/v1/auth/magic-link": [30, "15 minutes"],
  "POST /api/v1/auth/magic-link/verify": [60, "15 minutes"],
  "POST /api/v1/auth/guest": [200, "1 hour"],
  "GET /api/v1/auth/google/start": [30, "15 minutes"],
  "POST /api/v1/attempts": [90, "1 minute"],
  "POST /api/v1/lab-events": [240, "1 minute"],
  "POST /api/v1/classes/join": [20, "1 hour"],
  "POST /api/v1/live/:id/answer": [60, "1 minute"],
  "POST /api/v1/admin/import-bank": [20, "1 hour"],
};
export const GLOBAL_LIMIT: [number, string] = [1200, "1 minute"];

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** The origins a browser may write from: the app itself plus any extra (e.g. a staging host). */
function allowedOrigins() {
  return new Set([env.appOrigin, ...env.extraOrigins]);
}

function originOf(req: FastifyRequest): string | null {
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin !== "null") return origin.replace(/\/$/, "");
  const referer = req.headers.referer;
  if (typeof referer === "string") {
    try {
      return new URL(referer).origin;
    } catch {
      return "invalid";
    }
  }
  return null;
}

export async function registerSecurity(app: FastifyInstance, opts: { rateLimit: boolean }) {
  if (opts.rateLimit) {
    // Per-route windows. Added before the plugin, whose own onRoute hook reads route.config.rateLimit.
    app.addHook("onRoute", (route) => {
      for (const m of ([] as string[]).concat(route.method)) {
        const limit = ROUTE_LIMITS[`${m} ${route.url}`];
        if (limit) route.config = { ...(route.config as object), rateLimit: { max: limit[0], timeWindow: limit[1] } };
      }
    });
    await app.register(rateLimit, {
      global: true,
      max: GLOBAL_LIMIT[0],
      timeWindow: GLOBAL_LIMIT[1],
      // One bucket per route for the tight limits, so a busy lesson can't lock out sign-in.
      keyGenerator: (req) => {
        const route = `${req.method} ${req.routeOptions.url}`;
        const session = req.cookies?.[SESSION_COOKIE];
        const who = session && !IP_ROUTES.has(route) ? `s:${sha256(session).slice(0, 32)}` : `ip:${req.ip}`;
        return ROUTE_LIMITS[route] ? `${who}|${route}` : who;
      },
      errorResponseBuilder: (_req, ctx) => ({
        statusCode: 429,
        error: `Too many requests. Try again in ${Math.ceil(ctx.ttl / 1000)} s.`,
      }),
    });
  }

  app.addHook("onRequest", async (req, reply) => {
    if (!UNSAFE.has(req.method)) return;
    const origin = originOf(req);
    // No Origin or Referer: not a browser form or fetch from another site (scripts, curl, tests).
    if (origin === null) return;
    if (!allowedOrigins().has(origin)) {
      return reply.status(403).send({ error: "Cross-site request refused" });
    }
  });

  app.addHook("onSend", async (_req, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Cross-Origin-Resource-Policy", "same-origin");
    // API responses are personal (progress, results): never store them in a shared or browser cache.
    if (!reply.hasHeader("Cache-Control")) reply.header("Cache-Control", "no-store");
    return payload;
  });
}
