import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "@hampath/db";
import { buildApp } from "./app.ts";

const pool = createPool();
let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp(pool);
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

function browser(headers: Record<string, string> = {}) {
  let cookie = "";
  return async (method: "GET" | "POST" | "PUT", url: string, body?: unknown) => {
    const res = await app.inject({
      method,
      url: `/api/v1${url}`,
      payload: body as object,
      headers: { cookie, ...headers },
    });
    for (const c of ([] as string[]).concat(res.headers["set-cookie"] ?? [])) {
      const [pair] = c.split(";");
      if (pair!.startsWith("hp_session=")) cookie = pair!;
    }
    return { status: res.statusCode, json: res.json() as any };
  };
}

async function options(qid: string) {
  const { rows } = await pool.query<{ id: string; is_correct: boolean }>(
    "SELECT id, is_correct FROM option WHERE question_id = $1 AND retired_in IS NULL",
    [qid],
  );
  return { right: rows.find((r) => r.is_correct)!.id, wrong: rows.find((r) => !r.is_correct)!.id };
}

describe("GET /admin/analytics (Step 30)", () => {
  it("rejects a malformed time window", async () => {
    expect(
      (await browser({ "x-admin-token": "test-admin-token-123" })("GET", "/admin/analytics?since=yesterday")).status,
    ).toBe(400);
  });

  it("is for admins only", async () => {
    const learner = browser();
    await learner("POST", "/auth/guest");
    expect((await learner("GET", "/admin/analytics")).status).toBe(403);
    expect((await browser({ "x-admin-token": "test-admin-token-123" })("GET", "/admin/analytics")).status).toBe(200);
  });

  it("reports first-try success, flags weak questions with their teaching card, and lab and lesson funnels", async () => {
    // Count only this test's activity: other suites (mock exams draw random questions) share the DB.
    const since = new Date(Date.now() - 1000).toISOString();
    const hard = "B-006-002-001";
    const easy = "B-006-002-002";
    const rare = "B-006-002-003";
    const [h, e, r] = await Promise.all([options(hard), options(easy), options(rare)]);
    for (let i = 0; i < 6; i++) {
      const call = browser();
      const userId = (await call("POST", "/auth/guest")).json.user.id as string;
      // Hard: 2 of 6 right first time, and later answers don't change the first try.
      await call("POST", "/attempts", { question_id: hard, option_id: i < 2 ? h.right : h.wrong, context: "review" });
      await call("POST", "/attempts", { question_id: hard, option_id: h.right, context: "review" });
      await call("POST", "/attempts", { question_id: easy, option_id: e.right, context: "review" });
      if (i < 2) await call("POST", "/attempts", { question_id: rare, option_id: r.wrong, context: "review" });
      // Labs: everyone starts 5.04's first step, half use a hint, a third finish it.
      const step = "5.04/explore-current";
      await call("POST", "/lab-events", { lab_step_id: step, event: "started" });
      if (i % 2 === 0)
        await call("POST", "/lab-events", { lab_step_id: step, event: "hint_used", payload: { hint: 1 } });
      if (i % 3 === 0) {
        const board = { source: "battery", series: "ammeter", load: "resistor", across: null };
        await call("POST", "/lab-events", {
          lab_step_id: step,
          event: "goal_met",
          payload: { state: { topology: "single", E: 6, resistors: [30], closed: true, board } },
        });
      }
      // Lessons: 6.02 started by all, finished by two; the rest stopped on its second screen.
      await call("PUT", "/lessons/6.02/progress", { step: 1 });
      // (Finishing needs every Check answer; record the two finishes directly.)
      if (i < 2)
        await pool.query(
          "UPDATE lesson_progress SET completed_at = now() WHERE user_id = $1 AND lesson_id = 'B-006-002'",
          [userId],
        );
    }

    const { json } = await browser({ "x-admin-token": "test-admin-token-123" })(
      "GET",
      `/admin/analytics?since=${encodeURIComponent(since)}`,
    );
    expect(json).toMatchObject({ since, flagBelow: 0.6, minAnswers: 5 });
    const q = (id: string) => json.questions.find((x: any) => x.questionId === id);
    expect(q(hard)).toMatchObject({ learners: 6, flagged: true, lessonCode: "6.02" });
    expect(q(hard).firstTryRate).toBeCloseTo(2 / 6, 2);
    expect(q(hard).teach.href).toMatch(/^\/lessons\/6\.02\?card=/);
    expect(q(easy)).toMatchObject({ firstTryRate: 1, flagged: false, teach: null });
    expect(q(rare)).toMatchObject({ learners: 2, firstTryRate: 0, flagged: false }); // too few answers to flag
    expect(json.questions[0].flagged).toBe(true); // flags first

    const lab = json.labs.find((l: any) => l.labId === "LAB-20");
    const step = lab.steps.find((s: any) => s.stepId === "5.04/explore-current");
    expect(step.started).toBe(6);
    expect(step.completed).toBe(2);
    expect(step.hintRate).toBeGreaterThan(0);

    const lesson = json.lessons.find((l: any) => l.code === "6.02");
    expect(lesson).toMatchObject({ started: 6, finished: 2, dropOff: 4 });
    expect(lesson.mostCommonStop).toMatchObject({ step: 1, learners: 4 });
    expect(typeof lesson.mostCommonStop.screen).toBe("string");
  });
});
