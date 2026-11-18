/** ID helpers. Question B-005-004-001 → lesson B-005-004 (code "5.04") → section B-005. */

export const QUESTION_ID_RE = /^B-(\d{3})-(\d{3})-(\d{3})$/;
export const LESSON_ID_RE = /^B-(\d{3})-(\d{3})$/;
export const LESSON_CODE_RE = /^(\d)\.(\d{2})$/;

export function lessonIdOf(questionId: string): string {
  const m = QUESTION_ID_RE.exec(questionId);
  if (!m) throw new Error(`Bad question id: ${questionId}`);
  return `B-${m[1]}-${m[2]}`;
}

export function sectionIdOf(id: string): string {
  const m = /^B-(\d{3})/.exec(id);
  if (!m) throw new Error(`Bad id: ${id}`);
  return `B-${m[1]}`;
}

export function lessonCode(lessonId: string): string {
  const m = LESSON_ID_RE.exec(lessonId);
  if (!m) throw new Error(`Bad lesson id: ${lessonId}`);
  return `${Number(m[1])}.${m[2]!.slice(1)}`;
}

export function lessonIdFromCode(code: string): string {
  const m = LESSON_CODE_RE.exec(code);
  if (!m) throw new Error(`Bad lesson code: ${code}`);
  return `B-00${m[1]}-0${m[2]}`;
}

export function sectionNumber(sectionId: string): number {
  return Number(sectionId.slice(2));
}
