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
