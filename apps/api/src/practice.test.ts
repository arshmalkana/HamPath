import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readBlueprint, readContentTree } from "@hampath/content";
import { createPool, loadContent } from "@hampath/db";
import { buildApp } from "./app.ts";
import { readinessScore, streakFromDays } from "./routes/dashboard.ts";

// Runs against the fresh test database from scripts/test-global-setup.ts.
const pool = createPool();
let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp(pool);
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

function browser() {
  let cookie = "";
  return async (method: "GET" | "POST" | "PUT", url: string, body?: unknown) => {
    const res = await app.inject({ method, url: `/api/v1${url}`, payload: body as object, headers: { cookie } });
    for (const c of ([] as string[]).concat(res.headers["set-cookie"] ?? [])) {
      const [pair] = c.split(";");
      if (pair!.startsWith("hp_session=")) cookie = pair!;
    }
    return { status: res.statusCode, json: res.json() as any };
  };
}

/** No answer data in a question payload: only id, stem, lessonId and options of {id, text}. */
function expectNoAnswers(questions: any[]) {
  for (const q of questions) {
    expect(Object.keys(q).sort()).toEqual(["id", "lessonId", "options", "stem"]);
    for (const o of q.options) expect(Object.keys(o).sort()).toEqual(["id", "text"]);
  }
}

async function guest() {
  const call = browser();
  const { json } = await call("POST", "/auth/guest");
  return { call, userId: json.user.id as string };
}

/** question id → correct option id, and → one wrong option id */
async function answerKey() {
  const { rows } = await pool.query<{ question_id: string; id: string; is_correct: boolean }>(
    "SELECT question_id, id, is_correct FROM option WHERE retired_in IS NULL",
  );
  const right = new Map<string, string>();
  const wrong = new Map<string, string>();
  for (const r of rows) (r.is_correct ? right : wrong).set(r.question_id, r.id);
  return { right, wrong };
}

describe("minimal lessons for every topic", () => {
  // Every lesson is authored now, so load content without 1.19 to exercise the generated
  // minimal lesson, then put the full content back for the other suites.
  beforeAll(async () => {
    const tree = readContentTree();
    await loadContent(pool, { ...tree, lessons: tree.lessons.filter((l) => l.yaml.code !== "1.19") });
  });
  afterAll(async () => {
    await loadContent(pool);
  });

  it("serves an intro card and the full Check for a lesson with no authored content", async () => {
    const { json } = await browser()("GET", "/lessons/1.19");
    expect(json).toMatchObject({ code: "1.19", authored: false, title: "Frequency stability and overmodulation" });
    expect(json.cards).toHaveLength(1);
    expect(json.cards[0]).toMatchObject({
      type: "intro",
      title: "Frequency stability and overmodulation",
      teaches: [],
    });
    expect(json.questions).toHaveLength(6);
  });

  it("every one of the 100 lessons is playable, and all 984 questions are askable", async () => {
    const { rows } = await pool.query<{ lessons: number; withCards: number; questions: number }>(
      `SELECT count(DISTINCT l.id)::int AS lessons, count(DISTINCT c.lesson_id)::int AS "withCards", count(DISTINCT q.id)::int AS questions
         FROM lesson l LEFT JOIN card c ON c.lesson_id = l.id LEFT JOIN question q ON q.lesson_id = l.id AND q.retired_in IS NULL`,
    );
    expect(rows[0]).toEqual({ lessons: 100, withCards: 100, questions: 984 });
  });

  it("a miss in a minimal lesson links back to the lesson itself", async () => {
    const { call } = await guest();
    const { wrong } = await answerKey();
    const res = await call("POST", "/attempts", {
      question_id: "B-001-019-001",
      option_id: wrong.get("B-001-019-001"),
      context: "check",
    });
    expect(res.json.teach_card).toEqual({
      id: null,
      title: "1.19 Frequency stability and overmodulation",
      href: "/lessons/1.19",
    });
  });
});

