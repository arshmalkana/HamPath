/**
 * Placement test and section test-out (SPEC learner journey step 1, and the "Placement / test-out"
 * row of the assessment table).
 *
 * - Placement (optional, about 10 minutes): 24 questions, 3 per section, each from a different
 *   lesson. A section answered 3 for 3 is a strong area; the results recommend testing out of it.
 * - Test-out (any section, any time): 3 questions per lesson. Every one right marks the lesson
 *   tested out (and complete), and all of that lesson's questions still enter Daily Review.
 *
 * Both are submitted whole, like checkpoints; their attempts use the "placement" context and move
 * the FSRS state like any other answer.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { lessonCode } from "@hampath/content";
import { tx, type Pool } from "@hampath/db";
import { HttpError, requireUser } from "../auth.ts";
import { gradeBatch, publicQuestions, type GradedAnswer } from "../grading.ts";
import { resolveSectionId, sessionResults, shuffled, weakLessons } from "./practice.ts";

export const PLACEMENT_PER_SECTION = 3;
export const TEST_OUT_PER_LESSON = 3;
/** Questions of a tested-out lesson that weren't asked enter review spread over this many days. */
const REVIEW_SPREAD_DAYS = 7;

const SubmitBody = z.strictObject({
  answers: z.array(z.strictObject({ question_id: z.string(), option_id: z.uuid() })).max(400),
});

type Kind = "placement" | "test_out";
interface Session {
  id: string;
  kind: Kind;
  section_id: string | null;
  question_ids: string[];
  correct: number | null;
  total: number | null;
  score: number | null;
  results: unknown;
  finished_at: Date | null;
}

