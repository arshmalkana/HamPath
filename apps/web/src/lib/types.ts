/** Shapes returned by the HamPath API (/api/v1). */

export interface User {
  id: string;
  email: string | null;
  displayName: string | null;
  callSign: string | null;
  locale: "en" | "fr";
  role: "learner" | "instructor" | "admin";
  isGuest: boolean;
}

export interface LessonSummaryRow {
  id: string;
  sectionId: string;
  code: string;
  title: string;
  estMinutes: number | null;
  labId: string | null;
  authored: boolean;
  questionCount: number;
  step: number | null;
  completedAt: string | null;
  /** Passed in a section test-out (Step 29). */
  testedOut?: boolean;
  mastered: number;
}

export interface Section {
  id: string;
  number: number;
  title: string;
  recommendedOrder: number;
  lessons: LessonSummaryRow[];
}

export interface LabStep {
  id: string;
  labId: string;
  component: string | null;
  title: string;
  prompt: string;
  config: Record<string, unknown>;
  goal: string | null;
  goalText: string | null;
  hints: string[];
  success: string | null;
}

export type Interaction =
  | {
      kind: "predict";
      prompt: string;
      choices: { text: string; correct: boolean; feedback: string }[];
      reveal_lab_step?: string;
    }
  | {
      kind: "numeric";
      prompt: string;
      unit: string;
      answer: number;
      tolerance: number;
      hint?: string;
      solution?: string[];
    }
  | { kind: "reveal"; prompt?: string; items: { label: string; text: string }[] }
  | {
      kind: "drag_drop";
      prompt: string;
      items: { id: string; text: string }[];
      slots: { id: string; label: string; accepts: string }[];
    }
  | { kind: "flashcards"; cards: { front: string; back: string }[] }
  | {
      kind: "audio";
      prompt: string;
      morse?: string;
      wpm: number;
      src?: string;
      transcript: string;
      choices?: { text: string; correct: boolean }[];
    };

export type CardType =
  | "intro"
  | "hook"
  | "lab"
  | "concept"
  | "predict"
  | "numeric"
  | "worked_example"
  | "drag_drop"
  | "flashcards"
  | "audio";

export interface Card {
  id: string;
  type: CardType;
  title: string;
  bodyMd: string;
  media: string | null;
  mediaAlt: string | null;
  examFact: string | null;
  interaction: Interaction | null;
  teaches: string[];
  labStepId: string | null;
  labStep: LabStep | null;
}

export interface Question {
  id: string;
  stem: string;
  hasCalculation: boolean;
  options: { id: string; text: string }[];
}

export interface Lesson {
  id: string;
  code: string;
  title: string;
  estMinutes: number | null;
  authored: boolean;
  section: { id: string; number: number; title: string };
  lab: { id: string; name: string; component: string | null } | null;
  cards: Card[];
  labSteps: LabStep[];
  questions: Question[];
  next: { id: string; code: string; title: string; authored: boolean } | null;
  progress: { step: number; completedAt: string | null } | null;
}

export interface AttemptResult {
  correct: boolean;
  revealed: boolean;
  correct_option_id: string | null;
  why_not: string | null;
  worked_solution: string[] | null;
  teach_card: { id: string | null; title: string; href: string } | null;
  in_review_queue: boolean;
  mastered: boolean;
}

export interface LessonSummary {
  total: number;
  answered: number;
  firstTryCorrect: number;
  mastered: number;
  inReview: number;
  questions: { id: string; answered: boolean; firstTryCorrect: boolean | null; mastered: boolean }[];
}
