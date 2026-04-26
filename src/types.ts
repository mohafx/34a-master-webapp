export enum QuestionType {
  SINGLE_CHOICE = 'SINGLE_CHOICE',
  MULTIPLE_CHOICE = 'MULTIPLE_CHOICE'
}

export interface Flashcard {
  id: string;
  moduleId: string;
  lessonId?: string;
  orderIndex: number;
  questionDE: string;
  questionAR?: string;
  answerDE: string;
  answerAR?: string;
  hintDE?: string;
  hintAR?: string;
}

export interface Answer {
  id: string;
  textDE: string;
  textAR?: string;
  isCorrect: boolean;
}

export interface Question {
  id: string;
  moduleId: string;
  lessonId?: string;
  anchorId?: string;
  textDE: string;
  textAR?: string;
  type: QuestionType;
  answers: Answer[];
  explanationDE: string;
  explanationAR?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  orderIndex?: number;
  global_order_index?: number;
  isFree?: boolean;
  quality_check?: any;
  reviewed?: boolean;
  updated_at?: string;
}

export interface Lesson {
  id: string;
  titleDE: string;
  titleAR?: string;
  isCompleted: boolean; // In a real app, this would be user-specific
  isLocked?: boolean; // Indicates if the lesson is locked (not yet available)
  isInteractive?: boolean; // Indicates if the lesson has interactive screens
  orderIndex?: number; // Order of the lesson within the module
  imageUrl?: string;
  imageStatus?: 'none' | 'queued' | 'in_progress' | 'generated' | 'failed';
  imageStyleCode?: string;
}

export interface Module {
  id: string;
  titleDE: string;
  titleAR?: string;
  descriptionDE: string;
  descriptionAR?: string;
  icon: string; // Lucide icon name
  totalQuestions: number;
  lessons: Lesson[];
}

export interface UserProgress {
  answeredQuestions: Record<string, boolean>; // questionId -> isCorrect
  completedLessons: Record<string, boolean>; // lessonId -> isCompleted
  bookmarks: string[]; // questionIds
  flashcardProgress: Record<string, boolean>; // flashcardId -> known
  streak?: number;
}

export interface UserSettings {
  cardSize?: 'normal' | 'large' | 'small' | 'smaller';
  showLanguageToggle?: boolean;
  darkMode?: boolean;
  autoTheme?: boolean; // Automatically follow system light/dark mode
}

export interface User {
  name: string;
  isLoggedIn: boolean;
  settings?: UserSettings;
}

export enum AppLanguage {
  DE = 'DE',
  DE_AR = 'DE_AR'
}

// ========== WRITTEN EXAM TYPES ==========

export interface WrittenExamQuestion {
  id: string;
  topic: string;
  questionTextDE: string;
  questionTextAR?: string;
  answers: {
    A: { de: string; ar?: string };
    B: { de: string; ar?: string };
    C: { de: string; ar?: string };
    D: { de: string; ar?: string };
    E?: { de: string; ar?: string };
    F?: { de: string; ar?: string };
  };
  correctAnswer: string; // 'A', 'B', 'C', 'D', 'E', 'F' or combinations for Multiple Choice
  explanationDE?: string;
  explanationAR?: string;
}

export interface WrittenExamSession {
  id: string;
  userId: string;
  questionIds: string[];
  userAnswers: Record<string, string>;
  startedAt: string;
  completedAt?: string;
  timeLimitMinutes: number;
  score?: number;
  totalQuestions: number;
  examType?: 'full' | 'mini';
}

// Topic distribution constants for full exam (82 questions)
export const TOPIC_DISTRIBUTION = {
  'Öffentliche Sicherheit und Ordnung': 7,
  'Gewerberecht': 5,
  'Datenschutz': 5,
  'BGB': 13,
  'Strafrecht': 13,
  'Umgang mit Menschen': 19,
  'Waffenrecht': 5,
  'Sicherheitstechnik': 7,
  'DGUV': 8
} as const;

// Topic distribution for mini exam (16 questions) - proportional to full exam
export const MINI_EXAM_TOPIC_DISTRIBUTION = {
  'Öffentliche Sicherheit und Ordnung': 1,
  'Gewerberecht': 1,
  'Datenschutz': 1,
  'BGB': 3,
  'Strafrecht': 3,
  'Umgang mit Menschen': 4,
  'Waffenrecht': 1,
  'Sicherheitstechnik': 1,
  'DGUV': 1
} as const;

export type WrittenExamTopic = keyof typeof TOPIC_DISTRIBUTION;
