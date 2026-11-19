import { readFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BANK_PATH } from "@hampath/content";
import { createPool } from "@hampath/db";
import { buildApp } from "./app.ts";

/**
 * End to end: every question in ISED's bank file reaches the learner word for word.
 * The file is split here independently of the importer (semicolons, CRLF, header row, fields
 * trimmed of surrounding spaces only), then compared with what the API serves in each lesson's
 * Check, and the bank's correct answer (field 3) must be the option the server grades as right.
 */
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
  return async (method: "GET" | "POST", url: string, body?: unknown) => {
    const res = await app.inject({ method, url: `/api/v1${url}`, payload: body as object, headers: { cookie } });
    for (const c of ([] as string[]).concat(res.headers["set-cookie"] ?? [])) {
      const [pair] = c.split(";");
      if (pair!.startsWith("hp_session=")) cookie = pair!;
    }
    return { status: res.statusCode, json: res.json() as any };
  };
}

const raw = readFileSync(BANK_PATH, "utf8")
  .replace(/^\uFEFF/, "")
  .split(/\r?\n/)
  .slice(1)
  .filter((l) => l.trim() !== "")
  .map((l) => l.split(";").map((f) => f.trim()));
const bank = new Map(raw.map((f) => [f[0]!, { stem: f[1]!, correct: f[2]!, options: [f[2]!, f[3]!, f[4]!, f[5]!] }]));
const lessonIds = [...new Set(raw.map((f) => f[0]!.slice(0, 9)))];

describe("ISED bank, word for word", () => {
  it("has 984 questions in 100 topic groups", () => {
    expect(raw.every((f) => f.length === 11)).toBe(true);
    expect(bank.size).toBe(984);
    expect(lessonIds).toHaveLength(100);
  });

  it("serves every question in its lesson's Check with the exact stem and options", async () => {
    const call = browser();
    const served = new Set<string>();
    const mismatches: string[] = [];
    for (const lessonId of lessonIds) {
      const { status, json } = await call("GET", `/lessons/${lessonId}`);
      expect(status, lessonId).toBe(200);
      const expected = [...bank.keys()].filter((id) => id.startsWith(lessonId)).sort();
      expect(json.questions.map((q: any) => q.id).sort(), lessonId).toEqual(expected);
      for (const q of json.questions) {
        const b = bank.get(q.id)!;
        served.add(q.id);
        if (q.stem !== b.stem) mismatches.push(`${q.id} stem: ${JSON.stringify(q.stem)} != ${JSON.stringify(b.stem)}`);
        const got = q.options.map((o: any) => o.text).sort();
        const want = [...b.options].sort();
        if (JSON.stringify(got) !== JSON.stringify(want)) mismatches.push(`${q.id} options: ${got.join(" | ")}`);
      }
    }
    expect(mismatches).toEqual([]);
    expect(served.size).toBe(984);
  });

  it("grades the bank's correct answer as right, and every other option as wrong", async () => {
    const call = browser();
    await call("POST", "/auth/guest");
    const wrongGraded: string[] = [];
    for (const lessonId of lessonIds) {
      const { json } = await call("GET", `/lessons/${lessonId}`);
      for (const q of json.questions) {
        const b = bank.get(q.id)!;
        const right = q.options.find((o: any) => o.text === b.correct);
        const wrong = q.options.find((o: any) => o.text !== b.correct);
        const r1 = (await call("POST", "/attempts", { question_id: q.id, option_id: right.id, context: "review" }))
          .json;
        const r2 = (await call("POST", "/attempts", { question_id: q.id, option_id: wrong.id, context: "review" }))
          .json;
        if (r1.correct !== true) wrongGraded.push(`${q.id}: "${b.correct}" graded wrong`);
        if (r2.correct !== false) wrongGraded.push(`${q.id}: "${wrong.text}" graded right`);
        if (r2.correct_option_id !== right.id) wrongGraded.push(`${q.id}: reveals the wrong option`);
      }
    }
    expect(wrongGraded).toEqual([]);
  }, 300_000);
});
