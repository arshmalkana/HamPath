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

function browser() {
  let cookie = "";
  return async (method: "GET" | "POST" | "PUT" | "DELETE", url: string, body?: unknown) => {
    const res = await app.inject({ method, url: `/api/v1${url}`, payload: body as object, headers: { cookie } });
    for (const c of ([] as string[]).concat(res.headers["set-cookie"] ?? [])) {
      const [pair] = c.split(";");
      if (pair!.startsWith("hp_session=")) cookie = pair!;
    }
    return { status: res.statusCode, json: res.json() as any };
  };
}
let n = 0;
/** A signed-in account with a role (guests can't teach). */
async function account(role: "learner" | "instructor", name: string) {
  const call = browser();
  const id = (await call("POST", "/auth/guest")).json.user.id as string;
  await pool.query(`UPDATE "user" SET is_guest = false, email = $2, role = $3, display_name = $4 WHERE id = $1`, [
    id,
    `class-${Date.now()}-${n++}@example.invalid`,
    role,
    name,
  ]);
  return { call, id };
}
async function key(qid: string) {
  const { rows } = await pool.query<{ id: string; is_correct: boolean }>(
    "SELECT id, is_correct FROM option WHERE question_id = $1 AND retired_in IS NULL",
    [qid],
  );
  return { right: rows.find((r) => r.is_correct)!.id, wrong: rows.find((r) => !r.is_correct)!.id };
}

