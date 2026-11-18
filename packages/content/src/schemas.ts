import { z } from "zod";
import { CALCULATORS, LAB_GOAL_VARIABLES } from "@hampath/ham-sim";
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

const calcValue = z.union([z.string(), z.number()]);
export const CalcSpecSchema = z.strictObject({
  calc: z.enum(CALCULATORS as [string, ...string[]]),
  given: z.record(z.string(), z.union([calcValue, z.array(z.union([calcValue, z.array(calcValue)]))])),
  find: z.string().optional(),
  unit: z.enum(["V", "A", "Ω", "W", "Hz", "F", "H", "m", "s", ""]).optional(),
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

const PartKind = z.enum(["battery", "resistor", "ammeter", "voltmeter"]);
const SocketBoard = z.partialRecord(z.enum(["source", "series", "load", "across"]), PartKind.nullable());

/** LAB-20 Ohm's Law Circuit Builder config (after merging step config onto default_config). */
export const OhmsLabConfig = z.strictObject({
  mode: z.literal("circuit").optional(),
  topology: z.enum(["single", "series", "parallel"]),
  preplaced: SocketBoard.optional(),
  tray: z.array(PartKind).optional(),
  ratingW: z.number().positive().optional(),
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
    /** Series/parallel: let the learner add or remove resistors. */
    count: z.strictObject({ min: z.number().int().min(1), max: z.number().int().max(4) }).optional(),
  }),
  show: z.strictObject({ ammeter: z.boolean(), voltmeter: z.boolean(), power: z.boolean() }),
});

/** LAB-20 combiner mode: R, L or C in series or parallel. */
export const CombineLabConfig = z.object({
  mode: z.literal("combine"),
  kind: z.enum(["R", "L", "C"]),
  arrangement: z.enum(["series", "parallel"]),
  values: z.array(z.number().positive()).min(1).max(4),
  controls: z.object({ kind: z.boolean(), arrangement: z.boolean(), values: z.boolean() }),
});

const UnitEnum = z.enum(["V", "A", "Ω", "W", "Hz", "F", "H", "m", "s"]);
const RangeOrLocked = z.union([RangeControl, z.literal(false)]);

export const UnitSliderConfig = z.object({ quantity: z.string(), unit: UnitEnum, startExp: z.number().int().optional() });
export const ScopeConfig = z.object({
  f: z.number().positive(),
  fMin: z.number().positive(),
  fMax: z.number().positive(),
  view: z.enum(["wave", "reactance"]),
  harmonic: z.boolean().optional(),
  phase: z.number().optional(),
  component: z.enum(["L", "C"]).optional(),
  L: z.number().positive().optional(),
  C: z.number().positive().optional(),
  controls: z.object({ f: z.boolean(), harmonic: z.boolean().optional(), phase: z.boolean().optional(), component: z.boolean().optional() }),
});
export const DbLadderConfig = z.object({
  P0: z.number().positive(),
  stages: z.array(z.object({ label: z.string(), db: z.number(), min: z.number().optional(), max: z.number().optional(), locked: z.boolean().optional() })).max(6),
  controls: z.object({ P0: RangeOrLocked.optional() }).optional(),
  smeter: z.object({ start: z.number() }).optional(),
});
export const TransformerConfig = z.object({
  Np: z.number().positive(),
  Ns: z.number().positive(),
  Vp: z.number().positive(),
  Rload: z.number().positive(),
  controls: z.object({ Np: RangeOrLocked, Ns: RangeOrLocked, Vp: RangeOrLocked, Rload: RangeOrLocked }),
});
export const ResonanceConfig = z.object({
  L: z.number().positive(),
  C: z.number().positive(),
  R: z.number().min(0),
  circuit: z.enum(["series", "parallel"]),
  f: z.number().positive(),
  controls: z.object({ L: z.boolean(), C: z.boolean(), f: z.boolean(), circuit: z.boolean() }),
});

