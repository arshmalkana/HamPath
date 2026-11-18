import { createHash } from "node:crypto";
import { QUESTION_ID_RE, lessonIdOf, sectionIdOf } from "./ids.ts";

/** One row of ISED's amat_basic_quest_delim.txt (semicolon-delimited, 11 fields). */
export interface BankQuestion {
  id: string;
  lessonId: string;
  sectionId: string;
  stemEn: string;
  /** Index 0 is the correct answer (the file always lists it first); 1–3 are distractors. */
  optionsEn: [string, string, string, string];
  stemFr: string;
  optionsFr: [string, string, string, string];
}

export interface ParsedBank {
  questions: BankQuestion[];
  sha256: string;
  errors: string[];
}

export const BANK_HEADER = [
  "question_id",
  "question_english",
  "correct_answer_english",
  "incorrect_answer_1_english",
  "incorrect_answer_2_english",
  "incorrect_answer_3_english",
  "question_french",
  "correct_answer_french",
  "incorrect_answer_1_french",
  "incorrect_answer_2_french",
  "incorrect_answer_3_french",
];

/**
 * Parse the ISED bank file. Tolerates a UTF-8 BOM, CRLF line endings and stray whitespace
 * around the header names (the official file has "question_id " with a trailing space).
 * The format has no quoting, so a field containing ';' shows up as a wrong field count.
 */
export function parseBank(input: string | Buffer): ParsedBank {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const text = buf.toString("utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);
  const errors: string[] = [];
  const questions: BankQuestion[] = [];

  const header = (lines[0] ?? "").split(";").map((h) => h.trim().toLowerCase());
  if (header.join(";") !== BANK_HEADER.join(";")) {
    errors.push(`Line 1: unexpected header (${header.length} fields): ${header.join(";")}`);
    return { questions, sha256, errors };
  }

  const seen = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") continue;
    const f = line.split(";").map((s) => s.trim());
    const where = `Line ${i + 1}`;
    if (f.length !== 11) {
      errors.push(`${where}: expected 11 fields, got ${f.length} (${f[0]})`);
      continue;
    }
    const id = f[0]!;
    if (!QUESTION_ID_RE.test(id)) {
      errors.push(`${where}: bad question id '${id}'`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`${where}: duplicate question id ${id}`);
      continue;
    }
    const empty = f.findIndex((x, idx) => idx > 0 && x === "");
    if (empty !== -1) {
      errors.push(`${where}: ${id} has an empty ${BANK_HEADER[empty]}`);
      continue;
    }
    const en = [f[2]!, f[3]!, f[4]!, f[5]!] as [string, string, string, string];
    if (new Set(en).size !== 4) errors.push(`${where}: ${id} has duplicate English options`);
    seen.add(id);
    questions.push({
      id,
      lessonId: lessonIdOf(id),
      sectionId: sectionIdOf(id),
      stemEn: f[1]!,
      optionsEn: en,
      stemFr: f[6]!,
      optionsFr: [f[7]!, f[8]!, f[9]!, f[10]!],
    });
  }
  return { questions, sha256, errors };
}
