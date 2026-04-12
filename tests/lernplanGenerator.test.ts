import { describe, expect, it } from 'vitest';
import { Module, Question, QuestionType, UserProgress } from '../src/types';
import {
  buildLernplanSections,
  computeNodeStatusesWithModules,
  getPlanSummaryStats,
  Lernplan,
  LernplanNode,
  resolveResumeTargetForNode,
} from '../src/services/lernplanGenerator';

const modules: Module[] = [
  {
    id: 'm1',
    titleDE: 'Modul 1',
    titleAR: 'الوحدة 1',
    descriptionDE: 'Beschreibung Modul 1',
    descriptionAR: 'الوصف 1',
    icon: 'Scale',
    totalQuestions: 4,
    lessons: [
      { id: 'l1', titleDE: 'Lektion 1', isCompleted: false, orderIndex: 1 },
      { id: 'l2', titleDE: 'Lektion 2', isCompleted: false, orderIndex: 2 },
    ],
  },
  {
    id: 'm2',
    titleDE: 'Modul 2',
    titleAR: 'الوحدة 2',
    descriptionDE: 'Beschreibung Modul 2',
    descriptionAR: 'الوصف 2',
    icon: 'Shield',
    totalQuestions: 1,
    lessons: [{ id: 'l3', titleDE: 'Lektion 3', isCompleted: false, orderIndex: 1 }],
  },
];

const questions: Question[] = [
  {
    id: 'q1',
    moduleId: 'm1',
    lessonId: 'l1',
    textDE: 'Frage 1',
    type: QuestionType.SINGLE_CHOICE,
    answers: [],
    explanationDE: 'Erklärung 1',
    global_order_index: 1,
  },
  {
    id: 'q2',
    moduleId: 'm1',
    lessonId: 'l1',
    textDE: 'Frage 2',
    type: QuestionType.SINGLE_CHOICE,
    answers: [],
    explanationDE: 'Erklärung 2',
    global_order_index: 2,
  },
  {
    id: 'q3',
    moduleId: 'm1',
    lessonId: 'l2',
    textDE: 'Frage 3',
    type: QuestionType.SINGLE_CHOICE,
    answers: [],
    explanationDE: 'Erklärung 3',
    global_order_index: 3,
  },
  {
    id: 'q4',
    moduleId: 'm1',
    textDE: 'Allgemeine Frage',
    type: QuestionType.SINGLE_CHOICE,
    answers: [],
    explanationDE: 'Erklärung 4',
    global_order_index: 4,
  },
  {
    id: 'q5',
    moduleId: 'm2',
    lessonId: 'l3',
    textDE: 'Frage 5',
    type: QuestionType.SINGLE_CHOICE,
    answers: [],
    explanationDE: 'Erklärung 5',
    global_order_index: 1,
  },
];

const baseProgress: UserProgress = {
  answeredQuestions: {},
  completedLessons: {},
  bookmarks: [],
  flashcardProgress: {},
};

const plan: Lernplan = {
  version: 1,
  generatedAt: '2026-04-07T10:00:00.000Z',
  examDate: '2026-05-12',
  isDated: true,
  intensity: 'moderate',
  nodes: [
    {
      id: 'node-m1',
      moduleId: 'm1',
      moduleTitle: 'Modul 1',
      moduleDescription: 'Beschreibung Modul 1',
      moduleIcon: 'Scale',
      estimatedMinutes: 8,
      weekLabel: 'Woche 1',
      dateRange: '07.04 – 13.04',
      tasks: [
        { type: 'lessons', label: '2 Lektionen lesen', target: 2, moduleId: 'm1' },
        { type: 'questions', label: '4 Fragen beantworten', target: 4, moduleId: 'm1' },
      ],
    },
    {
      id: 'node-m2',
      moduleId: 'm2',
      moduleTitle: 'Modul 2',
      moduleDescription: 'Beschreibung Modul 2',
      moduleIcon: 'Shield',
      estimatedMinutes: 3,
      weekLabel: 'Woche 2',
      dateRange: '14.04 – 20.04',
      tasks: [
        { type: 'lessons', label: '1 Lektion lesen', target: 1, moduleId: 'm2' },
        { type: 'questions', label: '1 Frage beantworten', target: 1, moduleId: 'm2' },
      ],
    },
    {
      id: 'node-exam',
      moduleId: 'exam',
      moduleTitle: 'Prüfungssimulation',
      moduleIcon: 'GraduationCap',
      weekLabel: 'Woche 2',
      dateRange: '14.04 – 20.04',
      tasks: [{ type: 'exam', label: 'Prüfungssimulation durchführen', target: 1 }],
    },
  ],
};

