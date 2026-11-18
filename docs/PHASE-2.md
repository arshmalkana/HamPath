# Phase 2: the full course

Phase 2 wrote every lesson and built every lab. `pnpm check:coverage` is now the strict launch gate and passes:

- 984 of 984 questions taught on at least one card, each with three _Why not?_ notes;
- 100 of 100 lessons complete (Hook, Explore with its lab, Learn cards, Check, and a worked example wherever there are calculations);
- 35 of 35 labs built, each with a config schema, and every lab except the Exam Simulator used by at least one lesson;
- 90 calculation answers reproduced by ham-sim (`calculations` in `lesson.yaml`, checked by CI).

## Before launch: licensed-amateur review

SPEC §8 requires every lesson to be reviewed by a licensed amateur. None has been yet. Pay particular attention to the regulatory figures, which were transcribed from memory of the current documents and must be checked against the current issues:

| What                                         | Where                                          | Check against                                    |
| -------------------------------------------- | ---------------------------------------------- | ------------------------------------------------ |
| Band edges, bandwidth limits, power limits   | `packages/ham-sim/src/regulations.ts`          | RBR-4                                            |
| Call-sign prefixes by region                 | `regulations.ts` (`CALL_REGIONS`)              | ISED call sign policy                            |
| Amateur antenna exclusion under 15 m         | `regulations.ts` (`ISED_EXCLUSION_HEIGHT_M`)   | CPC-2-0-03                                       |
| Safety Code 6 power-density reference levels | `packages/ham-sim/src/station.ts` (`sc6Limit`) | Health Canada Safety Code 6                      |
| EMCAB-2 equipment categories                 | lesson 1.25                                    | EMCAB-2                                          |
| Example RF limit of 1.7 W/m² at UHF          | lesson 3.21 lab steps                          | Safety Code 6 (it matches `sc6Limit` at 440 MHz) |
| 10 m repeater offset of 100 kHz              | lesson 1.18 lab step                           | Common practice; not a regulation                |

The mock exam weights and time limit in `content/exam-blueprint.yaml` are still placeholders until ISED's specification is confirmed (Phase 1 ruling).

## Accuracy review (Phase 2b, Step 25)

Every teaching card was compared with the bank's correct answer for each question it teaches. The checks were:

- **Coverage of the answer.** Every question's correct answer was checked against the text of the cards that teach it. 139 questions had low word overlap or a distractor's number in the text. Reading each one by hand showed paraphrases (for example "Gain = 10 dB means an amplifier") or contrast tables (limits by qualification, "adding the IF twice gives 4.450 MHz"), not errors.
- **Distractor wording in the exam fact.** 23 exam facts contain a distractor's exact words. 22 are contrastive and correct: each part is given its right role ("the limiter removes amplitude variations… the AF amplifier is controlled by the volume control"), or both directions are stated ("lengthen to lower, shorten to raise").
- **_Why not?_ notes.** All 19 numeric "That's N" notes state what the distractor equals, correctly.

Cards whose wording could mislead, and the fixes:

| Card                                              | Risk                                                                                                                                                                                                                 | Fix                                                                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 5.10 `05-capacitive` (B-005-010-003)              | Two distractors are "applied voltage increases/decreases", and the card never said voltage plays no part (the inductive card does).                                                                                  | Exam fact and body now say the applied voltage doesn't change reactance.                                                |
| LAB-32 caption, lesson 7.07 (B-007-007-010, -011) | The no-enhancement caption described only the radio horizon (a reach of about 250 km), while the card says normal tropospheric propagation reaches about 800 km. Seen together, 250 km could read as "normal range". | The caption now says normal tropospheric propagation tops out around 800 km and that ducting is needed to go beyond it. |

**Ham-sim against the bank.** `calculations.test.ts` checks all 90 content calculations against the bank's correct option and rejects any that also match a distractor. The hand-written Ohm's Law cases in `ham-sim.test.ts` match their bank answers. The new `packages/content/src/bank-facts.test.ts` ties the model figures labs teach from to the bank. It checks the solar cycle (11 years), ID interval (30 min), dipole gain (2.1 dBi), single-hop E/F2 distances (2000/4000 km), the Yagi spacing with the best front-to-back (0.2 λ), the longest ground wave (160 m), normal VHF reach under 800 km and ducting beyond it, sporadic E and meteor scatter on 6 m, and the 600 kHz 2 m offset. For each, the model's figure must pick out the correct option over every distractor.

## Teaching models, not simulations

Several labs use simplified models so the cause and effect is clear. Each says so in its source file. They rank things correctly and land on the exam's numbers where the exam has numbers, but they are not engineering tools:

- **Propagation** (`propagation.ts`): ionization peaks at local noon and is lowest just before dawn; the MUF follows the secant law; D-region absorption is strong below about 4 MHz in daylight; hop distances use spherical geometry with E at 90 km and F2 at 300 km.
- **Feedline loss** (`feedline.ts`): typical published dB per 100 m at 100 MHz, scaled with the square root of frequency.
- **Yagi gain and front-to-back** (`antennas.ts`): typical values; front-to-back is best near 0.2 λ spacing.
- **Mode decode thresholds** (`spectrum.ts`): rough SNR figures that keep FT8 lowest.
- **Interference recordings** (LAB-33): synthesized with WebAudio, always with a written caption that carries the same information.

## Decisions

- **Lab per lesson.** `lesson.yaml` `lab_id` overrides the working assignment in `docs/coverage`. Changes from the working list: 2.02 uses LAB-09, 2.09 uses LAB-12 (clock mode), 3.09 uses LAB-28 (Yagi mode), 6.09 uses LAB-29, 1.11 uses LAB-11, 1.18 uses LAB-08, 1.19 uses LAB-14 and 1.21 uses LAB-12 (ITU mode).
- **One engine, several labs.** LAB-07 and LAB-11 share the scenario engine; LAB-09 and LAB-10's copy mode share the drill engine; LAB-02 and LAB-12's ITU mode share the rules engine. Modes are chosen by `config.mode`.
- **Server-side grading for every lab.** `labVariables` recomputes each lab's goal variables from the reported state and the step's trusted config (the right answers live in the config, never in the browser's report).
- **Multi-value and tight-tolerance calculations.** A `CalcResult` can require several values in the answer (`also`, e.g. 12 V and 40 Ah) and a tighter tolerance (frequencies, antenna lengths), so a calculation can't accidentally match a distractor.
- **LAB-35 Exam Simulator** is the lab frame around the mock exam: it shows the blueprint and starts a mock. It lives on `/mocks` and needs no lesson.
- **`loadContent(pool, tree)`** accepts a tree, so tests can still exercise the generated minimal lesson now that no real lesson uses it.

## Still open

- Licensed-amateur review of all content (above).
- French translations (`title_fr`, `why_not_fr`) are not written.
- ISED's mock exam specification (blueprint weights and time limit).
- The 3D radiation pattern (LAB-29) falls back to 2D cuts without WebGL; the cuts are always shown and carry the same information.
