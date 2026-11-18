# HamPath — Interactive Basic Amateur Radio Course

Nov 17, 2026 · @Arshpreet Singh Sidhu

HamPath is a Brilliant-style web course that teaches all 984 questions of Canada's Basic Qualification question bank through short lessons, hands-on simulated labs and section quizzes. Every question is mapped to the lesson and lab that teaches it; the full mapping is in the eight Question Coverage tabs.

## 1. Vision and learner experience

The goal: a learner who finishes HamPath has seen, touched and answered every one of the 984 Basic questions, and passes the ISED Basic exam (70%, 100 questions) with margin, ideally 80%+ for HF privileges.

**Who it is for**

- Complete beginners with no electronics background (the main audience).
- Technical people (IT, trades) who want a fast track: they can test out of lessons.
- Clubs and instructors who teach a class and want a shared syllabus, progress dashboard and live quiz mode.

**What "Brilliant for ham radio" means here**

1. **Learn by doing, not by reading.** Each concept starts with something to manipulate: drag a slider, wire a circuit, tune a receiver, point an antenna. Text is short and appears after the learner has tried something.
2. **Small steps.** A lesson is 5 to 12 minutes, with 6 to 15 interactive screens. One idea per screen.
3. **Immediate feedback.** Every action gets a response: the meter moves, the signal fades, a hint explains why an answer was wrong.
4. **Every exam question is taught on purpose.** Each of the 984 questions is tied to a specific lesson screen that teaches its fact, and then asked in its original wording before the section ends (see section 3 and the coverage tabs).
5. **A ham shack feel.** A consistent visual world: a virtual station desk with a transceiver, power supply, SWR meter, antenna farm out the window, a world map with the grey line and a band-conditions panel. Labs reuse these familiar objects.
6. **Progress you can see.** Streaks, a mastery ring per lesson, a section map that lights up, and an exam-readiness score.

**Learner journey**

1. Placement (optional, 10 min): 24 questions across the 8 sections; strong areas unlock test-out.
2. Work through 8 sections in order (recommended: 2, 5, 4, 3, 6, 7, 8, 1, see section 2), lesson by lesson.
3. Each lesson: Explore lab, Learn cards, Check questions (section 3).
4. End of each section: Section Checkpoint covering every question in that section that is not yet mastered.
5. Daily: spaced-review deck of due questions (5 to 15 min).
6. Final: timed mock exams in the real format until readiness is 85%+ on three mocks in a row.

## 2. Curriculum map

