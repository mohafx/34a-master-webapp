import { Module, Question, UserProgress } from '../types';
import {
  findFirstOpenQuestionInLesson,
  getAssignedModuleQuestions,
  getCompletedLessonCountForModule,
  getEffectiveCompletedLessonIds,
  getUnassignedModuleQuestions,
  isLessonCompleted,
  sortLessons,
} from './lessonFlow';

// ============================================================
// TYPES
// ============================================================

export interface LernplanTask {
  type: 'questions' | 'lessons' | 'exam';
  label: string;
  labelAR?: string;
  target: number;
  moduleId?: string;
}

export interface LernplanNode {
  id: string;
  moduleId: string;
  moduleTitle: string;
  moduleTitleAR?: string;
  moduleDescription?: string;
  moduleDescriptionAR?: string;
  moduleIcon?: string;
  estimatedMinutes?: number;
  weekLabel: string | null;
  dateRange?: string;
  tasks: LernplanTask[];
}

export interface Lernplan {
  version: 1;
  generatedAt: string;
  examDate: string | null;
  isDated: boolean;
  intensity: 'light' | 'moderate' | 'intensive' | 'undated';
  nodes: LernplanNode[];
}

export interface LernplanSummaryStats {
  completedLessons: number;
  totalLessons: number;
  answeredQuestions: number;
  totalQuestions: number;
  correctAnswers: number;
  quizAccuracy: number | null;
}

export interface LernplanResumeTarget {
  type: 'lesson' | 'question' | 'module' | 'exam';
  path: string;
  moduleId: string;
  lessonId?: string;
  questionId?: string;
}

export interface LernplanProgressStats {
  completed: number;
  target: number;
}

export interface LernplanLessonItem {
  id: string;
  titleDE: string;
  titleAR?: string;
  isCompleted: boolean;
}

export interface LernplanQuestionStats {
  correct: number;
  answered: number;
  total: number;
  accuracy: number | null;
}

export interface LernplanSection {
  id: string;
  label: string;
  dateRange?: string;
  nodes: NodeWithStatus[];
  completedCount: number;
  totalCount: number;
  isOpenByDefault: boolean;
}

export interface NodeWithStatus extends LernplanNode {
  status: 'completed' | 'current' | 'upcoming';
  taskProgress: LernplanProgressStats[];
  lessonStats: LernplanProgressStats | null;
  questionStats: LernplanQuestionStats | null;
  lessons: LernplanLessonItem[];
  remainingMinutes: number;
  resumeTarget: LernplanResumeTarget;
}

export interface LernplanWithStatus {
  plan: Lernplan;
  nodes: NodeWithStatus[];
  currentNodeIndex: number;
  completedCount: number;
  totalCount: number;
}

// ============================================================
// STORAGE
// ============================================================

const LERNPLAN_STORAGE_KEY = '34a_lernplan';
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function saveLernplan(plan: Lernplan): void {
  try {
    localStorage.setItem(LERNPLAN_STORAGE_KEY, JSON.stringify(plan));
  } catch (e) {
    console.warn('[Lernplan] Save error:', e);
  }
}

