# Phase 0: Foundations

Source: [SPEC.md](SPEC.md) section 9. **Done when:** lesson 5.04 Ohm's Law with LAB-20 is playable end to end.
**Status:** met. Lesson 5.04 plays from the hook to the recap in the browser (see "Verification").

## Decisions and corrections to the spec

| Topic           | Decision                                                                                                                                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lesson count    | **100 lessons**, one per topic group. The bank has 100 groups and the spec's per-section counts (25+9+21+6+13+13+8+5) also sum to 100; "104" in the spec is wrong. (Confirmed by the product owner.)                                                                            |
| Coverage docs   | `docs/coverage/section-N.md` is **generated** (`pnpm coverage`) from the bank, `content/lesson-titles.yaml` and the lessons. Each lesson is a `## x.yy Title` heading with a `Lab:` line; the database seed reads lessons from these files.                                     |
| Lesson titles   | Working titles drafted from each topic group's questions, in `content/lesson-titles.yaml`. They need the technical reviewer's sign-off.                                                                                                                                         |
| Repo            | pnpm workspaces: `apps/web`, `apps/api`, `packages/db`, `packages/ham-sim`, `packages/ui`, `packages/content`.                                                                                                                                                                  |
| Database        | PostgreSQL 16 in Docker on host port **5433**. Schema in Drizzle (`packages/db/src/schema.ts`) with generated SQL migrations plus two custom ones (citext, append-only trigger on `attempt`). See the README for why Drizzle.                                                   |
| Option IDs      | Opaque UUIDs. The ISED file lists the correct answer first, so positional ids would leak it.                                                                                                                                                                                    |
| Bank versioning | Each import is a `bank_version` row. Changed options are retired and replaced; changed stems go to `question_history`; removed questions are retired. Re-importing an identical file records nothing. Authored lessons with added or changed questions get `needs_card_review`. |
| Cards           | `.mdx` with YAML front matter (`type`, `teaches`, `exam_fact`, `lab_step`, `interaction`). Labs are referenced from front matter rather than JSX, so the loader stays a parser.                                                                                                 |
| Check flow      | First wrong try: _Why not?_ for that option and "See it again", answer hidden. Second try, quizzes, review and mocks reveal it (with the worked solution for calculations). (Confirmed by the product owner.)                                                                   |
| Auth            | Guest session from the first visit; e-mail magic link (Mailpit in dev) upgrades the guest in place. Google OIDC with PKCE, enabled by `GOOGLE_CLIENT_ID`/`SECRET`. Apple deferred. Roles: learner, instructor, admin.                                                           |
| Readiness       | `GET /me/readiness` is null until 3 mocks exist; mastery %, mocks taken and weak lessons are returned meanwhile. (Confirmed by the product owner.)                                                                                                                              |
| Mastery         | The spec's rule (2 correct on separate UTC days, the second outside the lesson Check); misses go to the review queue. FSRS columns exist; the scheduler is Phase 1.                                                                                                             |
| Look            | App: clean modern theme, light and dark. Labs: a "shack" skin (enamel panel, lit meters, phosphor readouts).                                                                                                                                                                    |

## What was built

- **ham-sim**: units and SI prefixes, Ohm's Law and power with worked steps, series and parallel circuits, the LAB-20 breadboard model (including the voltmeter-in-series and ammeter-across-load faults), Morse timing, a safe goal-expression evaluator, and calculation specs for content.
- **db**: every SPEC §7 table, plus versioning, sessions, sign-in tokens and OAuth accounts; seed; bank importer (CLI and `POST /admin/import-bank`) with a dry-run diff.
- **api**: `/sections`, `/sections/:id`, `/lessons/:id`, `/attempts`, `/lab-events`, `/lessons/:id/progress`, `/lessons/:id/summary`, `/review/due`, `/me`, `/me/readiness`, auth (guest, magic link, Google, logout), admin import.
- **ui**: tokens, base, components. App: button, phase progress, mastery ring, exam fact, feedback, theme toggle. Shack: knob, analog meter, seven-segment display, waterfall, toggle switch, world map with grey line. Plus drag-and-drop that works by pointer, tap or keyboard.
- **web**: course map, lesson player (Hook, Explore, Learn, Check, Recap) with every SPEC §3 screen type (lab, concept, predict, drag-and-drop, numeric, multiple choice, flashcards, audio), lab framework (`<Lab id config mode onEvent />`, registry of all 35 labs, placeholder for unbuilt ones), LAB-20, sign-in, profile, `/dev/components`.
- **Lesson 5.04**: 17 cards covering all 11 questions, 5 LAB-20 steps, 33 _Why not?_ notes, and 7 calculations reproduced by ham-sim.

## Verification

- `pnpm test`: 85 tests (ham-sim, content parser, DB seed and import, mastery, every API endpoint, lab registry).
- `pnpm check:content`, `pnpm lint`, `pnpm typecheck`: clean.
- A browser walkthrough in Chrome played 5.04 end to end. It built the circuit (including a wrong meter placement), reached every lab goal by keyboard, then did every Learn screen type. In the Check it missed one question (_Why not?_, "See it again" and back) and another twice (reveal and worked solution). It also covered the recap, the course-map update, phone width (no horizontal scroll) and dark mode.

## Still open in Phase 0

- Merging two learners' histories when a guest signs in to an existing account (attempts are append-only, so this needs a design).
- French: questions are stored in both languages; French lesson content is Phase 3.

Done in Phase 1 (see [PHASE-1.md](PHASE-1.md)): CI pipeline, the illustrated shack (code-drawn; an illustrator can
replace it), offline caching.