The course follows the 8 official sections and splits them into 104 lessons, one per official topic group (the middle number of the question ID, e.g. B-005-004 = lesson 5.04, Ohm's Law). That keeps every question's home lesson unambiguous.

| # | Section | Lessons | Questions | Recommended order | Signature labs |
| --- | --- | --- | --- | --- | --- |
| 1 | Regulations & Policies | 25 | 199 | 8th | Band Plan Explorer, Call Sign Builder, Power Limit Calculator, RF Exposure Zone |
| 2 | Operating & Procedures | 9 | 99 | 1st | Virtual QSO Simulator, Repeater Lab, Morse Trainer, Q-Code Cards |
| 3 | Station Assembly, Practice & Safety | 21 | 199 | 4th | Block-Diagram Builder, Mode Spectrum Lab, Power Supply Bench, Safe Shack Inspector |
| 4 | Circuit Components | 6 | 63 | 3rd | Component Bench, Resistor Colour Code |
| 5 | Basic Electronics & Theory | 13 | 142 | 2nd | Ohm's Law Circuit Builder, dB Ladder, Resonance Tuner, Multimeter Lab |
| 6 | Feedlines & Antenna Systems | 13 | 140 | 5th | Antenna Builder, SWR Bridge, Wavelength Ruler, Radiation Pattern 3D |
| 7 | Radio Wave Propagation | 8 | 87 | 6th | Ionosphere Simulator, Solar Cycle Dial, Skip Zone Map |
| 8 | Interference & Suppression | 5 | 55 | 7th | Interference Detective, Filter Designer |
|  | **Total** | **104** | **984** |  |  |

Why this order: Operating comes first because making a first contact is motivating and needs no theory. Electronics and Components then build the tools that Station, Antennas, Propagation and Interference rely on. Regulations goes last because many rules (power, bandwidth, interference) only make sense once the learner knows what those words mean. Learners can still open any section at any time; the order is a recommendation, not a lock.

The full list of 104 lessons, their labs and every question they teach is in the eight Question Coverage tabs. Each lesson code there (1.01 to 8.05) matches the official question IDs.

## 3. Lesson anatomy: how every question gets taught

Every one of the 104 lessons uses the same five-step loop, so the learner always knows what comes next and the content team always knows what to build.

1. **Hook (1 screen).** A real-world puzzle: "Your neighbour's TV buzzes only when you transmit on 20 m. Why?" No answer yet.
2. **Explore (2 to 4 screens).** The lesson's lab opens with a guided task: "Move the slider until the SWR meter reads 1:1." The learner discovers the rule before it is named.
3. **Learn cards (3 to 10 screens).** Short explanation cards, each with a visual, a one-sentence *Exam fact* box and a mini interaction (tap, drag, choose). Every card is tagged with the question IDs it teaches. Example: the card "SWR 1:1 means a perfect match" carries B-006-005-001.
4. **Check (every question in the lesson).** Each question in the lesson is asked in its official wording with the four official options, shuffled. Wrong answer → a *Why not?* note explains that specific distractor, then the learner gets a second try and the question goes into the review queue.
5. **Recap (1 screen).** The lesson's exam facts as a checklist, the mastery ring for the lesson, and the next lesson.

**Coverage rules (the contract with the content team)**

- Every question ID appears on at least one Learn card (direct or indirect teaching) and in the lesson's Check step (direct question). The coverage tabs list them all and a CI check enforces it (section 8).
- A Learn card teaches the fact in plain language; the official wording is reserved for the Check and quizzes, so learners understand the idea rather than memorise answer shapes.
- Each wrong option of each question gets a short *Why not?* explanation (984 × 3 = 2,952 notes). These are authored once and reused in quizzes, review and mock exams.
- Calculation questions (Ohm's Law, dB, wavelength, power limits) get a worked example card and a lab where the learner can check any number they like.
- Memorisation-heavy lessons (Q codes, phonetic alphabet, fees, call-sign prefixes, band edges) use flashcard decks and small games instead of a lab.

**Screen types the front end must support**

| Screen type | Used for | Interaction |
| --- | --- | --- |
| Lab screen | Explore step | Embedded simulation with a goal and a success check |
| Concept card | Learn step | Text + diagram/animation + optional tap-to-reveal |
| Predict card | Learn step | "What happens if…?" choice, then the lab animates the answer |
| Drag-and-drop | Block diagrams, matching | Drop parts into slots; instant correct/incorrect |
| Numeric input | Calculations | Number + unit picker; accepts tolerance (e.g. ±2%) |
| Multiple choice | Check, quizzes, mocks | 4 options, shuffled, with Why not? feedback |
| Flashcards | Codes, phonetics, regulations | Flip, self-grade, spaced repetition |
| Audio | Morse, signal sounds, interference noises | Play, slow down, identify |

## 4. Interactive lab catalogue

35 reusable labs cover all 104 lessons. A lab is a self-contained simulation component with parameters, a goal and a success check, so one lab serves several lessons in different modes (e.g. the Antenna Builder is used in 3.09, 6.08 and 6.10 to 6.13). All labs live in the virtual shack and use the same look: front-panel knobs, analog meters, a waterfall display and a world map.

| Lab | What the learner touches | What it simulates and teaches | Lessons |
| --- | --- | --- | --- |
| LAB-01 Band Plan Explorer | Zoomable frequency ruler, 136 kHz to 300 GHz; tap a band | Canadian amateur bands, segments, modes, bandwidth limits, which qualification may use them | 1.15, 1.16, 1.18, 1.21, 5.07 |
| LAB-02 Rules Navigator | "Can I do this?" scenario cards with yes/no/it depends paths | Who regulates, certificates, privileges, prohibited content, business use, privacy, third-party traffic | 1.01 to 1.12, 1.14, 1.20, 1.22 |
| LAB-03 Call Sign Builder | Pick province and qualification, build a call sign; an ID timer runs during a mock QSO | Canadian prefixes, valid formats, identification rules and timing | 1.13, 2.02 |
| LAB-04 Power Limit Calculator | Choose qualification, mode, band; read DC input, PEP and carrier power | Output power limits, PEP vs average power | 1.17, 3.12 |
| LAB-05 RF Exposure Zone | Antenna on a house; sliders for power, frequency, distance; compliance zone shades red/green | Safety Code 6 limits, why exposure limits are lowest at 48 to 300 MHz, safe distances | 1.24, 3.21 |
| LAB-06 Antenna Permit Planner | Place a tower on a lot, set height; a flowchart shows who to consult | Land-use authority consultation, exclusions, public consultation | 1.23 |
| LAB-07 Virtual QSO Simulator | Tune a simulated band, listen, call CQ, answer, give RST, sign off | Calling CQ, listening first, signal reports, simplex vs repeater, contests | 2.03, 2.04, 2.06, 2.09 |
| LAB-08 Repeater Lab | Set input, offset, CTCSS tone; key up; watch the time-out timer | Repeater offsets, tones, courtesy, time-out timer, coordination | 1.18, 2.01 |
| LAB-09 Phonetic & Q-Code Trainer | Flashcards, speed rounds, "decode the transmission" | ITU phonetic alphabet, Q codes (QRM, QSY, QTH, QRS…) | 2.02, 2.07 |
| LAB-10 Morse Trainer | Hear and key Morse (straight key and paddle), adjust speed | CW calling procedure, prosigns, keyers | 2.05, 3.14 |
| LAB-11 Emergency Net Scenario | Role-play a distress and relief scenario on a net | Distress signals (MAYDAY, SOS), priority, emergency rules | 1.11, 2.08 |
| LAB-12 World Map & Clock | Azimuthal map, beam heading, UTC clock, grey line, QSL log | UTC, time stations (CHU, WWV), long path, grid squares, QSL cards | 2.09, 7.06 |
| LAB-13 Block-Diagram Builder | Drag stages (oscillator, mixer, IF, detector…) into a chain; animate the signal | FM/CW/SSB transmitters, superhet receivers, linear power supply, station layout, digital-mode interface | 3.01 to 3.09 |
| LAB-14 Mode Spectrum Lab | Waterfall and scope; switch CW/SSB/AM/FM/digital; turn mic gain, deviation, ALC | Bandwidths, chirp, splatter, over-deviation, squelch, capture effect, AGC | 3.10 to 3.13, 3.15 |
| LAB-15 Power Bench | Batteries, chargers, transformer + rectifier + filter; scope shows ripple and hum | Battery types and safety, power supplies, hum sources | 3.08, 3.16, 3.17 |
| LAB-16 Safe Shack Inspector | Find the hazards in an illustrated shack and antenna yard | Electrical safety, grounding, fuses, lightning, tower safety | 3.18 to 3.21 |
| LAB-17 Component Bench | Breadboard with diodes, BJTs, FETs, triodes; I-V curves and gain readouts | Amplifiers, rectifiers, Zeners, transistors, tubes | 4.01 to 4.05 |
| LAB-18 Resistor Colour Code | Spin colour bands, read the value and tolerance; speed game | Colour code, tolerance ranges | 4.06 |
| LAB-19 Unit Slider | Move a value through p, n, µ, m, k, M, G | Metric prefixes and conversions | 5.01 |
| LAB-20 Ohm's Law Circuit Builder | Wire batteries, resistors, meters in series/parallel; read V, I, R, P live | Ohm's Law, power, series/parallel, resistor ratings, L and C combinations | 5.02 to 5.06, 5.09 |
| LAB-21 AC Scope | Generate sine waves, change frequency, add harmonics | Frequency, period, harmonics, audio vs RF ranges, reactance | 5.07, 5.10 |
| LAB-22 dB Ladder | Stack gains and losses in dB vs watts; S-meter link | Decibels, power ratios, antenna gain in dBi/dBd | 5.08, 6.09 |
| LAB-23 Transformer Lab | Set turns ratio and load; watch voltage, current, impedance | Turns ratio, power transfer, impedance matching | 5.11 |
| LAB-24 Resonance Tuner | LC tank with L and C knobs; frequency response curve | Resonance, series/parallel tuned circuits, Q | 5.12 |
| LAB-25 Meter Lab | Connect voltmeter, ammeter, multimeter, wattmeter correctly or wrongly | Meter connection, ranges, accuracy | 5.13 |
| LAB-26 Feedline Lab | Pick coax or ladder line, set length and frequency; see loss, impedance | Characteristic impedance, line types, baluns, connectors, loss | 6.01 to 6.04 |
| LAB-27 SWR Bridge & Tuner | Mismatched load; tune the ATU knobs until SWR is 1:1 | SWR, reflected power, tuners, matching | 6.05, 6.06 |
| LAB-28 Antenna Builder | Cut a dipole, vertical, Yagi or loop for a frequency; see resonance shift as length changes | Wavelength, element lengths, verticals, Yagis, quads, delta loops, random wires | 3.09, 6.08, 6.10 to 6.13 |
| LAB-29 Radiation Pattern 3D | Rotate a 3D pattern; add reflector and directors; change polarisation | Polarisation, gain, front-to-back, parasitic elements | 6.07, 6.09, 6.11 |
| LAB-30 Ionosphere Simulator | Day/night slider, frequency knob, launch angle; rays bend, absorb or escape | D/E/F regions, sky wave, skip zone, MUF, fading, NVIS | 7.01 to 7.04, 7.06 |
| LAB-31 Solar Cycle Dial | Spin through an 11-year cycle; watch sunspots and band openings | Sunspots, solar flux, cyclical propagation changes | 7.05 |
| LAB-32 VHF Propagation Sandbox | Toggle sporadic E, temperature inversion, meteor shower, aurora | Sporadic E, tropo ducting, scatter, meteor scatter | 7.07, 7.08 |
| LAB-33 Interference Detective | Case files: listen to the symptom, test with filters and chokes, solve it | Receiver overload, TVI, audio rectification, harmonics, EMC complaints | 1.25, 8.01 to 8.04 |
| LAB-34 Filter Designer | Drag cut-off frequencies; see the response curve and what passes | Low-pass, high-pass, band-pass, notch filters | 3.01, 8.05 |
| LAB-35 Exam Simulator | Timed 100-question exam with ISED-style randomisation | Final readiness | All |

**Lab component contract (for developers)**

- Each lab is a React component `<Lab id params mode onEvent />` with a JSON config per lesson: starting values, locked controls, the goal (e.g. `swr <= 1.2`) and hints.
- Labs emit events (`started`, `goal_met`, `hint_used`, `value_changed`) to the progress service for analytics and mastery.
- Physics/maths live in a shared pure-TypeScript `ham-sim` library (Ohm's Law, dB, wavelength, LC resonance, transmission-line loss, simple ray-traced ionosphere), unit-tested against the exam's own calculation questions so a lab never contradicts an answer.
- Every lab must work with keyboard and screen reader (a text readout of every meter) and on a phone in portrait.

## 5. Assessment: checks, section quizzes, review and mock exams

A question counts as **mastered** after 2 correct answers in a row on separate days, the second one in a quiz or review (not in the lesson right after being taught). The whole system serves one aim: every one of the 984 questions mastered before the mock exams.

| Layer | When | What it asks | Pass rule |
| --- | --- | --- | --- |
| Lesson Check | End of every lesson | Every question in that lesson, official wording, shuffled options | All answered; misses go to review |
| Section Checkpoint | End of each of the 8 sections | Every question in the section not yet mastered, plus a 20% sample of mastered ones | 80% to unlock the section badge; misses are re-taught with a link back to the exact Learn card |
| Daily Review | Every day | Due questions from a spaced-repetition scheduler (FSRS or SM-2) | None; keeps mastery alive |
| Mock Exam | After all sections, any time | 100 questions in the real ISED proportions, timed | 70% pass, 80% honours; readiness = rolling average of last 3 mocks |
| Placement / test-out | Start, or before a section | 3 questions per lesson | 100% on a lesson marks it test-out (its questions still enter review) |

**Mock exam blueprint.** The real exam draws questions by topic. The generator draws one question per topic group where the official blueprint does so, weighted by the 8 sections, and never repeats a question inside one mock. Section weights should be confirmed against ISED's current exam specification before launch.

**Readiness score** (shown on the dashboard): % of questions mastered × 0.5 + average of last 3 mocks × 0.5. Green at 85%+.

**Feedback rules**

- Never show just "wrong": show the correct answer, the *Why not?* note for the chosen option and a "See it again" link to the Learn card or lab state that teaches it.
- Calculation questions show the worked solution step by step.
- The Section Checkpoint ends with a weak-topics list that deep-links into lessons.

## 6. Technical architecture

Labs run entirely in the browser so they feel instant and work offline once loaded; the server owns grading, mastery and progress so scores cannot be faked and progress follows the learner across devices.

&#91;embedded content: HamPath architecture · web app, API, data stores, content pipeline\]

**Stack**

| Layer | Choice | Why |
| --- | --- | --- |
| Front end | Next.js + React + TypeScript, Tailwind | Server-rendered lesson pages for speed and SEO; React for labs |
| Lab rendering | SVG + Canvas, Three.js for 3D antenna patterns, WebAudio for Morse and receiver sounds | Smooth on phones, no plug-ins |
| Physics | `ham-sim`, a pure TypeScript package shared by front end and API | One source of truth for every formula |
| API | Node + Fastify + TypeScript, Zod validation | Fast, typed end to end |
| Database | PostgreSQL 16 | Relational content + learner state |
| Scheduler | FSRS spaced-repetition algorithm in the API | Proven review timing |
| Storage | S3-compatible object storage behind a CDN | Images, audio, lab assets |
| Hosting | Containers (Docker) on any cloud; Vercel or similar for the front end | Simple deploys |
| Offline | Service worker caches the current section's lessons and labs; answers sync when back online | Study on the bus |

## 7. Data model and backend API

PostgreSQL holds content and learner state; content is versioned so a question-bank update from ISED never breaks a learner's history.

**Content tables**

| Table | Key columns | Notes |
| --- | --- | --- |
| `section` | id (B-001), number, title\_en, title\_fr, order | 8 rows |
| `lesson` | id (B-001-013), section\_id, code (1.13), title, order, est\_minutes, lab\_id | 104 rows |
| `question` | id (B-001-013-001), lesson\_id, stem\_en, stem\_fr, bank\_version, has\_calculation, image\_ref | 984 rows, imported from the ISED file |
| `option` | id, question\_id, text\_en, text\_fr, is\_correct, why\_not\_en, why\_not\_fr | 4 per question; only one correct |
| `card` | id, lesson\_id, order, type, body\_md, media\_ref, exam\_fact | Learn cards |
| `card_question` | card\_id, question\_id | Coverage link; every question needs ≥ 1 row |
| `lab` | id (LAB-01), component, default\_config | 35 rows |
| `lab_step` | id, lesson\_id, lab\_id, order, config\_json, goal\_expr, hints | A lab's setup inside one lesson |

**Learner tables**

| Table | Key columns | Notes |
| --- | --- | --- |
| `user` | id, email, display\_name, locale, call\_sign (optional), role (learner/instructor/admin) | Auth via email magic link + Google/Apple |
| `attempt` | id, user\_id, question\_id, option\_id, correct, context (check/checkpoint/review/mock), ms\_taken, created\_at | Append-only; source of truth |
| `question_state` | user\_id, question\_id, mastered, streak, stability, difficulty, due\_at | Spaced-repetition state (FSRS) |
| `lesson_progress` | user\_id, lesson\_id, step, completed\_at, tested\_out |  |
| `lab_event` | user\_id, lab\_step\_id, event, payload, created\_at | Analytics |
| `mock_exam` | id, user\_id, question\_ids\[\], score, started\_at, finished\_at |  |
| `class`, `class_member` | instructor\_id, join\_code | Club/instructor mode |

**API (REST, JSON, versioned under /api/v1)**

| Endpoint | Purpose |
| --- | --- |
| `GET /sections`, `GET /sections/:id` | Section map with the learner's progress |
| `GET /lessons/:id` | Lesson with cards, lab steps and its Check questions (correct flags withheld) |
| `POST /attempts` | Submit an answer; returns correct, correct\_option\_id, why\_not, link to teaching card |
| `POST /lab-events` | Lab telemetry; `goal_met` advances the lesson step |
| `GET /review/due` | Today's spaced-review queue |
| `POST /checkpoints/:sectionId` | Build a Section Checkpoint |
| `POST /mocks`, `POST /mocks/:id/submit` | Generate and grade a mock exam |
| `GET /me/readiness` | Mastery %, mock average, weak lessons |
| `GET /classes/:id/dashboard` | Instructor view: progress and weak topics per learner |
| `POST /admin/import-bank` | Import a new ISED question-bank file (semicolon-delimited, 11 fields) and diff it against the current version |

**Rules the backend enforces**

- Correct answers are never sent to the client before the learner answers.
- Grading, mastery and readiness are computed server-side.
- An import that adds or changes a question flags its lesson as needing a card review; the coverage check fails until a card links to it.

## 8. Content pipeline, accessibility and French

Content lives in a Git repository as MDX and YAML, not in the database by hand. A build step validates it and loads it into PostgreSQL, so content changes are reviewed like code.

```
content/
  bank/amat_basic_quest_delim.txt        # ISED source file, untouched
  sections/05-electronics/
    section.yaml                         # title, order, checkpoint settings
    lessons/5.04-ohms-law/
      lesson.yaml                        # lab_id, est_minutes, question_ids
      cards/01-hook.mdx                  # each card front-matter: teaches: [B-005-004-001, ...]
      cards/02-explore.mdx               # embeds <Lab id="LAB-20" config="./lab.json" />
      lab.json
      why-not.yaml                       # one note per wrong option
```

**CI checks that block a merge**

1. Every question ID in the bank file is listed in exactly one lesson and in at least one card's `teaches:` list (coverage = 100%).
2. Every wrong option has a *Why not?* note in English (French before the French launch).
3. Every calculation question's correct answer is reproduced by the `ham-sim` library within tolerance.
4. Every lab config passes its schema; every image has alt text.

**Authoring workflow**

1. The coverage tabs in this document are the starting brief: each lesson heading names its lab, and each row is a question the lesson must teach.
2. A writer drafts cards and *Why not?* notes; a licensed amateur (Advanced qualification preferred) reviews for accuracy.
3. A developer builds or configures the lab step; the writer checks it in a preview build.
4. Ten beta learners take the lesson; any question with under 60% first-try success in the Check gets its card rewritten.

**Accessibility**: WCAG 2.2 AA. Every lab has a text readout and keyboard controls, audio has captions or text equivalents (Morse is shown as dots/dashes too), colour is never the only signal (important for the resistor colour code: show band names too).

**French**: the ISED bank already contains official French wording for every question and option. The data model stores both from day one; English launches first, French cards and *Why not?* notes follow in phase 3.

## 9. Build roadmap, team and acceptance criteria

Build in four phases; each phase ships something learners can use. Durations are estimates for a team of the size below.

| Phase | Scope | Done when | Estimate |
| --- | --- | --- | --- |
| 0. Foundations | Repo, design system, virtual-shack art direction, `ham-sim` library, bank import, auth, lesson player with card and multiple-choice screens | One lesson (5.04 Ohm's Law with LAB-20) playable end to end | 4–6 weeks |
| 1. Practice MVP | All 984 questions in Lesson Checks, Section Checkpoints, Daily Review, Mock Exam (LAB-35); minimal cards | A learner can drill the whole bank and take mocks | 4–6 weeks |
| 2. Full course | All 104 lessons with cards and Why not? notes; all 35 labs; progress dashboard | Coverage CI at 100%; beta cohort of 20 learners completes it | 4–6 months |
| 3. Growth | French, instructor/club mode, mobile app wrapper, Morse audio extras | French coverage 100%; one club class run on it | 2–3 months |

**Team**

- 1 product lead / instructional designer (owns the lesson loop and coverage).
- 2 front-end developers (React, SVG/Canvas, WebAudio for labs).
- 1 back-end developer (API, database, scheduler, import).
- 1 illustrator / motion designer (virtual shack, diagrams).
- 1–2 content writers, plus a licensed amateur technical reviewer.

**Acceptance criteria for launch**

- 984 of 984 questions: in a lesson, linked to ≥ 1 card, asked in a Check, with 3 Why not? notes.
- 104 of 104 lessons playable on desktop and phone; all 35 labs keyboard-accessible.
- Every calculation answer reproduced by `ham-sim`.
- Mock exams match the official format (100 questions, 70% pass, 80% honours) and section weighting confirmed against ISED's current specification.
- Beta learners: median mock score ≥ 80% after finishing the course.
- Page load under 2 s on a mid-range phone; labs run at 60 fps.

**Open questions**

- Confirm the current ISED exam blueprint (questions per topic) before building the mock generator.
- Free, paid or club-licensed?

**Settled:** ISED has no issue with the question bank being used in this product.
