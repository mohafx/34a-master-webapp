import { describe, expect, it, vi } from 'vitest';
import { FULL_EXAM_TOPIC_POINT_DISTRIBUTION } from '../src/types';

const mockDb = vi.hoisted(() => ({
  getRecentWrittenExamQuestionIds: vi.fn(),
  getWrittenExamQuestionsByTopic: vi.fn(),
  getPracticeQuestionsForWrittenExamTopic: vi.fn()
}));

vi.mock('../src/services/database', () => ({
  db: mockDb
}));

const { generateExamQuestions, selectExamQuestionsByType } = await import('../src/services/writtenExam');

function makeQuestion(id: string, topic: string, correctAnswer: string, source: 'written' | 'question' = 'written') {
  return {
    id,
    topic,
    questionTextDE: `Frage ${id}`,
    answers: {
      A: { de: 'Antwort A' },
      B: { de: 'Antwort B' },
      C: { de: 'Antwort C' },
      D: { de: 'Antwort D' }
    },
    correctAnswer,
    source
  };
}

describe('written exam question selection', () => {
  it('prefers fresh written questions, then fresh practice questions, before repeated questions', () => {
    const candidates = [
      makeQuestion('repeated-written', 'BGB', 'A', 'written'),
      makeQuestion('fresh-practice', 'BGB', 'A', 'question'),
      makeQuestion('fresh-written', 'BGB', 'A', 'written')
    ];

    const selected = selectExamQuestionsByType(
      candidates,
      2,
      new Set(['written:repeated-written'])
    );

    expect(selected.map(q => q.id).sort()).toEqual(['fresh-practice', 'fresh-written']);
  });

  it('detects source-qualified practice questions in recent history', () => {
    const candidates = [
      makeQuestion('repeated-practice', 'BGB', 'A', 'question'),
      makeQuestion('fresh-practice', 'BGB', 'A', 'question')
    ];

    const selected = selectExamQuestionsByType(
      candidates,
      1,
      new Set(['question:repeated-practice'])
    );

    expect(selected.map(q => q.id)).toEqual(['fresh-practice']);
  });

  it('generates exactly 82 questions while preserving the official single/multiple distribution', async () => {
    mockDb.getRecentWrittenExamQuestionIds.mockResolvedValue(['written-used-single-0', 'question:practice-used-multiple-0']);
    mockDb.getWrittenExamQuestionsByTopic.mockImplementation(async (topic: string) => {
      const config = FULL_EXAM_TOPIC_POINT_DISTRIBUTION[topic as keyof typeof FULL_EXAM_TOPIC_POINT_DISTRIBUTION];
      return [
        ...Array.from({ length: config.single + 2 }, (_, index) => makeQuestion(`${topic}-written-single-${index}`, topic, 'A')),
        ...Array.from({ length: config.multiple + 2 }, (_, index) => makeQuestion(`${topic}-written-multiple-${index}`, topic, 'A,B'))
      ];
    });
    mockDb.getPracticeQuestionsForWrittenExamTopic.mockImplementation(async (topic: string) => {
      const config = FULL_EXAM_TOPIC_POINT_DISTRIBUTION[topic as keyof typeof FULL_EXAM_TOPIC_POINT_DISTRIBUTION];
      return [
        ...Array.from({ length: config.single + 2 }, (_, index) => makeQuestion(`${topic}-practice-single-${index}`, topic, 'A')),
        ...Array.from({ length: config.multiple + 2 }, (_, index) => makeQuestion(`${topic}-practice-multiple-${index}`, topic, 'A,B'))
      ];
    });

    const ids = await generateExamQuestions('user-1');

    expect(ids).toHaveLength(82);
    expect(ids.every(id => !id.startsWith('question:'))).toBe(true);

    for (const [topic, config] of Object.entries(FULL_EXAM_TOPIC_POINT_DISTRIBUTION)) {
      const topicIds = ids.filter(id => id.startsWith(`${topic}-`));
      expect(topicIds).toHaveLength(config.questions);
      expect(topicIds.filter(id => id.includes('-single-'))).toHaveLength(config.single);
      expect(topicIds.filter(id => id.includes('-multiple-'))).toHaveLength(config.multiple);
    }
  });

  it('uses fresh practice questions before repeating written questions from recent history', async () => {
    mockDb.getRecentWrittenExamQuestionIds.mockResolvedValue([]);
    mockDb.getWrittenExamQuestionsByTopic.mockImplementation(async (topic: string) => {
      const config = FULL_EXAM_TOPIC_POINT_DISTRIBUTION[topic as keyof typeof FULL_EXAM_TOPIC_POINT_DISTRIBUTION];
      return [
        ...Array.from({ length: config.single }, (_, index) => makeQuestion(`${topic}-written-single-${index}`, topic, 'A')),
        ...Array.from({ length: config.multiple }, (_, index) => makeQuestion(`${topic}-written-multiple-${index}`, topic, 'A,B'))
      ];
    });
    mockDb.getPracticeQuestionsForWrittenExamTopic.mockImplementation(async (topic: string) => {
      const config = FULL_EXAM_TOPIC_POINT_DISTRIBUTION[topic as keyof typeof FULL_EXAM_TOPIC_POINT_DISTRIBUTION];
      return [
        ...Array.from({ length: config.single }, (_, index) => makeQuestion(`${topic}-practice-single-${index}`, topic, 'A', 'question')),
        ...Array.from({ length: config.multiple }, (_, index) => makeQuestion(`${topic}-practice-multiple-${index}`, topic, 'A,B', 'question'))
      ];
    });

    const repeatedIds = Object.entries(FULL_EXAM_TOPIC_POINT_DISTRIBUTION).flatMap(([topic, config]) => [
      ...Array.from({ length: config.single }, (_, index) => `${topic}-written-single-${index}`),
      ...Array.from({ length: config.multiple }, (_, index) => `${topic}-written-multiple-${index}`)
    ]);
    mockDb.getRecentWrittenExamQuestionIds.mockResolvedValue(repeatedIds);

    const ids = await generateExamQuestions('user-1');

    expect(ids).toHaveLength(82);
    expect(ids.every(id => id.startsWith('question:'))).toBe(true);
  });
});
