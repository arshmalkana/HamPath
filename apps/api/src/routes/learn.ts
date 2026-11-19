import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { evaluateGoal, labVariables } from "@hampath/ham-sim";
import type { Pool } from "@hampath/db";
import { HttpError, requireUser } from "../auth.ts";
import { resolveLessonId } from "./content.ts";

const LabEventBody = z.strictObject({
  lab_step_id: z.string(),
  event: z.enum(["started", "goal_met", "hint_used", "value_changed"]),
  payload: z.record(z.string(), z.unknown()).default({}),
  /** Idempotency key: a replayed event is stored once. */
  client_id: z.uuid().optional(),
});

const ProgressBody = z.strictObject({
  step: z.number().int().min(0).max(500).optional(),
  complete: z.boolean().optional(),
});

/** Lesson-player routes: lab telemetry, progress and the recap summary. */
export function learnRoutes(app: FastifyInstance, pool: Pool) {
  /** Lab telemetry. goal_met is re-checked on the server from the lab's reported inputs. */
  app.post("/lab-events", async (req) => {
    const user = await requireUser(pool, req);
    const body = LabEventBody.parse(req.body);
    const {
      rows: [step],
    } = await pool.query<{
      lab_id: string;
      goal_expr: string | null;
      lesson_id: string;
      card_order: number | null;
      config_json: { build?: boolean } & Record<string, unknown>;
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
      const state =
        step.config_json.build && reported && reported.board === undefined ? { ...reported, board: {} } : reported;
      const vars = labVariables(step.lab_id, state, step.config_json);
      verified = Boolean(vars && step.goal_expr && evaluateGoal(step.goal_expr, vars));
    }
    await pool.query(
      `INSERT INTO lab_event (user_id, lab_step_id, event, payload, client_id) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, client_id) DO NOTHING`,
      [user.id, body.lab_step_id, body.event, JSON.stringify({ ...body.payload, verified }), body.client_id ?? null],
    );
    // goal_met advances the lesson: the lab card counts as completed (step = screens completed).
    if (verified && step.card_order !== null) {
      await pool.query(
        `INSERT INTO lesson_progress (user_id, lesson_id, step) VALUES ($1,$2,$3)
         ON CONFLICT (user_id, lesson_id) DO UPDATE SET step = greatest(lesson_progress.step, EXCLUDED.step)`,
        [user.id, step.lesson_id, step.card_order],
      );
    }
    const {
      rows: [p],
    } = await pool.query<{ step: number }>("SELECT step FROM lesson_progress WHERE user_id = $1 AND lesson_id = $2", [
      user.id,
      step.lesson_id,
    ]);
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
    const {
      rows: [p],
    } = await pool.query(
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
    const { rows } = await pool.query<{
      id: string;
      answered: boolean;
      firstTryCorrect: boolean | null;
      mastered: boolean;
      dueAt: string | null;
    }>(
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
}