const Colour = z.enum(["black", "brown", "red", "orange", "yellow", "green", "blue", "violet", "grey", "white"]);
export const BenchConfig = z.object({
  device: z.enum(["diode", "zener", "bjt", "fet", "triode"]),
  mode: z.enum(["iv", "amp", "rectifier"]),
  input: z.number(),
  drive: z.number().min(0).optional(),
  controls: z.object({ device: z.boolean(), input: RangeOrLocked, drive: RangeOrLocked.optional() }),
});
export const ColourCodeConfig = z.object({
  bands: z.tuple([Colour, Colour, z.union([Colour, z.enum(["gold", "silver"])]), z.enum(["brown", "red", "gold", "silver", "none"])]),
  game: z.boolean().optional(),
  controls: z.object({ bands: z.tuple([z.boolean(), z.boolean(), z.boolean(), z.boolean()]) }),
});

export const DiagramConfigSchema = z
  .object({
    mode: z.enum(["build", "identify"]),
    blocks: z.array(z.strictObject({ id: z.string(), label: z.string(), does: z.string().optional() })).min(2),
    slots: z
      .array(
        z.strictObject({
          accepts: z.string(),
          fixed: z.boolean().optional(),
          feeds: z.number().int().min(0).optional(),
          out: z.string().optional(),
        }),
      )
      .min(1),
    target: z.string().optional(),
    input: z.string().optional(),
    output: z.string().optional(),
  })
  .superRefine((c, ctx) => {
    const ids = new Set(c.blocks.map((b) => b.id));
    c.slots.forEach((s, i) => {
      if (!ids.has(s.accepts)) ctx.addIssue({ code: "custom", message: `slot ${i} accepts unknown block ${s.accepts}` });
      if (s.feeds !== undefined && (s.feeds >= c.slots.length || c.slots[s.feeds]!.feeds !== undefined))
        ctx.addIssue({ code: "custom", message: `slot ${i} feeds ${s.feeds}, which is not a main-chain slot` });
    });
    if (c.mode === "identify" && !(c.target && c.slots.some((s) => s.accepts === c.target)))
      ctx.addIssue({ code: "custom", message: "identify mode needs a target that is in the diagram" });
  });
