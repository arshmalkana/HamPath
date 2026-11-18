import path from "node:path";
import { goalVariables, resultMatches, runCalculation } from "@hampath/ham-sim";
import type { ParsedBank } from "./bank.ts";
import { lessonCode } from "./ids.ts";
import { LAB_SCHEMAS } from "./schemas.ts";
import { REPO_ROOT, mergeLabConfig, type ContentTree } from "./tree.ts";

export interface QuestionCoverage {
  id: string;
  stemEn: string;
  /** Card keys whose `teaches:` lists this question. */
  cards: string[];
  /** Wrong options with a Why not? note (0–3). */
  whyNot: number;
  calc: "verified" | "failed" | "none";
}

export interface LessonCoverage {
  id: string;
  code: string;
  title: string | null;
  authored: boolean;
  labId: string | null;
  questions: QuestionCoverage[];
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  lessons: LessonCoverage[];
  totals: { questions: number; taught: number; whyNotComplete: number; lessons: number; authoredLessons: number };
}

const rel = (p: string) => path.relative(REPO_ROOT, p).replaceAll("\\", "/");

/**
 * The CI content checks from SPEC §8.
 * Always enforced: bank parses; every authored lesson lists exactly its bank questions; every
 * question in an authored lesson is on ≥1 card and has 3 Why not? notes; calculations reproduce;
 * lab configs pass their schema; media has alt text.
 * `strict` (the Phase 2 launch gate) additionally requires all 100 lessons to be authored.
 */
