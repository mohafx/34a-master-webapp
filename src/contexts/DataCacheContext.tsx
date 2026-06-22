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
  fullDataLoading: boolean;
  fullDataReady: boolean;
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
  const { loading: subscriptionLoading } = useSubscription();
  const [modules, setModules] = useState<Module[]>([]);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]); // All questions from DB
  const [questions, setQuestions] = useState<Question[]>([]); // All questions (no filtering)
  const [allFlashcards, setAllFlashcards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fullDataLoading, setFullDataLoading] = useState(false);
  const [fullDataReady, setFullDataReady] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('Initialisiere...');
  const [error, setError] = useState<string | null>(null);

  // localStorage cache keys
  const CACHE_SCHEMA_VERSION = 'v5';
  const CACHE_KEY_MODULES = `34a_cache_${CACHE_SCHEMA_VERSION}_modules`;
  const CACHE_KEY_QUESTIONS = `34a_cache_${CACHE_SCHEMA_VERSION}_questions`;
  const CACHE_KEY_FLASHCARDS = `34a_cache_${CACHE_SCHEMA_VERSION}_flashcards`;
  const CACHE_KEY_FULL_READY = `34a_cache_${CACHE_SCHEMA_VERSION}_full_ready`;
  const CACHE_TIMESTAMP_KEY = `34a_cache_${CACHE_SCHEMA_VERSION}_timestamp`;
  const CACHE_MAX_AGE_MS = 1000 * 60 * 60; // 1 hour cache validity

  const loadFromCache = (): { modules: Module[] | null; questions: Question[] | null; flashcards: any[] | null; fullDataReady: boolean } => {
    try {
      const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
      if (!timestamp) return { modules: null, questions: null, flashcards: null, fullDataReady: false };

      const cacheAge = Date.now() - parseInt(timestamp, 10);
      if (cacheAge > CACHE_MAX_AGE_MS) {
        console.log('📦 [DataCache] Cache expired, will refresh');
        return { modules: null, questions: null, flashcards: null, fullDataReady: false };
      }

      const modulesStr = localStorage.getItem(CACHE_KEY_MODULES);
      const questionsStr = localStorage.getItem(CACHE_KEY_QUESTIONS);
      const flashcardsStr = localStorage.getItem(CACHE_KEY_FLASHCARDS);
      const cachedFullDataReady = localStorage.getItem(CACHE_KEY_FULL_READY) === 'true';

      if (modulesStr && questionsStr && flashcardsStr) {
        console.log('⚡ [DataCache] Loading from localStorage cache');
        return {
          modules: JSON.parse(modulesStr),
          questions: JSON.parse(questionsStr),
          flashcards: JSON.parse(flashcardsStr),
          fullDataReady: cachedFullDataReady
        };
      }
    } catch (e) {
      console.warn('Cache read error:', e);
    }
    return { modules: null, questions: null, flashcards: null, fullDataReady: false };
  };

  const saveToCache = (modules: Module[], questions: Question[], flashcards: any[], cacheHasFullData: boolean) => {
    try {
      localStorage.setItem(CACHE_KEY_MODULES, JSON.stringify(modules));
      localStorage.setItem(CACHE_KEY_QUESTIONS, JSON.stringify(questions));
      localStorage.setItem(CACHE_KEY_FLASHCARDS, JSON.stringify(flashcards));
      localStorage.setItem(CACHE_KEY_FULL_READY, cacheHasFullData ? 'true' : 'false');
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
      explanationImageUrl: q.question_explanation_image_url || q.explanationImageUrl,
      explanationImageAltDE: q.question_explanation_image_alt_de || q.explanationImageAltDE,
      difficulty: q.difficulty,
      orderIndex: q.order_index ?? 0,
      global_order_index: q.global_order_index ?? undefined,
      isFree: q.is_free === true || q.isFree === true,
      quality_check: q.quality_check ?? null,
      reviewed: q.reviewed ?? false,
      updated_at: q.updated_at ?? null
    }));
  };

  const mergeQuestions = (previewData: any[], questionsData: any[]): Question[] => {
    const mappedFullQuestions = mapQuestions(questionsData);
    const fullById = new Map(mappedFullQuestions.map(question => [question.id, question]));

    return previewData.map((p: any) => {
      const fullVersion = fullById.get(p.id);
      if (fullVersion) {
        return fullVersion;
      }

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
        answers: [],
        explanationDE: '',
        explanationAR: '',
        explanationImageUrl: p.question_explanation_image_url || p.explanationImageUrl,
        explanationImageAltDE: p.question_explanation_image_alt_de || p.explanationImageAltDE,
        isFree: p.is_free || p.isFree || false,
        quality_check: p.quality_check ?? null,
        reviewed: p.reviewed ?? false,
        updated_at: p.updated_at ?? null
      };
    });
  };

  const mergeFlashcards = (previewFlashcards: any[], flashcardsData: any[]): any[] => {
    const fullById = new Map(flashcardsData.map((flashcard: any) => [flashcard.id, flashcard]));

    return previewFlashcards.map((p: any) => {
      const fullVersion = fullById.get(p.id);
      if (fullVersion) {
        return fullVersion;
      }

      return {
        id: p.id,
        moduleId: p.moduleId,
        lessonId: p.lessonId,
        orderIndex: p.orderIndex,
        questionDE: p.questionDE,
        questionAR: p.questionAR,
        answerDE: '',
        answerAR: '',
        hintDE: '',
        hintAR: ''
      };
    });
  };

  const loadAllData = async () => {
    const startTime = Date.now();
    console.log('🚀 [DataCache] Starting data load...');

    // 1. Try to load from cache FIRST for instant UI
    const cached = loadFromCache();

    if (cached.modules && cached.questions && cached.flashcards) {
      setModules(cached.modules);
      setAllQuestions(cached.questions);
      setQuestions(cached.questions);
      setAllFlashcards(cached.flashcards);
      setFullDataReady(cached.fullDataReady);
      setFullDataLoading(!cached.fullDataReady);
      console.log('[DEBUG] App loading state:', { authLoading, dataLoading: loading, subscriptionLoading, dataError: error });
      setLoading(false);
      console.log(`⚡ [DataCache] Cache loaded in ${Date.now() - startTime}ms`, { 
        modules: cached.modules?.length, 
        questions: cached.questions?.length, 
        flashcards: cached.flashcards?.length 
      });

      // 2. Refresh in background (don't wait)
      refreshFromNetwork(true, !cached.fullDataReady).catch(err => console.warn('Background refresh failed:', err));
      return;
    }

    // No cache - load from network
    await refreshFromNetwork();
  };

  const refreshFromNetwork = async (silent: boolean = false, applyPreviewState: boolean = true) => {
    const startTime = Date.now();

    try {
      if (!silent) setLoading(true);
      setError(null);
      setLoadingStatus('Lade Basisdaten...');

      const TIMEOUT_MS = 60000;
      const withTimeout = <T,>(promise: Promise<T>): Promise<T> =>
        Promise.race([
          promise,
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error('Datenbank-Timeout nach 60 Sekunden')), TIMEOUT_MS)
          )
        ]);

      console.log('🌐 [DataCache] Loading preview data...');
      const [modulesData, previewData, previewFlashcards] = await withTimeout(
        Promise.all([
          db.getModules(),
          db.getQuestionsPreview(),
          db.getFlashcardsPreview()
        ])
      );

      console.log(`✅ [DataCache] Preview load complete in ${Date.now() - startTime}ms`);
      console.log(`   Modules: ${modulesData.length}, Preview Questions: ${previewData.length}, Preview Flashcards: ${previewFlashcards.length}`);

      setLoadingStatus('Verarbeite Daten...');

      const previewQuestions = mergeQuestions(previewData, []);
      const previewFlashcardsOnly = mergeFlashcards(previewFlashcards, []);
      console.log(`   Preview Questions: ${previewQuestions.length} (Visible in UI)`);
      console.log(`   Preview Flashcards: ${previewFlashcardsOnly.length} (Visible in UI)`);

      if (applyPreviewState) {
        setModules(modulesData);
        setAllQuestions(previewQuestions);
        setQuestions(previewQuestions);
        setAllFlashcards(previewFlashcardsOnly);
        setFullDataReady(false);
        saveToCache(modulesData, previewQuestions, previewFlashcardsOnly, false);
      }
      setFullDataLoading(true);

      setLoadingStatus('Fertig!');
      if (!silent) setLoading(false);
      console.log(`✨ [DataCache] Initial data ready in ${Date.now() - startTime}ms`);

      void loadFullDataInBackground(modulesData, previewData, previewFlashcards);

    } catch (err: any) {
      const errorMessage = err?.message || 'Unbekannter Fehler';
      console.error('❌ [DataCache] Error loading data:', errorMessage);
      setLoadingStatus('Fehler aufgetreten');
      setError(`Fehler beim Laden der Daten: ${errorMessage}`);
      if (!silent) setLoading(false);
      setFullDataLoading(false);
      setFullDataReady(false);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadFullDataInBackground = async (modulesData: Module[], previewData: any[], previewFlashcards: any[]) => {
    const startTime = Date.now();

    try {
      const TIMEOUT_MS = 60000;
      const withTimeout = <T,>(promise: Promise<T>): Promise<T> =>
        Promise.race([
          promise,
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error('Datenbank-Timeout nach 60 Sekunden')), TIMEOUT_MS)
          )
        ]);

      console.log('🌐 [DataCache] Loading full data in background...');
      const [questionsData, flashcardsData] = await withTimeout(
        Promise.all([
          db.getAllQuestions(),
          db.getAllFlashcards()
        ])
      );

      const mergedQuestions = mergeQuestions(previewData, questionsData);
      const mergedFlashcards = mergeFlashcards(previewFlashcards, flashcardsData);

      setAllQuestions(mergedQuestions);
      setQuestions(mergedQuestions);
      setAllFlashcards(mergedFlashcards);
      setFullDataReady(true);
      saveToCache(modulesData, mergedQuestions, mergedFlashcards, true);

      console.log(`✅ [DataCache] Full data ready in ${Date.now() - startTime}ms`, {
        questions: mergedQuestions.length,
        flashcards: mergedFlashcards.length
      });
    } catch (err: any) {
      const errorMessage = err?.message || 'Unbekannter Fehler';
      console.warn('⚠️ [DataCache] Full background data load failed:', errorMessage);
      setFullDataReady(false);
    } finally {
      setFullDataLoading(false);
    }
  };

  // Wait for auth AND subscription to finish loading before loading data
  useEffect(() => {
    if (!authLoading && !subscriptionLoading) {
      loadAllData();
    }
  }, [authLoading, subscriptionLoading]);

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
      fullDataLoading,
      fullDataReady,
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
