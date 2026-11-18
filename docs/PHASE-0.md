# Phase 0 — Foundations: plan

Source: [SPEC.md](SPEC.md) section 9. **Done when:** lesson 5.04 Ohm's Law with LAB-20 is playable end to end.

## Decisions and corrections to the spec

| Topic | Decision |
| --- | --- |
| Lesson count | The bank has **100** topic groups, and the spec's own per-section lesson counts (25+9+21+6+13+13+8+5) also sum to 100. "104 lessons" in the spec is a typo; HamPath has 100 lessons, one per topic group. |
| Coverage tabs | `docs/coverage/` is **generated** from the bank + `content/` tree (`npm run coverage`), so it can never drift from the source of truth. |
| Repo layout | npm workspaces: `packages/ham-sim`, `packages/content`, `apps/api`, `apps/web`. |
| Database | PostgreSQL 16 in `docker-compose.yml`, host port **5433** (5432 is used by another local project). Plain SQL migrations in `apps/api/migrations`, applied by a tiny runner. |
| Option IDs | Opaque UUIDs. The ISED file always lists the correct answer first, so a position-based ID would leak the answer. |
| Bank versioning | Each import is a `bank_version` row (sha256 of the file). Changed option text retires the old option row and creates a new one, so past attempts keep pointing at the text the learner actually saw; changed stems are kept in `question_history`. Removed questions are retired, never deleted. Lessons with added/changed questions get `needs_card_review = true`. |
| Cards | `.mdx` files with YAML front matter (`type`, `teaches`, `exam_fact`, `lab_step`, `interaction`). Body is Markdown; labs are referenced by front matter, not by JSX, so the loader stays a pure parser. |
| Auth | Phase 0 ships **guest sessions** (httpOnly cookie, server-side session row) so grading and progress are server-side from day one. Email magic link + Google/Apple are the last Phase 0 item (below), layered on the same session table. |
| Check flow | First wrong try: *Why not?* for the chosen option + "See it again" link, correct answer **not** revealed; second try: correct answer revealed. Quizzes/mocks reveal immediately. |
| Mastery | Phase 0 implements the spec's mastery rule (2 correct in a row on separate days, the second outside the lesson Check) and puts misses in the review queue. FSRS stability/difficulty columns exist but are filled in Phase 1. |

## Work breakdown

1. **Repo & tooling** — workspaces, TypeScript strict, Vitest, docker-compose (PG16), `.env.example`.
2. **`ham-sim`** — pure TS: SI-prefix parse/format, Ohm's Law solver with worked steps, power, series/parallel, dB, wavelength, LC resonance, and a safe goal-expression evaluator (`I >= 0.2 && V < 12`) used by labs on both client and server. Unit-tested against the bank's own calculation questions.
3. **`@hampath/content`** — bank parser (11 fields, CRLF, BOM-safe), content-tree reader with Zod schemas, validation (CI checks 1–4 from SPEC §8), coverage report generator.
4. **Schema** — every table in SPEC §7 (content + learner), plus `bank_version`, `question_history`, `session`.
5. **Importer** — `npm run db:import-bank` and `POST /api/v1/admin/import-bank` (admin token), both returning a diff (added / changed / retired / unchanged). Creates sections and lessons from the IDs. `npm run db:load-content` loads cards, labs, lab steps, why-not notes.
6. **API** — Fastify + Zod: sections, lesson (correct flags withheld), attempts (server grading, why-not, worked solution, teaching card link), lab events (server re-checks `goal_met` against the step's `goal_expr`), lesson progress, guest auth.
7. **Web** — Next.js app router + Tailwind. Design tokens for the "virtual shack" look (dark panel, amber meter faces, phosphor-green readouts). Lesson player with screen types: concept card, predict card, numeric input, lab screen, multiple choice, recap.
8. **LAB-20 Ohm's Law Circuit Builder** — SVG circuit (battery, switch, resistor(s), ammeter, voltmeter), animated current flow, analog meters with text readouts, keyboard controls, single/series/parallel topologies, per-step config with locked controls, goals and hints, sandbox mode with typed values (`10m`, `2.2k`).
9. **Lesson 5.04 content** — hook, 3 explore steps, learn cards tagged with all 11 question IDs, worked example, numeric practice, 33 *Why not?* notes, calculation specs reproduced by `ham-sim`.
10. **Verification** — unit tests, `npm run check:content`, API smoke test, browser walk-through of 5.04.

## Remaining Phase 0 items after the 5.04 vertical slice

- Email magic link + Google/Apple sign-in; merge guest progress on sign-in.
- Virtual-shack illustration set (needs the illustrator); current art is code-drawn SVG.
- CI pipeline (GitHub Actions) running tests + `check:content`.
- Service worker / offline caching (could slip to Phase 1).