describe("Daily Review (FSRS)", () => {
  it("queues misses for today, reveals answers at once, and reschedules correct answers", async () => {
    const { call } = await guest();
    const { right, wrong } = await answerKey();
    for (const qid of ["B-005-004-001", "B-005-004-002"]) {
      await call("POST", "/attempts", { question_id: qid, option_id: wrong.get(qid), context: "check" });
    }
    await call("POST", "/attempts", {
      question_id: "B-005-004-003",
      option_id: right.get("B-005-004-003"),
      context: "check",
    });

    const due = (await call("GET", "/review/due")).json;
    expect(due.dueCount).toBe(2);
    expect(due.questions.map((q: any) => q.id).sort()).toEqual(["B-005-004-001", "B-005-004-002"]);
    expectNoAnswers(due.questions);
    expect(due.estMinutes).toBeGreaterThanOrEqual(1);

    const miss = (
      await call("POST", "/attempts", {
        question_id: "B-005-004-001",
        option_id: wrong.get("B-005-004-001"),
        context: "review",
      })
    ).json;
    expect(miss).toMatchObject({ correct: false, revealed: true, correct_option_id: right.get("B-005-004-001") });
    expect(miss.worked_solution).toEqual(["E = I × R", "E = 0.5 A × 2 Ω", "E = 1 V"]);

    const hit = (
      await call("POST", "/attempts", {
        question_id: "B-005-004-002",
        option_id: right.get("B-005-004-002"),
        context: "review",
      })
    ).json;
    expect(hit.correct).toBe(true);
    expect(new Date(hit.due_at).getTime()).toBeGreaterThan(Date.now() + 12 * 3_600_000);
    const after = (await call("GET", "/review/due")).json;
    expect(after.questions.map((q: any) => q.id)).toEqual(["B-005-004-001"]);
  });

  it("stores FSRS memory state per learner per question", async () => {
    const { call, userId } = await guest();
    const { right } = await answerKey();
    await call("POST", "/attempts", {
      question_id: "B-005-004-005",
      option_id: right.get("B-005-004-005"),
      context: "check",
    });
    const { rows } = await pool.query(
      "SELECT stability, difficulty, reps, last_reviewed_at FROM question_state WHERE user_id = $1",
      [userId],
    );
    expect(rows[0].stability).toBeCloseTo(3.173, 3);
    expect(rows[0]).toMatchObject({ reps: 1 });
    expect(rows[0].last_reviewed_at).toBeTruthy();
  });

  it("refuses single checkpoint or mock answers (they are submitted together)", async () => {
    const { call } = await guest();
    const { right } = await answerKey();
    expect(
      (
        await call("POST", "/attempts", {
          question_id: "B-005-004-001",
          option_id: right.get("B-005-004-001"),
          context: "mock",
        })
      ).status,
    ).toBe(400);
  });
});

