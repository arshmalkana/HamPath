import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import type { Pool } from "@hampath/db";
import { HttpError } from "./auth.ts";
import { adminRoutes } from "./routes/admin.ts";
import { analyticsRoutes } from "./routes/analytics.ts";
import { classRoutes } from "./routes/classes.ts";
import { authRoutes } from "./routes/auth.ts";
import { contentRoutes } from "./routes/content.ts";
import { dashboardRoutes } from "./routes/dashboard.ts";
import { learnRoutes } from "./routes/learn.ts";
import { placementRoutes } from "./routes/placement.ts";
import { practiceRoutes } from "./routes/practice.ts";
import { registerSecurity } from "./security.ts";
import { env } from "./env.ts";

export async function buildApp(
  pool: Pool,
  opts: { logger?: boolean; rateLimit?: boolean } = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? false,
    trustProxy: env.trustProxy,
    // Every JSON body is small; the bank import raises its own limit.
    bodyLimit: 256 * 1024,
  });
  await app.register(cookie);
  await registerSecurity(app, { rateLimit: opts.rateLimit ?? env.rateLimits });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: err.issues[0]?.message ?? "Invalid request", issues: err.issues });
    }
    if (err instanceof HttpError) {
      return reply.status(err.status).send({ error: err.message, ...(err.details ? { details: err.details } : {}) });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.status(status).send({ error: (err as Error).message });
    app.log.error(err);
    return reply.status(500).send({ error: "Internal error" });
  });

  await app.register(
    async (v1) => {
      v1.get("/health", async () => {
        await pool.query("SELECT 1");
        return { ok: true };
      });
      authRoutes(v1, pool);
      contentRoutes(v1, pool);
      learnRoutes(v1, pool);
      practiceRoutes(v1, pool);
      placementRoutes(v1, pool);
      dashboardRoutes(v1, pool);
      adminRoutes(v1, pool);
      analyticsRoutes(v1, pool);
      classRoutes(v1, pool);
    },
    { prefix: "/api/v1" },
  );
  return app;
}
