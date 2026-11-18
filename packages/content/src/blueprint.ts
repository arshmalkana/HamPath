import { readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { LESSON_CODE_RE } from "./ids.ts";
import { CONTENT_ROOT } from "./tree.ts";

export const BLUEPRINT_PATH = path.join(CONTENT_ROOT, "exam-blueprint.yaml");

export const BlueprintSchema = z.strictObject({
  version: z.string().min(1),
  total_questions: z.number().int().positive(),
  time_limit_minutes: z.number().int().positive(),
  pass_percent: z.number().min(0).max(100),
  honours_percent: z.number().min(0).max(100),
  sections: z.record(z.string().regex(/^[1-8]$/), z.number().int().min(0)),
  topics: z.record(z.string().regex(LESSON_CODE_RE), z.number().int().min(1)).default({}),
});
export type Blueprint = z.infer<typeof BlueprintSchema>;

export function readBlueprint(file = BLUEPRINT_PATH): Blueprint {
  return BlueprintSchema.parse(YAML.parse(readFileSync(file, "utf8")));
}

/** Question ids grouped by lesson code ("5.04" → ids), the input the generator and checks need. */
export type QuestionsByTopic = Map<string, string[]>;

/** Problems with a blueprint against the current bank (empty = usable). */
export function checkBlueprint(bp: Blueprint, byTopic: QuestionsByTopic): string[] {
  const errors: string[] = [];
  const sum = Object.values(bp.sections).reduce((a, b) => a + b, 0);
  if (sum !== bp.total_questions) errors.push(`sections add up to ${sum}, total_questions is ${bp.total_questions}`);
  if (bp.honours_percent < bp.pass_percent) errors.push("honours_percent is below pass_percent");
  for (const [sec, n] of Object.entries(bp.sections)) {
    const topics = [...byTopic.keys()].filter((c) => c.startsWith(`${sec}.`));
    const available = topics.reduce((s, c) => s + byTopic.get(c)!.length, 0);
    if (n > available) errors.push(`section ${sec} asks for ${n} questions but the bank has ${available}`);
    const pinned = Object.entries(bp.topics).filter(([c]) => c.startsWith(`${sec}.`)).reduce((s, [, k]) => s + k, 0);
    if (pinned > n) errors.push(`section ${sec}: pinned topics need ${pinned} questions, section allows ${n}`);
  }
  for (const [code, k] of Object.entries(bp.topics)) {
    const have = byTopic.get(code)?.length ?? 0;
    if (!have) errors.push(`topic ${code} is not in the bank`);
    else if (k > have) errors.push(`topic ${code} pins ${k} questions but has ${have}`);
    if (!bp.sections[code[0]!]) errors.push(`topic ${code} is pinned but section ${code[0]} draws none`);
  }
  return errors;
}

/** Small seeded PRNG (mulberry32) so tests and replays are deterministic. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Draw one mock exam: pinned topics first, then one question per randomly chosen topic, then
 * random fill within the section. Never repeats a question. Returned in question-id order,
 * which groups the paper by section and topic like the official exam.
 */
export function drawMockExam(bp: Blueprint, byTopic: QuestionsByTopic, rand: () => number = Math.random): string[] {
  const errors = checkBlueprint(bp, byTopic);
  if (errors.length) throw new Error(`Exam blueprint is unusable: ${errors.join("; ")}`);
  const picked = new Set<string>();
  const take = (pool: string[], k: number) => {
    for (const id of shuffle(pool.filter((q) => !picked.has(q)), rand).slice(0, k)) picked.add(id);
  };
  for (const [sec, n] of Object.entries(bp.sections)) {
    const topics = [...byTopic.keys()].filter((c) => c.startsWith(`${sec}.`));
    let remaining = n;
    for (const [code, k] of Object.entries(bp.topics)) {
      if (!code.startsWith(`${sec}.`)) continue;
      take(byTopic.get(code)!, k);
      remaining -= k;
    }
    const free = shuffle(topics.filter((c) => !(c in bp.topics)), rand);
    for (const code of free.slice(0, remaining)) take(byTopic.get(code)!, 1);
    remaining = n - [...picked].filter((q) => q.startsWith(`B-00${sec}-`)).length;
    if (remaining > 0) take(topics.flatMap((c) => byTopic.get(c)!), remaining);
  }
  return [...picked].sort();
}

/** Per-section totals of an exam, for checks and the results breakdown. */
export function sectionOf(questionId: string): string {
  return questionId.slice(0, 5);
}