export function loadLernplan(): Lernplan | null {
  try {
    const stored = localStorage.getItem(LERNPLAN_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (parsed?.version !== 1) return null;
    return parsed as Lernplan;
  } catch {
    return null;
  }
}

export function loadValidLernplan(): Lernplan | null {
  const plan = loadLernplan();
  if (!plan) return null;
  return shouldRegeneratePlan(plan) ? null : plan;
}

export function shouldRegeneratePlan(plan: Lernplan): boolean {
  const currentExamDate = localStorage.getItem('examDate') || null;
  return plan.examDate !== currentExamDate;
}

// ============================================================
// HELPERS
// ============================================================

function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getDaysRemaining(examDate: string | null): number | null {
  if (!examDate) return null;
  const exam = new Date(examDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  exam.setHours(0, 0, 0, 0);
  const diff = Math.ceil((exam.getTime() - now.getTime()) / MS_PER_DAY);
  return diff < 1 ? null : diff;
}

type Intensity = Lernplan['intensity'];

function getIntensity(daysRemaining: number | null): Intensity {
  if (daysRemaining === null) return 'undated';
  if (daysRemaining >= 60) return 'light';
  if (daysRemaining >= 30) return 'moderate';
  if (daysRemaining >= 10) return 'intensive';
  return 'undated';
}

function getQuestionStatsForModule(moduleId: string, questions: Question[], progress: UserProgress): LernplanQuestionStats {
  const moduleQuestions = getModuleQuestions(moduleId, questions);
  const answered = moduleQuestions.filter(question =>
    Object.prototype.hasOwnProperty.call(progress.answeredQuestions, question.id)
  ).length;
  const correct = moduleQuestions.filter(question => progress.answeredQuestions[question.id] === true).length;

  return {
    correct,
    answered,
    total: moduleQuestions.length,
    accuracy: answered > 0 ? Math.round((correct / answered) * 100) : null,
  };
}

function getModuleQuestions(moduleId: string, questions: Question[]): Question[] {
  return questions
    .filter(question => question.moduleId === moduleId)
    .sort((a, b) => {
      const globalA = a.global_order_index ?? a.orderIndex ?? Number.MAX_SAFE_INTEGER;
      const globalB = b.global_order_index ?? b.orderIndex ?? Number.MAX_SAFE_INTEGER;
      if (globalA !== globalB) return globalA - globalB;
      return (a.textDE || '').localeCompare(b.textDE || '');
    });
}

function getFirstOpenModuleQuestion(moduleId: string, questions: Question[], progress: UserProgress): Question | null {
  return (
    getModuleQuestions(moduleId, questions).find(question => progress.answeredQuestions[question.id] !== true)
    || null
  );
}

function getLessonStatsForModule(
  moduleId: string,
  modules: Module[] | undefined,
  questions: Question[],
  progress: UserProgress,
  fallbackTarget?: number,
): LernplanProgressStats | null {
  const module = modules?.find(item => item.id === moduleId);

  if (!module) {
    if (typeof fallbackTarget !== 'number') return null;
    const completed = Object.values(progress.completedLessons).filter(Boolean).length;
    return {
      completed: Math.min(completed, fallbackTarget),
      target: fallbackTarget,
    };
  }

  return {
    completed: getCompletedLessonCountForModule(moduleId, modules || [], questions, progress),
    target: module.lessons.length,
  };
}

export function getRemainingMinutesForNode(node: LernplanNode, taskProgress: LernplanProgressStats[]): number {
  return node.tasks.reduce((total, task, index) => {
    const progress = taskProgress[index];
    const remaining = Math.max((progress?.target ?? task.target) - (progress?.completed ?? 0), 0);

    if (task.type === 'lessons') return total + remaining * 2;
    if (task.type === 'questions') return total + remaining;
    return total;
  }, 0);
}

export function getPlanSummaryStats(
  modules: Module[],
  questions: Question[],
  progress: UserProgress,
): LernplanSummaryStats {
  const totalLessons = modules.reduce((sum, module) => sum + module.lessons.length, 0);
  const completedLessons = getEffectiveCompletedLessonIds(modules, questions, progress).size;

  const validQuestionIds = new Set(questions.map(question => question.id));
  const answeredEntries = Object.entries(progress.answeredQuestions).filter(([id]) => validQuestionIds.has(id));
  const answeredQuestions = answeredEntries.length;
  const correctAnswers = answeredEntries.filter(([, isCorrect]) => isCorrect === true).length;

  return {
    completedLessons,
    totalLessons,
    answeredQuestions,
    totalQuestions: validQuestionIds.size,
    correctAnswers,
    quizAccuracy: answeredQuestions > 0 ? Math.round((correctAnswers / answeredQuestions) * 100) : null,
  };
}

export function resolveResumeTargetForNode(
  node: LernplanNode,
  modules: Module[],
  questions: Question[],
  progress: UserProgress,
): LernplanResumeTarget {
  if (node.moduleId === 'exam') {
    return {
      type: 'exam',
      path: '/exam',
      moduleId: 'exam',
    };
  }

  const module = modules.find(item => item.id === node.moduleId);
  if (!module) {
    return {
      type: 'module',
      path: `/learn/${node.moduleId}`,
      moduleId: node.moduleId,
    };
  }

  const orderedLessons = sortLessons(module.lessons || []);

  for (const lesson of orderedLessons) {
    if (progress.completedLessons[lesson.id] !== true) {
      return {
        type: 'lesson',
        path: `/learn/${node.moduleId}/lesson/${lesson.id}`,
        moduleId: node.moduleId,
        lessonId: lesson.id,
      };
    }

    const openLessonQuestion = findFirstOpenQuestionInLesson(lesson.id, questions, progress);
    if (openLessonQuestion) {
      return {
        type: 'question',
        path: `/quiz?module=${node.moduleId}&single=${openLessonQuestion.id}`,
        moduleId: node.moduleId,
        lessonId: lesson.id,
        questionId: openLessonQuestion.id,
      };
    }
  }

  const openModuleQuestion = getFirstOpenModuleQuestion(node.moduleId, questions, progress);
  if (openModuleQuestion) {
    return {
      type: 'question',
      path: `/quiz?module=${node.moduleId}&single=${openModuleQuestion.id}`,
      moduleId: node.moduleId,
      lessonId: openModuleQuestion.lessonId,
      questionId: openModuleQuestion.id,
    };
  }

  return {
    type: 'module',
    path: `/learn/${node.moduleId}`,
    moduleId: node.moduleId,
  };
}

function createNodeWithRuntimeData(
  node: LernplanNode,
  modules: Module[] | undefined,
  questions: Question[],
  progress: UserProgress,
): Omit<NodeWithStatus, 'status'> {
  const module = modules?.find(item => item.id === node.moduleId);
  const lessonTask = node.tasks.find(task => task.type === 'lessons');
  const questionTask = node.tasks.find(task => task.type === 'questions');

  const lessonStats = node.moduleId === 'exam'
    ? null
    : getLessonStatsForModule(node.moduleId, modules, questions, progress, lessonTask?.target);
  const questionStats = node.moduleId === 'exam'
    ? null
    : getQuestionStatsForModule(node.moduleId, questions, progress);

  const taskProgress = node.tasks.map(task => {
    if (task.type === 'lessons') {
      return {
        completed: lessonStats?.completed ?? 0,
        target: task.target,
      };
    }

    if (task.type === 'questions') {
      return {
        completed: questionStats?.correct ?? 0,
        target: task.target,
      };
    }

    return {
      completed: 0,
      target: task.target,
    };
  });

  const lessons = node.moduleId === 'exam' || !module
    ? []
    : sortLessons(module.lessons).map(lesson => ({
        id: lesson.id,
        titleDE: lesson.titleDE,
        titleAR: lesson.titleAR,
        isCompleted: isLessonCompleted(lesson.id, questions, progress),
      }));

  return {
    ...node,
    taskProgress,
    lessonStats,
    questionStats,
    lessons,
    remainingMinutes: getRemainingMinutesForNode(node, taskProgress),
    resumeTarget: resolveResumeTargetForNode(node, modules || [], questions, progress),
  };
}

function computeStatuses(
  plan: Lernplan,
  modules: Module[] | undefined,
  questions: Question[],
  progress: UserProgress,
): LernplanWithStatus {
  let foundCurrent = false;
  let completedCount = 0;

  const nodesWithStatus: NodeWithStatus[] = plan.nodes.map(node => {
    const runtimeNode = createNodeWithRuntimeData(node, modules, questions, progress);
    const isNodeCompleted = runtimeNode.taskProgress.every(task => task.completed >= task.target);

    let status: NodeWithStatus['status'];
    if (isNodeCompleted && !foundCurrent) {
      status = 'completed';
      completedCount++;
    } else if (!foundCurrent) {
      status = 'current';
      foundCurrent = true;
    } else {
      status = 'upcoming';
    }

    return {
      ...runtimeNode,
      status,
    };
  });

  const examNode = nodesWithStatus.find(node => node.moduleId === 'exam');
  if (examNode) {
    const allOthersCompleted = nodesWithStatus
      .filter(node => node.moduleId !== 'exam')
      .every(node => node.status === 'completed');

    if (allOthersCompleted) {
      examNode.status = 'completed';
      examNode.taskProgress = [{ completed: 1, target: 1 }];
      examNode.remainingMinutes = 0;
      completedCount = nodesWithStatus.length;
    }
  }

  const currentNodeIndex = nodesWithStatus.findIndex(node => node.status === 'current');

  return {
    plan,
    nodes: nodesWithStatus,
    currentNodeIndex: currentNodeIndex === -1 ? 0 : currentNodeIndex,
    completedCount,
    totalCount: nodesWithStatus.length,
  };
}

export function buildLernplanSections(
  plan: Lernplan,
  nodes: NodeWithStatus[],
): LernplanSection[] {
  if (!plan.isDated) {
    return [{
      id: 'all',
      label: 'Lernplan',
      nodes,
      completedCount: nodes.filter(node => node.status === 'completed').length,
      totalCount: nodes.length,
      isOpenByDefault: true,
    }];
  }

  const sectionMap = new Map<string, { label: string; dateRange?: string; nodes: NodeWithStatus[] }>();

  for (const node of nodes) {
    const key = node.weekLabel || 'Ohne Woche';
    if (!sectionMap.has(key)) {
      sectionMap.set(key, {
        label: key,
        dateRange: node.dateRange,
        nodes: [],
      });
    }
    sectionMap.get(key)?.nodes.push(node);
  }

  const sectionEntries = Array.from(sectionMap.entries()).map(([id, section]) => ({
    id,
    label: section.label,
    dateRange: section.dateRange,
    nodes: section.nodes,
  }));

  const currentSectionId =
    sectionEntries.find(section => section.nodes.some(node => node.status === 'current'))?.id
    || sectionEntries.find(section => section.nodes.some(node => node.status !== 'completed'))?.id
    || sectionEntries[sectionEntries.length - 1]?.id;

  return sectionEntries.map(section => {
    const completedNodes = section.nodes.filter(node => node.status === 'completed').length;
    return {
      ...section,
      completedCount: completedNodes,
      totalCount: section.nodes.length,
      isOpenByDefault: section.id === currentSectionId,
    };
  });
}

// ============================================================
// GENERATOR
// ============================================================

export function generateLernplan(
  modules: Module[],
  questions: Question[],
): Lernplan {
  const examDate = localStorage.getItem('examDate') || null;
  const daysRemaining = getDaysRemaining(examDate);
  const intensity = getIntensity(daysRemaining);
  const isDated = intensity !== 'undated';

  const activeModules = modules.filter(module => {
    const hasQuestions = getAssignedModuleQuestions(module.id, questions).length > 0;
    const hasLessons = (module.lessons?.length ?? 0) > 0;
    return hasQuestions || hasLessons;
  });

  const nodes: LernplanNode[] = activeModules.map(module => {
    const moduleQuestions = getAssignedModuleQuestions(module.id, questions);
    const orphanQuestions = getUnassignedModuleQuestions(module.id, questions);
    const moduleLessons = module.lessons || [];
    const tasks: LernplanTask[] = [];

    if (orphanQuestions.length > 0) {
      console.warn(
        `[Lernplan] ${orphanQuestions.length} Fragen ohne lessonId in Modul ${module.id} werden im Lernplan ignoriert.`,
      );
    }

    if (moduleLessons.length > 0) {
      tasks.push({
        type: 'lessons',
        label: `${moduleLessons.length} ${moduleLessons.length === 1 ? 'Lektion' : 'Lektionen'} lesen`,
        labelAR: `قراءة ${moduleLessons.length} ${moduleLessons.length === 1 ? 'درس' : 'دروس'}`,
        target: moduleLessons.length,
        moduleId: module.id,
      });
    }

    if (moduleQuestions.length > 0) {
      tasks.push({
        type: 'questions',
        label: `${moduleQuestions.length} ${moduleQuestions.length === 1 ? 'Frage' : 'Fragen'} beantworten`,
        labelAR: `الإجابة على ${moduleQuestions.length} ${moduleQuestions.length === 1 ? 'سؤال' : 'أسئلة'}`,
        target: moduleQuestions.length,
        moduleId: module.id,
      });
    }

    const estimatedMinutes = (moduleLessons.length * 2) + moduleQuestions.length;

    return {
      id: `node-${module.id}`,
      moduleId: module.id,
      moduleTitle: module.titleDE,
      moduleTitleAR: module.titleAR,
      moduleDescription: module.descriptionDE,
      moduleDescriptionAR: module.descriptionAR,
      moduleIcon: module.icon,
      estimatedMinutes,
      weekLabel: null,
      tasks,
    };
  });

  nodes.push({
    id: 'node-exam',
    moduleId: 'exam',
    moduleTitle: 'Prüfungssimulation',
    moduleTitleAR: 'محاكاة الامتحان',
    moduleIcon: 'GraduationCap',
    weekLabel: null,
    tasks: [{
      type: 'exam',
      label: 'Prüfungssimulation durchführen',
      labelAR: 'إجراء محاكاة الامتحان',
      target: 1,
    }],
  });

  if (isDated && daysRemaining !== null) {
    const weeksAvailable = Math.max(Math.floor(daysRemaining / 7), 1);
    const modulesPerWeek = Math.max(Math.ceil(nodes.length / weeksAvailable), 1);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let index = 0; index < nodes.length; index++) {
      const weekIndex = Math.floor(index / modulesPerWeek);
      const weekStart = addDays(today, weekIndex * 7);
      const weekEnd = addDays(weekStart, 6);
      nodes[index].weekLabel = `Woche ${weekIndex + 1}`;
      nodes[index].dateRange = `${formatDate(weekStart)} – ${formatDate(weekEnd)}`;
    }
  }

  const plan: Lernplan = {
    version: 1,
    generatedAt: new Date().toISOString(),
    examDate,
    isDated,
    intensity,
    nodes,
  };

  saveLernplan(plan);
  return plan;
}

// ============================================================
// STATUS COMPUTATION
// ============================================================

export function computeNodeStatuses(
  plan: Lernplan,
  questions: Question[],
  progress: UserProgress,
): LernplanWithStatus {
  return computeStatuses(plan, undefined, questions, progress);
}

export function computeNodeStatusesWithModules(
  plan: Lernplan,
  modules: Module[],
  questions: Question[],
  progress: UserProgress,
): LernplanWithStatus {
  return computeStatuses(plan, modules, questions, progress);
}