function getNode(moduleId: string): LernplanNode {
  const node = plan.nodes.find(item => item.moduleId === moduleId);
  if (!node) {
    throw new Error(`Node ${moduleId} not found`);
  }
  return node;
}

describe('lernplanGenerator helpers', () => {
  it('calculates global summary stats and quiz quote from answered questions only', () => {
    const stats = getPlanSummaryStats(modules, questions, {
      ...baseProgress,
      completedLessons: { l1: true, l3: true },
      answeredQuestions: { q1: true, q2: false, q5: true, invalid: true },
    });

    expect(stats.completedLessons).toBe(2);
    expect(stats.totalLessons).toBe(3);
    expect(stats.answeredQuestions).toBe(3);
    expect(stats.totalQuestions).toBe(5);
    expect(stats.correctAnswers).toBe(2);
    expect(stats.quizAccuracy).toBe(67);
  });

  it('keeps wrongly answered questions open and calculates remaining minutes from open work', () => {
    const result = computeNodeStatusesWithModules(plan, modules, questions, {
      ...baseProgress,
      completedLessons: { l1: true },
      answeredQuestions: { q1: true, q2: false },
    });

    const currentNode = result.nodes.find(node => node.moduleId === 'm1');
    expect(currentNode?.status).toBe('current');
    expect(currentNode?.remainingMinutes).toBe(5);
    expect(currentNode?.questionStats?.correct).toBe(1);
    expect(currentNode?.questionStats?.answered).toBe(2);
    expect(currentNode?.questionStats?.accuracy).toBe(50);
  });

  it('groups dated plans into week sections and keeps undated plans in one open list', () => {
    const nodesWithStatus = computeNodeStatusesWithModules(plan, modules, questions, baseProgress).nodes;
    const datedSections = buildLernplanSections(plan, nodesWithStatus);

    expect(datedSections).toHaveLength(2);
    expect(datedSections[0].label).toBe('Woche 1');
    expect(datedSections[0].isOpenByDefault).toBe(true);
    expect(datedSections[1].isOpenByDefault).toBe(false);

    const undatedSections = buildLernplanSections(
      { ...plan, isDated: false, examDate: null, intensity: 'undated' },
      nodesWithStatus,
    );

    expect(undatedSections).toHaveLength(1);
    expect(undatedSections[0].label).toBe('Lernplan');
    expect(undatedSections[0].isOpenByDefault).toBe(true);
  });

  it('resolves resume targets in module order: lesson, lesson question, later lesson, general question, fallback', () => {
    const step1 = resolveResumeTargetForNode(getNode('m1'), modules, questions, baseProgress);
    expect(step1.type).toBe('lesson');
    expect(step1.path).toBe('/learn/m1/lesson/l1');

    const step2 = resolveResumeTargetForNode(getNode('m1'), modules, questions, {
      ...baseProgress,
      completedLessons: { l1: true },
    });
    expect(step2.type).toBe('question');
    expect(step2.path).toContain('single=q1');

    const step3 = resolveResumeTargetForNode(getNode('m1'), modules, questions, {
      ...baseProgress,
      completedLessons: { l1: true },
      answeredQuestions: { q1: true, q2: true },
    });
    expect(step3.type).toBe('lesson');
    expect(step3.path).toBe('/learn/m1/lesson/l2');

    const step4 = resolveResumeTargetForNode(getNode('m1'), modules, questions, {
      ...baseProgress,
      completedLessons: { l1: true, l2: true },
      answeredQuestions: { q1: true, q2: true, q3: true },
    });
    expect(step4.type).toBe('question');
    expect(step4.path).toContain('single=q4');

    const step5 = resolveResumeTargetForNode(getNode('m1'), modules, questions, {
      ...baseProgress,
      completedLessons: { l1: true, l2: true },
      answeredQuestions: { q1: true, q2: true, q3: true, q4: true },
    });
    expect(step5.type).toBe('module');
    expect(step5.path).toBe('/learn/m1');
  });

  it('returns the exam route for the exam node', () => {
    const target = resolveResumeTargetForNode(plan.nodes[2], modules, questions, baseProgress);
    expect(target.type).toBe('exam');
    expect(target.path).toBe('/exam');
  });
});