const SpectrumMode = z.enum(["cw", "ssb", "am", "fm", "rtty", "psk31", "ft8", "packet"]);
export const SpectrumConfigSchema = z.object({
  mode: SpectrumMode,
  filter: z.number().positive(),
  tune: z.number(),
  agc: z.boolean().optional(),
  filters: z.array(z.number().positive()).min(1),
  dialHz: z.number().positive().optional(),
  waterfall: z.boolean().optional(),
  qrm: z.object({ mode: SpectrumMode, offset: z.number() }).nullable().optional(),
  expectedDeviation: z.number().positive().optional(),
  deviation: z.number().min(0).optional(),
  regulated: z.boolean().optional(),
  shaped: z.boolean().optional(),
  squelch: z.boolean().optional(),
  noSignal: z.boolean().optional(),
  tuneLabel: z.string().optional(),
  controls: z.object({
    modes: z.union([z.array(SpectrumMode).min(2).max(4), z.literal(false)]),
    filter: z.boolean(),
    tune: RangeOrLocked,
    agc: z.boolean(),
    deviation: RangeOrLocked.optional(),
    keying: z.boolean().optional(),
    squelch: z.boolean().optional(),
  }),
});
export const SsbDriveConfigSchema = z.object({
  mode: z.literal("ssb"),
  rated: z.number().positive(),
  mic: z.number().min(0).max(1),
  processor: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  controls: z.object({ mic: z.boolean(), processor: z.boolean() }),
});
export const KeyerConfigSchema = z.object({
  mode: z.literal("keyer"),
  target: z.string().regex(/^[A-Z0-9]+$/),
  keyer: z.boolean(),
  controls: z.object({ keyer: z.boolean() }),
});
const Supply = z.enum(["battery", "linear", "switching", "unregulated"]);
export const PowerBenchConfigSchema = z.object({
  cellV: z.number().positive(),
  cellAh: z.number().positive(),
  cellR: z.number().min(0),
  batteries: z.number().int().min(1).max(4),
  wiring: z.enum(["series", "parallel"]),
  load: z.number().min(0),
  gauge: z.union([z.literal(8), z.literal(10), z.literal(12), z.literal(14)]),
  length: z.number().positive(),
  fuse: z.enum(["battery", "radio", "none"]),
  supply: Supply,
  supplies: z.array(Supply).min(2).max(4).optional(),
  controls: z.object({
    batteries: z.boolean(),
    wiring: z.boolean(),
    load: RangeOrLocked,
    gauge: z.boolean(),
    fuse: z.boolean(),
    supply: z.boolean(),
  }),
});
export const InspectorConfigSchema = z.object({
  scene: z.string(),
  items: z
    .array(z.strictObject({ id: z.string(), label: z.string(), hazard: z.boolean(), why: z.string() }))
    .min(2)
    .refine((xs) => new Set(xs.map((x) => x.id)).size === xs.length, "item ids must be unique"),
});
export const RfExposureConfigSchema = z.object({
  source: z.string(),
  power: z.number().positive(),
  gainDbi: z.number(),
  limit: z.number().positive(),
  distance: z.number().positive(),
  controls: z.object({ distance: z.object({ min: z.number().positive(), max: z.number().positive(), step: z.number().positive() }) }),
});
const AntennaRange = z.union([z.object({ min: z.number().min(0), max: z.number().positive(), step: z.number().positive() }), z.literal(false)]);
export const AntennaConfigSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("yagi"),
    reflector: z.number().min(0.85).max(1.15),
    driven: z.number().min(0.85).max(1.15),
    director: z.number().min(0.85).max(1.15),
    feed: z.enum(["reflector", "driven", "director"]).nullable(),
    directors: z.number().int().min(1).max(4).optional(),
    spacing: z.number().min(0.1).max(0.5).optional(),
    f: z.number().positive().optional(),
    controls: z.object({ lengths: z.boolean(), feed: z.boolean(), directors: z.boolean().optional(), spacing: z.boolean().optional() }),
  }),
  z.object({
    mode: z.literal("dipole"),
    f: z.number().positive(),
    length: z.number().positive(),
    orientation: z.enum(["ns", "ew"]),
    controls: z.object({ length: AntennaRange, orientation: z.boolean() }),
  }),
  z.object({
    mode: z.literal("vertical"),
    f: z.number().positive(),
    length: z.number().positive(),
    radials: z.enum(["none", "horizontal", "drooping"]),
    coil: z.number().min(0).optional(),
    whipReactance: z.number().positive().optional(),
    controls: z.object({ length: AntennaRange, radials: z.boolean(), coil: AntennaRange }),
  }),
  z.object({
    mode: z.literal("loop"),
    f: z.number().positive(),
    perimeter: z.number().positive(),
    shape: z.enum(["quad", "delta"]),
    feed: z.enum(["bottom", "side"]),
    controls: z.object({ perimeter: AntennaRange, feed: z.boolean() }),
  }),
]);
const LineIdSchema = z.enum(["rg58", "rg213", "foam", "twinlead", "window", "openwire"]);
export const FeedlineConfigSchema = z.object({
  mode: z.enum(["coax-geometry", "open-geometry", "loss", "balun"]),
  antenna: z.literal("dipole").optional(),
  line: LineIdSchema,
  length: z.number().min(0),
  f: z.number().positive(),
  balun: z.boolean().optional(),
  D: z.number().positive().optional(),
  d: z.number().positive().optional(),
  dielectric: z.enum(["solid", "foam", "air"]).optional(),
  S: z.number().positive().optional(),
  lines: z.array(LineIdSchema).min(2).max(4).optional(),
  bands: z.array(z.number().positive()).min(2).optional(),
  controls: z.object({
    D: z.boolean().optional(),
    d: z.boolean().optional(),
    dielectric: z.boolean().optional(),
    S: z.boolean().optional(),
    line: z.boolean().optional(),
    length: AntennaRange.optional(),
    f: z.boolean().optional(),
    balun: z.boolean().optional(),
  }),
});
export const SwrConfigSchema = z.object({
  r: z.number().positive(),
  x: z.number(),
  fDesign: z.number().positive(),
  fault: z.enum(["open", "short"]).nullable().optional(),
  rated: z.number().positive().optional(),
  length: z.number().positive(),
  f: z.number().positive(),
  lineLoss: z.number().min(0).optional(),
  ratio: z.number().positive().optional(),
  tuner: z.object({ xl: z.number().min(0), xc: z.number().positive() }).nullable().optional(),
  analyzer: z.boolean().optional(),
  sweep: z.tuple([z.number().positive(), z.number().positive()]).optional(),
  ratios: z.array(z.number().positive()).min(2).optional(),
  controls: z.object({
    length: z.boolean().optional(),
    f: AntennaRange.optional(),
    lineLoss: z.union([z.object({ min: z.number().min(0), max: z.number().positive(), step: z.number().positive() }), z.literal(false)]).optional(),
    ratio: z.boolean().optional(),
    tuner: z.boolean().optional(),
    repair: z.boolean().optional(),
  }),
});
const PropRange = z.union([z.object({ min: z.number().min(0), max: z.number().positive(), step: z.number().positive() }), z.literal(false)]);
export const IonosphereConfigSchema = z.object({
  f: z.number().positive(),
  angle: z.number().min(0).max(90),
  hour: z.number().min(0).max(24),
  sfi: z.number().min(60).max(300).optional(),
  rx: z.number().positive().optional(),
  bands: z.array(z.number().positive()).min(2).optional(),
  controls: z.object({ f: z.boolean(), angle: PropRange, hour: PropRange }),
});
export const SolarCycleConfigSchema = z.object({ year: z.number().min(0).max(11) });
export const VhfConfigSchema = z.object({
  band: z.union([z.literal(6), z.literal(2), z.literal(0.7)]),
  height: z.number().min(0),
  inversion: z.boolean().optional(),
  sporadicE: z.boolean().optional(),
  aurora: z.boolean().optional(),
  meteors: z.boolean().optional(),
  heading: z.number().min(0).max(359).optional(),
  controls: z.object({
    band: z.boolean(),
    height: PropRange,
    inversion: z.boolean(),
    sporadicE: z.boolean(),
    aurora: z.boolean(),
    meteors: z.boolean(),
    heading: z.boolean(),
  }),
});
const LonLatSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export const WorldClockConfigSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("propagation"),
    date: z.string(),
    from: LonLatSchema,
    to: LonLatSchema,
    fromLabel: z.string(),
    toLabel: z.string(),
    sfi: z.number().min(60).max(300).optional(),
    utc: z.number().min(0).max(24),
    f: z.number().positive(),
    bands: z.array(z.number().positive()).min(2),
    controls: z.object({ utc: z.boolean(), f: z.boolean() }),
  }),
]);
const CauseSchema = z.enum(["overload", "desense", "intermod", "rectification", "harmonics", "spurious", "parasitic", "clicks", "splatter", "commonmode"]);
const CureSchema = z.enum(["hpfTv", "lpfTx", "ferrite", "phoneFilter", "cmChoke", "rxFilter", "separate", "cover", "keying", "micGain", "lessPower"]);
export const InterferenceConfigSchema = z
  .object({
    title: z.string(),
    story: z.string(),
    evidence: z.array(z.string()).min(1),
    sound: z.enum(["ssb-rect", "cw-rect", "overload", "harmonic", "intermod", "clicks", "desense", "splatter"]),
    caption: z.string().min(10),
    cause: CauseSchema,
    cure: CureSchema,
    causes: z.array(CauseSchema).min(2),
    cures: z.array(CureSchema).min(2),
  })
  .refine((c) => c.causes.includes(c.cause) && c.cures.includes(c.cure), "the right cause and cure must be among the options");
