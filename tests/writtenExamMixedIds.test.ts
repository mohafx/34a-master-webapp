import { describe, expect, it, vi } from 'vitest';

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn()
}));

vi.mock('../src/lib/supabase', () => ({
  supabase: mockSupabase
}));

const { db } = await import('../src/services/database');

type LoadedQuestion = {
  id: string;
  topic: string;
  questionTextDE: string;
  correctAnswer: string;
};

function makeWrittenRow(id: string) {
  return {
    id,
    topic: 'BGB',
    question_text_de: 'Schriftliche Frage',
    question_text_ar: null,
    answer_a_de: 'A',
    answer_a_ar: null,
    answer_b_de: 'B',
    answer_b_ar: null,
    answer_c_de: 'C',
    answer_c_ar: null,
    answer_d_de: 'D',
    answer_d_ar: null,
    answer_e_de: null,
    answer_e_ar: null,
    answer_f_de: null,
    answer_f_ar: null,
    correct_answer: 'A',
    explanation_de: 'Erklärung',
    explanation_ar: null
  };
}

function makePracticeRow(id: string) {
  return {
    id,
    text_de: 'Normale Frage',
    text_ar: null,
    answer_a_de: 'A',
    answer_a_ar: null,
    answer_b_de: 'B',
    answer_b_ar: null,
    answer_c_de: 'C',
    answer_c_ar: null,
    answer_d_de: 'D',
    answer_d_ar: null,
    answer_e_de: null,
    answer_e_ar: null,
    answer_f_de: null,
    answer_f_ar: null,
    correct_answer: 'B,C',
    explanation_de: 'Erklärung',
    explanation_ar: null,
    modules: { title_de: 'Datenschutzrecht' }
  };
}

describe('written exam mixed question id loading', () => {
  it('loads written exam IDs and source-qualified practice IDs in the requested order', async () => {
    mockSupabase.from.mockImplementation((table: string) => ({
      select: () => ({
        in: async () => {
          if (table === 'written_exam_questions') {
            return { data: [makeWrittenRow('written-1')], error: null };
          }
          if (table === 'questions') {
            return { data: [makePracticeRow('practice-1')], error: null };
          }
          return { data: [], error: null };
        }
      })
    }));

    const questions = await db.getWrittenExamQuestionsByIds(['question:practice-1', 'written-1']) as LoadedQuestion[];

    expect(questions.map(q => q.id)).toEqual(['practice-1', 'written-1']);
    expect(questions[0].topic).toBe('Datenschutz');
    expect(questions[0].questionTextDE).toBe('Normale Frage');
    expect(questions[0].correctAnswer).toBe('B,C');
    expect(questions[1].topic).toBe('BGB');
    expect(questions[1].questionTextDE).toBe('Schriftliche Frage');
  });

  it('keeps legacy sessions with raw written exam UUIDs loadable', async () => {
    mockSupabase.from.mockImplementation((table: string) => ({
      select: () => ({
        in: async () => {
          if (table === 'written_exam_questions') {
            return { data: [makeWrittenRow('legacy-written')], error: null };
          }
          return { data: [], error: null };
        }
      })
    }));

    const questions = await db.getWrittenExamQuestionsByIds(['legacy-written']) as LoadedQuestion[];

    expect(questions).toHaveLength(1);
    expect(questions[0].id).toBe('legacy-written');
    expect(questions[0].correctAnswer).toBe('A');
  });
});
