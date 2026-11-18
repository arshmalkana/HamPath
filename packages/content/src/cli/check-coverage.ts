/**
 * `pnpm check:coverage`: the CI content checks from SPEC §8, with a per-section report.
 *
 *   1. every question belongs to exactly one lesson and is on at least one card's `teaches:` list
 *   2. every wrong option has an English Why not? note
 *   3. every calculation answer is reproduced by ham-sim
 *   4. every lab config passes its schema and every image has alt text
 *
 * Errors in authored lessons (and in the bank, titles or exam blueprint) fail the run. Lessons that
 * aren't written yet are reported as gaps, not failures. `-- --strict` is the launch gate: every
 * section must be fully built.
 */
import { appendFileSync, readFileSync } from "node:fs";
import {
  BANK_PATH,
  checkBlueprint,
  lessonCode,
  parseBank,
  readBlueprint,
  readContentTree,
  validateContent,
  type QuestionsByTopic,
} from "../index.ts";

const strict = process.argv.includes("--strict");
const bank = parseBank(readFileSync(BANK_PATH));
const tree = readContentTree();
const result = validateContent(bank, tree);

// Exam blueprint must stay satisfiable as the bank changes.
const byTopic: QuestionsByTopic = new Map();
for (const q of bank.questions) {
  const code = lessonCode(q.lessonId);
  byTopic.set(code, [...(byTopic.get(code) ?? []), q.id]);
}
let blueprintErrors: string[] = [];
try {
  blueprintErrors = checkBlueprint(readBlueprint(), byTopic).map((e) => `content/exam-blueprint.yaml: ${e}`);
} catch (e) {
  blueprintErrors = [`content/exam-blueprint.yaml: ${(e as Error).message.split("\n")[0]}`];
}

const sectionOfError = (e: string) => /content\/sections\/0(\d)-/.exec(e)?.[1] ?? /\bB-00(\d)-/.exec(e)?.[1] ?? null;
const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "-");

interface Row {
  section: string;
  title: string;
  lessons: string;
  rule1: string;
  rule2: string;
  rule3: string;
  rule4: string;
  status: string;
}
const rows: Row[] = [];
const errors = [...blueprintErrors, ...result.errors];
const unbuilt: string[] = [];

for (const s of tree.sections) {
  const lessons = result.lessons.filter((l) => l.id.startsWith(s.id));
  const authored = lessons.filter((l) => l.authored);
  const qs = lessons.flatMap((l) => l.questions);
  const builtQs = authored.flatMap((l) => l.questions);
  const secErrors = result.errors.filter((e) => sectionOfError(e) === String(s.number));
  const labErrors = secErrors.filter((e) => /lab\.json|alt text|lab step/.test(e));
  const calcs = builtQs.filter((q) => q.calc !== "none");
  const status = secErrors.length
    ? "FAIL"
    : authored.length === lessons.length
      ? "built"
      : authored.length
        ? "partly built"
        : "not built yet";
  if (authored.length < lessons.length) unbuilt.push(`${s.number}`);
  rows.push({
    section: `${s.number}`,
    title: s.title_en,
    lessons: `${authored.length}/${lessons.length}`,
    rule1: `${qs.filter((q) => q.cards.length).length}/${qs.length} (${pct(qs.filter((q) => q.cards.length).length, qs.length)})`,
    rule2: `${qs.filter((q) => q.whyNot === 3).length}/${qs.length}`,
    rule3: calcs.length ? `${calcs.filter((q) => q.calc === "verified").length}/${calcs.length}` : "-",
    rule4: authored.length ? (labErrors.length ? `${labErrors.length} error(s)` : "ok") : "-",
    status,
  });
}

const head = ["Section", "Lessons built", "1 taught on a card", "2 Why not? notes", "3 calcs reproduced", "4 labs & alt text", "Status"];
const table = rows.map((r) => [`${r.section}. ${r.title}`, r.lessons, r.rule1, r.rule2, r.rule3, r.rule4, r.status]);
const widths = head.map((h, i) => Math.max(h.length, ...table.map((r) => r[i]!.length)));
const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i]!)).join("  ");

const t = result.totals;
console.log(`Question coverage (bank sha256 ${bank.sha256.slice(0, 12)}…): ${t.questions} questions in ${t.lessons} lessons\n`);
console.log(line(head));
console.log(widths.map((w) => "-".repeat(w)).join("  "));
for (const r of table) console.log(line(r));
console.log(`\nTotal: ${t.taught}/${t.questions} taught on a card, ${t.whyNotComplete}/${t.questions} with 3 Why not? notes, ${t.authoredLessons}/${t.lessons} lessons built.`);
if (unbuilt.length) console.log(`Not failing for unbuilt lessons in section(s) ${unbuilt.join(", ")}${strict ? " (except in --strict)" : ""}.`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [
    "## Question coverage",
    "",
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...table.map((r) => `| ${r.join(" | ")} |`),
    "",
    `${t.taught}/${t.questions} questions taught on a card; ${t.authoredLessons}/${t.lessons} lessons built.`,
    errors.length ? `\n**${errors.length} error(s)**:\n\n${errors.map((e) => `- ${e}`).join("\n")}` : "",
  ].join("\n");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
}

if (strict && unbuilt.length) errors.push(`--strict: section(s) ${unbuilt.join(", ")} are not fully built`);
if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log("\n✓ coverage checks passed");
