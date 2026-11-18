import { z } from "zod";
import { LAB_GOAL_VARIABLES } from "@hampath/ham-sim";
import { LESSON_CODE_RE, QUESTION_ID_RE } from "./ids.ts";

const questionId = z.string().regex(QUESTION_ID_RE, "question id like B-005-004-001");
const lessonCode = z.string().regex(LESSON_CODE_RE, 'lesson code like "5.04"');

export const SectionSchema = z.strictObject({
  id: z.string().regex(/^B-00[1-8]$/),
  number: z.number().int().min(1).max(8),
  title_en: z.string().min(1),
  title_fr: z.string().optional(),
  recommended_order: z.number().int().min(1).max(8),
  checkpoint: z.strictObject({
    pass_percent: z.number().min(0).max(100),
    mastered_sample: z.number().min(0).max(1),
  }),
});
export type SectionYaml = z.infer<typeof SectionSchema>;

export const LabCatalogueSchema = z.array(
  z.strictObject({
    id: z.string().regex(/^LAB-\d{2}$/),
    name: z.string().min(1),
    component: z.string().nullable(),
    lessons: z.array(lessonCode),
    default_config: z.record(z.string(), z.unknown()).optional(),
  }),
);
export type LabCatalogue = z.infer<typeof LabCatalogueSchema>;

export const CalcSpecSchema = z.strictObject({
  calc: z.enum(["ohm", "power"]),
  given: z.record(z.string(), z.union([z.string(), z.number()])),
});

export const LessonSchema = z.strictObject({
  code: lessonCode,
  title: z.string().min(1),
  title_fr: z.string().optional(),
  est_minutes: z.number().int().min(1).max(30),
  lab_id: z.string().regex(/^LAB-\d{2}$/).optional(),
  question_ids: z.array(questionId).min(1),
  /** Calculation questions: the answer must be reproduced by ham-sim (CI check 3). */
  calculations: z.record(questionId, CalcSpecSchema).default({}),
});
export type LessonYaml = z.infer<typeof LessonSchema>;

// ---- Card interactions ---------------------------------------------------------------

export const PredictInteraction = z.strictObject({
  kind: z.literal("predict"),
  prompt: z.string(),
  choices: z
    .array(z.strictObject({ text: z.string(), correct: z.boolean().default(false), feedback: z.string() }))
    .min(2)
    .refine((cs) => cs.filter((c) => c.correct).length === 1, "exactly one correct choice"),
  /** Optional lab step to show (animated) once the learner has predicted. */
  reveal_lab_step: z.string().optional(),
});

export const NumericInteraction = z.strictObject({
  kind: z.literal("numeric"),
  prompt: z.string(),
  unit: z.enum(["V", "A", "Ω", "W", "Hz", "F", "H", "m", "s"]),
  answer: z.number(),
  /** Relative tolerance, e.g. 0.02 = ±2%. */
  tolerance: z.number().min(0).max(0.5).default(0.02),
  hint: z.string().optional(),
  solution: z.array(z.string()).optional(),
});

export const RevealInteraction = z.strictObject({
  kind: z.literal("reveal"),
  prompt: z.string().optional(),
  items: z.array(z.strictObject({ label: z.string(), text: z.string() })).min(1),
});

/** Drag items into labelled slots (block diagrams, matching). Keyboard: pick an item, then a slot. */
export const DragDropInteraction = z
  .strictObject({
    kind: z.literal("drag_drop"),
    prompt: z.string(),
    items: z.array(z.strictObject({ id: z.string(), text: z.string() })).min(2),
    slots: z.array(z.strictObject({ id: z.string(), label: z.string(), accepts: z.string() })).min(1),
  })
  .superRefine((d, ctx) => {
    const ids = new Set(d.items.map((i) => i.id));
    for (const s of d.slots) if (!ids.has(s.accepts)) ctx.addIssue({ code: "custom", message: `slot ${s.id} accepts unknown item ${s.accepts}` });
  });

/** Flip-and-self-grade deck (codes, phonetics, regulations). */
export const FlashcardsInteraction = z.strictObject({
  kind: z.literal("flashcards"),
  cards: z.array(z.strictObject({ front: z.string(), back: z.string() })).min(1),
});

