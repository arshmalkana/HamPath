/**
 * Admin analytics (Step 30): how the course is working, from the attempt, lab_event and
 * lesson_progress tables. Aggregates only; no learner is identified.
 *
 * - Questions: first-try success rate (each learner's first ever answer to the question). Below 60%
 *   with enough answers is flagged, with a link to the card that teaches it.
 * - Labs: per lab and per step, learners who started, reached the goal (server-verified) and used hints.
 * - Lessons: started, finished and where unfinished learners stopped.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Pool } from "@hampath/db";
import { teachLinks } from "../grading.ts";
import { requireAdmin } from "./admin.ts";

/** Below this first-try success rate a question is flagged for review of its teaching. */
export const FLAG_BELOW = 0.6;
/** Fewer first answers than this and the rate is too noisy to flag. */
export const MIN_ANSWERS = 5;

export function analyticsRoutes(app: FastifyInstance, pool: Pool) {
  /** ?since=ISO time limits every figure to activity after it (default: all time). */
  app.get<{ Querystring: { since?: string } }>("/admin/analytics", async (req) => {
    await requireAdmin(pool, req);
    const since = z.iso.datetime({ offset: true }).optional().parse(req.query.since);
    const from = since ? new Date(since) : new Date(0);
    const [questions, labs, lessons] = await Promise.all([
      questionStats(pool, from),
      labStats(pool, from),
      lessonStats(pool, from),
    ]);
    return { since: since ?? null, flagBelow: FLAG_BELOW, minAnswers: MIN_ANSWERS, questions, labs, lessons };
  });
}

async function questionStats(pool: Pool, from: Date) {
  const { rows } = await pool.query<{ id: string; stem: string; code: string; learners: number; right: number }>(
    `WITH first AS (
       SELECT DISTINCT ON (user_id, question_id) question_id, correct, created_at
         FROM attempt ORDER BY user_id, question_id, created_at, id)
     SELECT q.id, q.stem_en AS stem, l.code, count(*)::int AS learners, count(*) FILTER (WHERE f.correct)::int AS right
       FROM first f JOIN question q ON q.id = f.question_id JOIN lesson l ON l.id = q.lesson_id
      WHERE q.retired_in IS NULL AND f.created_at >= $1
      GROUP BY q.id, l.code
      ORDER BY q.id`,
    [from],
  );
  const flaggedIds = rows
    .filter((r) => r.learners >= MIN_ANSWERS && r.right / r.learners < FLAG_BELOW)
    .map((r) => r.id);
  const links = await teachLinks(pool, flaggedIds);
  return rows
    .map((r) => {
      const rate = r.right / r.learners;
      const flagged = r.learners >= MIN_ANSWERS && rate < FLAG_BELOW;
      return {
        questionId: r.id,
        lessonCode: r.code,
        stem: r.stem,
        learners: r.learners,
        firstTryRate: Math.round(rate * 1000) / 1000,
        flagged,
        teach: flagged ? (links.get(r.id) ?? null) : null,
      };
    })
    .sort((a, b) => Number(b.flagged) - Number(a.flagged) || a.firstTryRate - b.firstTryRate);
}

