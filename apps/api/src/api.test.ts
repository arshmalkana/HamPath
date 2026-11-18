import { readFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BANK_PATH } from "@hampath/content";
import { createPool } from "@hampath/db";
import { buildApp } from "./app.ts";
import { sentMail } from "./mailer.ts";

// Runs against the fresh test database from scripts/test-global-setup.ts.
const pool = createPool();
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(pool);
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

/** A browser: keeps its own session cookie between requests. */
function browser() {
  let cookie = "";
  return async function call(
    method: "GET" | "POST" | "PUT" | "PATCH",
    url: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const res = await app.inject({
      method,
      url: `/api/v1${url}`,
      payload: body as object,
      headers: { cookie, ...headers },
    });
    const set = res.headers["set-cookie"];
    for (const c of ([] as string[]).concat(set ?? [])) {
      const [pair] = c.split(";");
      if (pair!.startsWith("hp_session=")) cookie = pair!.endsWith("=") ? "" : pair!;
    }
    let json: any = null;
    try {
      json = res.json();
    } catch {
      json = null;
    }
    return { status: res.statusCode, json, headers: res.headers };
  };
}

const correctOptions = async (lessonPrefix: string) =>
  (
    await pool.query<{ question_id: string; id: string }>(
      `SELECT question_id, id FROM option WHERE is_correct AND retired_in IS NULL AND question_id LIKE $1`,
      [`${lessonPrefix}%`],
    )
  ).rows;

describe("GET /health", () => {
  it("reports ok", async () => {
    expect((await browser()("GET", "/health")).json).toEqual({ ok: true });
  });
});

describe("GET /sections", () => {
  it("lists 8 sections with 100 lessons and question counts", async () => {
    const { status, json } = await browser()("GET", "/sections");
    expect(status).toBe(200);
    expect(json).toHaveLength(8);
    expect(json.reduce((n: number, s: any) => n + s.lessons.length, 0)).toBe(100);
    expect(
      json.reduce((n: number, s: any) => n + s.lessons.reduce((m: number, l: any) => m + l.questionCount, 0), 0),
    ).toBe(984);
    const l504 = json[4].lessons.find((l: any) => l.code === "5.04");
    expect(l504).toMatchObject({ title: "Ohm's Law", authored: true, labId: "LAB-20", questionCount: 11 });
  });
});

describe("GET /sections/:id", () => {
  it("finds a section by id or number", async () => {
    const call = browser();
    expect((await call("GET", "/sections/B-005")).json).toMatchObject({
      id: "B-005",
      title: "Basic Electronics & Theory",
    });
    expect((await call("GET", "/sections/5")).json.lessons).toHaveLength(13);
  });
  it("404s an unknown section", async () => {
    expect((await browser()("GET", "/sections/B-009")).status).toBe(404);
  });
});

