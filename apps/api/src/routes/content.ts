import { randomInt } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { LESSON_CODE_RE, lessonIdFromCode } from "@hampath/content";
import { HttpError, userFromRequest } from "../auth.ts";
import type { Pool } from "@hampath/db";

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function resolveLessonId(idOrCode: string): string {
  if (LESSON_CODE_RE.test(idOrCode)) return lessonIdFromCode(idOrCode);
  if (/^B-\d{3}-\d{3}$/.test(idOrCode)) return idOrCode;
  throw new HttpError(404, `No lesson ${idOrCode}`);
}

/** Section map with each lesson and the learner's progress (userId null = anonymous). */
async function sectionMap(pool: Pool, userId: string | null) {
  const { rows: sections } = await pool.query<{ id: string; number: number }>(
    `SELECT id, number, title_en AS title, sort_order AS "recommendedOrder" FROM section ORDER BY number`,
  );
  const { rows: lessons } = await pool.query(
    `SELECT l.id, l.section_id AS "sectionId", l.code, l.title, l.est_minutes AS "estMinutes", l.lab_id AS "labId",
              l.authored, count(q.id)::int AS "questionCount",
              lp.step, lp.completed_at AS "completedAt", coalesce(lp.tested_out, false) AS "testedOut",
              count(qs.question_id) FILTER (WHERE qs.mastered)::int AS mastered
         FROM lesson l
         JOIN question q ON q.lesson_id = l.id AND q.retired_in IS NULL
         LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = $1
         LEFT JOIN question_state qs ON qs.question_id = q.id AND qs.user_id = $1
        GROUP BY l.id, lp.step, lp.completed_at, lp.tested_out
        ORDER BY l.id`,
    [userId],
  );
  return sections.map((s) => ({ ...s, lessons: lessons.filter((l) => l.sectionId === s.id) }));
}

export function contentRoutes(app: FastifyInstance, pool: Pool) {
  app.get("/sections", async (req) => sectionMap(pool, (await userFromRequest(pool, req))?.id ?? null));

  app.get<{ Params: { id: string } }>("/sections/:id", async (req) => {
    const all = await sectionMap(pool, (await userFromRequest(pool, req))?.id ?? null);
    const s = all.find((x) => x.id === req.params.id || String(x.number) === req.params.id);
    if (!s) throw new HttpError(404, `No section ${req.params.id}`);
    return s;
  });

  /**
   * Lesson with its cards, lab steps and Check questions. Correct flags and Why not? notes are
   * never sent here; the client learns them only from POST /attempts after answering.
   */
  app.get<{ Params: { id: string } }>("/lessons/:id", async (req) => {
    const id = resolveLessonId(req.params.id);
    const user = await userFromRequest(pool, req);
    const {
      rows: [lesson],
    } = await pool.query(
      `SELECT l.id, l.code, l.title, l.est_minutes AS "estMinutes", l.authored,
              json_build_object('id', s.id, 'number', s.number, 'title', s.title_en) AS section,
              CASE WHEN lab.id IS NULL THEN NULL ELSE json_build_object('id', lab.id, 'name', lab.name, 'component', lab.component) END AS lab
         FROM lesson l JOIN section s ON s.id = l.section_id LEFT JOIN lab ON lab.id = l.lab_id
        WHERE l.id = $1`,
      [id],
    );
    if (!lesson) throw new HttpError(404, `No lesson ${req.params.id}`);

    const { rows: cards } = await pool.query(
      `SELECT c.id, c.type, c.title, c.body_md AS "bodyMd", c.media_ref AS media, c.media_alt AS "mediaAlt",
              c.exam_fact AS "examFact", c.interaction,
              coalesce((SELECT array_agg(cq.question_id ORDER BY cq.question_id) FROM card_question cq WHERE cq.card_id = c.id), '{}') AS teaches,
              c.lab_step_id AS "labStepId"
         FROM card c WHERE c.lesson_id = $1 ORDER BY c.sort_order`,
      [id],
    );
    const { rows: labSteps } = await pool.query(
      `SELECT ls.id, ls.lab_id AS "labId", lab.component, ls.title, ls.prompt, ls.config_json AS config,
              ls.goal_expr AS goal, ls.goal_text AS "goalText", ls.hints, ls.success_text AS success
         FROM lab_step ls JOIN lab ON lab.id = ls.lab_id WHERE ls.lesson_id = $1 ORDER BY ls.sort_order`,
      [id],
    );
    const { rows: qs } = await pool.query<{
      id: string;
      stem: string;
      hasCalculation: boolean;
      options: { id: string; text: string }[];
    }>(
      `SELECT q.id, q.stem_en AS stem, q.has_calculation AS "hasCalculation",
              json_agg(json_build_object('id', o.id, 'text', o.text_en)) AS options
         FROM question q JOIN option o ON o.question_id = q.id AND o.retired_in IS NULL
        WHERE q.lesson_id = $1 AND q.retired_in IS NULL
        GROUP BY q.id ORDER BY q.id`,
      [id],
    );
    const {
      rows: [next],
    } = await pool.query(`SELECT id, code, title, authored FROM lesson WHERE id > $1 ORDER BY id LIMIT 1`, [id]);
    const progress = user
      ? ((
          await pool.query(
            `SELECT step, completed_at AS "completedAt" FROM lesson_progress WHERE user_id=$1 AND lesson_id=$2`,
            [user.id, id],
          )
        ).rows[0] ?? null)
      : null;

    return {
      ...lesson,
      cards: cards.map((c) => ({ ...c, labStep: labSteps.find((s) => s.id === c.labStepId) ?? null })),
      labSteps,
      questions: qs.map((q) => ({ ...q, options: shuffle(q.options) })),
      next: next ?? null,
      progress,
    };
  });
}
