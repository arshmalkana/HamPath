/**
 * Practice: lesson Check answers, Daily Review, Section Checkpoints and mock exams (SPEC §5).
 * Correctness is never sent before the learner answers; grading, FSRS and mastery run here.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { drawMockExam, lessonCode, readBlueprint, type Blueprint, type QuestionsByTopic } from "@hampath/content";
import { tx, type Pool } from "@hampath/db";
import { HttpError, requireUser } from "../auth.ts";
import {
  applyAnswer,
  gradeBatch,
  insertAttempt,
  publicQuestions,
  questionFacts,
  teachLinks,
  workedSolution,
  type TeachLink,
} from "../grading.ts";

const Context = z.enum(["check", "checkpoint", "review", "mock", "placement"]);

const AttemptBody = z.strictObject({
  question_id: z.string(),
  option_id: z.uuid(),
  context: Context,
  try: z.number().int().min(1).max(4).default(1),
  ms_taken: z.number().int().min(0).max(3_600_000).optional(),
});

const SubmitBody = z.strictObject({
  answers: z.array(z.strictObject({ question_id: z.string(), option_id: z.uuid() })).max(400),
});

/** Questions that count as "today": due before the end of the current UTC day. */
const DUE_TODAY = `qs.due_at < date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + interval '1 day'`;
const REVIEW_SECONDS_PER_QUESTION = 30;
const MOCK_GRACE_SECONDS = 120;

let blueprintCache: Blueprint | null = null;
const blueprint = () => (blueprintCache ??= readBlueprint());

function shuffled<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export interface ResultItem {
  questionId: string;
  lessonId: string;
  lessonCode: string;
  sectionId: string;
  stem: string;
  correct: boolean;
  chosen: { id: string; text: string } | null;
  correctOption: { id: string; text: string };
  whyNot: string | null;
  workedSolution: string[] | null;
  teach: TeachLink | null;
}

/** Per-question results of a checkpoint or mock, rebuilt from its attempts. */
async function sessionResults(pool: Pool, sessionId: string, questionIds: string[]): Promise<ResultItem[]> {
  const facts = await questionFacts(pool, questionIds);
  const links = await teachLinks(pool, questionIds);
  const { rows: attempts } = await pool.query<{ question_id: string; option_id: string; correct: boolean }>(
    `SELECT DISTINCT ON (question_id) question_id, option_id, correct FROM attempt
      WHERE session_id = $1 ORDER BY question_id, created_at`,
    [sessionId],
  );
  const chosen = new Map(attempts.map((a) => [a.question_id, a]));
  const { rows: texts } = await pool.query<{ qid: string; stem: string; oid: string; text: string }>(
    `SELECT q.id AS qid, q.stem_en AS stem, o.id AS oid, o.text_en AS text
       FROM question q JOIN option o ON o.question_id = q.id WHERE q.id = ANY($1)`,
    [questionIds],
  );
  const stem = new Map(texts.map((t) => [t.qid, t.stem]));
  const optText = new Map(texts.map((t) => [t.oid, t.text]));
  return questionIds.flatMap((qid) => {
    const f = facts.get(qid);
    if (!f) return [];
    const a = chosen.get(qid);
    const correct = Boolean(a?.correct);
    return [
      {
        questionId: qid,
        lessonId: f.lessonId,
        lessonCode: lessonCode(f.lessonId),
        sectionId: f.sectionId,
        stem: stem.get(qid) ?? "",
        correct,
        chosen: a ? { id: a.option_id, text: optText.get(a.option_id) ?? "" } : null,
        correctOption: { id: f.correctOptionId, text: optText.get(f.correctOptionId) ?? "" },
        whyNot: correct || !a ? null : (f.options.get(a.option_id)?.whyNot ?? null),
        workedSolution: correct ? null : workedSolution(f.calcSpec),
        teach: links.get(qid) ?? null,
      },
    ];
  });
}