const FilterTypeSchema = z.enum(["lowpass", "highpass", "bandpass", "bandreject", "notch"]);
export const FilterConfigSchema = z.object({
  wanted: z.array(z.number().positive()).min(1),
  interferers: z.array(z.number().positive()).min(1),
  type: FilterTypeSchema,
  f1: z.number().positive(),
  f2: z.number().positive().optional(),
  types: z.array(FilterTypeSchema).min(2).max(4),
  values: z.array(z.number().positive()).min(2),
  axis: z.object({ min: z.number().positive(), max: z.number().positive(), log: z.boolean() }),
  labels: z.object({ wanted: z.string().optional(), interferers: z.string().optional() }).optional(),
});
const PatternAntenna = z.enum(["isotropic", "dipole", "yagi"]);
export const PatternConfigSchema = z.object({
  antenna: PatternAntenna,
  orientation: z.enum(["horizontal", "vertical"]),
  rx: z.enum(["horizontal", "vertical"]).optional(),
  parasitic: z.enum(["none", "director", "reflector"]).optional(),
  antennas: z.array(PatternAntenna).min(1).max(4),
  controls: z.object({ antenna: z.boolean(), orientation: z.boolean(), rx: z.boolean(), parasitic: z.boolean() }),
});

/** Config schema and the variables a goal may reference, per implemented lab. */
export const LAB_SCHEMAS: Record<string, { config: z.ZodType; variables: string[] }> = {
  "LAB-13": { config: DiagramConfigSchema, variables: LAB_GOAL_VARIABLES["LAB-13"]! },
  "LAB-14": { config: SpectrumConfigSchema, variables: LAB_GOAL_VARIABLES["LAB-14"]! },
  "LAB-28": { config: AntennaConfigSchema, variables: LAB_GOAL_VARIABLES["LAB-28"]! },
  "LAB-33": { config: InterferenceConfigSchema, variables: LAB_GOAL_VARIABLES["LAB-33"]! },
  "LAB-34": { config: FilterConfigSchema, variables: LAB_GOAL_VARIABLES["LAB-34"]! },
  "LAB-30": { config: IonosphereConfigSchema, variables: LAB_GOAL_VARIABLES["LAB-30"]! },
  "LAB-31": { config: SolarCycleConfigSchema, variables: LAB_GOAL_VARIABLES["LAB-31"]! },
  "LAB-32": { config: VhfConfigSchema, variables: LAB_GOAL_VARIABLES["LAB-32"]! },
  "LAB-12": { config: WorldClockConfigSchema, variables: LAB_GOAL_VARIABLES["LAB-12"]! },
  "LAB-26": { config: FeedlineConfigSchema, variables: LAB_GOAL_VARIABLES["LAB-26"]! },
  "LAB-27": { config: SwrConfigSchema, variables: LAB_GOAL_VARIABLES["LAB-27"]! },
  "LAB-29": { config: PatternConfigSchema, variables: LAB_GOAL_VARIABLES["LAB-29"]! },
  "LAB-04": { config: SsbDriveConfigSchema, variables: LAB_GOAL_VARIABLES["LAB-04"]! },
  "LAB-10": { config: KeyerConfigSchema, variables: LAB_GOAL_VARIABLES["LAB-10"]! },
  "LAB-15": { config: PowerBenchConfigSchema, variables: LAB_GOAL_VARIABLES["LAB-15"]! },
  "LAB-16": { config: InspectorConfigSchema, variables: LAB_GOAL_VARIABLES["LAB-16"]! },
  "LAB-05": { config: RfExposureConfigSchema, variables: LAB_GOAL_VARIABLES["LAB-05"]! },
  "LAB-17": { config: BenchConfig, variables: LAB_GOAL_VARIABLES["LAB-17"]! },
  "LAB-18": { config: ColourCodeConfig, variables: LAB_GOAL_VARIABLES["LAB-18"]! },
  "LAB-19": { config: UnitSliderConfig, variables: LAB_GOAL_VARIABLES["LAB-19"]! },
  "LAB-20": { config: z.union([CombineLabConfig, OhmsLabConfig]), variables: LAB_GOAL_VARIABLES["LAB-20"]! },
  "LAB-21": { config: ScopeConfig, variables: LAB_GOAL_VARIABLES["LAB-21"]! },
  "LAB-22": { config: DbLadderConfig, variables: LAB_GOAL_VARIABLES["LAB-22"]! },
  "LAB-23": { config: TransformerConfig, variables: LAB_GOAL_VARIABLES["LAB-23"]! },
  "LAB-24": { config: ResonanceConfig, variables: LAB_GOAL_VARIABLES["LAB-24"]! },
  "LAB-25": { config: OhmsLabConfig, variables: LAB_GOAL_VARIABLES["LAB-25"]! },
};

export const LessonTitlesSchema = z.record(lessonCode, z.string().min(1));

export const WhyNotSchema = z.record(questionId, z.record(z.string(), z.string().min(1)));
