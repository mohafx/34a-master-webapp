import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { db } from '../services/database';
import { Module, Question, QuestionType, Answer } from '../types';
import { useAuth } from './AuthContext';
import { useSubscription } from './SubscriptionContext';

interface DataCacheContextType {
  modules: Module[];
  questions: Question[];
  flashcards: any[]; // Or define Flashcard here, but for brevity using any
  loading: boolean;
  loadingStatus: string;
  error: string | null;
  getModuleById: (id: string) => Module | undefined;
  getQuestionsByModule: (moduleId: string) => Question[];
  getFlashcardsByModule: (moduleId: string) => any[];
  getAccessibleQuestions: (moduleId: string, isPremium: boolean) => Question[];
  refreshData: () => Promise<void>;
}

const DataCacheContext = createContext<DataCacheContextType | undefined>(undefined);

// Helper to get first lesson ID for each module
function getFirstLessonIds(modules: Module[]): Set<string> {
  const firstLessonIds = new Set<string>();
  for (const mod of modules) {
    const lessons = mod.lessons || [];
    if (lessons.length > 0) {
      // Sort by orderIndex to ensure we get the actual first lesson
      const sortedLessons = [...lessons].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
      firstLessonIds.add(sortedLessons[0].id);
    }
  }
  return firstLessonIds;
}