describe("GET /lessons/:id", () => {
  it("returns cards, lab steps and Check questions by code or id", async () => {
    const call = browser();
    const { status, json } = await call("GET", "/lessons/5.04");
    expect(status).toBe(200);
    expect(json).toMatchObject({ id: "B-005-004", code: "5.04", title: "Ohm's Law", lab: { id: "LAB-20" } });
    expect(json.cards).toHaveLength(17);
    expect(json.questions).toHaveLength(11);
    expect(json.cards[1].labStep).toMatchObject({ id: "5.04/explore-current", component: "OhmsLawLab" });
    expect((await call("GET", "/lessons/B-005-004")).json.id).toBe("B-005-004");
  });

  it("never sends which option is correct, nor Why not? notes", async () => {
    const { json } = await browser()("GET", "/lessons/5.04");
    for (const q of json.questions) {
      expect(q.options).toHaveLength(4);
      for (const o of q.options) expect(Object.keys(o).sort()).toEqual(["id", "text"]);
    }
    expect(JSON.stringify(json.questions)).not.toMatch(/correct|why_?not/i);
  });

  it("shuffles option order between requests", async () => {
    const call = browser();
    const orders = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const { json } = await call("GET", "/lessons/5.04");
      orders.add(json.questions[0].options.map((o: any) => o.text).join("|"));
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it("serves any lesson with its questions and 404s unknown ones", async () => {
    const call = browser();
    const { json } = await call("GET", "/lessons/1.01");
    expect(json).toMatchObject({ code: "1.01", title: "Who makes the rules" });
    expect(json.questions).toHaveLength(4);
    expect((await call("GET", "/lessons/9.99")).status).toBe(404);
    expect((await call("GET", "/lessons/nonsense")).status).toBe(404);
  });
});

describe("POST /attempts", () => {
  it("requires a session", async () => {
    expect((await browser()("POST", "/attempts", {})).status).toBe(401);
  });

  it("grades on the server: hidden answer on a first miss, revealed with worked solution on the second", async () => {
    const call = browser();
    await call("POST", "/auth/guest");
    const { json: lesson } = await call("GET", "/lessons/5.04");
    const q6 = lesson.questions.find((q: any) => q.id === "B-005-004-006");
    const opt = (text: string) => q6.options.find((o: any) => o.text === text).id;

    const miss = (
      await call("POST", "/attempts", { question_id: q6.id, option_id: opt("90 ohms"), context: "check", try: 1 })
    ).json;
    expect(miss).toMatchObject({ correct: false, revealed: false, correct_option_id: null, in_review_queue: true });
    expect(miss.why_not).toMatch(/10 mA as 0\.1 A/);
    expect(miss.teach_card).toEqual({
      id: "5.04/10-milliamps",
      title: "Milliamps first",
      href: "/lessons/5.04?card=5.04%2F10-milliamps",
    });

    const miss2 = (
      await call("POST", "/attempts", { question_id: q6.id, option_id: opt("9 ohms"), context: "check", try: 2 })
    ).json;
    expect(miss2.revealed).toBe(true);
    expect(miss2.correct_option_id).toBe(opt("900 ohms"));
    expect(miss2.worked_solution).toEqual(["10 mA = 0.01 A", "R = E ÷ I", "R = 9 V ÷ 0.01 A", "R = 900 Ω"]);

    const right = (
      await call("POST", "/attempts", { question_id: q6.id, option_id: opt("900 ohms"), context: "review", try: 1 })
    ).json;
    expect(right).toMatchObject({ correct: true, why_not: null, correct_option_id: opt("900 ohms") });
  });

  it("reveals immediately outside the lesson Check", async () => {
    const call = browser();
    await call("POST", "/auth/guest");
    const { json } = await call("GET", "/lessons/5.04");
    const q = json.questions.find((x: any) => x.id === "B-005-004-008");
    const wrong = q.options.find((o: any) => o.text === "2 amperes");
    const res = (await call("POST", "/attempts", { question_id: q.id, option_id: wrong.id, context: "review" })).json;
    expect(res.revealed).toBe(true);
    expect(res.correct_option_id).toBeTruthy();
  });

  it("rejects an option from another question and malformed bodies", async () => {
    const call = browser();
    await call("POST", "/auth/guest");
    const [a] = await correctOptions("B-005-004-001");
    expect(
      (await call("POST", "/attempts", { question_id: "B-005-004-002", option_id: a!.id, context: "check" })).status,
    ).toBe(400);
    expect(
      (await call("POST", "/attempts", { question_id: "B-005-004-002", option_id: "nope", context: "check" })).status,
    ).toBe(400);
    expect(
      (await call("POST", "/attempts", { question_id: "B-005-004-002", option_id: a!.id, context: "exam" })).status,
    ).toBe(400);
  });
});

describe("POST /lab-events", () => {
  it("re-checks goal_met on the server from the lab's inputs and advances the lesson step", async () => {
    const call = browser();
    await call("POST", "/auth/guest");
    const step = "5.04/explore-current";
    const fake = await call("POST", "/lab-events", {
      lab_step_id: step,
      event: "goal_met",
      payload: { state: { topology: "single", E: 3, resistors: [30], closed: true }, I: 0.2 },
    });
    expect(fake.json).toEqual({ recorded: true, goal_verified: false, step: 0 });
    const unbuilt = await call("POST", "/lab-events", {
      lab_step_id: step,
      event: "goal_met",
      payload: { state: { topology: "single", E: 6, resistors: [30], closed: true } },
    });
    expect(unbuilt.json.goal_verified).toBe(false); // this step requires building the circuit
    const board = { source: "battery", series: "ammeter", load: "resistor", across: null };
    const real = await call("POST", "/lab-events", {
      lab_step_id: step,
      event: "goal_met",
      payload: { state: { topology: "single", E: 6, resistors: [30], closed: true, board } },
    });
    expect(real.json).toEqual({ recorded: true, goal_verified: true, step: 2 });
    const { json } = await call("GET", "/lessons/5.04");
    expect(json.progress.step).toBe(2);
  });

  it("records other events and 404s unknown steps", async () => {
    const call = browser();
    await call("POST", "/auth/guest");
    expect((await call("POST", "/lab-events", { lab_step_id: "5.04/sandbox", event: "hint_used" })).json.recorded).toBe(
      true,
    );
    expect((await call("POST", "/lab-events", { lab_step_id: "nope", event: "started" })).status).toBe(404);
    expect((await call("POST", "/lab-events", { lab_step_id: "5.04/sandbox", event: "exploded" })).status).toBe(400);
  });
});

describe("lesson completion, summary and GET /me/readiness", () => {
  it("completes only after every Check question is answered; readiness stays null without mocks", async () => {
    const call = browser();
    await call("POST", "/auth/guest");
    expect((await call("GET", "/me/readiness")).json).toMatchObject({
      masteryPercent: 0,
      mastered: 0,
      totalQuestions: 984,
      mocksTaken: 0,
      readiness: null,
      mocksNeeded: 3,
      weakLessons: [],
    });

    const opts = await correctOptions("B-005-004");
    const { json: lesson } = await call("GET", "/lessons/5.04");
    const q1 = lesson.questions.find((q: any) => q.id === "B-005-004-001");
    const wrong = q1.options.find((o: any) => o.text === "2.5 volts");
    await call("POST", "/attempts", { question_id: q1.id, option_id: wrong.id, context: "check", try: 1 });

    expect((await call("PUT", "/lessons/5.04/progress", { complete: true })).status).toBe(409);
    for (const o of opts.filter((o) => o.question_id !== q1.id)) {
      await call("POST", "/attempts", { question_id: o.question_id, option_id: o.id, context: "check", try: 1 });
    }
    const done = await call("PUT", "/lessons/5.04/progress", { step: 27, complete: true });
    expect(done.status).toBe(200);
    expect(done.json.completedAt).toBeTruthy();

    const { json: sum } = await call("GET", "/lessons/5.04/summary");
    expect(sum).toMatchObject({ total: 11, answered: 11, firstTryCorrect: 10, inReview: 1, mastered: 0 });
    expect((await call("GET", "/review/due")).json.due.map((d: any) => d.id)).toContain(q1.id);

    const r = (await call("GET", "/me/readiness")).json;
    expect(r.readiness).toBeNull();
    expect(r.weakLessons).toEqual([]); // 10/11 first-try correct is above the 80% weak threshold
  });

  it("computes readiness once 3 mocks exist", async () => {
    const call = browser();
    const { json } = await call("POST", "/auth/guest");
    for (const score of [70, 80, 90]) {
      await pool.query(
        "INSERT INTO mock_exam (user_id, question_ids, score, finished_at) VALUES ($1, '{}', $2, now())",
        [json.user.id, score],
      );
    }
    const r = (await call("GET", "/me/readiness")).json;
    expect(r).toMatchObject({ mocksTaken: 3, mockAverage: 80, readiness: 40, green: false, mocksNeeded: 0 });
  });
});

describe("auth: magic link", () => {
  it("e-mails a single-use link that signs the guest in and keeps their progress", async () => {
    const call = browser();
    const guest = (await call("POST", "/auth/guest")).json.user;
    const req = await call("POST", "/auth/magic-link", { email: "Learner@Example.com", redirect: "/lessons/5.04" });
    expect(req.status).toBe(202);
    const mail = sentMail.at(-1)!;
    expect(mail.to).toBe("learner@example.com");
    const link = /http:\/\/localhost:3000(\/api\/v1\/auth\/magic-link\/verify\?token=[\w-]+)/.exec(mail.text)![1]!;

    const verify = await call("GET", link.replace("/api/v1", ""));
    expect(verify.status).toBe(303);
    expect(verify.headers.location).toBe("/lessons/5.04");
    const me = (await call("GET", "/me")).json.user;
    expect(me).toMatchObject({ id: guest.id, email: "learner@example.com", isGuest: false, role: "learner" });

    // The link works once.
    const again = await browser()("GET", link.replace("/api/v1", ""));
    expect(again.headers.location).toBe("/sign-in?error=expired");
  });

  it("signs a second browser into the same account, rejects bad input and rate-limits", async () => {
    const other = browser();
    await other("POST", "/auth/magic-link", { email: "learner@example.com" });
    const link = /verify\?token=[\w-]+/.exec(sentMail.at(-1)!.text)![0];
    await other("GET", `/auth/magic-link/${link}`);
    expect((await other("GET", "/me")).json.user.email).toBe("learner@example.com");

    expect((await other("POST", "/auth/magic-link", { email: "not-an-email" })).status).toBe(400);
    const spam = browser();
    const codes = [];
    for (let i = 0; i < 6; i++)
      codes.push((await spam("POST", "/auth/magic-link", { email: "spam@example.com" })).status);
    expect(codes).toEqual([202, 202, 202, 202, 202, 429]);
  });

  it("refuses open redirects", async () => {
    const call = browser();
    await call("POST", "/auth/magic-link", { email: "redirect@example.com", redirect: "//evil.example" });
    const link = /verify\?token=[\w-]+/.exec(sentMail.at(-1)!.text)![0];
    expect((await call("GET", `/auth/magic-link/${link}`)).headers.location).toBe("/");
  });

  it("logs out", async () => {
    const call = browser();
    await call("POST", "/auth/guest");
    expect((await call("GET", "/me")).status).toBe(200);
    await call("POST", "/auth/logout");
    expect((await call("GET", "/me")).status).toBe(401);
  });
});

describe("auth: Google", () => {
  it("is advertised as unavailable and 404s until configured", async () => {
    const call = browser();
    expect((await call("GET", "/auth/providers")).json).toEqual({ magicLink: true, google: false });
    expect((await call("GET", "/auth/google/start")).status).toBe(404);
  });
});

describe("profile: GET/PATCH /me", () => {
  it("updates display name, call sign and locale with validation", async () => {
    const call = browser();
    await call("POST", "/auth/guest");
    const ok = await call("PATCH", "/me", { display_name: "Sam", call_sign: "va3rac", locale: "fr" });
    expect(ok.json.user).toMatchObject({ displayName: "Sam", callSign: "VA3RAC", locale: "fr" });
    expect((await call("PATCH", "/me", { call_sign: "" })).json.user.callSign).toBeNull();
    expect((await call("PATCH", "/me", { call_sign: "HELLO" })).status).toBe(400);
    expect((await call("PATCH", "/me", { locale: "de" })).status).toBe(400);
    expect((await call("PATCH", "/me", { role: "admin" })).status).toBe(400);
  });
});

describe("POST /admin/import-bank", () => {
  const text = { "content-type": "text/plain" };
  it("is forbidden to learners, allowed to admins and the admin token", async () => {
    const call = browser();
    await call("POST", "/auth/magic-link", { email: "admin@example.com" });
    await call("GET", `/auth/magic-link/${/verify\?token=[\w-]+/.exec(sentMail.at(-1)!.text)![0]}`);
    expect((await call("POST", "/admin/import-bank?dry_run=true", "x", text)).status).toBe(403);

    await pool.query(`UPDATE "user" SET role = 'admin' WHERE email = 'admin@example.com'`);
    const bank = readFileSync(BANK_PATH, "utf8");
    const preview = await call("POST", "/admin/import-bank?dry_run=true", bank, text);
    expect(preview.json).toMatchObject({ dryRun: true, unchanged: 984, added: [], changed: [], retired: [] });

    const byToken = await browser()("POST", "/admin/import-bank?dry_run=true", "x", {
      ...text,
      "x-admin-token": "test-admin-token-123",
    });
    expect(byToken.status).toBe(422);
  });
});

describe("POST /lab-events: authored labs are verified on the server", () => {
  const cases: [string, unknown, unknown][] = [
    // [lab step, state that meets the goal, state that doesn't]
    ["5.01/explore-khz", { exp: 3 }, { exp: 6 }],
    [
      "5.09/explore-coils",
      { kind: "L", arrangement: "parallel", values: [0.012, 0.012] },
      { kind: "L", arrangement: "series", values: [0.012, 0.012] },
    ],
    ["5.08/explore-double", { P0: 100, stages: [3] }, { P0: 100, stages: [1] }],
    ["5.11/explore-stepup", { Np: 250, Ns: 500, Vp: 120, Rload: 100 }, { Np: 250, Ns: 300, Vp: 120, Rload: 100 }],
    [
      "5.12/explore-series",
      { L: 5e-6, C: 100e-12, R: 2, circuit: "series", f: 7.118e6 },
      { L: 5e-6, C: 100e-12, R: 2, circuit: "series", f: 4e6 },
    ],
    [
      "5.10/explore-coil",
      { f: 20e6, harmonic: false, phase: 0, L: 10e-6, C: 0 },
      { f: 1e6, harmonic: false, phase: 0, L: 10e-6, C: 0 },
    ],
    [
      "5.13/explore-place",
      {
        topology: "single",
        E: 12,
        resistors: [100],
        closed: true,
        board: { source: "battery", load: "resistor", series: "ammeter", across: "voltmeter" },
      },
      {
        topology: "single",
        E: 12,
        resistors: [100],
        closed: true,
        board: { source: "battery", load: "resistor", series: "voltmeter", across: "ammeter" },
      },
    ],
    [
      "5.06/explore-rating",
      { topology: "series", E: 44.5, resistors: [500, 500], closed: true },
      { topology: "series", E: 30, resistors: [500, 500], closed: true },
    ],
    // section 3
    ["3.01/build-station", { slots: ["lpf", "swr", "tuner", "switch"] }, { slots: ["swr", "lpf", "tuner", "switch"] }],
    ["3.02/find-power", { slots: [], selected: "pa" }, { slots: [], selected: "osc" }],
    [
      "3.05/build-ssb-rx",
      { slots: ["rf", "mixer", "lo", "iff", "ifa", "pd", "bfo", "af"] },
      { slots: ["rf", "mixer", "bfo", "iff", "ifa", "pd", "lo", "af"] },
    ],
    [
      "3.09/explore-lengths",
      { mode: "yagi", reflector: 1.05, driven: 1, director: 0.95, feed: "driven" },
      { mode: "yagi", reflector: 0.95, driven: 1, director: 1.05, feed: "driven" },
    ],
    ["3.10/explore-cw-qrm", { mode: "cw", filter: 250, tune: 0 }, { mode: "cw", filter: 500, tune: 0 }],
    ["3.10/explore-tune", { mode: "ssb", filter: 2400, tune: 50 }, { mode: "ssb", filter: 2400, tune: 300 }],
    [
      "3.11/explore-keying",
      { mode: "cw", filter: 2400, tune: 0, regulated: true, shaped: true },
      { mode: "cw", filter: 2400, tune: 0, regulated: false, shaped: true },
    ],
    ["3.12/explore-mic", { mic: 0.6, processor: 0 }, { mic: 0.95, processor: 0 }],
    [
      "3.13/explore-deviation",
      { mode: "fm", filter: 20000, tune: 0, deviation: 5000 },
      { mode: "fm", filter: 20000, tune: 0, deviation: 2500 },
    ],
    ["3.14/explore-keyer", { keyer: true, sent: "-.-" }, { keyer: false, sent: "-.-", durations: [3, 1, 3] }],
    ["3.15/explore-rtty", { mode: "rtty", filter: 250, tune: 300 }, { mode: "rtty", filter: 250, tune: 100 }],
    [
      "3.16/explore-parallel",
      { batteries: 2, wiring: "parallel", load: 5, gauge: 10, length: 3, fuse: "battery", supply: "battery" },
      { batteries: 2, wiring: "series", load: 5, gauge: 10, length: 3, fuse: "battery", supply: "battery" },
    ],
    [
      "3.17/explore-gauge",
      { batteries: 1, wiring: "parallel", load: 22, gauge: 10, length: 3, fuse: "battery", supply: "battery" },
      { batteries: 1, wiring: "parallel", load: 22, gauge: 12, length: 3, fuse: "battery", supply: "battery" },
    ],
    [
      "3.18/inspect-security",
      {
        verdicts: {
          keysw: "safe",
          mic: "hazard",
          wrench: "hazard",
          interlock: "safe",
          live: "hazard",
          unplugged: "safe",
        },
      },
      {
        verdicts: {
          keysw: "safe",
          mic: "safe",
          wrench: "hazard",
          interlock: "safe",
          live: "hazard",
          unplugged: "safe",
        },
      },
    ],
    ["3.21/explore-distance", { distance: 8 }, { distance: 3 }],
    // section 6
    [
      "6.01/explore-coax",
      { line: "rg58", length: 20, f: 14200000, D: 7, d: 2, dielectric: "solid" },
      { line: "rg58", length: 20, f: 14200000, D: 7, d: 3, dielectric: "solid" },
    ],
    [
      "6.02/explore-dipole-balun",
      { line: "rg213", length: 20, f: 7100000, balun: true },
      { line: "rg213", length: 20, f: 7100000, balun: false },
    ],
    ["6.04/explore-uhf", { line: "foam", length: 30, f: 440000000 }, { line: "rg58", length: 30, f: 440000000 }],
    ["6.05/explore-analyzer", { length: 1.08, f: 3.6 }, { length: 1, f: 3.6 }],
    [
      "6.06/explore-tuner",
      { length: 1, f: 14.2, tuner: { xl: 100, xc: 100 } },
      { length: 1, f: 14.2, tuner: { xl: 0, xc: 500 } },
    ],
    [
      "6.07/explore-pol",
      { antenna: "dipole", orientation: "vertical", rx: "vertical" },
      { antenna: "dipole", orientation: "vertical", rx: "horizontal" },
    ],
    [
      "6.08/explore-lengthen",
      { mode: "dipole", f: 3.6, length: 39.7, orientation: "ns" },
      { mode: "dipole", f: 3.6, length: 36.7, orientation: "ns" },
    ],
    [
      "6.10/explore-coil",
      { mode: "vertical", f: 3.75, length: 2, radials: "drooping", coil: 64 },
      { mode: "vertical", f: 3.75, length: 2, radials: "drooping", coil: 20 },
    ],
    [
      "6.13/explore-quad",
      { mode: "loop", f: 21.4, perimeter: 14.3, shape: "quad", feed: "bottom" },
      { mode: "loop", f: 21.4, perimeter: 12, shape: "quad", feed: "bottom" },
    ],
    // section 7
    ["7.01/explore-nvis", { f: 5.3, angle: 60, hour: 12 }, { f: 5.3, angle: 20, hour: 12 }],
    ["7.03/explore-europe", { f: 7, angle: 5, hour: 22 }, { f: 7, angle: 15, hour: 22 }],
    ["7.04/explore-night", { f: 1.8, angle: 20, hour: 0 }, { f: 1.8, angle: 20, hour: 12 }],
    ["7.05/explore-max", { year: 5.5 }, { year: 0 }],
    ["7.06/explore-10m", { utc: 14.5, f: 28 }, { utc: 2, f: 28 }],
    [
      "7.07/explore-aurora",
      { band: 2, height: 10, aurora: true, heading: 0 },
      { band: 2, height: 10, aurora: true, heading: 180 },
    ],
    ["7.08/explore-meteor", { band: 6, height: 10, meteors: true }, { band: 2, height: 10, meteors: true }],
    // section 8
    ["8.01/case-overload", { diagnosis: "overload", cure: "hpfTv" }, { diagnosis: "harmonics", cure: "lpfTx" }],
    ["8.04/case-harmonic", { diagnosis: "harmonics", cure: "lpfTx" }, { diagnosis: "harmonics", cure: "hpfTv" }],
    ["8.05/explore-notch", { type: "notch", f1: 14.3 }, { type: "lowpass", f1: 14.0 }],
    ["8.05/explore-bandpass", { type: "bandpass", f1: 12, f2: 16 }, { type: "bandpass", f1: 10, f2: 20 }],
    // section 2
    ["2.01/explore-offset", { offset: -600, tone: 100 }, { offset: 0, tone: 100 }],
    ["2.01/explore-tone", { offset: -600, tone: 100 }, { offset: -600, tone: 88.5 }],
    ["2.03/qso-voice", { picks: [0, 0, 0] }, { picks: [0, 1, 0] }],
    ["2.08/net-distress", { picks: [0, 0, 0, 0, 0] }, { picks: [0, 0, 0, 0] }],
    [
      "2.07/drill-qcodes",
      {
        answers: {
          qrs: "Send more slowly",
          qth: "My location is…",
          qrl: "Is this frequency in use?",
          qsy: "Change frequency",
          qsb: "Your signal is fading",
          qrz: "Who is calling me?",
          qrm: "I'm being interfered with",
        },
      },
      { answers: { qrs: "Change frequency", qth: "My location is…" } },
    ],
    [
      "2.05/copy-prosigns",
      {
        answers: {
          cq: "Calling any station",
          de: "From",
          k: "Any station please reply",
          r: "All received",
          dx: "Distant station",
        },
      },
      { answers: { cq: "From" } },
    ],
    ["2.09/explore-longpath", { heading: 70, local: 7 }, { heading: 250, local: 7 }],
    ["2.09/explore-utc", { heading: 0, local: 13 }, { heading: 0, local: 1 }],
    // section 1
    [
      "1.02/rules-certificate",
      { answers: { valid: "Life", move: "Within 30 days", inspector: "48 hours", fee: "Nothing" } },
      { answers: { valid: "Five years", move: "Within 30 days", inspector: "48 hours", fee: "Nothing" } },
    ],
    [
      "1.09/rules-responsible",
      {
        answers: {
          both: "Both of you",
          family: "Not allowed",
          supervised: "Allowed",
          rx: "No: only when transmitting",
        },
      },
      { answers: { both: "Only you" } },
    ],
    ["1.13/build-callsign", { prefix: "VE", digit: "3", suffix: "HAM" }, { prefix: "VE", digit: "7", suffix: "HAM" }],
    ["1.13/id-timing", { ids: [0, 30, 60, 70] }, { ids: [0, 40, 70] }],
    ["1.16/mode-30m", { f: 10.12, emission: "cw" }, { f: 10.12, emission: "ssb" }],
    ["1.16/band-edge", { f: 14.347, emission: "ssb" }, { f: 14.349, emission: "ssb" }],
    ["1.17/limit-basic-dc", { power: 250 }, { power: 260 }],
    ["1.18/repeater-10m", { offset: -100, tone: null }, { offset: 0, tone: null }],
    [
      "1.21/itu-regions",
      { answers: { ca: "Region 2", jp: "Region 3", fr: "Region 1", au: "Region 3", ke: "Region 1", br: "Region 2" } },
      { answers: { ca: "Region 1" } },
    ],
    ["1.23/permit-height", { height: 14.5, choice: "none" }, { height: 15, choice: "none" }],
    ["1.24/sc6-lowest", { f: 146, environment: "uncontrolled" }, { f: 2000, environment: "uncontrolled" }],
    ["1.25/case-tv", { diagnosis: "fieldHigh", cure: "reduceField" }, { diagnosis: "immunity", cure: "ownerFixes" }],
    // section 4
    [
      "4.01/explore-drive",
      { device: "bjt", mode: "amp", input: 0.0001, drive: 1.5 },
      { device: "bjt", mode: "amp", input: 0.0001, drive: 0.5 },
    ],
    ["4.02/explore-forward", { device: "diode", mode: "iv", input: 1.2 }, { device: "diode", mode: "iv", input: -5 }],
    ["4.02/explore-zener", { device: "zener", mode: "iv", input: -6 }, { device: "zener", mode: "iv", input: -3 }],
    ["4.03/explore-cutoff", { device: "bjt", mode: "iv", input: 0 }, { device: "bjt", mode: "iv", input: 0.00015 }],
    ["4.04/explore-gate", { device: "fet", mode: "iv", input: 0 }, { device: "fet", mode: "iv", input: -2 }],
    ["4.05/explore-grid", { device: "triode", mode: "iv", input: -1 }, { device: "triode", mode: "iv", input: -5 }],
    [
      "4.06/explore-value",
      { bands: ["red", "violet", "yellow", "gold"] },
      { bands: ["red", "violet", "orange", "gold"] },
    ],
    [
      "4.06/speed-round",
      { bands: ["brown", "black", "black", "gold"], score: 5 },
      { bands: ["brown", "black", "black", "gold"], score: 2 },
    ],
  ];
  it.each(cases)("%s", async (step, good, bad) => {
    const call = browser();
    await call("POST", "/auth/guest");
    const yes = await call("POST", "/lab-events", { lab_step_id: step, event: "goal_met", payload: { state: good } });
    const no = await call("POST", "/lab-events", { lab_step_id: step, event: "goal_met", payload: { state: bad } });
    expect(yes.json.goal_verified).toBe(true);
    expect(no.json.goal_verified).toBe(false);
  });
});
