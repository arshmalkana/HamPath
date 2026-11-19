import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "@hampath/db";
import { buildApp } from "./app.ts";
import { ROUTE_LIMITS } from "./security.ts";

const LINKS = ROUTE_LIMITS["POST /api/v1/auth/magic-link"]![0];
const GUESTS = ROUTE_LIMITS["POST /api/v1/auth/guest"]![0];

const pool = createPool();
let app: FastifyInstance;
beforeAll(async () => {
  // The rest of the suite runs with RATE_LIMITS=off; this file switches them on.
  app = await buildApp(pool, { rateLimit: true });
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method: "POST", url: `/api/v1${url}`, payload: body as object, headers });

describe("security (rate limits, cross-site writes, headers, input bounds)", () => {
  it("limits sign-in links per client IP, whatever the address asked for", async () => {
    const ip = { "x-forwarded-for": "203.0.113.10" };
    const codes = [];
    for (let i = 0; i <= LINKS; i++)
      codes.push((await post("/auth/magic-link", { email: `mailbomb${i}@example.com` }, ip)).statusCode);
    expect(codes.slice(0, LINKS).every((c) => c === 202)).toBe(true);
    expect(codes.at(-1)).toBe(429);
    // Another client (behind the same trusted proxy) has its own budget.
    expect(
      (await post("/auth/magic-link", { email: "fresh@example.com" }, { "x-forwarded-for": "203.0.113.11" }))
        .statusCode,
    ).toBe(202);
  });

  it("limits guest accounts per client IP", async () => {
    const ip = { "x-forwarded-for": "203.0.113.20" };
    let last = 0;
    for (let i = 0; i <= GUESTS; i++) last = (await post("/auth/guest", undefined, ip)).statusCode;
    expect(last).toBe(429);
  });

  it("refuses writes from another site, allows the app and non-browser clients", async () => {
    expect((await post("/auth/guest", undefined, { origin: "https://evil.example" })).statusCode).toBe(403);
    expect((await post("/auth/guest", undefined, { referer: "https://evil.example/page" })).statusCode).toBe(403);
    expect(
      (await post("/auth/guest", undefined, { origin: "http://localhost:3000", "x-forwarded-for": "203.0.113.30" }))
        .statusCode,
    ).toBe(200);
    expect((await post("/auth/guest", undefined, { "x-forwarded-for": "203.0.113.31" })).statusCode).toBe(200);
    // Reads aren't affected.
    expect(
      (await app.inject({ method: "GET", url: "/api/v1/auth/providers", headers: { origin: "https://evil.example" } }))
        .statusCode,
    ).toBe(200);
  });

  it("sends security headers and never lets personal JSON be cached", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(res.headers).toMatchObject({
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY",
    });
  });

  it("bounds request sizes and lab payloads", async () => {
    const guest = await post("/auth/guest", undefined, { "x-forwarded-for": "203.0.113.40" });
    const cookie = String(guest.headers["set-cookie"]).split(";")[0]!;
    const big = await post(
      "/lab-events",
      { lab_step_id: "5.04/explore-current", event: "value_changed", payload: { junk: "x".repeat(20_000) } },
      { cookie, "x-forwarded-for": "203.0.113.40" },
    );
    expect(big.statusCode).toBe(400);
    expect(big.json().error).toMatch(/too large/);
    const huge = await post("/attempts", { junk: "x".repeat(300_000) }, { cookie, "x-forwarded-for": "203.0.113.40" });
    expect(huge.statusCode).toBe(413);
  });
});

describe("rate limit keys", () => {
  it("counts learning traffic per session, so a classroom behind one address isn't throttled together", async () => {
    const school = { "x-forwarded-for": "198.51.100.7" };
    const cookies: string[] = [];
    for (let i = 0; i < 3; i++) {
      const g = await post("/auth/guest", undefined, school);
      cookies.push(String(g.headers["set-cookie"]).split(";")[0]!);
    }
    // Learner 1 uses up their answer budget; learner 2 at the same address is unaffected.
    const answer = {
      question_id: "B-005-004-001",
      option_id: "00000000-0000-4000-8000-000000000000",
      context: "review",
    };
    let last = 0;
    for (let i = 0; i < 91; i++)
      last = (await post("/attempts", answer, { ...school, cookie: cookies[0]! })).statusCode;
    expect(last).toBe(429);
    expect((await post("/attempts", answer, { ...school, cookie: cookies[1]! })).statusCode).not.toBe(429);
  });
});
