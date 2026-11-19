import { readFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BANK_PATH } from "@hampath/content";
import { createPool, loadContent } from "@hampath/db";
import { buildApp } from "./app.ts";

const pool = createPool();
let app: FastifyInstance;
const original = readFileSync(BANK_PATH, "utf8");
beforeAll(async () => {
  app = await buildApp(pool);
});
afterAll(async () => {
  // Put the real bank back for the other suites.
  await admin("POST", "/admin/import-bank?source=restore", original);
  await app.close();
  await pool.end();
}, 60_000);

const TOKEN = { "x-admin-token": "test-admin-token-123" };
async function admin(method: "GET" | "POST", url: string, text?: string) {
  const res = await app.inject({
    method,
    url: `/api/v1${url}`,
    payload: text,
    headers: text === undefined ? TOKEN : { ...TOKEN, "content-type": "text/plain" },
  });
  return { status: res.statusCode, json: res.json() as any };
}
function learner() {
  let cookie = "";
  return async (method: "GET" | "POST", url: string, body?: unknown) => {
    const res = await app.inject({ method, url: `/api/v1${url}`, payload: body as object, headers: { cookie } });
    for (const c of ([] as string[]).concat(res.headers["set-cookie"] ?? [])) {
      const [pair] = c.split(";");
      if (pair!.startsWith("hp_session=")) cookie = pair!;
    }
    return { status: res.statusCode, json: res.json() as any };
  };
}

/** The bank with one question's correct answer reworded (field 3 is always the correct answer). */
function withNewAnswer(qid: string, answer: string) {
  return original
    .split("\r\n")
    .map((line) => {
      if (!line.startsWith(`${qid};`)) return line;
      const f = line.split(";");
      f[2] = answer;
      return f.join(";");
    })
    .join("\r\n");
}

describe("bank update workflow (Step 33)", () => {
  const qid = "B-005-004-003";
  const lessonId = "B-005-004";

  it("previews, applies, flags the lesson until reviewed, resets mastery, and keeps old attempts on their version", async () => {
    // A learner answers the question under the current bank and has mastered it.
    const call = learner();
    const userId = (await call("POST", "/auth/guest")).json.user.id as string;
    const { rows: before } = await pool.query<{ id: string; text_en: string; bank_version: number }>(
      "SELECT id, text_en, bank_version FROM option WHERE question_id = $1 AND is_correct AND retired_in IS NULL",
      [qid],
    );
    const oldOption = before[0]!;
    await call("POST", "/attempts", { question_id: qid, option_id: oldOption.id, context: "review" });
    await pool.query(
      "UPDATE question_state SET mastered = true, due_at = now() + interval '30 days' WHERE user_id = $1 AND question_id = $2",
      [userId, qid],
    );

    const edited = withNewAnswer(qid, `${oldOption.text_en} (revised)`);
    const preview = await admin("POST", "/admin/import-bank?dry_run=true&source=edited.txt", edited);
    expect(preview.status).toBe(200);
    expect(preview.json).toMatchObject({
      dryRun: true,
      bankVersion: null,
      added: [],
      retired: [],
      changed: [{ id: qid, fields: ["correct_answer"] }],
      lessonsNeedingReview: [lessonId],
    });
    // At least our learner; other suites share the database and may have answered it too.
    expect(preview.json.masteryReset).toBeGreaterThanOrEqual(1);
    expect(preview.json.changes).toEqual([
      { id: qid, field: "correct_answer", before: oldOption.text_en, after: `${oldOption.text_en} (revised)` },
    ]);
    // A preview writes nothing.
    expect((await admin("GET", "/admin/card-reviews")).json.reviews.filter((r: any) => !r.resolvedAt)).toEqual([]);

    const applied = (await admin("POST", "/admin/import-bank?source=edited.txt", edited)).json;
    expect(applied.bankVersion).toBeGreaterThan(oldOption.bank_version);

    // The lesson is up for review, with the reason; reloading content doesn't clear it.
    await loadContent(pool);
    const { rows: flag } = await pool.query("SELECT needs_card_review FROM lesson WHERE id = $1", [lessonId]);
    expect(flag[0].needs_card_review).toBe(true);
    const open = (await admin("GET", "/admin/card-reviews")).json.reviews.filter((r: any) => !r.resolvedAt);
    expect(open).toEqual([
      expect.objectContaining({
        code: "5.04",
        bankVersion: applied.bankVersion,
        questions: [{ id: qid, fields: ["correct_answer"] }],
      }),
    ]);

    // Mastery was reset: the learner sees it again today.
    const { rows: state } = await pool.query(
      "SELECT mastered, due_at FROM question_state WHERE user_id = $1 AND question_id = $2",
      [userId, qid],
    );
    expect(state[0].mastered).toBe(false);
    expect(state[0].due_at.getTime()).toBeLessThanOrEqual(Date.now());

    // The old attempt still points at the option the learner saw, now retired, from the old version.
    const { rows: attempt } = await pool.query(
      `SELECT o.text_en, o.bank_version, o.retired_in FROM attempt a JOIN option o ON o.id = a.option_id
        WHERE a.user_id = $1 AND a.question_id = $2`,
      [userId, qid],
    );
    expect(attempt[0]).toMatchObject({
      text_en: oldOption.text_en,
      bank_version: oldOption.bank_version,
      retired_in: applied.bankVersion,
    });
    const versions = (await admin("GET", "/admin/bank-versions")).json.versions;
    expect(versions[0]).toMatchObject({ id: applied.bankVersion, changed: 1, sourceFile: "edited.txt" });
    expect(versions.find((v: any) => v.id === oldOption.bank_version).attempts).toBeGreaterThan(0);
    // Answering with the retired option now asks for a reload instead of grading stale text.
    expect(
      (await call("POST", "/attempts", { question_id: qid, option_id: oldOption.id, context: "review" })).status,
    ).toBe(409);

    // Resolving the review clears the lesson flag.
    expect((await learner()("POST", `/admin/card-reviews/${open[0].id}/resolve`)).status).toBe(403);
    expect((await admin("POST", `/admin/card-reviews/${open[0].id}/resolve`)).json).toEqual({ resolved: open[0].id });
    expect((await admin("POST", `/admin/card-reviews/${open[0].id}/resolve`)).status).toBe(404);
    const { rows: cleared } = await pool.query("SELECT needs_card_review FROM lesson WHERE id = $1", [lessonId]);
    expect(cleared[0].needs_card_review).toBe(false);
  }, 60_000);
});
