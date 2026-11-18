import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { evaluateGoal, labVariables, runCalculation, type CalcSpec } from "@hampath/ham-sim";
import { HttpError, requireUser } from "../auth.ts";
import { tx, type Pool } from "@hampath/db";
import { nextState, type QState } from "../mastery.ts";
import { resolveLessonId } from "./content.ts";

const AttemptBody = z.strictObject({
  question_id: z.string(),
  option_id: z.uuid(),
  context: z.enum(["check", "checkpoint", "review", "mock", "placement"]),
  try: z.number().int().min(1).max(4).default(1),
  ms_taken: z.number().int().min(0).max(3_600_000).optional(),
});

const LabEventBody = z.strictObject({
  lab_step_id: z.string(),
  event: z.enum(["started", "goal_met", "hint_used", "value_changed"]),
  payload: z.record(z.string(), z.unknown()).default({}),
});

const ProgressBody = z.strictObject({
  step: z.number().int().min(0).max(500).optional(),
  complete: z.boolean().optional(),
});

export function learnRoutes(app: FastifyInstance, pool: Pool) {
  /**
   * Grade an answer server-side. In the lesson Check a first wrong try gets the Why not? note
   * for the chosen option but not the correct answer (the learner gets a second try);
   * everywhere else, and on the second try, the correct answer is revealed.
   */
  app.post("/attempts", async (req) => {
    const user = await requireUser(pool, req);
    const body = AttemptBody.parse(req.body);

    const { rows: [opt] } = await pool.query<{
      is_correct: boolean; why_not: string | null; retired: boolean; calc_spec: CalcSpec | null; q_retired: boolean;
    }>(
      `SELECT o.is_correct, o.why_not_en AS why_not, o.retired_in IS NOT NULL AS retired,
              q.calc_spec, q.retired_in IS NOT NULL AS q_retired
         FROM option o JOIN question q ON q.id = o.question_id
        WHERE o.id = $1 AND o.question_id = $2`,
      [body.option_id, body.question_id],
    );
    if (!opt) throw new HttpError(400, "That option does not belong to that question");
    if (opt.retired || opt.q_retired) throw new HttpError(409, "This question was updated; reload the lesson");

    const at = new Date();
    const result = await tx(pool, async (c) => {
      await c.query(
        `INSERT INTO attempt (user_id, question_id, option_id, correct, context, try_no, ms_taken, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [user.id, body.question_id, body.option_id, opt.is_correct, body.context, body.try, body.ms_taken ?? null, at],
      );
      const { rows: [prevRow] } = await c.query(
        `SELECT mastered, streak, last_correct_at AS "lastCorrectAt", lapses, due_at AS "dueAt"
           FROM question_state WHERE user_id=$1 AND question_id=$2 FOR UPDATE`,
        [user.id, body.question_id],
      );
      const next = nextState((prevRow as QState | undefined) ?? null, {
        correct: opt.is_correct, context: body.context, tryNo: body.try, at,
      });
      if (next) {
        await c.query(
          `INSERT INTO question_state (user_id, question_id, mastered, streak, last_correct_at, lapses, due_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (user_id, question_id) DO UPDATE SET mastered=EXCLUDED.mastered, streak=EXCLUDED.streak,
             last_correct_at=EXCLUDED.last_correct_at, lapses=EXCLUDED.lapses, due_at=EXCLUDED.due_at, updated_at=EXCLUDED.updated_at`,
          [user.id, body.question_id, next.mastered, next.streak, next.lastCorrectAt, next.lapses, next.dueAt, at],
        );
      }
      return next;
    });

    const reveal = opt.is_correct || body.context !== "check" || body.try >= 2;
    let correctOptionId: string | null = null;
    let workedSolution: string[] | null = null;
    if (reveal) {
      const { rows: [c] } = await pool.query<{ id: string }>(
        "SELECT id FROM option WHERE question_id=$1 AND is_correct AND retired_in IS NULL",
        [body.question_id],
      );
      correctOptionId = c?.id ?? null;
      if (opt.calc_spec) workedSolution = runCalculation(opt.calc_spec).steps;
    }
    // "See it again": prefer the Learn card that explains the fact, then practice cards, then the lab.
    const { rows: [card] } = await pool.query<{ id: string; title: string; code: string }>(
      `SELECT c.id, c.title, l.code FROM card_question cq JOIN card c ON c.id = cq.card_id JOIN lesson l ON l.id = c.lesson_id
        WHERE cq.question_id = $1
        ORDER BY CASE c.type WHEN 'concept' THEN 0 WHEN 'worked_example' THEN 1 WHEN 'lab' THEN 5 WHEN 'hook' THEN 9 ELSE 3 END, c.sort_order
        LIMIT 1`,
      [body.question_id],
    );

    return {
      correct: opt.is_correct,
      revealed: reveal,
      correct_option_id: correctOptionId,
      why_not: opt.is_correct ? null : opt.why_not,
      worked_solution: workedSolution,
      teach_card: card
        ? { id: card.id, title: card.title, href: `/lessons/${card.code}?card=${encodeURIComponent(card.id)}` }
        : null,
      in_review_queue: !opt.is_correct,
      mastered: result?.mastered ?? false,
    };
  });

  /** Lab telemetry. goal_met is re-checked on the server from the lab's reported inputs. */
  app.post("/lab-events", async (req) => {
    const user = await requireUser(pool, req);
    const body = LabEventBody.parse(req.body);
    const { rows: [step] } = await pool.query<{
      lab_id: string; goal_expr: string | null; lesson_id: string; card_order: number | null; config_json: { build?: boolean };
    }>(
      `SELECT ls.lab_id, ls.goal_expr, ls.lesson_id, ls.config_json,
              (SELECT min(c.sort_order) FROM card c WHERE c.lab_step_id = ls.id) AS card_order
         FROM lab_step ls WHERE ls.id = $1`,
      [body.lab_step_id],
    );
    if (!step) throw new HttpError(404, `No lab step ${body.lab_step_id}`);

    let verified: boolean | null = null;
    if (body.event === "goal_met") {
      // A "build it" step starts from an empty board: a report without one has built nothing.
      const reported = body.payload.state as Record<string, unknown> | undefined;
      const state = step.config_json.build && reported && reported.board === undefined ? { ...reported, board: {} } : reported;
      const vars = labVariables(step.lab_id, state);
      verified = Boolean(vars && step.goal_expr && evaluateGoal(step.goal_expr, vars));
    }
    await pool.query(
      `INSERT INTO lab_event (user_id, lab_step_id, event, payload) VALUES ($1,$2,$3,$4)`,
      [user.id, body.lab_step_id, body.event, JSON.stringify({ ...body.payload, verified })],
    );
    // goal_met advances the lesson: the lab card counts as completed (step = screens completed).
    if (verified && step.card_order !== null) {
      await pool.query(
        `INSERT INTO lesson_progress (user_id, lesson_id, step) VALUES ($1,$2,$3)
         ON CONFLICT (user_id, lesson_id) DO UPDATE SET step = greatest(lesson_progress.step, EXCLUDED.step)`,
        [user.id, step.lesson_id, step.card_order],
      );
    }
    const { rows: [p] } = await pool.query<{ step: number }>(
      "SELECT step FROM lesson_progress WHERE user_id = $1 AND lesson_id = $2",
      [user.id, step.lesson_id],
    );
    return { recorded: true, goal_verified: verified, step: p?.step ?? 0 };
  });

  /** Save the furthest screen reached; `complete` requires every Check question to be answered. */
  app.put<{ Params: { id: string } }>("/lessons/:id/progress", async (req) => {
    const user = await requireUser(pool, req);
    const id = resolveLessonId(req.params.id);
    const body = ProgressBody.parse(req.body);
    if (body.complete) {
      const { rows: missing } = await pool.query<{ id: string }>(
        `SELECT q.id FROM question q
          WHERE q.lesson_id = $1 AND q.retired_in IS NULL
            AND NOT EXISTS (SELECT 1 FROM attempt a WHERE a.user_id = $2 AND a.question_id = q.id AND a.context = 'check')
          ORDER BY q.id`,
        [id, user.id],
      );
      if (missing.length) {
        throw new HttpError(409, "Answer every Check question first", { missing: missing.map((m) => m.id) });
      }
    }
    const { rows: [p] } = await pool.query(
      `INSERT INTO lesson_progress (user_id, lesson_id, step, completed_at) VALUES ($1,$2,$3, CASE WHEN $4 THEN now() END)
       ON CONFLICT (user_id, lesson_id) DO UPDATE SET
         step = greatest(lesson_progress.step, EXCLUDED.step),
         completed_at = coalesce(lesson_progress.completed_at, EXCLUDED.completed_at)
       RETURNING step, completed_at AS "completedAt"`,
      [user.id, id, body.step ?? 0, Boolean(body.complete)],
    );
    return p;
  });

  /** Recap data: per-question results of the latest Check pass and mastery. */
  app.get<{ Params: { id: string } }>("/lessons/:id/summary", async (req) => {
    const user = await requireUser(pool, req);
    const id = resolveLessonId(req.params.id);
    const { rows } = await pool.query<{ id: string; answered: boolean; firstTryCorrect: boolean | null; mastered: boolean; dueAt: string | null }>(
      `SELECT q.id,
              EXISTS (SELECT 1 FROM attempt a WHERE a.user_id=$2 AND a.question_id=q.id AND a.context='check') AS answered,
              (SELECT a.correct FROM attempt a WHERE a.user_id=$2 AND a.question_id=q.id AND a.context='check' AND a.try_no=1
                ORDER BY a.created_at DESC LIMIT 1) AS "firstTryCorrect",
              coalesce(qs.mastered, false) AS mastered, qs.due_at AS "dueAt"
         FROM question q LEFT JOIN question_state qs ON qs.question_id=q.id AND qs.user_id=$2
        WHERE q.lesson_id=$1 AND q.retired_in IS NULL ORDER BY q.id`,
      [id, user.id],
    );
    return {
      questions: rows,
      total: rows.length,
      answered: rows.filter((r) => r.answered).length,
      firstTryCorrect: rows.filter((r) => r.firstTryCorrect).length,
      mastered: rows.filter((r) => r.mastered).length,
      inReview: rows.filter((r) => r.firstTryCorrect === false).length,
    };
  });

  /** Today's spaced-review queue (Phase 1 replaces the ladder with FSRS). */
  app.get("/review/due", async (req) => {
    const user = await requireUser(pool, req);
    const { rows } = await pool.query(
      `SELECT qs.question_id AS id, q.lesson_id AS "lessonId", qs.due_at AS "dueAt", qs.streak, qs.mastered
         FROM question_state qs JOIN question q ON q.id = qs.question_id AND q.retired_in IS NULL
        WHERE qs.user_id = $1 AND qs.due_at <= now() ORDER BY qs.due_at LIMIT 50`,
      [user.id],
    );
    return { due: rows };
  });
}

/** Mocks needed before the readiness score is shown (user decision: null until then). */
export const READINESS_MOCKS = 3;

export function readinessRoutes(app: FastifyInstance, pool: Pool) {
  /**
   * Readiness (SPEC §5): % mastered × 0.5 + average of the last 3 mocks × 0.5, green at 85%+.
   * Until the learner has 3 finished mocks the score is null and the response says how many remain.
   */
  app.get("/me/readiness", async (req) => {
    const user = await requireUser(pool, req);
    const { rows: [m] } = await pool.query<{ total: number; mastered: number }>(
      `SELECT count(*)::int AS total,
              count(qs.question_id) FILTER (WHERE qs.mastered)::int AS mastered
         FROM question q LEFT JOIN question_state qs ON qs.question_id = q.id AND qs.user_id = $1
        WHERE q.retired_in IS NULL`,
      [user.id],
    );
    const { rows: mocks } = await pool.query<{ score: number }>(
      `SELECT score FROM mock_exam WHERE user_id = $1 AND finished_at IS NOT NULL AND score IS NOT NULL
        ORDER BY finished_at DESC LIMIT ${READINESS_MOCKS}`,
      [user.id],
    );
    const { rows: weak } = await pool.query(
      `SELECT l.id, l.code, l.title,
              count(*)::int AS "attempted",
              round(100.0 * avg(CASE WHEN a.correct THEN 1 ELSE 0 END))::int AS "accuracyPercent"
         FROM attempt a JOIN question q ON q.id = a.question_id JOIN lesson l ON l.id = q.lesson_id
        WHERE a.user_id = $1 AND a.try_no = 1
        GROUP BY l.id
       HAVING avg(CASE WHEN a.correct THEN 1 ELSE 0 END) < 0.8
        ORDER BY avg(CASE WHEN a.correct THEN 1 ELSE 0 END), count(*) DESC
        LIMIT 5`,
      [user.id],
    );
    const masteryPercent = m!.total ? Math.round((1000 * m!.mastered) / m!.total) / 10 : 0;
    const mockAverage = mocks.length ? Math.round((10 * mocks.reduce((s, x) => s + x.score, 0)) / mocks.length) / 10 : null;
    const readiness =
      mocks.length >= READINESS_MOCKS ? Math.round(10 * (masteryPercent * 0.5 + mockAverage! * 0.5)) / 10 : null;
    return {
      masteryPercent,
      mastered: m!.mastered,
      totalQuestions: m!.total,
      mocksTaken: mocks.length,
      mockAverage,
      readiness,
      green: readiness !== null && readiness >= 85,
      mocksNeeded: Math.max(0, READINESS_MOCKS - mocks.length),
      weakLessons: weak,
    };
  });
}