/** Listen and identify: Morse generated in the browser (or an audio file), always with a text equivalent. */
export const AudioInteraction = z
  .strictObject({
    kind: z.literal("audio"),
    prompt: z.string(),
    morse: z.string().optional(),
    wpm: z.number().min(5).max(40).default(18),
    src: z.string().optional(),
    /** Shown on request and to screen readers: dots/dashes or a caption. */
    transcript: z.string(),
    choices: z.array(z.strictObject({ text: z.string(), correct: z.boolean().default(false) })).optional(),
  })
  .refine((a) => Boolean(a.morse) !== Boolean(a.src), "exactly one of morse or src");

export const Interaction = z.discriminatedUnion("kind", [
  PredictInteraction, NumericInteraction, RevealInteraction, DragDropInteraction, FlashcardsInteraction, AudioInteraction,
]);
export type Interaction = z.infer<typeof Interaction>;

export const CARD_TYPES = [
  "hook", "lab", "concept", "predict", "numeric", "worked_example", "drag_drop", "flashcards", "audio",
] as const;

export const CardFrontMatter = z
  .strictObject({
    type: z.enum(CARD_TYPES),
    title: z.string().min(1),
    teaches: z.array(questionId).default([]),
    exam_fact: z.string().optional(),
    /** Inline diagram key (e.g. "svg:ohms-triangle") or an asset path. */
    media: z.string().optional(),
    media_alt: z.string().optional(),
    /** For type "lab": key of a step in the lesson's lab.json. */
    lab_step: z.string().optional(),
    interaction: Interaction.optional(),
  })
  .superRefine((c, ctx) => {
    if (c.type === "lab" && !c.lab_step) ctx.addIssue({ code: "custom", message: "lab cards need lab_step" });
    if (c.type === "predict" && c.interaction?.kind !== "predict")
      ctx.addIssue({ code: "custom", message: "predict cards need a predict interaction" });
    if (c.type === "numeric" && c.interaction?.kind !== "numeric")
      ctx.addIssue({ code: "custom", message: "numeric cards need a numeric interaction" });
    for (const k of ["drag_drop", "flashcards", "audio"] as const) {
      if (c.type === k && c.interaction?.kind !== k) ctx.addIssue({ code: "custom", message: `${k} cards need a ${k} interaction` });
    }
    if (c.media && !c.media_alt?.trim())
      ctx.addIssue({ code: "custom", message: "media needs media_alt (CI check 4: alt text)" });
  });
export type CardFrontMatter = z.infer<typeof CardFrontMatter>;

// ---- Labs ------------------------------------------------------------------------------

export const LabStepSchema = z.strictObject({
  title: z.string(),
  /** Instruction shown above the lab. */
  prompt: z.string(),
  /** Overrides merged onto the lab's default_config. */
  config: z.record(z.string(), z.unknown()).default({}),
  /** Goal expression evaluated by ham-sim's evaluateGoal; omit for free play. */
  goal: z.string().optional(),
  goal_text: z.string().optional(),
  hints: z.array(z.string()).default([]),
  success: z.string().optional(),
});

export const LabFileSchema = z.strictObject({
  lab: z.string().regex(/^LAB-\d{2}$/),
  steps: z.record(z.string(), LabStepSchema),
});
export type LabFile = z.infer<typeof LabFileSchema>;

const RangeControl = z.strictObject({ min: z.number(), max: z.number(), step: z.number().positive() });

/** LAB-20 Ohm's Law Circuit Builder config (after merging step config onto default_config). */
export const OhmsLabConfig = z.strictObject({
  topology: z.enum(["single", "series", "parallel"]),
  E: z.number().min(0),
  resistors: z.array(z.number().positive()).min(1).max(4),
  closed: z.boolean(),
  /** Start with an empty breadboard: the learner places the battery, resistor and meters. */
  build: z.boolean().optional(),
  controls: z.strictObject({
    E: z.union([RangeControl, z.literal(false)]),
    R: z.union([RangeControl, z.literal(false)]),
    switch: z.boolean(),
    /** Let the learner type exact values with SI prefixes ("10m", "2.2k"). */
    typed: z.boolean().optional(),
  }),
  show: z.strictObject({ ammeter: z.boolean(), voltmeter: z.boolean(), power: z.boolean() }),
});

/** Config schema and the variables a goal may reference, per implemented lab. */
export const LAB_SCHEMAS: Record<string, { config: z.ZodType; variables: string[] }> = {
  "LAB-20": { config: OhmsLabConfig, variables: LAB_GOAL_VARIABLES["LAB-20"]! },
};

export const LessonTitlesSchema = z.record(lessonCode, z.string().min(1));

export const WhyNotSchema = z.record(questionId, z.record(z.string(), z.string().min(1)));