describe("classes (Step 31)", () => {
  it("lets instructors create classes that learners join by code, and keeps others out", async () => {
    const learner = await account("learner", "Sam");
    expect((await learner.call("POST", "/classes", { name: "Nope" })).status).toBe(403);
    const guest = browser();
    await guest("POST", "/auth/guest");
    expect((await guest("POST", "/classes", { name: "Nope" })).status).toBe(403);

    const teacher = await account("instructor", "VE3XYZ");
    const c = (await teacher.call("POST", "/classes", { name: "Tuesday night class" })).json;
    expect(c.joinCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

    expect((await learner.call("GET", `/classes/${c.id}`)).status).toBe(403);
    expect((await learner.call("POST", "/classes/join", { code: "ZZZZZZ" })).status).toBe(404);
    expect(
      (await learner.call("POST", "/classes/join", { code: c.joinCode.toLowerCase(), display_name: "Sam K" })).json,
    ).toMatchObject({
      id: c.id,
    });
    const asLearner = (await learner.call("GET", `/classes/${c.id}`)).json;
    expect(asLearner).toMatchObject({ name: "Tuesday night class", isInstructor: false });
    expect(asLearner.joinCode).toBeUndefined();
    expect((await teacher.call("GET", `/classes/${c.id}`)).json).toMatchObject({
      isInstructor: true,
      joinCode: c.joinCode,
    });
    expect((await teacher.call("GET", "/classes")).json.teaching[0]).toMatchObject({ id: c.id, members: 1 });
    expect((await learner.call("GET", "/classes")).json).toMatchObject({ canTeach: false, joined: [{ id: c.id }] });
  });

  it("assigns sections and shows each learner's progress and weak topics", async () => {
    const teacher = await account("instructor", "Ms Lee");
    const c = (await teacher.call("POST", "/classes", { name: "Club" })).json;
    const a = await account("learner", "Ana");
    const b = await account("learner", "Ben");
    for (const l of [a, b]) await l.call("POST", "/classes/join", { code: c.joinCode });
    expect((await a.call("POST", `/classes/${c.id}/assignments`, { section: 5 })).status).toBe(403);
    const assigned = (await teacher.call("POST", `/classes/${c.id}/assignments`, { section: 5, due_on: "2026-12-15" }))
      .json;
    expect(assigned.assignments).toEqual([expect.objectContaining({ number: 5, dueOn: "2026-12-15" })]);
    expect((await a.call("GET", `/classes/${c.id}`)).json.assignments).toHaveLength(1);

    // Ana misses every 5.04 question she tries first time; Ben gets them right and finishes the lesson.
    for (const qid of ["B-005-004-001", "B-005-004-005", "B-005-004-006"]) {
      const k = await key(qid);
      await a.call("POST", "/attempts", { question_id: qid, option_id: k.wrong, context: "review" });
      await b.call("POST", "/attempts", { question_id: qid, option_id: k.right, context: "review" });
    }
    await pool.query(
      "INSERT INTO lesson_progress (user_id, lesson_id, step, completed_at) VALUES ($1, 'B-005-004', 9, now())",
      [b.id],
    );

    expect((await a.call("GET", `/classes/${c.id}/dashboard`)).status).toBe(403);
    const d = (await teacher.call("GET", `/classes/${c.id}/dashboard`)).json;
    const ana = d.learners.find((l: any) => l.name === "Ana");
    const ben = d.learners.find((l: any) => l.name === "Ben");
    expect(ana.weakTopics).toEqual([expect.objectContaining({ code: "5.04", accuracy: 0 })]);
    expect(ana.lastActive).not.toBeNull();
    expect(ben).toMatchObject({ lessonsCompleted: 1, weakTopics: [] });
    expect(ben.assignedProgress).toBeGreaterThan(0);
    expect(d.weakTopics[0]).toMatchObject({ code: "5.04", accuracy: 50, learners: 2 });

    expect((await teacher.call("DELETE", `/classes/${c.id}/assignments/5`)).json.assignments).toEqual([]);
  });

  it("runs a live quiz that members answer from their phones", async () => {
    const teacher = await account("instructor", "Projector");
    const c = (await teacher.call("POST", "/classes", { name: "Live" })).json;
    const p1 = await account("learner", "Phone 1");
    const p2 = await account("learner", "Phone 2");
    const outsider = await account("learner", "Outsider");
    for (const p of [p1, p2]) await p.call("POST", "/classes/join", { code: c.joinCode });

    const q = (await teacher.call("POST", `/classes/${c.id}/live`, { section: 5, questions: 2 })).json;
    expect((await outsider.call("GET", `/live/${q.id}`)).status).toBe(403);
    expect((await p1.call("GET", `/classes/${c.id}`)).json.liveQuiz).toMatchObject({ id: q.id, state: "lobby" });
    expect((await p1.call("GET", `/live/${q.id}`)).json).toMatchObject({
      state: "lobby",
      question: null,
      total: 2,
      members: 2,
    });
    expect((await p1.call("POST", `/live/${q.id}/advance`)).status).toBe(403);

    const before = (
      await pool.query("SELECT count(*)::int AS n FROM attempt WHERE user_id = ANY($1)", [[p1.id, p2.id]])
    ).rows[0].n;
    let view = (await teacher.call("POST", `/live/${q.id}/advance`)).json;
    for (let i = 0; i < 2; i++) {
      expect(view).toMatchObject({ state: "question", number: i + 1, correctOptionId: null, counts: null });
      const qid = view.question.id;
      expect(Object.keys(view.question).sort()).toEqual(["id", "lessonId", "options", "stem"]);
      // Every viewer sees the options in the same order, poll after poll.
      const order = view.question.options.map((o: any) => o.id);
      for (const who of [p1, p2, teacher]) {
        expect((await who.call("GET", `/live/${q.id}`)).json.question.options.map((o: any) => o.id)).toEqual(order);
      }
      const k = await key(qid);
      const own = (await p1.call("POST", `/live/${q.id}/answer`, { question_id: qid, option_id: k.right })).json;
      expect(own).toMatchObject({ myAnswer: k.right, correctOptionId: null, myResult: null });
      // A changed answer doesn't count: the first one stands.
      await p1.call("POST", `/live/${q.id}/answer`, { question_id: qid, option_id: k.wrong });
      await p2.call("POST", `/live/${q.id}/answer`, { question_id: qid, option_id: k.wrong });
      expect(
        (await outsider.call("POST", `/live/${q.id}/answer`, { question_id: qid, option_id: k.right })).status,
      ).toBe(403);
      expect((await teacher.call("GET", `/live/${q.id}`)).json).toMatchObject({ answered: 2, counts: null });

      view = (await teacher.call("POST", `/live/${q.id}/advance`)).json;
      expect(view).toMatchObject({ state: "reveal", correctOptionId: k.right });
      expect(view.counts[k.right]).toBe(1);
      expect(view.counts[k.wrong]).toBe(1);
      expect((await p1.call("GET", `/live/${q.id}`)).json).toMatchObject({ myResult: true, myAnswer: k.right });
      expect((await p2.call("GET", `/live/${q.id}`)).json).toMatchObject({ myResult: false });
      expect((await p2.call("POST", `/live/${q.id}/answer`, { question_id: qid, option_id: k.right })).status).toBe(
        409,
      );
      view = (await teacher.call("POST", `/live/${q.id}/advance`)).json;
    }
    expect(view.state).toBe("ended");
    expect(view.scores).toEqual([
      { name: "Phone 1", right: 2 },
      { name: "Phone 2", right: 0 },
    ]);
    expect((await p2.call("GET", `/live/${q.id}`)).json).toMatchObject({ state: "ended", myScore: 0 });
    expect((await p2.call("GET", `/live/${q.id}`)).json.scores).toBeUndefined();
    // A classroom game: no attempts, so mastery and review are untouched.
    const after = (await pool.query("SELECT count(*)::int AS n FROM attempt WHERE user_id = ANY($1)", [[p1.id, p2.id]]))
      .rows[0].n;
    expect(after).toBe(before);
  });
});
