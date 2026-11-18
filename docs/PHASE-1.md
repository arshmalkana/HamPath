# Phase 1: Practice MVP

Source: [SPEC.md](SPEC.md) §5 and §9. **Done when:** a learner can drill the whole bank and take mocks. **Status:** met,
plus the three items left open in Phase 0 (CI, the illustrated shack, offline caching).

## What was built

| Area                           | Where                                                                              | Notes                                                                                                                                                                                                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Minimal lesson for every topic | `packages/db/src/import/content.ts`                                                | Each of the 99 lessons without written content gets one generated intro card (title, lab name) and a Check of all its questions. The intro teaches nothing, so coverage stays honest. Writing a lesson folder replaces it.                                             |
| FSRS-5 scheduling              | `apps/api/src/fsrs.ts`, `mastery.ts`                                               | Per learner per question: stability, difficulty, reps, lapses, next due. Correct = Good, wrong = Again (back in 10 minutes).                                                                                                                                           |
| Mastery                        | `apps/api/src/mastery.ts`                                                          | Correct twice in a row on separate UTC days, the second outside the lesson Check. Any miss un-masters.                                                                                                                                                                 |
| Daily Review                   | `GET /review/due`, `/review`                                                       | Questions due by the end of today, most overdue first, up to 20 (about 10 minutes); answers revealed at once.                                                                                                                                                          |
| Section Checkpoints            | `POST /checkpoints/:sectionId`, `POST /checkpoints/:id/submit`, `/checkpoints/new` | Every unmastered question in the section plus a 20% sample of mastered ones; submitted as a whole; 80% earns the section badge; results list weak lessons and link every miss back to where it is taught.                                                              |
| Mock exams (LAB-35)            | `POST /mocks`, `POST /mocks/:id/submit`, `/mocks`                                  | 100 questions from `content/exam-blueprint.yaml`, one per topic before any topic repeats, no repeats in an exam, timed (answers after the limit don't count). Pass 70%, honours 80%. Results: score, status, per-section table, every miss.                            |
| Dashboard                      | `GET /me/dashboard`, `/`                                                           | Illustrated shack, readiness (null until 3 mocks; green at 85%), streak, today's review count, last 3 mocks, mastery % and badge per section, lessons that light up when finished.                                                                                     |
| CI                             | `.github/workflows/ci.yml`, `pnpm check:coverage`                                  | The four SPEC §8 checks with a per-section report (also written to the GitHub job summary); unbuilt lessons reported, not failed. Plus lint, Prettier, types, tests on Postgres, web build.                                                                            |
| Illustrated shack              | `packages/ui/src/shack/ShackScene.tsx`                                             | Code-drawn SVG from design tokens: desk, transceiver, power supply, microphone, Morse key, wall map with today's grey line, band-conditions board, antenna farm through the window. Its readings are real: UTC clock, readiness meter, mastery per section.            |
| Offline                        | `apps/web/public/sw.js`, `src/lib/outbox.ts`                                       | Production builds: app shell and static assets cached; opening a lesson caches every lesson page in its section; pages not cached show an offline fallback. Answers, progress and lab events made offline are queued and replayed on reconnect, where they are graded. |

## Verification

- `pnpm test`: 114 tests, including FSRS scheduling and mastery, blueprint drawing and validation, and API tests for
  review, checkpoints, mocks, minimal lessons and the dashboard.
- `pnpm check:coverage`, lint, Prettier and type checks are clean. CI's own run happens on your first push.
- A Chrome walkthrough on the production build covered:
  - a generated lesson (two misses), then Daily Review (those two misses)
  - a full Section 8 Checkpoint (badge, weak lessons, links back)
  - a full 100-question mock at 78% (pass, no honours, section table, 22 misses)
  - the dashboard updating (streak, last mock, badge, lesson lit up)
  - offline: a section lesson opening from cache, an answer saved offline and graded after reconnecting, the fallback
    page for an uncached lesson
  - the dashboard at phone width.

## Decisions and open questions

- **Blueprint weights are placeholders** (proportional to the bank) until ISED's current Basic exam specification is
  confirmed; so is the 180-minute time limit. Edit `content/exam-blueprint.yaml`; CI checks it stays satisfiable.
- **The artwork is code-drawn**, not an illustrator's set. It is built so an illustrator can replace parts of it while
  keeping the live readings.
- **Unanswered checkpoint and mock questions count as wrong** but don't move the learner's memory state.
- **Days are UTC** for streaks, "due today" and mastery; switch to the learner's timezone once profiles store one.
- **Checkpoints can be long:** a section's Checkpoint asks every unmastered question (up to 199 in sections 1 and 3), as
  the spec says. Answers are saved in the browser as you go.