export function placementRoutes(app: FastifyInstance, pool: Pool) {
  /** Live questions grouped by lesson, with each lesson's section. */
  async function questionsByLesson(sectionId?: string) {
    const { rows } = await pool.query<{ lesson_id: string; section_id: string; ids: string[] }>(
      `SELECT l.id AS lesson_id, l.section_id, array_agg(q.id ORDER BY q.id) AS ids
         FROM lesson l JOIN question q ON q.lesson_id = l.id AND q.retired_in IS NULL
        WHERE $1::text IS NULL OR l.section_id = $1
        GROUP BY l.id, l.section_id ORDER BY l.id`,
      [sectionId ?? null],
    );
    return rows;
  }

  async function sections() {
    const { rows } = await pool.query<{ id: string; number: number; title: string }>(
      "SELECT id, number, title_en AS title FROM section ORDER BY number",
    );
    return rows;
  }

  async function load(userId: string, id: string, kind: Kind): Promise<Session> {
    if (!z.uuid().safeParse(id).success) throw new HttpError(404, "No such test");
    const { rows } = await pool.query<Session>(
      "SELECT * FROM quiz_session WHERE id = $1 AND user_id = $2 AND kind = $3",
      [id, userId, kind],
    );
    if (!rows[0]) throw new HttpError(404, "No such test");
    return rows[0];
  }

  async function create(userId: string, kind: Kind, sectionId: string | null, ids: string[]) {
    const { rows } = await pool.query<{ id: string }>(
      "INSERT INTO quiz_session (user_id, kind, section_id, question_ids) VALUES ($1,$2,$3,$4) RETURNING id",
      [userId, kind, sectionId, ids],
    );
    return rows[0]!.id;
  }

  async function finish(s: Session, graded: GradedAnswer[], results: unknown) {
    const correct = graded.filter((g) => g.correct).length;
    const total = graded.length;
    const score = total ? Math.round((1000 * correct) / total) / 10 : 0;
    await pool.query(
      "UPDATE quiz_session SET finished_at = now(), correct = $2, total = $3, score = $4, results = $5 WHERE id = $1",
      [s.id, correct, total, score, JSON.stringify(results)],
    );
    return { ...s, finished_at: new Date(), correct, total, score, results };
  }

  function inProgress(s: Session, title: string) {
    return publicQuestions(pool, s.question_ids).then((questions) => ({
      id: s.id,
      finished: false as const,
      title,
      passPercent: 100,
      questions,
    }));
  }

  // ---- Placement ---------------------------------------------------------------------------

  interface PlacementResults {
    sections: { sectionId: string; number: number; title: string; correct: number; total: number }[];
  }

  async function placementResults(s: Session) {
    const items = await sessionResults(pool, s.id, s.question_ids);
    const r = s.results as PlacementResults;
    return {
      id: s.id,
      kind: "placement" as const,
      finished: true as const,
      title: "Placement",
      score: s.score,
      correct: s.correct,
      total: s.total,
      passed: true,
      passPercent: 100,
      sectionBreakdown: r.sections,
      recommendTestOut: r.sections.filter((x) => x.total > 0 && x.correct === x.total),
      weakLessons: await weakLessons(pool, items),
      misses: items.filter((i) => !i.correct),
    };
  }

  app.post("/placement", async (req) => {
    const user = await requireUser(pool, req);
    const lessons = await questionsByLesson();
    const ids: string[] = [];
    for (const sec of await sections()) {
      // One question each from three different lessons of the section.
      const picks = shuffled(lessons.filter((l) => l.section_id === sec.id)).slice(0, PLACEMENT_PER_SECTION);
      for (const l of picks) ids.push(shuffled(l.ids)[0]!);
    }
    const id = await create(user.id, "placement", null, shuffled(ids));
    return inProgress(await load(user.id, id, "placement"), "Placement");
  });

  /** The learner's latest finished placement, for the dashboard and the test-out page. */
  app.get("/placement", async (req) => {
    const user = await requireUser(pool, req);
    const { rows } = await pool.query<Session>(
      `SELECT * FROM quiz_session WHERE user_id = $1 AND kind = 'placement' AND finished_at IS NOT NULL
        ORDER BY finished_at DESC LIMIT 1`,
      [user.id],
    );
    if (!rows[0]) return { latest: null };
    const r = rows[0].results as PlacementResults;
    return {
      latest: {
        id: rows[0].id,
        finishedAt: rows[0].finished_at,
        score: rows[0].score,
        sections: r.sections,
        recommendTestOut: r.sections.filter((x) => x.total > 0 && x.correct === x.total).map((x) => x.number),
      },
    };
  });

  app.get<{ Params: { id: string } }>("/placement/:id", async (req) => {
    const user = await requireUser(pool, req);
    const s = await load(user.id, req.params.id, "placement");
    return s.finished_at ? placementResults(s) : inProgress(s, "Placement");
  });

  app.post<{ Params: { id: string } }>("/placement/:id/submit", async (req) => {
    const user = await requireUser(pool, req);
    const body = SubmitBody.parse(req.body);
    const s = await load(user.id, req.params.id, "placement");
    if (s.finished_at) throw new HttpError(409, "This placement test was already submitted");
    const answers = new Map(
      body.answers.filter((a) => s.question_ids.includes(a.question_id)).map((a) => [a.question_id, a.option_id]),
    );
    const graded = await gradeBatch(pool, user.id, s.question_ids, answers, "placement", s.id);
    const results: PlacementResults = {
      sections: (await sections()).map((sec) => {
        const mine = graded.filter((g) => g.sectionId === sec.id);
        return {
          sectionId: sec.id,
          number: sec.number,
          title: sec.title,
          correct: mine.filter((g) => g.correct).length,
          total: mine.length,
        };
      }),
    };
    return placementResults(await finish(s, graded, results));
  });

  // ---- Test-out ----------------------------------------------------------------------------

  interface TestOutResults {
    lessons: { lessonId: string; code: string; title: string; correct: number; total: number; testedOut: boolean }[];
  }

  async function testOutResults(s: Session) {
    const items = await sessionResults(pool, s.id, s.question_ids);
    const r = s.results as TestOutResults;
    const { rows: sec } = await pool.query<{ number: number; title: string }>(
      "SELECT number, title_en AS title FROM section WHERE id = $1",
      [s.section_id],
    );
    const testedOut = r.lessons.filter((l) => l.testedOut).length;
    return {
      id: s.id,
      kind: "test_out" as const,
      finished: true as const,
      title: `Section ${sec[0]?.number}: ${sec[0]?.title}`,
      score: s.score,
      correct: s.correct,
      total: s.total,
      passed: testedOut > 0,
      passPercent: 100,
      lessons: r.lessons,
      testedOut,
      weakLessons: await weakLessons(pool, items),
      misses: items.filter((i) => !i.correct),
    };
  }

  app.post<{ Params: { sectionId: string } }>("/test-out/:sectionId", async (req) => {
    const user = await requireUser(pool, req);
    const sectionId = resolveSectionId(req.params.sectionId);
    const lessons = await questionsByLesson(sectionId);
    if (!lessons.length) throw new HttpError(404, `No section ${req.params.sectionId}`);
    const ids = lessons.flatMap((l) => shuffled(l.ids).slice(0, TEST_OUT_PER_LESSON));
    const { rows } = await pool.query<{ title: string; number: number }>(
      "SELECT title_en AS title, number FROM section WHERE id = $1",
      [sectionId],
    );
    const id = await create(user.id, "test_out", sectionId, shuffled(ids));
    return inProgress(await load(user.id, id, "test_out"), `Section ${rows[0]!.number}: ${rows[0]!.title}`);
  });

  app.get<{ Params: { id: string } }>("/test-out/:id", async (req) => {
    const user = await requireUser(pool, req);
    const s = await load(user.id, req.params.id, "test_out");
    if (s.finished_at) return testOutResults(s);
    const { rows } = await pool.query<{ title: string; number: number }>(
      "SELECT title_en AS title, number FROM section WHERE id = $1",
      [s.section_id],
    );
    return inProgress(s, `Section ${rows[0]?.number}: ${rows[0]?.title}`);
  });

  app.post<{ Params: { id: string } }>("/test-out/:id/submit", async (req) => {
    const user = await requireUser(pool, req);
    const body = SubmitBody.parse(req.body);
    const s = await load(user.id, req.params.id, "test_out");
    if (s.finished_at) throw new HttpError(409, "This test-out was already submitted");
    const answers = new Map(
      body.answers.filter((a) => s.question_ids.includes(a.question_id)).map((a) => [a.question_id, a.option_id]),
    );
    const graded = await gradeBatch(pool, user.id, s.question_ids, answers, "placement", s.id);
    const { rows: meta } = await pool.query<{ id: string; title: string }>(
      "SELECT id, title FROM lesson WHERE section_id = $1 ORDER BY id",
      [s.section_id],
    );
    const lessons = meta
      .map((l) => {
        const mine = graded.filter((g) => g.lessonId === l.id);
        const correct = mine.filter((g) => g.correct).length;
        return {
          lessonId: l.id,
          code: lessonCode(l.id),
          title: l.title,
          correct,
          total: mine.length,
          testedOut: mine.length > 0 && correct === mine.length,
        };
      })
      .filter((l) => l.total > 0);
    const passed = lessons.filter((l) => l.testedOut).map((l) => l.lessonId);
    if (passed.length) {
      await tx(pool, async (c) => {
        await c.query(
          `INSERT INTO lesson_progress (user_id, lesson_id, completed_at, tested_out)
           SELECT $1, unnest($2::text[]), now(), true
           ON CONFLICT (user_id, lesson_id) DO UPDATE
             SET tested_out = true, completed_at = coalesce(lesson_progress.completed_at, now())`,
          [user.id, passed],
        );
        // "Its questions still enter review": every question of the lesson gets a review slot. The
        // ones just answered already have one; the rest are spread over the coming week.
        await c.query(
          `INSERT INTO question_state (user_id, question_id, due_at, updated_at)
           SELECT $1, q.id, now() + ((row_number() OVER (ORDER BY q.id)) % $3) * interval '1 day', now()
             FROM question q WHERE q.lesson_id = ANY($2) AND q.retired_in IS NULL
           ON CONFLICT (user_id, question_id) DO NOTHING`,
          [user.id, passed, REVIEW_SPREAD_DAYS],
        );
      });
    }
    return testOutResults(await finish(s, graded, { lessons } satisfies TestOutResults));
  });
}