export function validateContent(bank: ParsedBank, tree: ContentTree, opts: { strict?: boolean } = {}): ValidationResult {
  const errors = [...bank.errors.map((e) => `bank: ${e}`), ...tree.errors];
  const warnings: string[] = [];
  const byLesson = new Map<string, typeof bank.questions>();
  for (const q of bank.questions) {
    if (!byLesson.has(q.lessonId)) byLesson.set(q.lessonId, []);
    byLesson.get(q.lessonId)!.push(q);
  }
  const bankIds = new Set(bank.questions.map((q) => q.id));

  // Sections
  const bankSections = new Set(bank.questions.map((q) => q.sectionId));
  for (const s of bankSections) {
    if (!tree.sections.some((x) => x.id === s)) errors.push(`content/sections: no section.yaml for ${s}`);
  }

  // Authored lessons
  const authored = new Map(tree.lessons.map((l) => [l.id, l]));
  const listedIn = new Map<string, string>();
  for (const l of tree.lessons) {
    const where = rel(l.dir);
    const bankQs = byLesson.get(l.id);
    if (!bankQs) {
      errors.push(`${where}: lesson ${l.yaml.code} has no questions in the bank`);
      continue;
    }
    const listed = new Set(l.yaml.question_ids);
    for (const q of bankQs) if (!listed.has(q.id)) errors.push(`${where}/lesson.yaml: missing ${q.id}`);
    for (const id of l.yaml.question_ids) {
      if (!bankIds.has(id)) errors.push(`${where}/lesson.yaml: ${id} is not in the bank`);
      else if (!id.startsWith(l.id)) errors.push(`${where}/lesson.yaml: ${id} belongs to lesson ${lessonCode(id.slice(0, 9))}`);
      if (listedIn.has(id)) errors.push(`${where}/lesson.yaml: ${id} is also listed in ${listedIn.get(id)}`);
      listedIn.set(id, where);
    }
    if (l.cards.length === 0) errors.push(`${where}: no cards`);

    for (const c of l.cards) {
      for (const id of c.front.teaches) {
        if (!bankIds.has(id)) errors.push(`${rel(c.file)}: teaches unknown question ${id}`);
      }
      for (const m of c.bodyMd.matchAll(/!\[([^\]]*)\]\(/g)) {
        if (!m[1]!.trim()) errors.push(`${rel(c.file)}: image without alt text (CI check 4)`);
      }
      const steps = [c.front.lab_step, c.front.interaction?.kind === "predict" ? c.front.interaction.reveal_lab_step : undefined];
      for (const step of steps) {
        if (step && !l.lab?.steps[step]) errors.push(`${rel(c.file)}: lab step '${step}' not found in lab.json`);
      }
    }

    // Lab configs (CI check 4)
    if (l.lab) {
      const cat = tree.labs.find((x) => x.id === l.lab!.lab);
      const schema = LAB_SCHEMAS[l.lab.lab];
      if (!cat) errors.push(`${where}/lab.json: ${l.lab.lab} is not in content/labs.yaml`);
      else if (!schema || !cat.component) errors.push(`${where}/lab.json: ${l.lab.lab} has no implementation yet`);
      else {
        for (const [key, step] of Object.entries(l.lab.steps)) {
          const merged = mergeLabConfig(cat.default_config, step.config);
          const r = schema.config.safeParse(merged);
          if (!r.success) {
            for (const i of r.error.issues) errors.push(`${where}/lab.json: steps.${key}.config.${i.path.join(".")}: ${i.message}`);
          }
          if (step.goal) {
            try {
              const unknown = goalVariables(step.goal).filter((v) => !schema.variables.includes(v));
              if (unknown.length) errors.push(`${where}/lab.json: steps.${key}.goal uses unknown ${unknown.join(", ")}`);
            } catch (e) {
              errors.push(`${where}/lab.json: steps.${key}.goal: ${(e as Error).message}`);
            }
          }
        }
      }
    }

    // Why-not notes must match real wrong options
    for (const [qid, notes] of Object.entries(l.whyNot)) {
      const q = bankQs.find((x) => x.id === qid);
      if (!q) {
        errors.push(`${where}/why-not.yaml: ${qid} is not in this lesson`);
        continue;
      }
      for (const opt of Object.keys(notes)) {
        if (opt === q.optionsEn[0]) errors.push(`${where}/why-not.yaml: ${qid}: "${opt}" is the correct answer`);
        else if (!q.optionsEn.includes(opt)) errors.push(`${where}/why-not.yaml: ${qid}: "${opt}" is not an option`);
      }
    }

    for (const qid of Object.keys(l.yaml.calculations)) {
      if (!bankQs.some((q) => q.id === qid)) errors.push(`${where}/lesson.yaml: calculation for ${qid} not in this lesson`);
    }
  }

  // Coverage per lesson (all 100, authored or not)
  const lessons: LessonCoverage[] = [];
  for (const [lessonId, qs] of [...byLesson.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const l = authored.get(lessonId);
    const questions: QuestionCoverage[] = qs.map((q) => {
      const cards = l ? l.cards.filter((c) => c.front.teaches.includes(q.id)).map((c) => c.key) : [];
      const notes = l?.whyNot[q.id] ?? {};
      const whyNot = q.optionsEn.slice(1).filter((o) => notes[o]?.trim()).length;
      let calc: QuestionCoverage["calc"] = "none";
      const spec = l?.yaml.calculations[q.id];
      if (spec) {
        try {
          const sol = runCalculation(spec);
          const distractorHit = q.optionsEn.slice(1).find((o) => resultMatches(o, sol));
          if (!resultMatches(q.optionsEn[0]!, sol)) {
            calc = "failed";
            errors.push(`${q.id}: ham-sim gives ${sol.value} ${sol.unit}, bank answer is "${q.optionsEn[0]}" (CI check 3)`);
          } else if (distractorHit) {
            calc = "failed";
            errors.push(`${q.id}: ham-sim result also matches distractor "${distractorHit}"`);
          } else calc = "verified";
        } catch (e) {
          calc = "failed";
          errors.push(`${q.id}: calculation error: ${(e as Error).message}`);
        }
      }
      if (l) {
        if (cards.length === 0) errors.push(`${rel(l.dir)}: ${q.id} is not taught on any card (CI check 1)`);
        if (whyNot < 3) errors.push(`${rel(l.dir)}/why-not.yaml: ${q.id} has ${whyNot}/3 Why not? notes (CI check 2)`);
      }
      return { id: q.id, stemEn: q.stemEn, cards, whyNot, calc };
    });
    const code = lessonCode(lessonId);
    lessons.push({
      id: lessonId,
      code,
      title: l?.yaml.title ?? tree.titles[code] ?? null,
      authored: Boolean(l),
      labId: l?.yaml.lab_id ?? tree.labs.find((x) => x.lessons.includes(code))?.id ?? null,
      questions,
    });
  }

  for (const l of lessons) if (!l.title) errors.push(`content/lesson-titles.yaml: no title for lesson ${l.code}`);
  for (const code of Object.keys(tree.titles)) {
    if (!lessons.some((l) => l.code === code)) errors.push(`content/lesson-titles.yaml: ${code} is not a lesson in the bank`);
  }

  const unauthored = lessons.filter((l) => !l.authored);
  if (unauthored.length) {
    const msg = `${unauthored.length} of ${lessons.length} lessons have no authored content yet`;
    if (opts.strict) errors.push(`${msg} (strict mode requires 100% coverage)`);
    else warnings.push(msg);
  }

  const all = lessons.flatMap((l) => l.questions);
  return {
    errors,
    warnings,
    lessons,
    totals: {
      questions: all.length,
      taught: all.filter((q) => q.cards.length > 0).length,
      whyNotComplete: all.filter((q) => q.whyNot === 3).length,
      lessons: lessons.length,
      authoredLessons: lessons.length - unauthored.length,
    },
  };
}