describe("offline replay (Step 28)", () => {
  it("grades an answer once however many times it is replayed", async () => {
    const { call, userId } = await guest();
    const { wrong } = await answerKey();
    const qid = "B-005-004-001";
    const body = {
      question_id: qid,
      option_id: wrong.get(qid),
      context: "review",
      client_id: "6f1d6c3e-2c1b-4f5e-9a7d-0b7c8e9f1a2b",
      answered_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    };
    const first = await call("POST", "/attempts", body);
    const state1 = await pool.query(
      "SELECT due_at, lapses FROM question_state WHERE user_id = $1 AND question_id = $2",
      [userId, qid],
    );
    // The reply was lost; the outbox sends it again, twice, once from another tab at the same time.
    const replays = await Promise.all([call("POST", "/attempts", body), call("POST", "/attempts", body)]);
    for (const r of replays) expect(r.json).toEqual(first.json);
    const { rows } = await pool.query("SELECT created_at FROM attempt WHERE user_id = $1 AND question_id = $2", [
      userId,
      qid,
    ]);
    expect(rows).toHaveLength(1);
    // Recorded at the time it was answered, not when it arrived.
    expect(Math.abs(rows[0].created_at.getTime() - Date.parse(body.answered_at))).toBeLessThan(1000);
    const state2 = await pool.query(
      "SELECT due_at, lapses FROM question_state WHERE user_id = $1 AND question_id = $2",
      [userId, qid],
    );
    expect(state2.rows).toEqual(state1.rows);
  });

  it("ignores an implausible answer time", async () => {
    const { call, userId } = await guest();
    const { right } = await answerKey();
    const qid = "B-005-004-005";
    await call("POST", "/attempts", {
      question_id: qid,
      option_id: right.get(qid),
      context: "review",
      answered_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const { rows } = await pool.query("SELECT created_at FROM attempt WHERE user_id = $1 AND question_id = $2", [
      userId,
      qid,
    ]);
    expect(Math.abs(rows[0].created_at.getTime() - Date.now())).toBeLessThan(60_000);
  });

  it("stores a replayed lab event once", async () => {
    const { call, userId } = await guest();
    const ev = {
      lab_step_id: "5.04/explore-current",
      event: "hint_used",
      payload: { hint: 1 },
      client_id: "0a3c1e55-7b2d-4c8e-8f10-2d3e4f5a6b7c",
    };
    for (let i = 0; i < 3; i++) expect((await call("POST", "/lab-events", ev)).status).toBe(200);
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM lab_event WHERE user_id = $1 AND event = 'hint_used'",
      [userId],
    );
    expect(rows[0].n).toBe(1);
  });
});

describe("Section Checkpoints", () => {
  it("asks every unmastered question plus a 20% sample of mastered ones", async () => {
    const { call, userId } = await guest();
    const { rows } = await pool.query<{ id: string }>(
      "SELECT id FROM question WHERE lesson_id LIKE 'B-005-%' ORDER BY id LIMIT 10",
    );
    for (const r of rows) {
      await pool.query("INSERT INTO question_state (user_id, question_id, mastered, streak) VALUES ($1,$2,true,2)", [
        userId,
        r.id,
      ]);
    }
    const cp = (await call("POST", "/checkpoints/5")).json;
    expect(cp).toMatchObject({ sectionId: "B-005", unmastered: 132, masteredSampled: 2, passPercent: 80 });
    expect(cp.questions).toHaveLength(134);
    expect(new Set(cp.questions.map((q: any) => q.id)).size).toBe(134);
    expectNoAnswers(cp.questions);
  });

  it("80% earns the badge; results list weak lessons and link misses to teaching", async () => {
    const { call } = await guest();
    const { right, wrong } = await answerKey();
    const cp = (await call("POST", "/checkpoints/B-008")).json; // 55 questions
    const ids: string[] = cp.questions.map((q: any) => q.id);
    const missed = ids.filter((q) => q.startsWith("B-008-002-")).slice(0, 5);
    const answers = ids.map((q) => ({ question_id: q, option_id: missed.includes(q) ? wrong.get(q)! : right.get(q)! }));
    const res = (await call("POST", `/checkpoints/${cp.id}/submit`, { answers })).json;
    expect(res).toMatchObject({ finished: true, correct: 50, total: 55, passed: true, badge: true });
    expect(res.score).toBeCloseTo(90.9, 1);
    expect(res.weakLessons[0]).toMatchObject({ code: "8.02", missed: 5, href: "/lessons/8.02" });
    expect(res.misses).toHaveLength(5);
    // Authored lessons deep-link to the card that teaches the missed question.
    expect(res.misses[0]).toMatchObject({ correct: false });
    expect(res.misses[0].teach.href).toMatch(/^\/lessons\/8\.02(\?card=8\.02%2F.+)?$/);
    expect(res.misses[0].chosen.text).toBeTruthy();
    expect(res.misses[0].correctOption.text).toBeTruthy();

    expect((await call("POST", `/checkpoints/${cp.id}/submit`, { answers })).status).toBe(409);
    expect((await call("GET", `/checkpoints/${cp.id}`)).json.finished).toBe(true);
    const dash = (await call("GET", "/me/dashboard")).json;
    expect(dash.sections.find((s: any) => s.id === "B-008").badge).toBe(true);
  });

  it("below 80% gives no badge; unanswered questions count as wrong; other learners can't see it", async () => {
    const { call } = await guest();
    const { right } = await answerKey();
    const cp = (await call("POST", "/checkpoints/8")).json;
    const answers = cp.questions.slice(0, 30).map((q: any) => ({ question_id: q.id, option_id: right.get(q.id) }));
    expect((await browser()("GET", `/checkpoints/${cp.id}`)).status).toBe(401);
    const { call: other } = await guest();
    expect((await other("GET", `/checkpoints/${cp.id}`)).status).toBe(404);
    const res = (await call("POST", `/checkpoints/${cp.id}/submit`, { answers })).json;
    expect(res).toMatchObject({ correct: 30, total: 55, passed: false, badge: false });
    expect(res.misses.filter((m: any) => m.chosen === null)).toHaveLength(25);
  });
});

describe("mock exams (LAB-35)", () => {
  const bp = readBlueprint();

  it("draws 100 distinct questions weighted by section, timed", async () => {
    const { call } = await guest();
    const m = (await call("POST", "/mocks")).json;
    expect(m).toMatchObject({
      finished: false,
      timeLimitS: bp.time_limit_minutes * 60,
      passPercent: 70,
      honoursPercent: 80,
    });
    const ids: string[] = m.questions.map((q: any) => q.id);
    expect(ids).toHaveLength(100);
    expect(new Set(ids).size).toBe(100);
    for (const [sec, n] of Object.entries(bp.sections))
      expect(ids.filter((q) => q.startsWith(`B-00${sec}-`))).toHaveLength(n);
    const again = (await call("GET", `/mocks/${m.id}`)).json;
    expect(again.remainingS).toBeLessThanOrEqual(bp.time_limit_minutes * 60);
    expectNoAnswers(again.questions);
  });

  it("scores pass at 70, honours at 80, with a per-section breakdown and every miss", async () => {
    const { call } = await guest();
    const { right, wrong } = await answerKey();
    const m = (await call("POST", "/mocks")).json;
    const ids: string[] = m.questions.map((q: any) => q.id);
    const answers = ids.map((q, i) => ({ question_id: q, option_id: i < 75 ? right.get(q)! : wrong.get(q)! }));
    const res = (await call("POST", `/mocks/${m.id}/submit`, { answers })).json;
    expect(res).toMatchObject({ finished: true, score: 75, correct: 75, total: 100, passed: true, honours: false });
    expect(res.sectionBreakdown.reduce((n: number, s: any) => n + s.total, 0)).toBe(100);
    expect(res.sectionBreakdown.reduce((n: number, s: any) => n + s.correct, 0)).toBe(75);
    expect(res.misses).toHaveLength(25);
    expect((await call("POST", `/mocks/${m.id}/submit`, { answers })).status).toBe(409);

    const m2 = (await call("POST", "/mocks")).json;
    const all = m2.questions.map((q: any) => ({ question_id: q.id, option_id: right.get(q.id) }));
    expect((await call("POST", `/mocks/${m2.id}/submit`, { answers: all })).json).toMatchObject({
      score: 100,
      honours: true,
    });
  });

  it("answers after the time limit don't count", async () => {
    const { call } = await guest();
    const { right } = await answerKey();
    const m = (await call("POST", "/mocks")).json;
    await pool.query("UPDATE mock_exam SET started_at = now() - interval '4 hours' WHERE id = $1", [m.id]);
    const answers = m.questions.map((q: any) => ({ question_id: q.id, option_id: right.get(q.id) }));
    expect((await call("POST", `/mocks/${m.id}/submit`, { answers })).json).toMatchObject({ score: 0, passed: false });
  });

  it("an untimed mock has no countdown and accepts answers at any time", async () => {
    const { call } = await guest();
    const { right } = await answerKey();
    const m = (await call("POST", "/mocks", { timed: false })).json;
    expect(m.timeLimitS).toBeNull();
    await pool.query("UPDATE mock_exam SET started_at = now() - interval '4 hours' WHERE id = $1", [m.id]);
    expect((await call("GET", `/mocks/${m.id}`)).json).toMatchObject({ timeLimitS: null, remainingS: null });
    const answers = m.questions.map((q: any) => ({ question_id: q.id, option_id: right.get(q.id) }));
    expect((await call("POST", `/mocks/${m.id}/submit`, { answers })).json).toMatchObject({ score: 100, passed: true });
    const list = (await call("GET", "/mocks")).json;
    expect(list.mocks[0]).toMatchObject({ id: m.id, timed: false });
    expect((await call("POST", "/mocks", { timed: "no" })).status).toBe(400);
  });
});

describe("dashboard", () => {
  it("reports streak, today's reviews, last mocks and readiness once there are 3 mocks", async () => {
    const { call } = await guest();
    const { right, wrong } = await answerKey();
    await call("POST", "/attempts", {
      question_id: "B-002-007-001",
      option_id: wrong.get("B-002-007-001"),
      context: "check",
    });
    let d = (await call("GET", "/me/dashboard")).json;
    expect(d.streak).toEqual({ days: 1, activeToday: true });
    expect(d.reviewDueToday).toBe(1);
    expect(d.readiness.readiness).toBeNull();
    expect(d.sections).toHaveLength(8);

    for (let i = 0; i < 3; i++) {
      const m = (await call("POST", "/mocks")).json;
      const answers = m.questions.map((q: any) => ({ question_id: q.id, option_id: right.get(q.id) }));
      await call("POST", `/mocks/${m.id}/submit`, { answers });
    }
    d = (await call("GET", "/me/dashboard")).json;
    expect(d.lastMocks).toHaveLength(3);
    expect(d.readiness.mockAverage).toBe(100);
    expect(d.readiness.readiness).toBeCloseTo(d.readiness.masteryPercent * 0.5 + 50, 1);
  });

  it("computes streaks and readiness", () => {
    const today = new Date(Date.UTC(2026, 10, 18, 9));
    expect(streakFromDays(["2026-11-18", "2026-11-17", "2026-11-16", "2026-11-14"], today)).toEqual({
      days: 3,
      activeToday: true,
    });
    expect(streakFromDays(["2026-11-17", "2026-11-16"], today)).toEqual({ days: 2, activeToday: false });
    expect(streakFromDays(["2026-11-15"], today)).toEqual({ days: 0, activeToday: false });
    expect(readinessScore(80, [90, 90])).toMatchObject({ readiness: null, mocksNeeded: 1 });
    expect(readinessScore(80, [90, 90, 90])).toMatchObject({ readiness: 85, green: true });
    expect(readinessScore(70, [80, 80, 80])).toMatchObject({ readiness: 75, green: false });
  });
});

describe("placement and test-out (Step 29)", () => {
  async function lessonOf(qids: string[]) {
    const { rows } = await pool.query<{ id: string; lesson_id: string; section_id: string }>(
      "SELECT q.id, q.lesson_id, l.section_id FROM question q JOIN lesson l ON l.id = q.lesson_id WHERE q.id = ANY($1)",
      [qids],
    );
    return new Map(rows.map((r) => [r.id, r]));
  }

  it("draws 24 placement questions, 3 per section from different lessons, and recommends strong sections", async () => {
    const { call } = await guest();
    const { right, wrong } = await answerKey();
    expect((await call("GET", "/placement")).json).toEqual({ latest: null });
    const p = (await call("POST", "/placement")).json;
    expect(p.questions).toHaveLength(24);
    const meta = await lessonOf(p.questions.map((q: any) => q.id));
    const bySection = new Map<string, Set<string>>();
    for (const m of meta.values())
      bySection.set(m.section_id, (bySection.get(m.section_id) ?? new Set()).add(m.lesson_id));
    expect(bySection.size).toBe(8);
    for (const lessons of bySection.values()) expect(lessons.size).toBe(3);
    // Everything right except one question in section 8.
    const miss = p.questions.find((q: any) => meta.get(q.id)!.section_id === "B-008")!.id;
    const answers = p.questions.map((q: any) => ({
      question_id: q.id,
      option_id: q.id === miss ? wrong.get(q.id) : right.get(q.id),
    }));
    const r = (await call("POST", `/placement/${p.id}/submit`, { answers })).json;
    expect(r).toMatchObject({ finished: true, correct: 23, total: 24 });
    expect(r.recommendTestOut.map((s: any) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(r.misses.map((m: any) => m.questionId)).toEqual([miss]);
    expect((await call("GET", "/placement")).json.latest.recommendTestOut).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect((await call("POST", `/placement/${p.id}/submit`, { answers })).status).toBe(409);
    const stranger = await guest();
    expect((await stranger.call("GET", `/placement/${p.id}`)).status).toBe(404);
  });

  it("tests out of lessons answered 100% and still puts all their questions into review", async () => {
    const { call, userId } = await guest();
    const { right, wrong } = await answerKey();
    const t = (await call("POST", "/test-out/7")).json;
    const meta = await lessonOf(t.questions.map((q: any) => q.id));
    const perLesson = new Map<string, number>();
    for (const m of meta.values()) perLesson.set(m.lesson_id, (perLesson.get(m.lesson_id) ?? 0) + 1);
    for (const n of perLesson.values()) expect(n).toBeLessThanOrEqual(3);
    expect([...meta.values()].every((m) => m.section_id === "B-007")).toBe(true);
    // Miss one question of the first lesson; every other lesson is all right.
    const [failLesson] = [...perLesson.keys()].sort();
    const miss = [...meta.values()].find((m) => m.lesson_id === failLesson)!.id;
    const answers = t.questions.map((q: any) => ({
      question_id: q.id,
      option_id: q.id === miss ? wrong.get(q.id) : right.get(q.id),
    }));
    const r = (await call("POST", `/test-out/${t.id}/submit`, { answers })).json;
    expect(r.testedOut).toBe(perLesson.size - 1);
    expect(r.lessons.find((l: any) => l.lessonId === failLesson)).toMatchObject({ testedOut: false });

    const { rows: progress } = await pool.query(
      "SELECT lesson_id, tested_out, completed_at FROM lesson_progress WHERE user_id = $1 ORDER BY lesson_id",
      [userId],
    );
    expect(progress.map((p) => p.lesson_id)).toEqual([...perLesson.keys()].filter((l) => l !== failLesson).sort());
    expect(progress.every((p) => p.tested_out && p.completed_at)).toBe(true);

    // Every question of a tested-out lesson is scheduled for review within the week, asked or not.
    const passed = progress.map((p) => p.lesson_id);
    const { rows: due } = await pool.query(
      `SELECT q.id, qs.due_at FROM question q LEFT JOIN question_state qs ON qs.question_id = q.id AND qs.user_id = $1
        WHERE q.lesson_id = ANY($2) AND q.retired_in IS NULL`,
      [userId, passed],
    );
    expect(due.length).toBeGreaterThan(passed.length * 3);
    expect(due.every((d) => d.due_at !== null)).toBe(true);
    const unasked = due.filter((d) => !meta.has(d.id));
    expect(unasked.length).toBeGreaterThan(0);
    for (const d of unasked) expect(d.due_at.getTime() - Date.now()).toBeLessThan(7 * 86_400_000);

    const map = (await call("GET", "/sections/7")).json;
    expect(map.lessons.filter((l: any) => l.testedOut).length).toBe(passed.length);
    expect((await call("GET", `/test-out/${t.id}`)).json).toMatchObject({ finished: true, testedOut: passed.length });
  });
});
