import type { Question } from "@/lib/types";

export interface QuizQuestion extends Question {
  lessonId?: string;
}

export interface ResultItem {
  questionId: string;
  lessonCode: string;
  sectionId: string;
  stem: string;
  correct: boolean;
  chosen: { id: string; text: string } | null;
  correctOption: { id: string; text: string };
  whyNot: string | null;
  workedSolution: string[] | null;
  teach: { id: string | null; title: string; href: string } | null;
}

export interface WeakLesson {
  lessonId: string;
  code: string;
  title: string;
  missed: number;
  total: number;
  href: string;
}

export interface QuizResults {
  id: string;
  finished: true;
  score: number;
  correct: number;
  total: number;
  passed: boolean;
  honours?: boolean;
  badge?: boolean;
  passPercent: number;
  honoursPercent?: number;
  title?: string;
  sectionBreakdown?: { sectionId: string; number: number; title: string; correct: number; total: number }[];
  weakLessons: WeakLesson[];
  misses: ResultItem[];
}

export interface QuizInProgress {
  id: string;
  finished: false;
  title?: string;
  passPercent: number;
  honoursPercent?: number;
  timeLimitS?: number;
  remainingS?: number;
  questions: QuizQuestion[];
}