/** Lessons with misses, worst first, for "weak topics" lists. */
async function weakLessons(pool: Pool, items: ResultItem[]) {
  const by = new Map<string, { lessonId: string; missed: number; total: number }>();
  for (const it of items) {
    const e = by.get(it.lessonId) ?? { lessonId: it.lessonId, missed: 0, total: 0 };
    e.total++;
    if (!it.correct) e.missed++;
    by.set(it.lessonId, e);
  }
  const weak = [...by.values()]
    .filter((e) => e.missed > 0)
    .sort((a, b) => b.missed / b.total - a.missed / a.total || b.missed - a.missed);
  if (!weak.length) return [];
  const { rows } = await pool.query<{ id: string; code: string; title: string }>(
    "SELECT id, code, title FROM lesson WHERE id = ANY($1)",
    [weak.map((w) => w.lessonId)],
  );
  const meta = new Map(rows.map((r) => [r.id, r]));
  return weak.map((w) => ({
    ...w,
    code: meta.get(w.lessonId)?.code,
    title: meta.get(w.lessonId)?.title,
    href: `/lessons/${meta.get(w.lessonId)?.code}`,
  }));
}

function resolveSectionId(idOrNumber: string): string {
  if (/^[1-8]$/.test(idOrNumber)) return `B-00${idOrNumber}`;
  if (/^B-00[1-8]$/.test(idOrNumber)) return idOrNumber;
  throw new HttpError(404, `No section ${idOrNumber}`);
}

