import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BANK_PATH, lessonCode, lessonIdFromCode, parseBank } from "./index.ts";

const HEADER =
  "question_id ;question_english;correct_answer_english;incorrect_answer_1_english;incorrect_answer_2_english;incorrect_answer_3_english;question_french;correct_answer_french;incorrect_answer_1_french;incorrect_answer_2_french;incorrect_answer_3_french";

describe("parseBank", () => {
  it("parses the official file: 984 questions, 100 lessons, 8 sections", () => {
    const bank = parseBank(readFileSync(BANK_PATH));
    expect(bank.errors).toEqual([]);
    expect(bank.questions).toHaveLength(984);
    expect(new Set(bank.questions.map((q) => q.lessonId)).size).toBe(100);
    expect(new Set(bank.questions.map((q) => q.sectionId)).size).toBe(8);
    const q = bank.questions.find((x) => x.id === "B-005-004-001")!;
    expect(q.optionsEn[0]).toBe("1.0 volts");
    expect(q.optionsFr[0]).toBe("1,0 volt");
    expect(q.lessonId).toBe("B-005-004");
  });

  it("handles BOM, CRLF and reports bad rows", () => {
    const text =
      "\uFEFF" +
      HEADER +
      "\r\nB-001-001-001;Q?;a;b;c;d;Qf?;af;bf;cf;df\r\n" +
      "B-001-001-002;too;few\r\n" +
      "B-001-001-001;Q?;a;b;c;d;Qf?;af;bf;cf;df\r\n" +
      "X-1;Q?;a;b;c;d;Qf?;af;bf;cf;df\r\n" +
      "B-001-001-003;Q?;a;;c;d;Qf?;af;bf;cf;df\r\n";
    const bank = parseBank(text);
    expect(bank.questions.map((q) => q.id)).toEqual(["B-001-001-001"]);
    expect(bank.errors).toHaveLength(4);
    expect(bank.errors.join("\n")).toMatch(/expected 11 fields/);
    expect(bank.errors.join("\n")).toMatch(/duplicate/);
    expect(bank.errors.join("\n")).toMatch(/bad question id/);
    expect(bank.errors.join("\n")).toMatch(/empty incorrect_answer_1_english/);
  });

  it("rejects an unexpected header", () => {
    expect(parseBank("id;q\nB-001-001-001;x").errors[0]).toMatch(/unexpected header/);
  });

  it("converts lesson codes", () => {
    expect(lessonCode("B-005-004")).toBe("5.04");
    expect(lessonIdFromCode("1.25")).toBe("B-001-025");
  });
});
