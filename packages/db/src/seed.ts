import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  REPO_ROOT,
  lessonIdFromCode,
  parseCoverageLessons,
  readContentTree,
  type CoverageLesson,
} from "@hampath/content";
import { tx, type Pool } from "./pool.ts";

export const COVERAGE_DIR = path.join(REPO_ROOT, "docs", "coverage");

/** Lessons from docs/coverage/section-*.md, in file order. */
export function readCoverageLessons(dir = COVERAGE_DIR): CoverageLesson[] {
  if (!existsSync(dir)) throw new Error(`${dir} not found. Run pnpm coverage first.`);
  return readdirSync(dir)
    .filter((f) => /^section-\d\.md$/.test(f))
    .sort()
    .flatMap((f) => parseCoverageLessons(readFileSync(path.join(dir, f), "utf8")));
}

export interface SeedResult {
  sections: number;
  lessons: number;
  labs: number;
}

/**
 * Seed the structural content: the 8 sections (content/sections/<n>/section.yaml), the 35 labs
 * (content/labs.yaml) and every lesson with its title and lab (docs/coverage/section-*.md).
 * Idempotent: re-running updates titles and labs in place.
 */
export async function seed(pool: Pool): Promise<SeedResult> {
  const tree = readContentTree();
  if (tree.errors.length) throw new Error(`content/ has errors:\n${tree.errors.join("\n")}`);
  const lessons = readCoverageLessons();

  return tx(pool, async (c) => {
    for (const s of tree.sections) {
      await c.query(
        `INSERT INTO section (id, number, title_en, title_fr, sort_order, checkpoint_pass_percent, checkpoint_mastered_sample)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET number=EXCLUDED.number, title_en=EXCLUDED.title_en, title_fr=EXCLUDED.title_fr,
           sort_order=EXCLUDED.sort_order, checkpoint_pass_percent=EXCLUDED.checkpoint_pass_percent,
           checkpoint_mastered_sample=EXCLUDED.checkpoint_mastered_sample`,
        [s.id, s.number, s.title_en, s.title_fr ?? null, s.recommended_order, s.checkpoint.pass_percent, s.checkpoint.mastered_sample],
      );
    }
    for (const l of tree.labs) {
      await c.query(
        `INSERT INTO lab (id, name, component, default_config) VALUES ($1,$2,$3,$4)
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, component=EXCLUDED.component, default_config=EXCLUDED.default_config`,
        [l.id, l.name, l.component, JSON.stringify(l.default_config ?? {})],
      );
    }
    for (const l of lessons) {
      const id = lessonIdFromCode(l.code);
      if (l.labId && !tree.labs.some((x) => x.id === l.labId)) {
        throw new Error(`docs/coverage: lesson ${l.code} uses unknown lab ${l.labId}`);
      }
      await c.query(
        `INSERT INTO lesson (id, section_id, code, title, sort_order, lab_id) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, sort_order=EXCLUDED.sort_order, lab_id=EXCLUDED.lab_id`,
        [id, id.slice(0, 5), l.code, l.title, Number(id.slice(6)), l.labId],
      );
    }
    return { sections: tree.sections.length, lessons: lessons.length, labs: tree.labs.length };
  });
}
