import { lessonCode, parseBank, type BankQuestion } from "@hampath/content";
import { DryRunRollback, tx, type Client, type Pool } from "../pool.ts";

export interface ImportDiff {
  bankVersion: number | null;
  sha256: string;
  dryRun: boolean;
  questionCount: number;
  added: string[];
  changed: { id: string; fields: string[] }[];
  retired: string[];
  unchanged: number;
  /** Lessons flagged needs_card_review because a question was added or changed. */
  lessonsNeedingReview: string[];
}

export class BankParseError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Bank file has ${errors.length} error(s): ${errors.slice(0, 5).join("; ")}`);
  }
}

interface ExistingOption {
  id: string;
  slot: number;
  text_en: string;
  text_fr: string;
}
interface ExistingQuestion {
  id: string;
  stem_en: string;
  stem_fr: string;
  bank_version: number;
  retired_in: number | null;
  options: ExistingOption[];
}

/** Questions link to lessons by ID; the lessons come from the seed (docs/coverage). */
async function assertLessonsSeeded(c: Client, qs: BankQuestion[]) {
  const { rows } = await c.query<{ id: string }>("SELECT id FROM lesson");
  const have = new Set(rows.map((r) => r.id));
  const missing = [...new Set(qs.map((q) => q.lessonId))].filter((id) => !have.has(id)).sort();
  if (missing.length) {
    throw new Error(`No lesson rows for ${missing.map(lessonCode).join(", ")}. Run pnpm db:seed first (or add them to docs/coverage).`);
  }
}

async function loadExisting(c: Client): Promise<Map<string, ExistingQuestion>> {
  const qs = await c.query<Omit<ExistingQuestion, "options">>(
    "SELECT id, stem_en, stem_fr, bank_version, retired_in FROM question",
  );
  const map = new Map<string, ExistingQuestion>(qs.rows.map((q) => [q.id, { ...q, options: [] }]));
  const os = await c.query<ExistingOption & { question_id: string }>(
    "SELECT id, question_id, slot, text_en, text_fr FROM option WHERE retired_in IS NULL",
  );
  for (const o of os.rows) map.get(o.question_id)?.options.push(o);
  return map;
}

async function insertOption(c: Client, qid: string, slot: number, en: string, fr: string, version: number) {
  await c.query(
    `INSERT INTO option (question_id, slot, text_en, text_fr, is_correct, bank_version)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [qid, slot, en, fr, slot === 0, version],
  );
}

/**
 * Import an ISED bank file and diff it against what is in the database.
 * - new question → inserted; its lesson is flagged needs_card_review
 * - changed stem → old stem kept in question_history
 * - changed option → old option row retired, new row inserted (attempts keep their text)
 * - question missing from the file → retired (never deleted)
 * Re-importing the same file is a no-op apart from recording nothing new.
 * With dryRun, everything runs in a transaction that is rolled back: a preview of the diff.
 */
export async function importBank(
  pool: Pool,
  file: Buffer | string,
  opts: { sourceFile: string; dryRun?: boolean },
): Promise<ImportDiff> {
  const bank = parseBank(file);
  if (bank.errors.length) throw new BankParseError(bank.errors);

  const run = async (c: Client): Promise<ImportDiff> => {
    await c.query("LOCK TABLE question IN EXCLUSIVE MODE");
    const existing = await loadExisting(c);
    const diff: ImportDiff = {
      bankVersion: null, sha256: bank.sha256, dryRun: Boolean(opts.dryRun),
      questionCount: bank.questions.length, added: [], changed: [], retired: [], unchanged: 0, lessonsNeedingReview: [],
    };

    const { rows: [v] } = await c.query<{ id: number }>(
      "INSERT INTO bank_version (sha256, source_file, question_count) VALUES ($1,$2,$3) RETURNING id",
      [bank.sha256, opts.sourceFile, bank.questions.length],
    );
    const version = v!.id;
    diff.bankVersion = version;
    await assertLessonsSeeded(c, bank.questions);

    const review = new Set<string>();
    for (const q of bank.questions) {
      const old = existing.get(q.id);
      if (!old) {
        await c.query(
          `INSERT INTO question (id, lesson_id, stem_en, stem_fr, bank_version) VALUES ($1,$2,$3,$4,$5)`,
          [q.id, q.lessonId, q.stemEn, q.stemFr, version],
        );
        for (let s = 0; s < 4; s++) await insertOption(c, q.id, s, q.optionsEn[s]!, q.optionsFr[s]!, version);
        diff.added.push(q.id);
        review.add(q.lessonId);
        continue;
      }

      const fields: string[] = [];
      if (old.retired_in !== null) fields.push("restored");
      if (old.stem_en !== q.stemEn || old.stem_fr !== q.stemFr) {
        fields.push("stem");
        await c.query(
          `INSERT INTO question_history (question_id, bank_version, stem_en, stem_fr) VALUES ($1,$2,$3,$4)`,
          [q.id, old.bank_version, old.stem_en, old.stem_fr],
        );
      }
      for (let s = 0; s < 4; s++) {
        const o = old.options.find((x) => x.slot === s);
        if (o && o.text_en === q.optionsEn[s] && o.text_fr === q.optionsFr[s]) continue;
        if (o) await c.query("UPDATE option SET retired_in = $1 WHERE id = $2", [version, o.id]);
        await insertOption(c, q.id, s, q.optionsEn[s]!, q.optionsFr[s]!, version);
        fields.push(s === 0 ? "correct_answer" : `distractor_${s}`);
      }
      if (fields.length) {
        await c.query(
          `UPDATE question SET stem_en=$2, stem_fr=$3, bank_version=$4, retired_in=NULL WHERE id=$1`,
          [q.id, q.stemEn, q.stemFr, version],
        );
        diff.changed.push({ id: q.id, fields });
        review.add(q.lessonId);
      } else diff.unchanged++;
    }

    const inFile = new Set(bank.questions.map((q) => q.id));
    for (const old of existing.values()) {
      if (old.retired_in !== null || inFile.has(old.id)) continue;
      await c.query("UPDATE question SET retired_in = $1 WHERE id = $2", [version, old.id]);
      await c.query("UPDATE option SET retired_in = $1 WHERE question_id = $2 AND retired_in IS NULL", [version, old.id]);
      diff.retired.push(old.id);
    }

    // Only authored lessons need a card review; unauthored ones have no cards to review yet.
    const { rows: flagged } = await c.query<{ id: string }>(
      "UPDATE lesson SET needs_card_review = true WHERE id = ANY($1) AND authored RETURNING id",
      [[...review]],
    );
    diff.lessonsNeedingReview = flagged.map((r) => r.id).sort();
    await c.query("UPDATE bank_version SET added=$2, changed=$3, retired=$4 WHERE id=$1", [
      version, diff.added.length, diff.changed.length, diff.retired.length,
    ]);

    const noChange = !diff.added.length && !diff.changed.length && !diff.retired.length;
    if (opts.dryRun || noChange) throw new DryRunRollback(diff);
    return diff;
  };

  try {
    return await tx(pool, run);
  } catch (e) {
    if (!(e instanceof DryRunRollback)) throw e;
    const diff = e.result as ImportDiff;
    if (diff.dryRun) return { ...diff, bankVersion: null };
    // Identical to what is loaded: keep the current version, record nothing.
    const { rows } = await pool.query<{ id: number | null }>("SELECT max(id) AS id FROM bank_version");
    return { ...diff, bankVersion: rows[0]?.id ?? null };
  }
}
