/** Learner dashboard data: readiness, streak, today's reviews, recent mocks, mastery per section. */
import type { FastifyInstance } from "fastify";
import type { Pool } from "@hampath/db";
import { requireUser } from "../auth.ts";

/** Mocks needed before the readiness score is shown (product decision: null until then). */
export const READINESS_MOCKS = 3;
export const READINESS_GREEN = 85;

const DAY = 86_400_000;

/** Consecutive UTC days with at least one answer, counting back from today (or yesterday if not yet active today). */
export function streakFromDays(days: string[], today = new Date()): { days: number; activeToday: boolean } {
  const set = new Set(days);
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const activeToday = set.has(key(today));
  let cursor = new Date(today.getTime() - (activeToday ? 0 : DAY));
  let n = 0;
  while (set.has(key(cursor))) {
    n++;
    cursor = new Date(cursor.getTime() - DAY);
  }
  return { days: n, activeToday };
}

/** Readiness (SPEC §5): % mastered × 0.5 + average of the last 3 mocks × 0.5, green at 85%+. */
export function readinessScore(masteryPercent: number, lastMockScores: number[]) {
  const mockAverage = lastMockScores.length
    ? Math.round((10 * lastMockScores.reduce((s, x) => s + x, 0)) / lastMockScores.length) / 10
    : null;
  const readiness =
    lastMockScores.length >= READINESS_MOCKS ? Math.round(10 * (masteryPercent * 0.5 + mockAverage! * 0.5)) / 10 : null;
  return {
    mockAverage,
    readiness,
    green: readiness !== null && readiness >= READINESS_GREEN,
    mocksNeeded: Math.max(0, READINESS_MOCKS - lastMockScores.length),
  };
}

async function readiness(pool: Pool, userId: string) {
  const {
    rows: [m],
  } = await pool.query<{ total: number; mastered: number }>(
    `SELECT count(*)::int AS total, count(qs.question_id) FILTER (WHERE qs.mastered)::int AS mastered
       FROM question q LEFT JOIN question_state qs ON qs.question_id = q.id AND qs.user_id = $1
      WHERE q.retired_in IS NULL`,
    [userId],
  );
  const { rows: mocks } = await pool.query<{
    id: string;
    score: number;
    passed: boolean;
    honours: boolean;
    finishedAt: Date;
  }>(
    `SELECT id, score, passed, honours, finished_at AS "finishedAt" FROM mock_exam
      WHERE user_id = $1 AND finished_at IS NOT NULL AND score IS NOT NULL
      ORDER BY finished_at DESC LIMIT ${READINESS_MOCKS}`,
    [userId],
  );
  const { rows: weak } = await pool.query(
    `SELECT l.id, l.code, l.title, count(*)::int AS "attempted",
            round(100.0 * avg(CASE WHEN a.correct THEN 1 ELSE 0 END))::int AS "accuracyPercent"
       FROM attempt a JOIN question q ON q.id = a.question_id JOIN lesson l ON l.id = q.lesson_id
      WHERE a.user_id = $1 AND a.try_no = 1
      GROUP BY l.id
     HAVING avg(CASE WHEN a.correct THEN 1 ELSE 0 END) < 0.8
      ORDER BY avg(CASE WHEN a.correct THEN 1 ELSE 0 END), count(*) DESC
      LIMIT 5`,
    [userId],
  );
  const masteryPercent = m!.total ? Math.round((1000 * m!.mastered) / m!.total) / 10 : 0;
  return {
    masteryPercent,
    mastered: m!.mastered,
    totalQuestions: m!.total,
    mocksTaken: mocks.length,
    ...readinessScore(
      masteryPercent,
      mocks.map((x) => x.score),
    ),
    weakLessons: weak,
    lastMocks: mocks,
  };
}

export function dashboardRoutes(app: FastifyInstance, pool: Pool) {
  app.get("/me/readiness", async (req) => {
    const user = await requireUser(pool, req);
    const { lastMocks: _lastMocks, ...r } = await readiness(pool, user.id);
    return r;
  });

  app.get("/me/dashboard", async (req) => {
    const user = await requireUser(pool, req);
    const r = await readiness(pool, user.id);
    const { rows: days } = await pool.query<{ day: string }>(
      `SELECT DISTINCT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day FROM attempt
        WHERE user_id = $1 AND created_at > now() - interval '400 days' ORDER BY day DESC`,
      [user.id],
    );
    const { rows: due } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM question_state qs JOIN question q ON q.id = qs.question_id AND q.retired_in IS NULL
        WHERE qs.user_id = $1 AND qs.due_at < date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + interval '1 day'`,
      [user.id],
    );
    const { rows: sections } = await pool.query(
      `SELECT s.id, s.number, s.title_en AS title,
              count(q.id)::int AS "totalQuestions",
              count(qs.question_id) FILTER (WHERE qs.mastered)::int AS mastered,
              count(DISTINCT l.id)::int AS lessons,
              count(DISTINCT lp.lesson_id) FILTER (WHERE lp.completed_at IS NOT NULL)::int AS "lessonsCompleted",
              bool_or(sb.user_id IS NOT NULL) AS badge
         FROM section s
         JOIN lesson l ON l.section_id = s.id
         JOIN question q ON q.lesson_id = l.id AND q.retired_in IS NULL
         LEFT JOIN question_state qs ON qs.question_id = q.id AND qs.user_id = $1
         LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = $1
         LEFT JOIN section_badge sb ON sb.section_id = s.id AND sb.user_id = $1
        GROUP BY s.id ORDER BY s.number`,
      [user.id],
    );
    return {
      readiness: { ...r, lastMocks: undefined },
      streak: streakFromDays(days.map((d) => d.day)),
      reviewDueToday: due[0]?.n ?? 0,
      lastMocks: r.lastMocks,
      sections: sections.map((s) => ({
        ...s,
        masteryPercent: s.totalQuestions ? Math.round((1000 * s.mastered) / s.totalQuestions) / 10 : 0,
      })),
    };
  });
}