export function practiceRoutes(app: FastifyInstance, pool: Pool) {
  // ---- Single answers: lesson Check and Daily Review ----------------------------------------

  /**
   * Grade one answer. In the lesson Check a first wrong try gets the Why not? note for the chosen
   * option but not the correct answer (the learner gets a second try); everywhere else, and on
   * the second try, the correct answer is revealed.
   */
  app.post("/attempts", async (req) => {
    const user = await requireUser(pool, req);
    const body = AttemptBody.parse(req.body);
    if (body.context === "checkpoint" || body.context === "mock") {
      throw new HttpError(400, "Checkpoint and mock answers are submitted together at the end");
    }
    const facts = (await questionFacts(pool, [body.question_id])).get(body.question_id);
    const opt = facts?.options.get(body.option_id);
    if (!facts || !opt) {
      const { rows } = await pool.query("SELECT 1 FROM option WHERE id = $1 AND question_id = $2", [
        body.option_id,
        body.question_id,
      ]);
      if (rows.length) throw new HttpError(409, "This question was updated; reload the lesson");
      throw new HttpError(400, "That option does not belong to that question");
    }
    const at = new Date();
    const state = await tx(pool, async (c) => {
      await insertAttempt(c, {
        userId: user.id,
        questionId: body.question_id,
        optionId: body.option_id,
        correct: opt.isCorrect,
        context: body.context,
        tryNo: body.try,
        msTaken: body.ms_taken,
        at,
      });
      return applyAnswer(c, user.id, body.question_id, {
        correct: opt.isCorrect,
        context: body.context,
        tryNo: body.try,
        at,
      });
    });
    const reveal = opt.isCorrect || body.context !== "check" || body.try >= 2;
    const teach = (await teachLinks(pool, [body.question_id])).get(body.question_id) ?? null;
    return {
      correct: opt.isCorrect,
      revealed: reveal,
      correct_option_id: reveal ? facts.correctOptionId : null,
      why_not: opt.isCorrect ? null : opt.whyNot,
      worked_solution: reveal && !opt.isCorrect ? workedSolution(facts.calcSpec) : null,
      teach_card: teach,
      in_review_queue: !opt.isCorrect,
      mastered: state?.mastered ?? false,
      due_at: state?.dueAt ?? null,
    };
  });

  /** Today's spaced-review deck: questions FSRS has due by the end of today, most overdue first. */
  app.get<{ Querystring: { limit?: string } }>("/review/due", async (req) => {
    const user = await requireUser(pool, req);
    const limit = Math.min(30, Math.max(1, Number(req.query.limit ?? 20) || 20));
    const { rows } = await pool.query<{ id: string; dueAt: string; mastered: boolean; lessonId: string }>(
      `SELECT qs.question_id AS id, qs.due_at AS "dueAt", qs.mastered, q.lesson_id AS "lessonId"
         FROM question_state qs JOIN question q ON q.id = qs.question_id AND q.retired_in IS NULL
        WHERE qs.user_id = $1 AND qs.due_at IS NOT NULL AND ${DUE_TODAY}
        ORDER BY qs.due_at`,
      [user.id],
    );
    const deck = rows.slice(0, limit);
    return {
      dueCount: rows.length,
      due: rows,
      estMinutes: Math.max(deck.length ? 1 : 0, Math.round((deck.length * REVIEW_SECONDS_PER_QUESTION) / 60)),
      questions: await publicQuestions(
        pool,
        deck.map((r) => r.id),
      ),
    };
  });

  // ---- Section Checkpoints ------------------------------------------------------------------

  /** Build a checkpoint: every unmastered question in the section plus a sample of mastered ones. */
  app.post<{ Params: { sectionId: string } }>("/checkpoints/:sectionId", async (req) => {
    const user = await requireUser(pool, req);
    const sectionId = resolveSectionId(req.params.sectionId);
    const { rows: sec } = await pool.query<{ title: string; pass: number; sample: number }>(
      `SELECT title_en AS title, checkpoint_pass_percent AS pass, checkpoint_mastered_sample AS sample FROM section WHERE id = $1`,
      [sectionId],
    );
    if (!sec[0]) throw new HttpError(404, `No section ${sectionId}`);
    const { rows } = await pool.query<{ id: string; mastered: boolean }>(
      `SELECT q.id, coalesce(qs.mastered, false) AS mastered
         FROM question q JOIN lesson l ON l.id = q.lesson_id
         LEFT JOIN question_state qs ON qs.question_id = q.id AND qs.user_id = $2
        WHERE l.section_id = $1 AND q.retired_in IS NULL`,
      [sectionId, user.id],
    );
    const unmastered = rows.filter((r) => !r.mastered).map((r) => r.id);
    const mastered = rows.filter((r) => r.mastered).map((r) => r.id);
    const sample = shuffled(mastered).slice(0, Math.ceil(mastered.length * sec[0].sample));
    const ids = shuffled([...unmastered, ...sample]);
    const { rows: cp } = await pool.query<{ id: string }>(
      `INSERT INTO checkpoint (user_id, section_id, question_ids) VALUES ($1,$2,$3) RETURNING id`,
      [user.id, sectionId, ids],
    );
    return {
      id: cp[0]!.id,
      sectionId,
      title: sec[0].title,
      passPercent: sec[0].pass,
      unmastered: unmastered.length,
      masteredSampled: sample.length,
      questions: await publicQuestions(pool, ids),
    };
  });

  async function loadCheckpoint(userId: string, id: string) {
    if (!z.uuid().safeParse(id).success) throw new HttpError(404, "No such checkpoint");
    const { rows } = await pool.query<{
      id: string;
      section_id: string;
      question_ids: string[];
      finished_at: Date | null;
      score: number | null;
      passed: boolean | null;
      correct: number | null;
      total: number | null;
      title: string;
      pass: number;
    }>(
      `SELECT c.*, s.title_en AS title, s.checkpoint_pass_percent AS pass
         FROM checkpoint c JOIN section s ON s.id = c.section_id WHERE c.id = $1 AND c.user_id = $2`,
      [id, userId],
    );
    if (!rows[0]) throw new HttpError(404, "No such checkpoint");
    return rows[0];
  }

  async function checkpointResults(userId: string, cp: Awaited<ReturnType<typeof loadCheckpoint>>) {
    const items = await sessionResults(pool, cp.id, cp.question_ids);
    const { rows: badge } = await pool.query(
      "SELECT earned_at FROM section_badge WHERE user_id = $1 AND section_id = $2",
      [userId, cp.section_id],
    );
    return {
      id: cp.id,
      sectionId: cp.section_id,
      title: cp.title,
      finished: true,
      passPercent: cp.pass,
      score: cp.score,
      correct: cp.correct,
      total: cp.total,
      passed: cp.passed,
      badge: Boolean(badge[0]),
      weakLessons: await weakLessons(pool, items),
      misses: items.filter((i) => !i.correct),
    };
  }

  app.get<{ Params: { id: string } }>("/checkpoints/:id", async (req) => {
    const user = await requireUser(pool, req);
    const cp = await loadCheckpoint(user.id, req.params.id);
    if (cp.finished_at) return checkpointResults(user.id, cp);
    return {
      id: cp.id,
      sectionId: cp.section_id,
      title: cp.title,
      finished: false,
      passPercent: cp.pass,
      questions: await publicQuestions(pool, cp.question_ids),
    };
  });

  app.post<{ Params: { id: string } }>("/checkpoints/:id/submit", async (req) => {
    const user = await requireUser(pool, req);
    const body = SubmitBody.parse(req.body);
    const cp = await loadCheckpoint(user.id, req.params.id);
    if (cp.finished_at) throw new HttpError(409, "This checkpoint was already submitted");
    const answers = new Map(
      body.answers.filter((a) => cp.question_ids.includes(a.question_id)).map((a) => [a.question_id, a.option_id]),
    );
    const graded = await gradeBatch(pool, user.id, cp.question_ids, answers, "checkpoint", cp.id);
    const correct = graded.filter((g) => g.correct).length;
    const total = graded.length;
    const score = total ? Math.round((1000 * correct) / total) / 10 : 0;
    const passed = score >= cp.pass;
    await pool.query(
      `UPDATE checkpoint SET finished_at = now(), correct = $2, total = $3, score = $4, passed = $5 WHERE id = $1`,
      [cp.id, correct, total, score, passed],
    );
    if (passed) {
      await pool.query(
        `INSERT INTO section_badge (user_id, section_id, checkpoint_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [user.id, cp.section_id, cp.id],
      );
    }
    return checkpointResults(user.id, { ...cp, finished_at: new Date(), correct, total, score, passed });
  });

  // ---- Mock exams (LAB-35) ------------------------------------------------------------------

  async function questionsByTopic(): Promise<QuestionsByTopic> {
    const { rows } = await pool.query<{ id: string; lesson_id: string }>(
      "SELECT id, lesson_id FROM question WHERE retired_in IS NULL",
    );
    const map: QuestionsByTopic = new Map();
    for (const r of rows) {
      const code = lessonCode(r.lesson_id);
      map.set(code, [...(map.get(code) ?? []), r.id]);
    }
    return map;
  }

  app.get("/mocks", async (req) => {
    const user = await requireUser(pool, req);
    const { rows } = await pool.query(
      `SELECT id, score, passed, honours, correct, total, started_at AS "startedAt", finished_at AS "finishedAt"
         FROM mock_exam WHERE user_id = $1 ORDER BY started_at DESC LIMIT 20`,
      [user.id],
    );
    const bp = blueprint();
    return {
      mocks: rows,
      blueprint: {
        version: bp.version,
        total: bp.total_questions,
        timeLimitMinutes: bp.time_limit_minutes,
        passPercent: bp.pass_percent,
        honoursPercent: bp.honours_percent,
      },
    };
  });

  /** Generate a mock exam from the blueprint (content/exam-blueprint.yaml). */
  app.post("/mocks", async (req) => {
    const user = await requireUser(pool, req);
    const bp = blueprint();
    const ids = drawMockExam(bp, await questionsByTopic());
    const { rows } = await pool.query<{ id: string; started_at: Date }>(
      `INSERT INTO mock_exam (user_id, question_ids, time_limit_s, blueprint_version) VALUES ($1,$2,$3,$4) RETURNING id, started_at`,
      [user.id, ids, bp.time_limit_minutes * 60, bp.version],
    );
    return {
      id: rows[0]!.id,
      finished: false,
      startedAt: rows[0]!.started_at,
      timeLimitS: bp.time_limit_minutes * 60,
      passPercent: bp.pass_percent,
      honoursPercent: bp.honours_percent,
      questions: await publicQuestions(pool, ids),
    };
  });

  async function loadMock(userId: string, id: string) {
    if (!z.uuid().safeParse(id).success) throw new HttpError(404, "No such mock exam");
    const { rows } = await pool.query<{
      id: string;
      question_ids: string[];
      started_at: Date;
      finished_at: Date | null;
      time_limit_s: number;
      score: number | null;
      correct: number | null;
      total: number | null;
      passed: boolean | null;
      honours: boolean | null;
      section_breakdown: { sectionId: string; correct: number; total: number }[] | null;
    }>("SELECT * FROM mock_exam WHERE id = $1 AND user_id = $2", [id, userId]);
    if (!rows[0]) throw new HttpError(404, "No such mock exam");
    return rows[0];
  }

  async function mockResults(m: Awaited<ReturnType<typeof loadMock>>) {
    const bp = blueprint();
    const items = await sessionResults(pool, m.id, m.question_ids);
    const { rows: sections } = await pool.query<{ id: string; number: number; title: string }>(
      "SELECT id, number, title_en AS title FROM section ORDER BY number",
    );
    const breakdown = sections
      .map((s) => {
        const mine = items.filter((i) => i.sectionId === s.id);
        return {
          sectionId: s.id,
          number: s.number,
          title: s.title,
          correct: mine.filter((i) => i.correct).length,
          total: mine.length,
        };
      })
      .filter((s) => s.total > 0);
    return {
      id: m.id,
      finished: true,
      startedAt: m.started_at,
      finishedAt: m.finished_at,
      score: m.score,
      correct: m.correct,
      total: m.total,
      passed: m.passed,
      honours: m.honours,
      passPercent: bp.pass_percent,
      honoursPercent: bp.honours_percent,
      sectionBreakdown: breakdown,
      weakLessons: await weakLessons(pool, items),
      misses: items.filter((i) => !i.correct),
    };
  }

  app.get<{ Params: { id: string } }>("/mocks/:id", async (req) => {
    const user = await requireUser(pool, req);
    const m = await loadMock(user.id, req.params.id);
    if (m.finished_at) return mockResults(m);
    const bp = blueprint();
    return {
      id: m.id,
      finished: false,
      startedAt: m.started_at,
      timeLimitS: m.time_limit_s,
      remainingS: Math.max(0, Math.round(m.time_limit_s - (Date.now() - m.started_at.getTime()) / 1000)),
      passPercent: bp.pass_percent,
      honoursPercent: bp.honours_percent,
      questions: await publicQuestions(pool, m.question_ids),
    };
  });

  app.post<{ Params: { id: string } }>("/mocks/:id/submit", async (req) => {
    const user = await requireUser(pool, req);
    const body = SubmitBody.parse(req.body);
    const m = await loadMock(user.id, req.params.id);
    if (m.finished_at) throw new HttpError(409, "This mock exam was already submitted");
    const elapsedS = (Date.now() - m.started_at.getTime()) / 1000;
    if (elapsedS > m.time_limit_s + MOCK_GRACE_SECONDS) {
      // Out of time: like the real exam, answers after the limit don't count.
      body.answers = [];
    }
    const bp = blueprint();
    const answers = new Map(
      body.answers.filter((a) => m.question_ids.includes(a.question_id)).map((a) => [a.question_id, a.option_id]),
    );
    const graded = await gradeBatch(pool, user.id, m.question_ids, answers, "mock", m.id);
    const correct = graded.filter((g) => g.correct).length;
    const total = graded.length;
    const score = total ? Math.round((1000 * correct) / total) / 10 : 0;
    const breakdown = [...new Set(graded.map((g) => g.sectionId))].map((sectionId) => {
      const gs = graded.filter((g) => g.sectionId === sectionId);
      return { sectionId, correct: gs.filter((g) => g.correct).length, total: gs.length };
    });
    const passed = score >= bp.pass_percent;
    const honours = score >= bp.honours_percent;
    await pool.query(
      `UPDATE mock_exam SET finished_at = now(), score = $2, correct = $3, total = $4, passed = $5, honours = $6, section_breakdown = $7 WHERE id = $1`,
      [m.id, score, correct, total, passed, honours, JSON.stringify(breakdown)],
    );
    return mockResults({ ...m, finished_at: new Date(), score, correct, total, passed, honours });
  });
}
