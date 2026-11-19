# Phase 2b and 3: hardening and new features

Steps 25 to 33 of the brief. Step 25 (accuracy) is recorded in `PHASE-2.md`, Step 26 in `ACCESSIBILITY.md` and Step 27 in `PERFORMANCE.md`. Step 32 (French) is skipped by the product owner's decision.

## Step 28: offline

What works without a connection, once a lesson has been opened online:

- **Every lesson in that section, with its labs.** The player asks the service worker to save each lesson page in the section, plus the `/_next/static` files each page refers to. After the page settles, it also downloads the code for each lab the section uses (`preloadLabs` in `labs/registry.ts`). The worker keeps every static file it sees.
- **Deep links.** A page saved as `/lessons/5.05` also answers `/lessons/5.05?card=…` offline, and the player opens the card named in the address.
- **Answers, progress and lab events** are queued in the outbox (`lib/outbox.ts`) and replayed on reconnect.

How the replay avoids double-counting:

- Every answer and lab event carries a `client_id` (a UUID made when the learner submits). It's kept with the queued copy, and `attempt` and `lab_event` have a unique index on `(user_id, client_id)` (migration `0005_offline_idempotency`). A replay of an answer already graded returns the same response and doesn't move the FSRS state a second time. A duplicate lab event is dropped. This covers the hard case, where the server got the request but the reply was lost on the way back.
- The outbox replays under a Web Lock (`navigator.locks`), so two open tabs don't send the same queue at once.
- Answers carry `answered_at`. The server records the time the learner answered, not when the answer arrived, so the FSRS schedule, the streak and "today" come out right. It ignores a time in the future or more than 7 days old.
- Progress updates were already idempotent (`greatest(step)`).

The service worker's caches are versioned (`v2`); old ones are deleted on activation.

Tested by `practice.test.ts` ("offline replay") and an end-to-end browser run against a production build. The run opens a section-5 lesson online, goes offline, opens a different section-5 lab never visited before and answers a Check question. It then reconnects with two tabs open while the first replay's reply is dropped: one attempt is stored and the outbox drains.

Lab chunk names are per import site, so `dynamic()` and `preloadLabs()` share one loader per lab. Otherwise the cache would hold a chunk the page never asks for.

## Step 29: placement and test-out

- **Placement** (`/placement`, optional): 24 questions, three per section, each from a different lesson of that section. Results show the score by section and recommend testing out of every section answered 3 for 3. `GET /placement` returns the latest result. The dashboard offers placement to learners who haven't started.
- **Test-out** (`/test-out/new?section=N`): three questions per lesson (fewer if a lesson has fewer). A lesson with every asked question right is marked `tested_out` and complete in `lesson_progress`, and the course map labels it "Tested out". All of its questions enter Daily Review: the ones answered already have an FSRS slot, and the rest are spread over the next 7 days so the deck doesn't spike.
- Both are submitted whole like checkpoints and stored in `quiz_session` (migration `0006_placement_test_out`). Their attempts use the `placement` context and move the FSRS state like any answer.
- **Decision:** SPEC says strong placement areas "unlock" test-out. Placement is optional, so a gate would lock out learners who skip it. Instead, test-out is open for every section (a "Test out" link sits beside each Checkpoint), and placement recommends the sections answered all right. Product owner to confirm.

Tested by `practice.test.ts` ("placement and test-out") and a browser run at 390 px. The run takes placement from the dashboard, then the recommended test-out, and checks the course map; axe is clean on every new screen.

## Step 30: admin analytics

`/admin` (admins only; there's an "Admin" nav link for them) reads `GET /admin/analytics`. Scripts can also use the `x-admin-token` header, as for bank imports. To make an account an admin: `pnpm db:make-admin you@example.com`.

- **Questions:** the first-try success rate for each question, from each learner's first answer to it anywhere in the course. A question is **flagged below 60%** once at least 5 learners have answered it, and links to the card that teaches it (`FLAG_BELOW` and `MIN_ANSWERS` in `routes/analytics.ts`). Flagged questions come first, then the lowest unflagged rates.
- **Labs:** for each lab, and each step behind a disclosure, the learners who started, the share who reached the goal (server-verified `goal_met` only), the share who used a hint, and hints per start. Labs with the lowest completion come first.
- **Drop-off by lesson:** learners who started, finished and dropped, plus the screen where most unfinished learners stopped (a card title, or "Check question n"). Tested-out lessons are left out.

Aggregates only; no learner is named. Tested by `analytics.test.ts`: access control, the first-try rate ignoring later answers, flags and their teaching links, the minimum-sample rule, and the lab and lesson funnels. axe is clean on the page at 390 px.

## Step 31: instructor and club mode

- **Classes.** An instructor creates a class on `/classes` and gets a 6-character join code; the alphabet leaves out 0/O and 1/I/L. Instructor is a role: `pnpm db:make-admin you@example.com instructor`. Learners join on `/classes` with the code and can give a display name for the class. Guests can join too; they appear as "Learner n" until they set a name.
- **Assignments.** The instructor assigns sections, each with an optional target date. Learners see them on their class page, which links to the section on the course map.
- **Dashboard** (`GET /classes/:id/dashboard`, instructor or admin only). For each learner it shows:
  - last active, lessons done and mastery;
  - progress on the assigned sections;
  - up to three weak topics: lessons below 70% first-try accuracy over at least 3 answers.

  It also lists the class's weakest lessons, pooled across learners, as topics for the next session.

- **Live quiz.** The instructor starts a quiz from the class page. It draws from a chosen section, else the assigned sections, else the whole course. The instructor's screen is the projector view: large type, "x of y answered", then on reveal the correct answer and the count for each option, and final scores at the end. Members join from their class page and answer on their phones. The first answer stands, and answers are refused once a question is no longer open. Correct answers and counts appear only at reveal.
- **Design decisions:**
  - Phones and the projector **poll every 1.5 s**: simple and reliable through the Next proxy for a club-sized room. Server-sent events are an option if classes get large.
  - **Live answers don't touch mastery or Daily Review** (`live_answer`, separate from `attempt`), so a rushed round can't distort anyone's schedule. The phone says so.
  - Options are shuffled **once per quiz** (ordered by a hash of quiz and option), so the projector's A–D matches every phone and buttons don't move between polls.

Migration `0007_classes_live_quiz` adds `class_assignment`, `live_quiz` and `live_answer`; `class` and `class_member` came from Phase 0. Tested by `classes.test.ts`:

- roles and access;
- joining by code;
- assignments;
- dashboard figures and weak topics;
- the full live cycle, including option order and that no attempts are written.

A browser run with an instructor laptop and two phones passes, and axe is clean on the class, phone and projector screens.