async function labStats(pool: Pool, from: Date) {
  const { rows } = await pool.query<{
    lab_id: string;
    name: string;
    step_id: string;
    title: string | null;
    started: number;
    completed: number;
    hinted: number;
    hints: number;
    skipped: number;
  }>(
    `SELECT ls.lab_id, lab.name, ls.id AS step_id, ls.title,
            count(DISTINCT e.user_id) FILTER (WHERE e.event = 'started')::int AS started,
            count(DISTINCT e.user_id) FILTER (WHERE e.event = 'goal_met' AND (e.payload->>'verified')::boolean)::int AS completed,
            count(DISTINCT e.user_id) FILTER (WHERE e.event = 'hint_used')::int AS hinted,
            count(*) FILTER (WHERE e.event = 'hint_used')::int AS hints,
            count(DISTINCT e.user_id) FILTER (WHERE e.event = 'skipped')::int AS skipped
       FROM lab_step ls JOIN lab ON lab.id = ls.lab_id
       LEFT JOIN lab_event e ON e.lab_step_id = ls.id AND e.created_at >= $1
      GROUP BY ls.lab_id, lab.name, ls.id, ls.title
      ORDER BY ls.lab_id, ls.id`,
    [from],
  );
  const rate = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 1000 : null);
  const byLab = new Map<string, { labId: string; name: string; steps: typeof rows }>();
  for (const r of rows) {
    const e = byLab.get(r.lab_id) ?? { labId: r.lab_id, name: r.name, steps: [] };
    e.steps.push(r);
    byLab.set(r.lab_id, e);
  }
  return [...byLab.values()].map((l) => {
    const started = l.steps.reduce((n, s) => n + s.started, 0);
    const completed = l.steps.reduce((n, s) => n + s.completed, 0);
    const hinted = l.steps.reduce((n, s) => n + s.hinted, 0);
    const hints = l.steps.reduce((n, s) => n + s.hints, 0);
    const skipped = l.steps.reduce((n, s) => n + s.skipped, 0);
    return {
      labId: l.labId,
      name: l.name,
      started,
      completionRate: rate(completed, started),
      hintRate: rate(hinted, started),
      hintsPerStart: rate(hints, started),
      skipRate: rate(skipped, started),
      steps: l.steps.map((s) => ({
        stepId: s.step_id,
        title: s.title,
        started: s.started,
        completed: s.completed,
        completionRate: rate(s.completed, s.started),
        hintRate: rate(s.hinted, s.started),
        skipped: s.skipped,
        skipRate: rate(s.skipped, s.started),
      })),
    };
  });
}

async function lessonStats(pool: Pool, from: Date) {
  const { rows } = await pool.query<{
    id: string;
    code: string;
    title: string;
    started: number;
    finished: number;
    tested_out: number;
  }>(
    `SELECT l.id, l.code, l.title,
            count(lp.user_id) FILTER (WHERE NOT lp.tested_out)::int AS started,
            count(lp.user_id) FILTER (WHERE NOT lp.tested_out AND lp.completed_at IS NOT NULL)::int AS finished,
            count(lp.user_id) FILTER (WHERE lp.tested_out)::int AS tested_out
       FROM lesson l LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.started_at >= $1
      GROUP BY l.id ORDER BY l.id`,
    [from],
  );
  // Where unfinished learners stopped: their furthest screen. Screens are the cards in order, then
  // the Check questions, then the recap (as the lesson player builds them).
  const { rows: stops } = await pool.query<{ lesson_id: string; step: number; n: number }>(
    `SELECT lesson_id, step, count(*)::int AS n FROM lesson_progress
      WHERE completed_at IS NULL AND NOT tested_out AND started_at >= $1 GROUP BY lesson_id, step`,
    [from],
  );
  const { rows: cards } = await pool.query<{ lesson_id: string; title: string }>(
    "SELECT lesson_id, title FROM card ORDER BY lesson_id, sort_order",
  );
  const cardTitles = new Map<string, string[]>();
  for (const c of cards) cardTitles.set(c.lesson_id, [...(cardTitles.get(c.lesson_id) ?? []), c.title]);
  const screenName = (lessonId: string, step: number) => {
    const t = cardTitles.get(lessonId) ?? [];
    return step < t.length ? t[step]! : `Check question ${step - t.length + 1}`;
  };
  return rows.map((r) => {
    const mine = stops.filter((s) => s.lesson_id === r.id).sort((a, b) => b.n - a.n || a.step - b.step);
    const top = mine[0];
    return {
      lessonId: r.id,
      code: r.code,
      title: r.title,
      started: r.started,
      finished: r.finished,
      testedOut: r.tested_out,
      finishRate: r.started ? Math.round((r.finished / r.started) * 1000) / 1000 : null,
      dropOff: r.started - r.finished,
      mostCommonStop: top ? { step: top.step, screen: screenName(r.id, top.step), learners: top.n } : null,
    };
  });
}
