import {
  mergeLabConfig,
  parseBank,
  primaryLabFor,
  readContentTree,
  validateContent,
  BANK_PATH,
} from "@hampath/content";
import { readFileSync } from "node:fs";
import { tx, type Pool } from "../pool.ts";

export interface ContentLoadResult {
  lessons: { code: string; cards: number; labSteps: number; whyNot: number }[];
}

export class ContentInvalidError extends Error {
  constructor(public readonly errors: string[]) {
    super(`content has ${errors.length} error(s)`);
  }
}

/**
 * Load authored lessons from content/ (cards, lab steps, calculations, Why not? notes) into
 * PostgreSQL. Refuses to load content that fails the CI checks. Idempotent: cards and lab
 * steps are upserted by stable key and stale ones removed.
 */
export async function loadContent(pool: Pool): Promise<ContentLoadResult> {
  const tree = readContentTree();
  const validation = validateContent(parseBank(readFileSync(BANK_PATH)), tree);
  if (validation.errors.length) throw new ContentInvalidError(validation.errors);

  return tx(pool, async (c) => {
    const { rows } = await c.query<{ n: number }>("SELECT count(*)::int AS n FROM question");
    if (!rows[0]?.n) throw new Error("No questions in the database. Run pnpm db:seed and pnpm import:bank first.");

    const result: ContentLoadResult = { lessons: [] };
    for (const l of tree.lessons) {
      const y = l.yaml;
      await c.query(
        `UPDATE lesson SET title=$2, title_fr=$3, est_minutes=$4, lab_id=$5, authored=true,
                needs_card_review=false WHERE id=$1`,
        [l.id, y.title, y.title_fr ?? null, y.est_minutes, primaryLabFor(y.code, tree.labs, y.lab_id ?? l.lab?.lab)],
      );

      // Lab steps
      const stepIds: string[] = [];
      if (l.lab) {
        const cat = tree.labs.find((x) => x.id === l.lab!.lab)!;
        let order = 0;
        for (const [key, step] of Object.entries(l.lab.steps)) {
          const id = `${y.code}/${key}`;
          stepIds.push(id);
          await c.query(
            `INSERT INTO lab_step (id, lesson_id, lab_id, sort_order, title, prompt, config_json, goal_expr, goal_text, hints, success_text)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (id) DO UPDATE SET lab_id=EXCLUDED.lab_id, sort_order=EXCLUDED.sort_order, title=EXCLUDED.title,
               prompt=EXCLUDED.prompt, config_json=EXCLUDED.config_json, goal_expr=EXCLUDED.goal_expr,
               goal_text=EXCLUDED.goal_text, hints=EXCLUDED.hints, success_text=EXCLUDED.success_text`,
            [id, l.id, l.lab.lab, ++order, step.title, step.prompt,
             JSON.stringify(mergeLabConfig(cat.default_config, step.config)),
             step.goal ?? null, step.goal_text ?? null, JSON.stringify(step.hints), step.success ?? null],
          );
        }
      }

      // Cards (+ coverage links)
      const cardIds = l.cards.map((cd) => cd.key);
      await c.query(
        `DELETE FROM card_question WHERE card_id IN (SELECT id FROM card WHERE lesson_id=$1)`,
        [l.id],
      );
      await c.query("DELETE FROM card WHERE lesson_id=$1 AND NOT (id = ANY($2))", [l.id, cardIds]);
      for (const cd of l.cards) {
        const f = cd.front;
        const stepId = f.lab_step ? `${y.code}/${f.lab_step}` : null;
        const interaction = f.interaction
          ? {
              ...f.interaction,
              ...(f.interaction.kind === "predict" && f.interaction.reveal_lab_step
                ? { reveal_lab_step: `${y.code}/${f.interaction.reveal_lab_step}` }
                : {}),
            }
          : null;
        await c.query(
          `INSERT INTO card (id, lesson_id, sort_order, type, title, body_md, media_ref, media_alt, exam_fact, lab_step_id, interaction)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (id) DO UPDATE SET sort_order=EXCLUDED.sort_order, type=EXCLUDED.type, title=EXCLUDED.title,
             body_md=EXCLUDED.body_md, media_ref=EXCLUDED.media_ref, media_alt=EXCLUDED.media_alt,
             exam_fact=EXCLUDED.exam_fact, lab_step_id=EXCLUDED.lab_step_id, interaction=EXCLUDED.interaction`,
          [cd.key, l.id, cd.order, f.type, f.title, cd.bodyMd, f.media ?? null, f.media_alt ?? null,
           f.exam_fact ?? null, stepId, interaction ? JSON.stringify(interaction) : null],
        );
        for (const qid of f.teaches) {
          await c.query("INSERT INTO card_question (card_id, question_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [cd.key, qid]);
        }
      }
      await c.query("DELETE FROM lab_step WHERE lesson_id=$1 AND NOT (id = ANY($2))", [l.id, stepIds]);

      // Calculations and Why not? notes
      await c.query("UPDATE question SET has_calculation=false, calc_spec=NULL WHERE lesson_id=$1", [l.id]);
      for (const [qid, spec] of Object.entries(y.calculations)) {
        await c.query("UPDATE question SET has_calculation=true, calc_spec=$2 WHERE id=$1", [qid, JSON.stringify(spec)]);
      }
      let whyNot = 0;
      for (const [qid, notes] of Object.entries(l.whyNot)) {
        for (const [optText, note] of Object.entries(notes)) {
          const r = await c.query(
            `UPDATE option SET why_not_en=$3 WHERE question_id=$1 AND text_en=$2 AND retired_in IS NULL AND NOT is_correct`,
            [qid, optText, note.trim()],
          );
          whyNot += r.rowCount ?? 0;
        }
      }
      result.lessons.push({ code: y.code, cards: l.cards.length, labSteps: stepIds.length, whyNot });
    }
    return result;
  });
}
