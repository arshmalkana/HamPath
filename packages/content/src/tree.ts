import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import type { z } from "zod";
import { lessonIdFromCode } from "./ids.ts";
import {
  CardFrontMatter,
  LabCatalogueSchema,
  LabFileSchema,
  LessonSchema,
  LessonTitlesSchema,
  SectionSchema,
  WhyNotSchema,
  type LabCatalogue,
  type LabFile,
  type LessonYaml,
  type SectionYaml,
} from "./schemas.ts";

/** Repo root: packages/content/src → ../../.. */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const CONTENT_ROOT = path.join(REPO_ROOT, "content");
export const BANK_PATH = path.join(CONTENT_ROOT, "bank", "amat_basic_quest_delim.txt");

export interface Card {
  /** Stable key: "<lesson code>/<file name without extension>", e.g. "5.04/03-learn-voltage". */
  key: string;
  order: number;
  front: CardFrontMatter;
  bodyMd: string;
  file: string;
}

export interface AuthoredLesson {
  id: string;
  dir: string;
  yaml: LessonYaml;
  cards: Card[];
  lab: LabFile | null;
  /** question id → wrong-option English text → note */
  whyNot: Record<string, Record<string, string>>;
}

export interface ContentTree {
  sections: (SectionYaml & { dir: string })[];
  labs: LabCatalogue;
  lessons: AuthoredLesson[];
  /** Working titles for every lesson code (content/lesson-titles.yaml). */
  titles: Record<string, string>;
  errors: string[];
}

function rel(p: string) {
  return path.relative(REPO_ROOT, p).replaceAll("\\", "/");
}

function parseWith<T extends z.ZodType>(schema: T, data: unknown, file: string, errors: string[]): z.infer<T> | null {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  for (const issue of r.error.issues) {
    errors.push(`${rel(file)}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  return null;
}

function readYaml(file: string, errors: string[]): unknown {
  try {
    return YAML.parse(readFileSync(file, "utf8"));
  } catch (e) {
    errors.push(`${rel(file)}: invalid YAML: ${(e as Error).message}`);
    return null;
  }
}

/** Split an .mdx card into YAML front matter and Markdown body. */
export function splitFrontMatter(text: string): { front: unknown; body: string } | null {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return null;
  return { front: YAML.parse(m[1]!), body: m[2]!.trim() };
}

function readLesson(dir: string, errors: string[]): AuthoredLesson | null {
  const lessonFile = path.join(dir, "lesson.yaml");
  const yaml = parseWith(LessonSchema, readYaml(lessonFile, errors), lessonFile, errors);
  if (!yaml) return null;

  const cards: Card[] = [];
  const cardsDir = path.join(dir, "cards");
  if (existsSync(cardsDir)) {
    const files = readdirSync(cardsDir).filter((f) => f.endsWith(".mdx")).sort();
    files.forEach((f, i) => {
      const file = path.join(cardsDir, f);
      let split: ReturnType<typeof splitFrontMatter>;
      try {
        split = splitFrontMatter(readFileSync(file, "utf8"));
      } catch (e) {
        errors.push(`${rel(file)}: invalid front matter: ${(e as Error).message}`);
        return;
      }
      if (!split) {
        errors.push(`${rel(file)}: missing --- front matter ---`);
        return;
      }
      const front = parseWith(CardFrontMatter, split.front, file, errors);
      if (!front) return;
      cards.push({ key: `${yaml.code}/${f.replace(/\.mdx$/, "")}`, order: i + 1, front, bodyMd: split.body, file });
    });
  }

  const labFile = path.join(dir, "lab.json");
  let lab: LabFile | null = null;
  if (existsSync(labFile)) {
    try {
      lab = parseWith(LabFileSchema, JSON.parse(readFileSync(labFile, "utf8")), labFile, errors);
    } catch (e) {
      errors.push(`${rel(labFile)}: invalid JSON: ${(e as Error).message}`);
    }
  }

  const whyNotFile = path.join(dir, "why-not.yaml");
  const whyNot = existsSync(whyNotFile)
    ? (parseWith(WhyNotSchema, readYaml(whyNotFile, errors) ?? {}, whyNotFile, errors) ?? {})
    : {};

  return { id: lessonIdFromCode(yaml.code), dir, yaml, cards, lab, whyNot };
}

export function readContentTree(root = CONTENT_ROOT): ContentTree {
  const errors: string[] = [];
  const sections: ContentTree["sections"] = [];
  const lessons: AuthoredLesson[] = [];

  const labsFile = path.join(root, "labs.yaml");
  const labs = parseWith(LabCatalogueSchema, readYaml(labsFile, errors), labsFile, errors) ?? [];

  const titlesFile = path.join(root, "lesson-titles.yaml");
  const titles = existsSync(titlesFile)
    ? (parseWith(LessonTitlesSchema, readYaml(titlesFile, errors), titlesFile, errors) ?? {})
    : {};

  const sectionsDir = path.join(root, "sections");
  for (const d of readdirSync(sectionsDir).sort()) {
    const dir = path.join(sectionsDir, d);
    const sectionFile = path.join(dir, "section.yaml");
    if (!existsSync(sectionFile)) continue;
    const s = parseWith(SectionSchema, readYaml(sectionFile, errors), sectionFile, errors);
    if (s) sections.push({ ...s, dir });
    const lessonsDir = path.join(dir, "lessons");
    if (!existsSync(lessonsDir)) continue;
    for (const ld of readdirSync(lessonsDir).sort()) {
      if (!existsSync(path.join(lessonsDir, ld, "lesson.yaml"))) continue;
      const lesson = readLesson(path.join(lessonsDir, ld), errors);
      if (!lesson) continue;
      if (s && !lesson.id.startsWith(s.id)) {
        errors.push(`${rel(lesson.dir)}: lesson ${lesson.yaml.code} is filed under section ${s.id}`);
      }
      if (!ld.startsWith(`${lesson.yaml.code}-`)) {
        errors.push(`${rel(lesson.dir)}: folder name must start with "${lesson.yaml.code}-"`);
      }
      lessons.push(lesson);
    }
  }
  return { sections, labs, lessons, titles, errors };
}

/** The lab id a lesson uses: lesson.yaml lab_id, else the first catalogue lab that lists it. */
export function primaryLabFor(code: string, labs: LabCatalogue, explicit?: string): string | null {
  if (explicit) return explicit;
  return labs.find((l) => l.lessons.includes(code))?.id ?? null;
}

/** Merge a lab step's config over the lab's default_config (one level deep for plain objects). */
export function mergeLabConfig(base: Record<string, unknown> | undefined, over: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...(base ?? {}) };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] =
      v && typeof v === "object" && !Array.isArray(v) && b && typeof b === "object" && !Array.isArray(b)
        ? { ...(b as object), ...(v as object) }
        : v;
  }
  return out;
}