export function DataCacheProvider({ children }: { children: ReactNode }) {
  const { loading: authLoading } = useAuth();
  const { loading: subscriptionLoading, isPremium } = useSubscription();
  const [modules, setModules] = useState<Module[]>([]);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]); // All questions from DB
  const [questions, setQuestions] = useState<Question[]>([]); // All questions (no filtering)
  const [allFlashcards, setAllFlashcards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState('Initialisiere...');
  const [error, setError] = useState<string | null>(null);

  // localStorage cache keys
  const CACHE_KEY_MODULES = '34a_cache_modules';
  const CACHE_KEY_QUESTIONS = '34a_cache_questions';
  const CACHE_KEY_FLASHCARDS = '34a_cache_flashcards';
  const CACHE_TIMESTAMP_KEY = '34a_cache_timestamp';
  const CACHE_MAX_AGE_MS = 1000 * 60 * 60; // 1 hour cache validity

  const loadFromCache = (): { modules: Module[] | null; questions: Question[] | null; flashcards: any[] | null } => {
    try {
      const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
      if (!timestamp) return { modules: null, questions: null, flashcards: null };

      const cacheAge = Date.now() - parseInt(timestamp, 10);
      if (cacheAge > CACHE_MAX_AGE_MS) {
        console.log('📦 [DataCache] Cache expired, will refresh');
        return { modules: null, questions: null, flashcards: null };
      }

      const modulesStr = localStorage.getItem(CACHE_KEY_MODULES);
      const questionsStr = localStorage.getItem(CACHE_KEY_QUESTIONS);
      const flashcardsStr = localStorage.getItem(CACHE_KEY_FLASHCARDS);

      if (modulesStr && questionsStr && flashcardsStr) {
        console.log('⚡ [DataCache] Loading from localStorage cache');
        return {
          modules: JSON.parse(modulesStr),
          questions: JSON.parse(questionsStr),
          flashcards: JSON.parse(flashcardsStr)
        };
      }
    } catch (e) {
      console.warn('Cache read error:', e);
    }
    return { modules: null, questions: null, flashcards: null };
  };

  const saveToCache = (modules: Module[], questions: Question[], flashcards: any[]) => {
    try {
      localStorage.setItem(CACHE_KEY_MODULES, JSON.stringify(modules));
      localStorage.setItem(CACHE_KEY_QUESTIONS, JSON.stringify(questions));
      localStorage.setItem(CACHE_KEY_FLASHCARDS, JSON.stringify(flashcards));
      localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
      console.log('💾 [DataCache] Saved to localStorage cache');
    } catch (e) {
      console.warn('Cache write error (quota?):', e);
    }
  };

  const mapQuestions = (questionsData: any[]): Question[] => {
    return questionsData.map((q: any) => ({
      id: q.id,
      moduleId: q.module_id,
      lessonId: q.lesson_id,
      textDE: q.text_de,
      textAR: q.text_ar,
      type: q.type === 'MULTIPLE_CHOICE' ? QuestionType.MULTIPLE_CHOICE : QuestionType.SINGLE_CHOICE,
      answers: (q.answers || []).map((a: any) => ({
        id: a.id,
        textDE: a.text_de || a.textDE,
        textAR: a.text_ar || a.textAR,
        isCorrect: a.is_correct ?? a.isCorrect
      })),
      explanationDE: q.explanation_de || '',
      explanationAR: q.explanation_ar,
      difficulty: q.difficulty,
      orderIndex: q.order_index ?? 0,
      global_order_index: q.global_order_index ?? undefined,
      isFree: q.is_free === true || q.isFree === true,
      quality_check: q.quality_check ?? null,
      reviewed: q.reviewed ?? false,
      updated_at: q.updated_at ?? null
    }));
  };

  const loadAllData = async () => {
    const startTime = Date.now();
    console.log('🚀 [DataCache] Starting data load...');

    // 1. Try to load from cache FIRST for instant UI
    const cached = loadFromCache();
    // If we have cache AND user is NOT premium (or status didn't change), use it.
    // BUT if user IS premium, we might need to check if cache is "full" or "partial".
    // For simplicity: If cached data count is low (< 100) but User IS Premium, we force refresh.
    // Otherwise use cache.

    const seemsPartial = cached.questions && cached.questions.length < 100;
    const shouldIgnoreCache = isPremium && seemsPartial;

    if (!shouldIgnoreCache && cached.modules && cached.questions && cached.flashcards) {
      setModules(cached.modules);
      setAllQuestions(cached.questions);
      setQuestions(cached.questions);
      setAllFlashcards(cached.flashcards);
      setLoadingStatus('Aus Cache geladen');
      setLoading(false);
      console.log(`⚡ [DataCache] Cache loaded in ${Date.now() - startTime}ms`);

      // 2. Refresh in background (don't wait)
      refreshFromNetwork(true).catch(err => console.warn('Background refresh failed:', err));
      return;
    }

    // No cache - load from network
    await refreshFromNetwork();
  };

  const refreshFromNetwork = async (silent: boolean = false) => {
    const startTime = Date.now();

    try {
      if (!silent) setLoading(true);
      setError(null);
      setLoadingStatus('Lade Daten...');

      // PARALLEL loading - everything at the same time!
      console.log('🌐 [DataCache] Loading modules + questions + flashcards in parallel...');
      const [modulesData, questionsData, previewData, flashcardsData, previewFlashcards] = await Promise.all([
        db.getModules(),
        db.getAllQuestions(),
        db.getQuestionsPreview(),
        db.getAllFlashcards(),
        db.getFlashcardsPreview()
      ]);

      console.log(`✅ [DataCache] Parallel load complete in ${Date.now() - startTime}ms`);
      console.log(`   Modules: ${modulesData.length}, Full Questions: ${questionsData.length}, Preview Questions: ${previewData.length}`);
      console.log(`   Full Flashcards: ${flashcardsData.length}, Preview Flashcards: ${previewFlashcards.length}`);

      setLoadingStatus('Verarbeite Daten...');

      const mappedFullQuestions = mapQuestions(questionsData);

      // Merge Strategy: Start with Preview (Skeleton), overwrite with Full (if available)
      const mergedQuestions = previewData.map((p: any) => {
        const fullVersion = mappedFullQuestions.find(f => f.id === p.id);
        if (fullVersion) {
          return fullVersion; // This one has answers and correct solution
        }
        // Otherwise use preview version (No answers, effectively locked)
        return {
          id: p.id,
          moduleId: p.moduleId,
          lessonId: p.lessonId,
          textDE: p.textDE,
          textAR: p.textAR,
          type: p.type,
          difficulty: p.difficulty,
          orderIndex: p.orderIndex,
          global_order_index: p.global_order_index,
          answers: [], // LOCKED / HIDDEN
          explanationDE: '',
          explanationAR: '',
          isFree: p.is_free || p.isFree || false
        };
      });

      console.log(`   Merged Questions: ${mergedQuestions.length} (Visible in UI)`);

      // Merge Flashcards Strategy
      const mergedFlashcards = previewFlashcards.map((p: any) => {
        const fullVersion = flashcardsData.find((f: any) => f.id === p.id);
        if (fullVersion) {
          return fullVersion;
        }
        // Otherwise use preview version (No answers, effectively locked)
        return {
          id: p.id,
          moduleId: p.moduleId,
          lessonId: p.lessonId,
          orderIndex: p.orderIndex,
          questionDE: p.questionDE,
          questionAR: p.questionAR,
          answerDE: '', // LOCKED
          answerAR: '',
          hintDE: '',
          hintAR: ''
        };
      });
      console.log(`   Merged Flashcards: ${mergedFlashcards.length} (Visible in UI)`);

      setModules(modulesData);
      setAllQuestions(mergedQuestions);
      setQuestions(mergedQuestions);
      setAllFlashcards(mergedFlashcards); // Update with merged

      // Save to cache for next time
      saveToCache(modulesData, mergedQuestions, mergedFlashcards);

      setLoadingStatus('Fertig!');
      console.log(`✨ [DataCache] Total time: ${Date.now() - startTime}ms`);

    } catch (err: any) {
      const errorMessage = err?.message || 'Unbekannter Fehler';
      console.error('❌ [DataCache] Error loading data:', errorMessage);
      setLoadingStatus('Fehler aufgetreten');
      setError(`Fehler beim Laden der Daten: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // Wait for auth AND subscription to finish loading before loading data
  useEffect(() => {
    if (!authLoading && !subscriptionLoading) {
      loadAllData();
    }
  }, [authLoading, subscriptionLoading, isPremium]); // Re-run if isPremium changes

  // No filtering in cache - access control is done at UI level
  // This ensures all lessons are always displayed

  const getModuleById = (id: string) => modules.find(m => m.id === id);

  const getQuestionsByModule = (moduleId: string) =>
    questions.filter(q => q.moduleId === moduleId);

  const getFlashcardsByModule = (moduleId: string) =>
    allFlashcards.filter(f => f.moduleId === moduleId);

  // Helper to get accessible questions for a module based on premium status
  // This is used by components that need to know which questions are accessible
  const getAccessibleQuestions = (moduleId: string, userIsPremium: boolean): Question[] => {
    return allQuestions.filter(q => q.moduleId === moduleId);
  };

  const refreshData = async () => {
    await loadAllData();
  };

  return (
    <DataCacheContext.Provider value={{
      modules,
      questions,
      flashcards: allFlashcards,
      loading,
      loadingStatus,
      error,
      getModuleById,
      getQuestionsByModule,
      getFlashcardsByModule,
      getAccessibleQuestions,
      refreshData
    }}>
      {children}
    </DataCacheContext.Provider>
  );
}

export function useDataCache() {
  const context = useContext(DataCacheContext);
  if (!context) {
    throw new Error('useDataCache must be used within a DataCacheProvider');
  }
  return context;
}






