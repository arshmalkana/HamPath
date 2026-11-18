import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { BANK_PATH } from "@hampath/content";
import { createPool, importBank, seed } from "./index.ts";

// Runs against the fresh test database built by scripts/test-global-setup.ts.
const pool = createPool();
afterAll(() => pool.end());

const count = async (sql: string) => (await pool.query<{ n: number }>(sql)).rows[0]!.n;

describe("seed", () => {
  it("has 8 sections, 100 lessons and 35 labs (LAB-01..LAB-35)", async () => {
    expect(await count("SELECT count(*)::int AS n FROM section")).toBe(8);
    expect(await count("SELECT count(*)::int AS n FROM lesson")).toBe(100);
    const labs = (await pool.query<{ id: string }>("SELECT id FROM lab ORDER BY id")).rows.map((r) => r.id);
    expect(labs).toEqual(Array.from({ length: 35 }, (_, i) => `LAB-${String(i + 1).padStart(2, "0")}`));
  });

  it("takes lesson titles and labs from docs/coverage", async () => {
    const { rows } = await pool.query("SELECT code, title, lab_id FROM lesson WHERE code IN ('5.04', '1.19', '6.05') ORDER BY code");
    expect(rows).toEqual([
      { code: "1.19", title: "Frequency stability and overmodulation", lab_id: null },
      { code: "5.04", title: "Ohm's Law", lab_id: "LAB-20" },
      { code: "6.05", title: "Standing wave ratio", lab_id: "LAB-27" },
    ]);
  });

  it("matches the per-section lesson counts", async () => {
    const { rows } = await pool.query<{ number: number; n: number }>(
      "SELECT s.number, count(l.id)::int AS n FROM section s JOIN lesson l ON l.section_id = s.id GROUP BY s.number ORDER BY s.number",
    );
    expect(rows.map((r) => r.n)).toEqual([25, 9, 21, 6, 13, 13, 8, 5]);
  });

  it("is idempotent", async () => {
    await seed(pool);
    expect(await count("SELECT count(*)::int AS n FROM lesson")).toBe(100);
  });
});

describe("bank import", () => {
  it("loads exactly 984 questions and 3,936 options", async () => {
    expect(await count("SELECT count(*)::int AS n FROM question WHERE retired_in IS NULL")).toBe(984);
    expect(await count("SELECT count(*)::int AS n FROM option WHERE retired_in IS NULL")).toBe(3936);
  });

  it("marks exactly one correct option per question, from field 3", async () => {
    const bad = await count(`SELECT count(*)::int AS n FROM (
      SELECT question_id FROM option WHERE retired_in IS NULL GROUP BY question_id HAVING count(*) FILTER (WHERE is_correct) <> 1) x`);
    expect(bad).toBe(0);
    const { rows } = await pool.query(
      "SELECT text_en, text_fr FROM option WHERE question_id = 'B-005-004-001' AND is_correct AND retired_in IS NULL",
    );
    expect(rows).toEqual([{ text_en: "1.0 volts", text_fr: "1,0 volt" }]);
  });

  it("links every question to its lesson, and every lesson has questions", async () => {
    const mislinked = await count(
      "SELECT count(*)::int AS n FROM question q JOIN lesson l ON l.id = q.lesson_id WHERE left(q.id, 9) <> l.id",
    );
    expect(mislinked).toBe(0);
    const empty = await count(
      "SELECT count(*)::int AS n FROM lesson l WHERE NOT EXISTS (SELECT 1 FROM question q WHERE q.lesson_id = l.id)",
    );
    expect(empty).toBe(0);
    const { rows } = await pool.query("SELECT lesson_id FROM question WHERE id = 'B-005-004-001'");
    expect(rows[0].lesson_id).toBe("B-005-004");
  });

  it("stores the bank version", async () => {
    const { rows } = await pool.query("SELECT sha256, question_count, added FROM bank_version ORDER BY id LIMIT 1");
    expect(rows[0]).toMatchObject({ question_count: 984, added: 984 });
    expect(rows[0].sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is idempotent: re-importing the same file changes nothing", async () => {
    const versions = await count("SELECT count(*)::int AS n FROM bank_version");
    const diff = await importBank(pool, readFileSync(BANK_PATH), { sourceFile: "test" });
    expect(diff).toMatchObject({ added: [], changed: [], retired: [], unchanged: 984 });
    expect(await count("SELECT count(*)::int AS n FROM bank_version")).toBe(versions);
  });

  it("diffs a new bank file (dry run): added, changed and removed IDs", async () => {
    const original = readFileSync(BANK_PATH, "utf8");
    const edited = original
      .replace("B-005-004-002;How is the current", "B-005-004-002;HOW is the current")
      .replace(/^B-008-005-001;.*\r?\n/m, "")
      .concat("B-005-004-012;New question?;a;b;c;d;Nouvelle?;af;bf;cf;df\r\n");
    const diff = await importBank(pool, edited, { sourceFile: "test", dryRun: true });
    expect(diff.added).toEqual(["B-005-004-012"]);
    expect(diff.changed).toEqual([{ id: "B-005-004-002", fields: ["stem"] }]);
    expect(diff.retired).toEqual(["B-008-005-001"]);
    // dry run wrote nothing
    expect(await count("SELECT count(*)::int AS n FROM question WHERE id = 'B-005-004-012'")).toBe(0);
  });

  it("rejects a malformed file without touching the database", async () => {
    await expect(importBank(pool, "not;a;bank", { sourceFile: "test" })).rejects.toThrow(/unexpected header/);
  });

  it("keeps attempts append-only", async () => {
    const u = (await pool.query<{ id: string }>(`INSERT INTO "user" (is_guest) VALUES (true) RETURNING id`)).rows[0]!.id;
    const o = (await pool.query<{ id: string }>("SELECT id FROM option WHERE question_id = 'B-005-004-001' LIMIT 1")).rows[0]!.id;
    await pool.query(
      "INSERT INTO attempt (user_id, question_id, option_id, correct, context) VALUES ($1, 'B-005-004-001', $2, false, 'check')",
      [u, o],
    );
    await expect(pool.query("UPDATE attempt SET correct = true WHERE user_id = $1", [u])).rejects.toThrow(/append-only/);
    await expect(pool.query("DELETE FROM attempt WHERE user_id = $1", [u])).rejects.toThrow(/append-only/);
  });
});
