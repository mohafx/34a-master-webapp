import { Module, Question, UserProgress } from '../types';

export interface LessonQuestionProgress {
  total: number;
  answered: number;
  correct: number;
  wrong: number;
  unanswered: number;
  allAnswered: boolean;
}

export function compareQuestions(a: Question, b: Question): number {
  const globalA = a.global_order_index ?? a.orderIndex ?? Number.MAX_SAFE_INTEGER;
  const globalB = b.global_order_index ?? b.orderIndex ?? Number.MAX_SAFE_INTEGER;

  if (globalA !== globalB) return globalA - globalB;
  return (a.textDE || '').localeCompare(b.textDE || '');
}

export function sortLessons<T extends { orderIndex?: number; titleDE?: string }>(lessons: T[]): T[] {
  return [...lessons].sort((a, b) => {
    const orderDiff = (a.orderIndex ?? Number.MAX_SAFE_INTEGER) - (b.orderIndex ?? Number.MAX_SAFE_INTEGER);
    if (orderDiff !== 0) return orderDiff;
    return (a.titleDE || '').localeCompare(b.titleDE || '');
  });
}

export function getOrderedLessonsForModule(moduleId: string, modules: Module[]): Module['lessons'] {
  const module = modules.find(item => item.id === moduleId);
  if (!module) return [];
  return sortLessons(module.lessons || []);
}

export function getFirstLessonForModule(moduleId: string, modules: Module[]): Module['lessons'][number] | null {
  return getOrderedLessonsForModule(moduleId, modules)[0] || null;
}

export function getNextLessonForModule(
  moduleId: string,
  lessonId: string,
  modules: Module[],
): Module['lessons'][number] | null {
  const lessons = getOrderedLessonsForModule(moduleId, modules);
  const currentIndex = lessons.findIndex(lesson => lesson.id === lessonId);
  if (currentIndex === -1 || currentIndex >= lessons.length - 1) return null;
  return lessons[currentIndex + 1];
}

export function getLessonQuestions(lessonId: string, questions: Question[]): Question[] {
  return questions
    .filter(question => question.lessonId === lessonId)
    .sort(compareQuestions);
}

export function getAssignedModuleQuestions(moduleId: string, questions: Question[]): Question[] {
  return questions
    .filter(question => question.moduleId === moduleId && !!question.lessonId)
    .sort(compareQuestions);
}

export function getUnassignedModuleQuestions(moduleId: string, questions: Question[]): Question[] {
  return questions
    .filter(question => question.moduleId === moduleId && !question.lessonId)
    .sort(compareQuestions);
}

export function isQuestionBasedLesson(lessonId: string, questions: Question[]): boolean {
  return getLessonQuestions(lessonId, questions).length > 0;
}

export function getLessonQuestionProgress(
  lessonId: string,
  questions: Question[],
  progress: UserProgress,
): LessonQuestionProgress {
  const lessonQuestions = getLessonQuestions(lessonId, questions);
  const answered = lessonQuestions.filter(question =>
    Object.prototype.hasOwnProperty.call(progress.answeredQuestions, question.id)
  ).length;
  const correct = lessonQuestions.filter(question => progress.answeredQuestions[question.id] === true).length;
  const wrong = answered - correct;

  return {
    total: lessonQuestions.length,
    answered,
    correct,
    wrong,
    unanswered: lessonQuestions.length - answered,
    allAnswered: lessonQuestions.length > 0 && answered === lessonQuestions.length,
  };
}

export function isLessonCompleted(
  lessonId: string,
  questions: Question[],
  progress: UserProgress,
): boolean {
  if (isQuestionBasedLesson(lessonId, questions)) {
    return getLessonQuestionProgress(lessonId, questions, progress).allAnswered;
  }

  return progress.completedLessons[lessonId] === true;
}

export function getEffectiveCompletedLessonIds(
  modules: Module[],
  questions: Question[],
  progress: UserProgress,
): Set<string> {
  const completed = new Set<string>();

  for (const module of modules) {
    for (const lesson of module.lessons || []) {
      if (isLessonCompleted(lesson.id, questions, progress)) {
        completed.add(lesson.id);
      }
    }
  }

  return completed;
}

export function getCompletedLessonCountForModule(
  moduleId: string,
  modules: Module[],
  questions: Question[],
  progress: UserProgress,
): number {
  return getOrderedLessonsForModule(moduleId, modules)
    .filter(lesson => isLessonCompleted(lesson.id, questions, progress))
    .length;
}

export function findFirstOpenLesson(
  moduleId: string,
  modules: Module[],
  questions: Question[],
  progress: UserProgress,
): Module['lessons'][number] | null {
  const orderedLessons = getOrderedLessonsForModule(moduleId, modules);

  return (
    orderedLessons.find(lesson => !isLessonCompleted(lesson.id, questions, progress))
    || orderedLessons[0]
    || null
  );
}

export function findFirstOpenQuestionInLesson(
  lessonId: string,
  questions: Question[],
  progress: UserProgress,
): Question | null {
  return (
    getLessonQuestions(lessonId, questions).find(question => progress.answeredQuestions[question.id] !== true)
    || null
  );
}

export function buildLessonQuestionPath(
  moduleId: string,
  lessonId: string,
  startQuestionId?: string,
): string {
  const params = new URLSearchParams({
    mode: 'lesson',
    module: moduleId,
    lesson: lessonId,
  });

  if (startQuestionId) {
    params.set('start', startQuestionId);
  }

  return `/quiz?${params.toString()}`;
}
