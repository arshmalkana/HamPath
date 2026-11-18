# HamPath

An interactive course for Canada's Basic amateur radio qualification. Every one of the 984 ISED questions is taught in a
lesson, practised in a hands-on lab and asked in its official wording. The product spec is in [docs/SPEC.md](docs/SPEC.md);
phase notes are in [docs/PHASE-0.md](docs/PHASE-0.md) and [docs/PHASE-1.md](docs/PHASE-1.md).

## Quick start

Needs Node 22+ and Docker. pnpm is pinned in `package.json`; if you don't have it, prefix commands with `npx pnpm@10.34.9`.

```sh
pnpm install
cp .env.example .env
pnpm dev
```

`pnpm dev` starts Postgres and Mailpit in Docker, applies migrations, loads the database on first run (seed, question
bank, lesson content), then runs the API and the web app together:

| What                    | Where                                                                   |
| ----------------------- | ----------------------------------------------------------------------- |
| Web app (dashboard)     | http://localhost:3000                                                   |
| Full reference lesson   | http://localhost:3000/lessons/5.04 (Ohm's Law, LAB-20)                  |
| Daily Review / mocks    | http://localhost:3000/review, http://localhost:3000/mocks               |
| Component gallery       | http://localhost:3000/dev/components                                    |
| API                     | http://127.0.0.1:4000/api/v1 (the web app proxies `/api/*` to it)       |
| Dev inbox (magic links) | http://localhost:8025                                                   |
| Postgres                | `127.0.0.1:5433` (5433 so it doesn't clash with another local Postgres) |

Offline support (service worker) runs in production builds: `pnpm build`, then `pnpm --filter @hampath/web start` with
the API running. In dev you can opt in with `localStorage.setItem("hp-sw", "1")`.

## Repository

```
apps/web          Next.js (App Router) + React + TypeScript + Tailwind: dashboard, lesson player, labs, review,
                  checkpoints, mock exams, sign-in, profile, service worker
apps/api          Fastify + TypeScript + Zod: grading, FSRS scheduling, mastery, progress, auth, readiness, admin import
packages/db       PostgreSQL 16 schema (Drizzle), SQL migrations, seed, question-bank importer, content loader
packages/ham-sim  Pure TypeScript physics and maths (Ohm's Law, power, circuits, Morse, goal expressions), Vitest
packages/ui       Design system: app theme (light/dark), shack skin, instruments, the illustrated shack scene
packages/content  ISED bank parser, content-tree reader, CI coverage checks, exam blueprint
content/          Source of truth: bank file, sections, lessons (YAML + MDX), lesson titles, exam blueprint
docs/coverage/    Generated: every question, its lesson, the cards that teach it (pnpm coverage)
```

## Commands

| Command                                  | Does                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm dev`                               | Everything above                                                                         |
| `pnpm test`                              | All Vitest suites. Builds a throwaway `hampath_test` database first (needs `pnpm db:up`) |
| `pnpm lint` / `pnpm format`              | ESLint / Prettier                                                                        |
| `pnpm typecheck`                         | `tsc` in every package                                                                   |
| `pnpm check:coverage`                    | CI content checks (SPEC §8) with a per-section report; `-- --strict` is the launch gate  |
| `pnpm coverage`                          | Regenerate `docs/coverage/` from the bank and `content/`                                 |
| `pnpm build`                             | Production build of the web app                                                          |
| `pnpm db:setup` / `pnpm db:reset`        | Migrate, seed, import, load content / the same on a fresh volume                         |
| `pnpm import:bank [file] [-- --dry-run]` | Import an ISED bank file and print the diff (added / changed / retired)                  |
| `pnpm db:generate`                       | Generate a migration after editing `packages/db/src/schema.ts`                           |
| `pnpm db:make-admin <email>`             | Give a signed-in account the admin role                                                  |

## CI

`.github/workflows/ci.yml` runs on every push to `main` and every pull request:

- **Content coverage:** `pnpm check:coverage` (the four SPEC §8 checks; the per-section table goes to the job summary) and
  a check that `docs/coverage/` was regenerated. Lessons that aren't written yet are reported, not failed; errors in
  written lessons, the bank, the titles or the exam blueprint fail the build.
- **Quality:** lint, Prettier, type checks.
- **Tests:** Vitest against a Postgres 16 service container.
- **Build:** the production web build.

## Decisions worth knowing

- **100 lessons, not 104.** The bank has 100 topic groups and the spec's own per-section counts add up to 100. Lesson
  titles are working drafts in `content/lesson-titles.yaml`, awaiting the technical reviewer. Lessons without written
  content are served as an intro card plus a Check of every question, so the whole bank is answerable today.
- **Drizzle, not Prisma.** The schema needs partial unique indexes (one active correct option per question), check
  constraints, a citext column and an append-only trigger. Drizzle expresses the first three in TypeScript and generates
  plain, reviewable SQL migrations, with custom SQL migrations for the rest. It is a thin layer over `pg`, so complex
  reporting queries stay as SQL. Prisma would add a query-engine binary and code generation, and still need raw SQL for
  the partial indexes and the trigger.
- **The bank is versioned.** Re-importing the same file is a no-op. A changed option is retired and replaced, never
  edited, so past attempts keep the text the learner saw. Removed questions are retired, not deleted.
- **Answers never reach the browser early.** Question payloads carry opaque option ids only. In the lesson Check, a first
  wrong answer gets the _Why not?_ note and a second try; the answer is revealed on the second try, straight away in
  Daily Review, and at the end of a Checkpoint or mock (which are submitted as a whole).
- **Scheduling is FSRS-5** (correct = Good, wrong = Again, 90% target retention). Mastered = correct twice in a row on
  separate UTC days, the second outside the lesson Check.
- **The mock exam blueprint is a config file:** `content/exam-blueprint.yaml` (questions per section, optional pinned
  topics, time limit, pass and honours marks). Its section weights are placeholders until ISED's current exam
  specification is confirmed; CI fails if the blueprint can't be met by the bank.
- **Lab goals are re-checked on the server** from the lab's inputs, using the same `ham-sim` code the browser runs.
- **Sign-in:** guest sessions from the first visit; an e-mail magic link upgrades the guest and keeps their progress.
  Google appears once `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set in `.env` (redirect URI:
  `http://localhost:3000/api/v1/auth/google/callback`).
- **Readiness** = mastered % × 0.5 + last-3-mock average × 0.5, green at 85%; it stays empty until 3 mocks are done.
- **Offline:** the service worker keeps the app shell and the current section's lessons; answers given offline are saved
  in the browser and graded when the connection returns.

## Authoring a lesson

Copy `content/sections/05-electronics/lessons/5.04-ohms-law/`: `lesson.yaml` (questions, calculations), `cards/*.mdx`
(front matter `teaches:` lists the question ids each card covers), `lab.json` (lab steps: config, goal, hints) and
`why-not.yaml` (one note per wrong option). `pnpm check:coverage` tells you what's missing. The generated intro lesson
for that topic is replaced automatically once the folder exists; `pnpm dev` reloads content on every start.
