import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../../App';
import { useAuth } from '../../contexts/AuthContext';
import { useDataCache } from '../../contexts/DataCacheContext';
import { usePostHog } from '../../contexts/PostHogProvider';
import { supabase } from '../../lib/supabase';
import { db } from '../../services/database';
import { QuestionType, Question } from '../../types';
import { Bookmark, Check, X, AlertCircle, Bot, ArrowRight, RotateCcw, Clock, CheckCircle, XCircle, Timer, Maximize2, Minimize2, Lightbulb, Trophy, Play, ChevronRight, ChevronLeft, BookOpen, Lock, Crown, ArrowLeft, Languages, Settings, ChevronDown, ChevronUp, Pencil, Save, Circle, Search, Sparkles, AlertTriangle, Scale } from 'lucide-react';
import { runQualityAnalysis, QualityAnalysisResult, runArabicTranslation, ArabicTranslationResult } from '../../services/gemini';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { QuizSettingsDialog } from './QuizSettingsDialog';
import { ExplanationRenderer } from './ExplanationRenderer';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { GuestProgressPopup } from '../ui/GuestProgressPopup';
import { AuthDialog } from '../auth/AuthDialog';
import { isAdminEmail } from '../../utils/userRoles';
import {
  compareQuestions,
  getLessonQuestionProgress,
  getNextLessonForModule,
  getOrderedLessonsForModule,
  getLessonQuestions,
} from '../../services/lessonFlow';

interface QuestionResult {
  question: Question;
  isCorrect: boolean;
  timedOut: boolean;
  selectedAnswers: string[];
}

const ANSWER_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

export default function QuestionView() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, language, answerQuestion, toggleBookmark, progress, settings, isPremium, openPaywall, toggleLanguage, setLessonCompletion } = useApp();
  const { user: authUser } = useAuth();
  const isAdmin = isAdminEmail(authUser?.email);
  const { trackEvent } = usePostHog();
  const [quizStartTime] = useState(Date.now());

  // Admin inline edit state
  const [showAdminActions, setShowAdminActions] = useState(false);
  const [adminEditing, setAdminEditing] = useState(false);
  const [adminEditData, setAdminEditData] = useState<any>(null);
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminShowExplanations, setAdminShowExplanations] = useState(false);
  const [adminToast, setAdminToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // AI Quality Analysis state
  const [qualityChecking, setQualityChecking] = useState(false);
  const [isAnalysisExpanded, setIsAnalysisExpanded] = useState(true);
  const [qualityResult, setQualityResult] = useState<QualityAnalysisResult | null>(null);

  // AI Arabic Translation state
  const [arabicChecking, setArabicChecking] = useState(false);
  const [isArabicExpanded, setIsArabicExpanded] = useState(true);
  const [arabicResult, setArabicResult] = useState<ArabicTranslationResult | null>(null);

  // Local overrides for live-update after admin save
  const [localQuestionOverrides, setLocalQuestionOverrides] = useState<Record<string, any>>({});
  // Reviewed checkbox state
  const [reviewedMap, setReviewedMap] = useState<Record<string, boolean>>({});

  // Font size configuration
  const fontSizes = {
    large: {
      question: 'text-base',
      answer: 'text-[13.7px]',
      index: 'text-sm',
      icon: 16,
      explanation: 'text-sm'
    },
    normal: {
      question: 'text-sm',
      answer: 'text-[11.6px]',
      index: 'text-xs',
      icon: 15,
      explanation: 'text-xs'
    },
    small: {
      question: 'text-xs',
      answer: 'text-[9.5px]',
      index: 'text-[10px]',
      icon: 14,
      explanation: 'text-[10px]'
    },
    smaller: {
      question: 'text-[10px]',
      answer: 'text-[8.5px]',
      index: 'text-[9px]',
      icon: 12,
      explanation: 'text-[9px]'
    }
  };

  const currentFontSize = fontSizes[settings?.cardSize || 'normal'];

  // Mode resolution
  const mode = searchParams.get('mode'); // 'random' | 'exam' | 'module-test' | 'mini-exam'
  const moduleId = searchParams.get('module');
  const singleId = searchParams.get('single');
  const lessonId = searchParams.get('lesson');
  const startQuestionId = searchParams.get('start');
  const wrongIds = searchParams.get('wrongIds'); // Comma-separated list of wrong question IDs
  const fromBookmarks = searchParams.get('from') === 'bookmarks';
  const isLessonMode = mode === 'lesson' && !!moduleId && !!lessonId;

  // Mini-exam specific URL params
  const miniExamQuestionCount = parseInt(searchParams.get('questionCount') || '10', 10);
  const miniExamTimeLimit = parseInt(searchParams.get('timeLimit') || '900', 10); // Default 15 min
  const isMiniExam = mode === 'mini-exam';

  // Get modules from DataCache to determine first lesson
  const { modules: cachedModules, getQuestionsByModule } = useDataCache();

  // Helper to check if a question is accessible
  const isQuestionAccessible = useCallback((question: Question): boolean => {
    if (isPremium) return true;
    return question.isFree === true;
  }, [isPremium]);

  // State
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);
  const [queue, setQueue] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const explanationRef = useRef<HTMLDivElement>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
  const [isChecked, setIsChecked] = useState(false);

  const [explanationExpanded, setExplanationExpanded] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);

  const [examFinished, setExamFinished] = useState(false);
  const [examScore, setExamScore] = useState(0);

  // Module-test specific state
  const [timeLeft, setTimeLeft] = useState(90);
  const [questionResults, setQuestionResults] = useState<QuestionResult[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isModuleTest = mode === 'module-test' || mode === 'module-wrong';
  const [testStarted, setTestStarted] = useState(false);

  // Guest motivation popup state
  const [showGuestPopup, setShowGuestPopup] = useState(false);
  const [currentSessionCorrectCount, setCurrentSessionCorrectCount] = useState(0);
  const [showAuthDialog, setShowAuthDialog] = useState(false);

  // Scroll to top when exam finishes
  useEffect(() => {
    if (examFinished) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [examFinished]);

  // Scroll to top when question changes
  useEffect(() => {
    // The main scroll container is #root, not window
    document.getElementById('root')?.scrollTo({ top: 0, behavior: 'instant' });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [currentIndex, moduleId, mode]);

  // Mini-exam specific state
  const [miniExamAnswers, setMiniExamAnswers] = useState<Record<string, string[]>>({});
  const [miniExamTimeLeft, setMiniExamTimeLeft] = useState(miniExamTimeLimit);
  const [miniExamStarted, setMiniExamStarted] = useState(false);
  const [reviewingQuestion, setReviewingQuestion] = useState<number | null>(null);

  // Module completion state
  const [moduleTitle, setModuleTitle] = useState<{ de: string; ar: string } | null>(() => {
    // Try to get from URL params first for instant render
    const nameDE = searchParams.get('moduleName');
    if (nameDE) {
      return { de: nameDE, ar: '' }; // AR title might not be in params, but DE is enough for initial paint
    }
    return null;
  });
  const [nextModule, setNextModule] = useState<{ id: string; titleDE: string; titleAR: string } | null>(null);

  // Total questions count from database
  const [totalQuestionsCount, setTotalQuestionsCount] = useState<number>(0);

  const lessonMeta = useMemo(() => {
    if (!isLessonMode || !moduleId || !lessonId) return null;
    return getOrderedLessonsForModule(moduleId, cachedModules).find(lesson => lesson.id === lessonId) || null;
  }, [isLessonMode, moduleId, lessonId, cachedModules]);

  const nextLesson = useMemo(() => {
    if (!isLessonMode || !moduleId || !lessonId) return null;
    return getNextLessonForModule(moduleId, lessonId, cachedModules);
  }, [isLessonMode, moduleId, lessonId, cachedModules]);



  // Reset states when mode/module changes
  useEffect(() => {
    setExamFinished(false);
    setExamScore(0);
    setQuestionResults([]);
    setCurrentIndex(0);
    setSelectedAnswers([]);
    setIsChecked(false);
    setTimeLeft(90);

    setShowExplanation(false);
    setExplanationExpanded(false);
    setTestStarted(false);
    // Mini-exam reset
    setMiniExamAnswers({});
    setMiniExamTimeLeft(miniExamTimeLimit);
    setMiniExamStarted(true); // Start immediately for mini-exam
    setReviewingQuestion(null);

    // Track quiz started
    if (mode || moduleId) {
      trackEvent('quiz_started', {
        mode: mode || 'normal',
        module_id: moduleId || undefined
      });
    }
  }, [mode, moduleId, singleId, lessonId, startQuestionId, miniExamTimeLimit]);

  // Load total questions count
  useEffect(() => {
    async function fetchTotalCount() {
      try {
        const { count, error } = await supabase
          .from('questions')
          .select('*', { count: 'exact', head: true });

        if (error) {
          console.error('Error fetching total questions count:', error);
        } else {
          setTotalQuestionsCount(count || 0);
        }
      } catch (err) {
        console.error('Error in fetchTotalCount:', err);
      }
    }

    fetchTotalCount();
  }, []);

  // Initialize Queue
  useEffect(() => {
    async function fetchQuestions() {
      try {
        // 1. CACHE-FIRST STRATEGY
        // If we are in standard module mode and have data in cache, use it!
        if (moduleId && !fromBookmarks && !singleId && !wrongIds && cachedModules.length > 0) {
          let cachedQuestions = getQuestionsByModule(moduleId);

          if (cachedQuestions.length > 0) {
            console.log('⚡ [QuestionView] Using cached questions:', cachedQuestions.length);

            // We need to map the cached questions to the format expected by the queue
            // The cached questions are already mapped to Question type, but we need to ensure
            // compatibility with the logic below (e.g. adding lesson info if needed)

            // Actually, DataCacheContext returns fully mapped Question objects.
            // We just need to apply the sorting/filtering logic.

            let finalQueue = isLessonMode && lessonId
              ? getLessonQuestions(lessonId, cachedQuestions)
              : [...cachedQuestions];

            // Apply caching to module title
            const mod = cachedModules.find(m => m.id === moduleId);
            if (mod) {
              setModuleTitle({ de: mod.titleDE, ar: mod.titleAR || '' });
              // Find next module
              const modIndex = (mod as any).orderIndex || 0;
              const nextMod = cachedModules.find(m => ((m as any).orderIndex || 0) > modIndex);
              if (nextMod) {
                setNextModule({ id: nextMod.id, titleDE: nextMod.titleDE, titleAR: nextMod.titleAR || '' });
              }
            }

            // SORTING LOGIC (Mirrored from below)
            if (isLessonMode) {
              finalQueue = [...finalQueue].sort(compareQuestions);
            } else if (!mode) {
              finalQueue = [...finalQueue].sort((a, b) => {
                // First sort by Lesson Order (we need to resolve lesson order from cached modules if not on question)
                // The cached questions might not have lessonOrder property directly if not enriched.
                // DataCacheContext mapQuestions adds global_order_index and orderIndex.
                // Let's rely on global_order_index which should be sufficient as it's computed.
                // Then by global_order_index within same lesson
                const globalA = a.global_order_index ?? a.orderIndex ?? 0;
                const globalB = b.global_order_index ?? b.orderIndex ?? 0;

                if (globalA !== globalB) {
                  return globalA - globalB;
                }

                // Final tie-breaker: sort by text for stable ordering
                return (a.textDE || '').localeCompare(b.textDE || '');
              });
            } else if (mode === 'random') {
              finalQueue = finalQueue.sort(() => 0.5 - Math.random()).slice(0, 10);
            } else if (mode === 'exam') {
              // logic for exam without moduleId is not covered here (fallback to DB)
            } else if (mode === 'mini-exam') {
              // Mini-exam: shuffle and limit to user-selected count
              finalQueue = [...finalQueue].sort(() => 0.5 - Math.random()).slice(0, miniExamQuestionCount);
            } else if (mode === 'module-test') {
              finalQueue = finalQueue.sort(() => 0.5 - Math.random());
            }

            // Ensure we have questions, otherwise fallback to DB
            if (finalQueue.length > 0) {
              setQueue(finalQueue);
              if (isLessonMode) {
                const startIndex = startQuestionId ? finalQueue.findIndex(q => q.id === startQuestionId) : -1;
                const firstOpenIndex = finalQueue.findIndex(q =>
                  !Object.prototype.hasOwnProperty.call(progress.answeredQuestions, q.id)
                );
                setCurrentIndex(startIndex !== -1 ? startIndex : firstOpenIndex !== -1 ? firstOpenIndex : 0);
              } else {
                setCurrentIndex(0);
              }
              return; // EXIT EARLY - NO NETWORK CALL
            }
          }
        }


        let query = supabase
          .from('questions')
          .select('*');


        if (isLessonMode && moduleId && lessonId) {
          query = query.eq('module_id', moduleId).eq('lesson_id', lessonId);
        } else if (singleId) {
          // If starting from a single question, we still want to load the context (e.g. the module it belongs to)
          // so the user can continue to the next question in that module.

          // If coming from bookmarks, we want to load all bookmarks as the context
          if (fromBookmarks) {
            // Load all bookmarked questions
            const { data: bookmarkData, error: bmErr } = await supabase
              .from('user_bookmarks')
              .select('question_id')
              .eq('user_id', user?.isLoggedIn ? (await supabase.auth.getUser()).data.user?.id : null);

            if (user?.isLoggedIn && bookmarkData) {
              const bookmarkIds = bookmarkData.map((b: any) => b.question_id);
              if (bookmarkIds.length > 0) {
                // If a specific module is requested (filtered bookmarks), filter by it
                if (moduleId) {
                  query = query.in('id', bookmarkIds).eq('module_id', moduleId);
                } else {
                  query = query.in('id', bookmarkIds);
                }
              } else {
                // No bookmarks, just load single question to be safe (shouldn't happen ideally)
                query = query.eq('id', singleId);
              }
            } else {
              // Fallback for guests or error - just load the single question
              // Or if we can access guest bookmarks from localStorage (passed via context ideally, but here we access DB)
              // Since QuestionView uses Supabase primarily, we might need to rely on the passed IDs or fetch from cache if we want full offline support.
              // For now, let's stick to DB if logged in.
              query = query.eq('id', singleId);
            }
          } else {
            // Standard flow: load module context
            const { data: qData, error: qErr } = await supabase
              .from('questions')
              .select('module_id')
              .eq('id', singleId)
              .single();

            if (qErr) throw qErr;

            // Now load all questions for this module (will be sorted by lesson order + question order later)
            query = query.eq('module_id', qData.module_id);
          }
        } else if (wrongIds) {
          // Load specific wrong questions by IDs
          const ids = wrongIds.split(',').filter(id => id.trim());
          if (ids.length > 0) {
            query = query.in('id', ids);
          }
        } else if (moduleId) {
          // Load questions for module (will be sorted by lesson order + question order later)
          query = query.eq('module_id', moduleId);
        }

        // Include lesson order index in query for correct sorting
        query = query.select('*, lesson:lessons(order_index)');

        const { data, error } = await query;

        if (error) {
          console.error('Error fetching questions:', error);
          return;
        }

        if (!data || data.length === 0) {
          setQueue([]);
          return;
        }

        // Helper function to map flat answer columns to answers array
        const mapQuestionAnswers = (q: any) => {
          const answerLetters = ['a', 'b', 'c', 'd', 'e', 'f'];
          const correctAnswers = (q.correct_answer || '').split(',').map((s: string) => s.trim().toUpperCase());

          return answerLetters
            .map((letter, index) => {
              const textDE = q[`answer_${letter}_de`];
              if (!textDE) return null; // Skip if no answer text

              return {
                id: `${q.id}-${letter.toUpperCase()}`,
                text_de: textDE,
                text_ar: q[`answer_${letter}_ar`] || null,
                is_correct: correctAnswers.includes(letter.toUpperCase()),
                order_index: index
              };
            })
            .filter(Boolean);
        };

        // Map Supabase data to App types
        const mappedQuestions: (Question & { orderIndex?: number; lessonId?: string | null; lessonOrder?: number })[] = data.map((q: any) => ({
          id: q.id,
          moduleId: q.module_id,
          lessonId: q.lesson_id,
          anchorId: q.anchor_id,
          textDE: q.text_de,
          textAR: q.text_ar,
          type: q.type as QuestionType,
          explanationDE: q.explanation_de,
          explanationAR: q.explanation_ar,
          orderIndex: q.order_index,
          global_order_index: q.global_order_index ?? undefined,
          lessonOrder: q.lesson?.order_index,
          isFree: q.is_free,
          quality_check: q.quality_check ?? null,
          reviewed: q.reviewed ?? false,
          updated_at: q.updated_at ?? null,
          answers: mapQuestionAnswers(q)
            .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
            .map((a: any) => ({
              id: a.id,
              textDE: a.text_de,
              textAR: a.text_ar,
              isCorrect: a.is_correct
            }))
        }));

        // Debug: Log first few questions with global_order_index
        if (mappedQuestions.length > 0) {
          console.log('QuestionView: Loaded questions with global_order_index:',
            mappedQuestions.slice(0, 5).map(q => ({
              id: q.id,
              global_order_index: q.global_order_index,
              text: q.textDE?.substring(0, 50)
            }))
          );
        }

        // Apply mode logic (random/exam/module-test)
        let finalQueue = mappedQuestions;

        // Sort questions by Lesson Order then global_order_index/orderIndex
        // This matches the sorting in ModuleQuestionsList.tsx (Lesson Grouping)
        if (isLessonMode) {
          finalQueue = [...finalQueue].sort(compareQuestions);
        } else if (!mode && (moduleId || finalQueue.length > 0)) {
          finalQueue = [...finalQueue].sort((a, b) => {
            // First sort by Lesson Order
            const lessonA = a.lessonOrder ?? 999999;
            const lessonB = b.lessonOrder ?? 999999;

            if (lessonA !== lessonB) {
              return lessonA - lessonB;
            }

            // Then Global Order
            const globalA = a.global_order_index ?? a.orderIndex ?? 0;
            const globalB = b.global_order_index ?? b.orderIndex ?? 0;

            if (globalA !== globalB) {
              return globalA - globalB;
            }

            // Final tie-breaker: sort by text for stable ordering
            return (a.textDE || '').localeCompare(b.textDE || '');
          });

          console.log('Sorted questions by Lesson + Global:', finalQueue.map((q, i) => ({
            index: i + 1,
            id: q.id,
            lessonOrder: q.lessonOrder,
            global_order_index: q.global_order_index,
            text: q.textDE?.substring(0, 50)
          })));
        }

        if (mode === 'random') {
          finalQueue = finalQueue.sort(() => 0.5 - Math.random()).slice(0, 10);
        } else if (mode === 'exam') {
          if (!moduleId && !singleId) {
            finalQueue = finalQueue.sort(() => 0.5 - Math.random()).slice(0, 40);
          }
        } else if (mode === 'mini-exam') {
          // Mini-exam: shuffle and limit to user-selected count
          finalQueue = finalQueue.sort(() => 0.5 - Math.random()).slice(0, miniExamQuestionCount);
        } else if (mode === 'module-test') {
          // Shuffle all questions for module test
          finalQueue = finalQueue.sort(() => 0.5 - Math.random());
        } else if (mode === 'module-wrong') {
          // Filter for wrong answers only
          finalQueue = finalQueue.filter(q => progress.answeredQuestions[q.id] === false);
          // Do NOT shuffle - keep module order for "Normal" feel
          // finalQueue = finalQueue.sort(() => 0.5 - Math.random());
        } else if (moduleId || singleId) {
          // Keep DB order (order_index) - already sorted by the query
        }

        setQueue(finalQueue);

        // If singleId, set currentIndex to that question
        if (isLessonMode) {
          const startIndex = startQuestionId ? finalQueue.findIndex(q => q.id === startQuestionId) : -1;
          const firstOpenIndex = finalQueue.findIndex(q =>
            !Object.prototype.hasOwnProperty.call(progress.answeredQuestions, q.id)
          );

          setCurrentIndex(startIndex !== -1 ? startIndex : firstOpenIndex !== -1 ? firstOpenIndex : 0);
        } else if (singleId) {
          const index = finalQueue.findIndex(q => q.id === singleId);
          if (index !== -1) {
            setCurrentIndex(index);
          } else if (fromBookmarks) {
            // If coming from bookmarks and the specific singleId question wasn't found in the filtered list
            // (e.g. because of complex filtering), just start at 0 or handle gracefully.
            setCurrentIndex(0);
          }
        } else {
          setCurrentIndex(0);
        }

        // Load module title and next module
        if (moduleId || (finalQueue.length > 0 && finalQueue[0].moduleId)) {
          const currentModuleId = moduleId || finalQueue[0].moduleId;

          // Get current module title
          const { data: modData } = await supabase
            .from('modules')
            .select('title_de, title_ar, order_index')
            .eq('id', currentModuleId)
            .single();

          if (modData) {
            setModuleTitle({ de: modData.title_de, ar: modData.title_ar });

            // Get next module
            const { data: nextModData } = await supabase
              .from('modules')
              .select('id, title_de, title_ar')
              .gt('order_index', modData.order_index)
              .order('order_index')
              .limit(1)
              .single();

            if (nextModData) {
              setNextModule({ id: nextModData.id, titleDE: nextModData.title_de, titleAR: nextModData.title_ar });
            }
          }
        }

      } catch (err) {
        console.error('Unexpected error fetching questions:', err);
      }
    }

    fetchQuestions();
  }, [mode, moduleId, singleId, lessonId, startQuestionId]);

  const rawQuestion = queue[currentIndex];
  const currentQuestion = rawQuestion ? {
    ...rawQuestion,
    ...(localQuestionOverrides[rawQuestion.id] || {})
  } : rawQuestion;

  // Initialize reviewedMap when queue loads or reviewed values change (e.g. after background refresh)
  const queueReviewedKey = queue.map(q => `${q.id}:${q.reviewed ? 1 : 0}`).join(',');
  useEffect(() => {
    if (queue.length > 0) {
      const newMap: Record<string, boolean> = {};
      queue.forEach(q => { newMap[q.id] = q.reviewed ?? false; });
      setReviewedMap(newMap);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueReviewedKey]);

  // Set qualityResult when currentQuestion changes
  useEffect(() => {
    if (currentQuestion) {
      setQualityResult(null);
    }
  }, [currentQuestion?.id]);

  const handleQualityAnalysis = async () => {
    if (!currentQuestion) return;
    setQualityChecking(true);
    setIsAnalysisExpanded(true);
    setQualityResult(null);
    try {
      const q = currentQuestion;
      const answersData = q.answers.map((a, i) => ({
        letter: String.fromCharCode(65 + i),
        text: a.textDE,
        isCorrect: a.isCorrect
      }));

      const result = await runQualityAnalysis({
        questionText: q.textDE,
        answers: answersData,
        topic: moduleTitle?.de || q.moduleId,
        questionType: q.type === QuestionType.MULTIPLE_CHOICE ? 'Multiple Choice' : 'Single Choice'
      });
      setQualityResult(result);
    } catch (err) {
      console.error('Quality analysis failed:', err);
      setQualityResult({
        analysis: '## ❌ Fehler\n\nVerbindungsfehler bei der KI-Qualitätsprüfung.',
        optimized_question: null
      });
    } finally {
      setQualityChecking(false);
    }
  };

  // ======== ARABIC TRANSLATION ========
  const handleArabicAnalysis = async () => {
    if (!currentQuestion) return;
    setArabicChecking(true);
    setIsArabicExpanded(true);
    setArabicResult(null);
    try {
      const q = currentQuestion;
      const answersData = q.answers.map((a, i) => ({
        letter: String.fromCharCode(65 + i),
        text: a.textDE,
        isCorrect: a.isCorrect,
        existingAr: a.textAR || null
      }));

      const result = await runArabicTranslation({
        questionText: q.textDE,
        answers: answersData,
        topic: moduleTitle?.de || q.moduleId,
        questionType: q.type === QuestionType.MULTIPLE_CHOICE ? 'Multiple Choice' : 'Single Choice',
        existingArabic: { questionTextAr: q.textAR || null }
      });
      setArabicResult(result);
    } catch (err) {
      console.error('Arabic analysis failed:', err);
      setArabicResult({
        analysis: '## ❌ Fehler\n\nVerbindungsfehler bei der KI-Übersetzung.',
        translated_question: null
      });
    } finally {
      setArabicChecking(false);
    }
  };

  const applyArabicTranslation = () => {
    if (!arabicResult?.translated_question || !currentQuestion) return;
    const trans = arabicResult.translated_question;
    const q = currentQuestion;

    const editObj: any = {
      text_de: q.textDE,
      text_ar: trans.question_text_ar,
      type: q.type === QuestionType.MULTIPLE_CHOICE ? 'MULTIPLE_CHOICE' : 'SINGLE_CHOICE',
      explanation_de: q.explanationDE || '',
      explanation_ar: q.explanationAR || '',
      correct_answer: q.answers.filter(a => a.isCorrect).map((a, i) => String.fromCharCode(65 + q.answers.indexOf(a))).join(','),
      is_free: q.isFree
    };

    // Keep existing DE answers
    q.answers.forEach((a, i) => {
      const letter = String.fromCharCode(97 + i);
      editObj[`answer_${letter}_de`] = a.textDE;
      editObj[`answer_${letter}_ar`] = a.textAR || '';
    });

    // Apply AR translations
    if (trans.answers) {
      for (const [letter, data] of Object.entries(trans.answers)) {
        const key = letter.toLowerCase();
        if (data.text_ar) editObj[`answer_${key}_ar`] = data.text_ar;
      }
    }

    setAdminEditData(editObj);
    setAdminEditing(true);
    setAdminShowExplanations(false);
    setAdminToast({ message: 'AR-Übersetzung übernommen ✓', type: 'success' });
    setTimeout(() => setAdminToast(null), 2500);

    setTimeout(() => {
      document.getElementById('admin-edit-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
  };

  const applyOptimizedQuestion = () => {
    if (!qualityResult?.optimized_question || !currentQuestion) return;
    const opt = qualityResult.optimized_question;
    const q = currentQuestion;

    const editObj: any = {
      text_de: opt.question_text_de,
      text_ar: q.textAR || '',
      type: opt.correct_answer.includes(',') ? 'MULTIPLE_CHOICE' : 'SINGLE_CHOICE',
      explanation_de: q.explanationDE || '',
      explanation_ar: q.explanationAR || '',
      correct_answer: opt.correct_answer,
      is_free: q.isFree
    };

    q.answers.forEach((_, i) => {
      const letter = String.fromCharCode(97 + i);
      editObj[`answer_${letter}_de`] = '';
    });

    if (opt.answers) {
      for (const [letter, data] of Object.entries(opt.answers)) {
        const key = letter.toLowerCase();
        if (data.text_de) editObj[`answer_${key}_de`] = data.text_de;
      }
    }

    setAdminEditData(editObj);
    setAdminEditing(true);
    setAdminShowExplanations(false);
    setAdminToast({ message: 'KI-Vorschlag übernommen ✓', type: 'success' });
    setTimeout(() => setAdminToast(null), 2500);

    setTimeout(() => {
      document.getElementById('admin-edit-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
  };

  const swapAnswers = (idx1: number, idx2: number) => {
    if (!adminEditData) return;

    const letter1 = ANSWER_LETTERS[idx1];
    const letter2 = ANSWER_LETTERS[idx2];
    const key1 = letter1.toLowerCase();
    const key2 = letter2.toLowerCase();

    const textDE1 = adminEditData[`answer_${key1}_de`];
    const textAR1 = adminEditData[`answer_${key1}_ar`];
    const textDE2 = adminEditData[`answer_${key2}_de`];
    const textAR2 = adminEditData[`answer_${key2}_ar`];

    // Correct Answer Swap
    const correctAnswers = adminEditData.correct_answer ? adminEditData.correct_answer.split(',').map((a: string) => a.trim()).filter(Boolean) : [];
    const is1Correct = correctAnswers.includes(letter1);
    const is2Correct = correctAnswers.includes(letter2);

    let newCorrectAnswers = [...correctAnswers];
    if (is1Correct && !is2Correct) {
      newCorrectAnswers = newCorrectAnswers.filter((a: string) => a !== letter1);
      newCorrectAnswers.push(letter2);
    } else if (!is1Correct && is2Correct) {
      newCorrectAnswers = newCorrectAnswers.filter((a: string) => a !== letter2);
      newCorrectAnswers.push(letter1);
    }

    setAdminEditData({
      ...adminEditData,
      [`answer_${key1}_de`]: textDE2,
      [`answer_${key1}_ar`]: textAR2,
      [`answer_${key2}_de`]: textDE1,
      [`answer_${key2}_ar`]: textAR1,
      correct_answer: newCorrectAnswers.sort().join(',')
    });
  };

  // Click outside to close explanation
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (showExplanation && explanationRef.current && !explanationRef.current.contains(event.target as Node)) {
        setShowExplanation(false);
        setExplanationExpanded(false);

      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showExplanation]);



  // Mini-exam global timer effect
  useEffect(() => {
    if (!isMiniExam || examFinished || !miniExamStarted || queue.length === 0) return;

    const timer = setInterval(() => {
      setMiniExamTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          // Time's up - auto-submit the exam
          handleMiniExamSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isMiniExam, examFinished, miniExamStarted, queue.length]);

  // Mini-exam answer storage (no immediate feedback)
  const handleMiniExamSelect = (answerId: string) => {
    const questionId = currentQuestion.id;

    if (currentQuestion.type === QuestionType.SINGLE_CHOICE) {
      setMiniExamAnswers(prev => ({ ...prev, [questionId]: [answerId] }));
    } else {
      setMiniExamAnswers(prev => {
        const current = prev[questionId] || [];
        const updated = current.includes(answerId)
          ? current.filter(id => id !== answerId)
          : current.length < 2 ? [...current, answerId] : current;
        return { ...prev, [questionId]: updated };
      });
    }
  };

  // Mini-exam navigation
  const handleMiniExamNext = () => {
    if (currentIndex < queue.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const handleMiniExamPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  // Mini-exam submit
  const handleMiniExamSubmit = () => {
    // Calculate results
    let score = 0;
    const results: QuestionResult[] = queue.map(q => {
      const userAnswers = miniExamAnswers[q.id] || [];
      const correctIds = q.answers.filter(a => a.isCorrect).map(a => a.id);
      const isCorrect = correctIds.length === userAnswers.length &&
        correctIds.every(id => userAnswers.includes(id));

      if (isCorrect) score++;

      // Save to progress
      answerQuestion(q.id, isCorrect);

      return {
        question: q,
        isCorrect,
        timedOut: false,
        selectedAnswers: userAnswers
      };
    });

    setQuestionResults(results);
    setExamScore(score);
    setExamFinished(true);

    // Track quiz completed
    const timeSpent = Math.round((Date.now() - quizStartTime) / 1000);
    trackEvent('quiz_completed', {
      mode: mode || 'mini-exam',
      module_id: moduleId || undefined,
      score: score,
      total_questions: queue.length,
      percentage: Math.round((score / queue.length) * 100),
      time_spent_seconds: timeSpent,
      passed: (score / queue.length) >= 0.5
    });
  };

  const handleTimeOut = () => {
    if (!currentQuestion) return;

    // Record as timed out (wrong)
    setQuestionResults(prev => [...prev, {
      question: currentQuestion,
      isCorrect: false,
      timedOut: true,
      selectedAnswers: []
    }]);

    answerQuestion(currentQuestion.id, false);

    // Move to next or finish
    if (currentIndex < queue.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswers([]);
    } else {
      setExamFinished(true);
    }
  };

  // Timer effect for module-test mode
  const handleTimeOutRef = useRef(handleTimeOut);
  useEffect(() => {
    handleTimeOutRef.current = handleTimeOut;
  });

  useEffect(() => {
    if (mode !== 'module-test' || isChecked || examFinished || !currentQuestion) return;

    setTimeLeft(90);

    const id = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(id);
          handleTimeOutRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    timerRef.current = id;

    return () => {
      clearInterval(id);
    };
  }, [currentIndex, isModuleTest, isChecked, examFinished, currentQuestion?.id]);
  const handleSelect = (answerId: string) => {
    if (isChecked) return; // Locked

    if (currentQuestion.type === QuestionType.SINGLE_CHOICE) {
      setSelectedAnswers([answerId]);
    } else {
      setSelectedAnswers(prev =>
        prev.includes(answerId)
          ? prev.filter(id => id !== answerId)
          : prev.length < 2 ? [...prev, answerId] : prev // Limit to 2 for this simulation logic
      );
    }
  };

  const checkAnswer = () => {
    if (selectedAnswers.length === 0) return;

    // Stop timer for module-test
    if (timerRef.current) clearInterval(timerRef.current);

    const correctIds = currentQuestion.answers.filter(a => a.isCorrect).map(a => a.id);
    // Simple equality check for arrays
    const isCorrect = correctIds.length === selectedAnswers.length &&
      correctIds.every(id => selectedAnswers.includes(id));

    setIsChecked(true);
    answerQuestion(currentQuestion.id, isCorrect);

    const nextAnsweredQuestions = {
      ...progress.answeredQuestions,
      [currentQuestion.id]: isCorrect,
    };
    const allLessonQuestionsAnswered = isLessonMode
      ? queue.every(question => Object.prototype.hasOwnProperty.call(nextAnsweredQuestions, question.id))
      : false;

    // Wenn falsch beantwortet → Erklärung sofort anzeigen
    if (!isCorrect) {
      setShowExplanation(true);
      setExplanationExpanded(true);
    } else {
      setCurrentSessionCorrectCount(prev => prev + 1);
    }

    if ((mode === 'exam' || mode === 'module-test') && isCorrect) {
      setExamScore(prev => prev + 1);
    }

    // Record result for module-test
    if (isModuleTest) {
      setQuestionResults(prev => [...prev, {
        question: currentQuestion,
        isCorrect,
        timedOut: false,
        selectedAnswers: [...selectedAnswers]
      }]);

      // Auto-advance after short delay in module-test
      setTimeout(() => {
        if (currentIndex < queue.length - 1) {
          setCurrentIndex(prev => prev + 1);
          setIsChecked(false);
          setSelectedAnswers([]);
        } else {
          setExamFinished(true);
        }
      }, 1500);
    } else if (isLessonMode && currentIndex >= queue.length - 1 && allLessonQuestionsAnswered) {
      window.setTimeout(async () => {
        try {
          if (lessonId) {
            await setLessonCompletion(lessonId, true);
          }
        } catch (error) {
          console.error('Error auto-completing lesson:', error);
        }
        setExamFinished(true);
      }, isCorrect ? 450 : 900);
    }
  };

  const executeNextStep = async () => {
    if (currentIndex < queue.length - 1) {
      const nextQuestion = queue[currentIndex + 1];
      // Check if next question is accessible
      if (!isQuestionAccessible(nextQuestion)) {
        openPaywall('Premium Fragen');
        return;
      }
      const nextId = nextQuestion.id;
      setCurrentIndex(prev => prev + 1);
      setIsChecked(false);
      setSelectedAnswers([]);

      setShowExplanation(false);
      setExplanationExpanded(false);
      setQualityResult(null);
    } else {
      // End of queue reached
      if (isLessonMode && lessonId) {
        try {
          await setLessonCompletion(lessonId, true);
        } catch (error) {
          console.error('Error finalizing lesson completion:', error);
        }
      }
      setExamFinished(true);
    }
  };

  const handleNext = () => {
    // If guest and answered correctly and it's normal practice mode (not exam/module-test)
    const isCorrect = isChecked && !showExplanation; 
    // Wait, showing explanation can happen immediately for wrong answers, but users can toggle it.
    // Let's explicitly check the answer correctness based on currentQuestion and selectedAnswers
    const correctIds = currentQuestion?.answers.filter(a => a.isCorrect).map(a => a.id) || [];
    const wasAnsweredCorrectly = isChecked && correctIds.length === selectedAnswers.length &&
      correctIds.every(id => selectedAnswers.includes(id));

    if (!authUser && wasAnsweredCorrectly && !isMiniExam && !isModuleTest && mode !== 'exam') {
      setShowGuestPopup(true);
    } else {
      executeNextStep();
    }
  };

  if (examFinished && isLessonMode && moduleId && lessonId) {
    const lessonProgress = getLessonQuestionProgress(lessonId, queue, progress);
    const completionPercentage = lessonProgress.total > 0
      ? Math.round((lessonProgress.answered / lessonProgress.total) * 100)
      : 0;

    return (
      <div className="min-h-screen bg-[#F2F4F6] dark:bg-slate-950 px-4 pt-8 pb-24 flex items-center justify-center">
        <div className="w-full max-w-xl animate-in fade-in zoom-in-95 slide-in-from-bottom-6 duration-500">
          <Card className="border-none bg-gradient-to-br from-[#3B65F5] via-[#4A73FF] to-[#2551E8] text-white shadow-2xl shadow-blue-500/20 overflow-hidden" padding="lg">
            <div className="relative">
              <div className="absolute -top-16 -right-12 w-48 h-48 rounded-full bg-white/10 blur-3xl" />
              <div className="absolute -bottom-12 -left-10 w-32 h-32 rounded-full bg-white/10 blur-2xl" />

              <div className="relative z-10 text-center pt-14 pb-12">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-white/15 shadow-inner">
                  <CheckCircle size={32} className="text-white" strokeWidth={2.5} />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70 mb-2">
                  {lessonMeta?.titleDE || 'Stark gemacht'}
                </p>
                <h1 className="text-3xl font-black tracking-tight mb-10">
                  Lektion abgeschlossen
                </h1>

                <div className="mt-8 grid grid-cols-3 gap-3 text-left">
                  <div className="rounded-2xl bg-white/10 border border-white/10 p-3.5">
                    <p className="text-[10px] uppercase font-black tracking-[0.16em] text-white/60 mb-1">Beantwortet</p>
                    <p className="text-xl font-black">{lessonProgress.answered}/{lessonProgress.total}</p>
                  </div>
                  <div className="rounded-2xl bg-white/10 border border-white/10 p-3.5">
                    <p className="text-[10px] uppercase font-black tracking-[0.16em] text-white/60 mb-1">Richtig</p>
                    <p className="text-xl font-black">{lessonProgress.correct}</p>
                  </div>
                  <div className="rounded-2xl bg-white/10 border border-white/10 p-3.5">
                    <p className="text-[10px] uppercase font-black tracking-[0.16em] text-white/60 mb-1">Fortschritt</p>
                    <p className="text-xl font-black">{completionPercentage}%</p>
                  </div>
                </div>

                <div className="mt-10 space-y-3">
                  {nextLesson ? (
                    <Button
                      fullWidth
                      size="lg"
                      variant="secondary"
                      onClick={() => navigate(`/learn/${moduleId}/lesson/${nextLesson.id}`, { state: location.state })}
                      rightIcon={<ChevronRight size={20} />}
                      className="bg-white text-slate-900 hover:bg-white/90"
                    >
                      Weiter mit der nächsten Lektion
                    </Button>
                  ) : null}

                  <Button
                    fullWidth
                    size="lg"
                    variant="ghost"
                    onClick={() => navigate('/')}
                    className="border border-white/20 bg-white/10 text-white hover:bg-white/15"
                  >
                    Zurück zum Lernplan
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }
  // Mini-Exam Result View with explanations
  if (examFinished && isMiniExam) {
    const passed = (examScore / queue.length) >= 0.5;
    const correctCount = questionResults.filter(r => r.isCorrect).length;
    const wrongCount = questionResults.filter(r => !r.isCorrect).length;
    const percentage = Math.round((examScore / queue.length) * 100);
    const unansweredCount = questionResults.filter(r => r.selectedAnswers.length === 0).length;

    return (
      <div className="pt-2 px-4 pb-32">
        {/* Result Header */}
        <Card className={`mb-5 text-center ${passed
          ? 'bg-gradient-to-br from-success to-emerald-600 border-none'
          : 'bg-white dark:bg-slate-800 border-2 border-error/20'}`} padding="md">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm ${passed
            ? 'bg-white/20'
            : 'bg-error-light dark:bg-error/10'}`}>
            {passed
              ? <Check size={32} className="text-white" strokeWidth={3} />
              : <X size={32} className="text-error" strokeWidth={3} />}
          </div>
          <h2 className={`text-xl font-black mb-1 ${passed ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
            {passed ? 'Bestanden!' : 'Nicht bestanden'}
          </h2>
          {language === 'DE_AR' && <p className={`mb-2 font-bold text-sm ${passed ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`} dir="rtl">{passed ? 'نجحت!' : 'لم تنجح'}</p>}
          <p className={`text-3xl font-black mb-0.5 ${passed ? 'text-white' : 'text-error'}`}>{percentage}%</p>
          <p className={`text-xs font-medium ${passed ? 'text-white/70' : 'text-slate-500 dark:text-slate-400'}`}>{examScore} von {queue.length} richtig</p>
          <p className={`text-[10px] mt-1.5 ${passed ? 'text-white/60' : 'text-slate-400 dark:text-slate-500'}`}>
            {passed ? '≥50% erreicht' : '<50% - Versuche es erneut!'}
          </p>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          <Card className="bg-success-light dark:bg-success/10 border-success/20 text-center" padding="sm">
            <CheckCircle className="text-success mx-auto mb-1" size={20} />
            <p className="text-xl font-black text-success-dark dark:text-success">{correctCount}</p>
            <p className="text-[10px] font-bold text-success-dark dark:text-success">Richtig</p>
          </Card>
          <Card className="bg-error-light dark:bg-error/10 border-error/20 text-center" padding="sm">
            <XCircle className="text-error mx-auto mb-1" size={20} />
            <p className="text-xl font-black text-error-dark dark:text-error">{wrongCount}</p>
            <p className="text-[10px] font-bold text-error-dark dark:text-error">Falsch</p>
          </Card>
          <Card className="bg-slate-100 dark:bg-slate-800 text-center" padding="sm">
            <AlertCircle className="text-slate-500 mx-auto mb-1" size={20} />
            <p className="text-xl font-black text-slate-700 dark:text-slate-300">{unansweredCount}</p>
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Offen</p>
          </Card>
        </div>

        {/* Questions with Explanations */}
        <div className="mb-5">
          <h3 className="font-black text-base text-slate-900 dark:text-white mb-2.5">
            Auswertung
            {language === 'DE_AR' && <span className="block text-xs font-medium text-slate-500 dark:text-slate-400" dir="rtl">التقييم</span>}
          </h3>
          <div className="space-y-3">
            {questionResults.map((result, index) => {
              const isExpanded = reviewingQuestion === index;
              const userAnswerTexts = result.selectedAnswers.map(id =>
                result.question.answers.find(a => a.id === id)?.textDE || ''
              );
              const correctAnswers = result.question.answers.filter(a => a.isCorrect);

              return (
                <Card
                  key={result.question.id}
                  className={`border-l-4 overflow-hidden transition-all ${result.isCorrect
                    ? 'border-l-success bg-success-light/30 dark:bg-success/5'
                    : result.selectedAnswers.length === 0
                      ? 'border-l-slate-400 bg-slate-50 dark:bg-slate-800/50'
                      : 'border-l-error bg-error-light/30 dark:bg-error/5'
                    }`}
                  padding="none"
                >
                  {/* Question Header - Clickable */}
                  <button
                    onClick={() => setReviewingQuestion(isExpanded ? null : index)}
                    className="w-full p-3 text-left flex items-start gap-2"
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {result.isCorrect ? (
                        <CheckCircle size={16} className="text-success" />
                      ) : result.selectedAnswers.length === 0 ? (
                        <AlertCircle size={16} className="text-slate-400" />
                      ) : (
                        <XCircle size={16} className="text-error" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <ChevronDown
                          size={14}
                          className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </div>
                      <p className="text-[13px] font-medium text-slate-900 dark:text-white line-clamp-2 leading-snug">
                        {result.question.textDE}
                      </p>
                      {language === 'DE_AR' && result.question.textAR && (
                        <p className="text-[9.5px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1 font-normal" dir="rtl">
                          {result.question.textAR}
                        </p>
                      )}
                    </div>
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-700">
                      {/* User's Answer */}
                      <div className="mt-3 mb-3">
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Deine Antwort:</p>
                        {userAnswerTexts.length > 0 ? (
                          userAnswerTexts.map((text, i) => (
                            <p key={i} className={`text-sm font-medium ${result.isCorrect ? 'text-success' : 'text-error'}`}>
                              {result.isCorrect ? '✓' : '✗'} {text}
                            </p>
                          ))
                        ) : (
                          <p className="text-sm text-slate-400 italic">Keine Antwort ausgewählt</p>
                        )}
                      </div>

                      {/* Correct Answer */}
                      {!result.isCorrect && (
                        <div className="mb-3">
                          <p className="text-xs font-bold text-success mb-1">Richtige Antwort:</p>
                          {correctAnswers.map((a, i) => (
                            <p key={i} className="text-sm font-medium text-success">
                              ✓ {a.textDE}
                            </p>
                          ))}
                        </div>
                      )}

                      {/* Explanation */}
                      {result.question.explanationDE && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 mt-2">
                          <p className="text-xs font-bold text-blue-700 dark:text-blue-400 mb-1">
                            Erklärung
                            {language === 'DE_AR' && <span className="mr-1" dir="rtl"> / تفسير</span>}
                          </p>
                          <ExplanationRenderer
                            text={result.question.explanationDE}
                          />
                          {language === 'DE_AR' && result.question.explanationAR && (
                            <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-800">
                              <ExplanationRenderer
                                text={result.question.explanationAR}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5">
          {!passed && (
            <Button
              fullWidth
              size="md"
              variant="primary"
              onClick={() => {
                setExamFinished(false);
                setExamScore(0);
                setQuestionResults([]);
                setCurrentIndex(0);
                setMiniExamAnswers({});
                setMiniExamTimeLeft(miniExamTimeLimit);
                setReviewingQuestion(null);
                // Re-shuffle questions
                setQueue(prev => [...prev].sort(() => 0.5 - Math.random()));
              }}
              leftIcon={<RotateCcw size={16} />}
            >
              Nochmal versuchen
            </Button>
          )}

          <Button
            fullWidth
            size="md"
            variant="secondary"
            onClick={() => navigate(`/practice/${moduleId}`)}
          >
            Zurück zur Fragenliste
          </Button>
        </div>
      </div>
    );
  }

  // Module Test Result View with detailed summary
  if (examFinished && isModuleTest) {
    const passed = (examScore / queue.length) >= 0.5;
    const correctCount = questionResults.filter(r => r.isCorrect).length;
    const wrongCount = questionResults.filter(r => !r.isCorrect && !r.timedOut).length;
    const timedOutCount = questionResults.filter(r => r.timedOut).length;
    const percentage = Math.round((examScore / queue.length) * 100);

    return (
      <div className="pt-4 px-4 pb-32 relative">
        {/* Close Button */}
        <button
          onClick={() => navigate('/')}
          className="absolute top-4 left-4 w-10 h-10 flex items-center justify-center rounded-full bg-slate-200/50 dark:bg-slate-800/50 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all z-50 shadow-sm"
        >
          <X size={24} />
        </button>

        {/* Result Header */}
        <Card className={`mb-6 text-center border-none ${passed ? 'bg-gradient-to-br from-success to-emerald-600' : 'bg-gradient-to-br from-error to-rose-600'}`} padding="lg">
          <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
            {passed ? <Check size={40} className="text-white" strokeWidth={3} /> : <X size={40} className="text-white" strokeWidth={3} />}
          </div>
          <h2 className="text-2xl font-black text-white mb-1">{passed ? 'Bestanden!' : 'Nicht bestanden'}</h2>
          {language === 'DE_AR' && <p className="text-white/80 mb-2 font-bold">{passed ? 'نجح!' : 'رسب'}</p>}
          <p className="text-white/90 text-lg font-bold">{percentage}%</p>
          <p className="text-white/70 text-sm font-medium">{examScore} von {queue.length} richtig</p>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="bg-success-light dark:bg-success/10 border-success/20 text-center" padding="sm">
            <CheckCircle className="text-success mx-auto mb-1" size={24} />
            <p className="text-2xl font-black text-success-dark dark:text-success">{correctCount}</p>
            <p className="text-xs font-bold text-success-dark dark:text-success">Richtig</p>
          </Card>
          <Card className="bg-error-light dark:bg-error/10 border-error/20 text-center" padding="sm">
            <XCircle className="text-error mx-auto mb-1" size={24} />
            <p className="text-2xl font-black text-error-dark dark:text-error">{wrongCount}</p>
            <p className="text-xs font-bold text-error-dark dark:text-error">Falsch</p>
          </Card>
          <Card className="bg-warning-light dark:bg-warning/10 border-warning/20 text-center" padding="sm">
            <Timer className="text-warning mx-auto mb-1" size={24} />
            <p className="text-2xl font-black text-warning-dark dark:text-warning">{timedOutCount}</p>
            <p className="text-xs font-bold text-warning-dark dark:text-warning">Zeit abgelaufen</p>
          </Card>
        </div>

        {/* Questions Summary */}
        {questionResults.length > 0 && (
          <div className="mb-6">
            <h3 className="font-black text-lg text-slate-900 dark:text-white mb-3">Alle Fragen</h3>
            <div className="space-y-2">
              {questionResults.map((result, index) => (
                <Card
                  key={result.question.id}
                  className={`border-l-4 ${result.isCorrect
                    ? 'border-l-success bg-success-light/30 dark:bg-success/5 border-y-slate-100 border-r-slate-100 dark:border-y-slate-800 dark:border-r-slate-800'
                    : result.timedOut
                      ? 'border-l-warning bg-warning-light/30 dark:bg-warning/5 border-y-slate-100 border-r-slate-100 dark:border-y-slate-800 dark:border-r-slate-800'
                      : 'border-l-error bg-error-light/30 dark:bg-error/5 border-y-slate-100 border-r-slate-100 dark:border-y-slate-800 dark:border-r-slate-800'
                    }`}
                  padding="sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {result.isCorrect ? (
                        <CheckCircle size={18} className="text-success" />
                      ) : result.timedOut ? (
                        <Timer size={18} className="text-warning" />
                      ) : (
                        <XCircle size={18} className="text-error" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${result.isCorrect
                          ? 'bg-success-light dark:bg-success/20 text-success-dark dark:text-success'
                          : result.timedOut
                            ? 'bg-warning-light dark:bg-warning/20 text-warning-dark dark:text-warning'
                            : 'bg-error-light dark:bg-error/20 text-error-dark dark:text-error'
                          }`}>
                          {result.isCorrect ? 'Richtig' : result.timedOut ? 'Zeit abgelaufen' : 'Falsch'}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white line-clamp-2">{result.question.textDE}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          {/* Next Module Button */}
          {nextModule && passed && (
            <Button
              fullWidth
              size="lg"
              variant="primary"
              onClick={() => navigate(`/practice/${nextModule.id}`)}
              rightIcon={<ChevronRight size={24} />}
              className="h-auto py-4 flex items-center justify-between shadow-lg"
            >
              <div className="text-left">
                <p className="font-bold">Nächstes Thema</p>
                <p className="text-xs text-blue-200 line-clamp-1 font-normal">{nextModule.titleDE}</p>
              </div>
            </Button>
          )}

          {/* Retry Test Button */}
          {!passed && mode !== 'module-wrong' && (
            <Button
              fullWidth
              size="lg"
              variant="ghost"
              onClick={() => {
                setExamFinished(false);
                setExamScore(0);
                setQuestionResults([]);
                setCurrentIndex(0);
                setSelectedAnswers([]);
                setIsChecked(false);
                setTimeLeft(90);
                // Re-shuffle questions
                setQueue(prev => [...prev].sort(() => 0.5 - Math.random()));
              }}
              leftIcon={<RotateCcw size={18} />}
              className="bg-warning-light dark:bg-warning/20 text-warning-dark dark:text-warning hover:bg-warning-light/80"
            >
              Nochmal versuchen
            </Button>
          )}

          {wrongCount + timedOutCount > 0 && mode !== 'module-wrong' && (
            <Button
              fullWidth
              size="lg"
              variant="ghost"
              onClick={() => navigate('/wrong-answers')}
              leftIcon={<XCircle size={18} />}
              className="bg-error-light dark:bg-error/20 text-error-dark dark:text-error hover:bg-error-light/80"
            >
              Falsche Fragen üben
            </Button>
          )}
          <Button
            fullWidth
            variant="secondary"
            onClick={() => navigate(`/practice/${moduleId}`)}
          >
            Zurück zur Fragenliste
          </Button>
          <Button
            fullWidth
            variant="primary"
            onClick={() => navigate('/')}
          >
            Zum Dashboard
          </Button>
        </div>
      </div>
    );
  }

  // Regular Exam/Module Completion Result View
  if (examFinished) {
    const correctCount = Object.values(progress.answeredQuestions).filter(v => v === true).length;
    const wrongCount = Object.values(progress.answeredQuestions).filter(v => v === false).length;
    const totalAnswered = correctCount + wrongCount;
    const percentage = totalAnswered > 0 ? Math.round((correctCount / queue.length) * 100) : 0;
    const currentModuleId = moduleId || (queue.length > 0 ? queue[0].moduleId : null);

    // Module completion view (when finishing all questions in a module)
    if (currentModuleId && !mode) {
      return (
        <div className="pt-4 px-4 pb-32 relative">
          {/* Close Button */}
          <button
            onClick={() => navigate('/')}
            className="absolute top-4 left-4 w-10 h-10 flex items-center justify-center rounded-full bg-slate-200/50 dark:bg-slate-800/50 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all z-50 shadow-sm"
          >
            <X size={24} />
          </button>

          {/* Celebration Header */}
          <Card className="mb-6 text-center border-none bg-gradient-to-br from-warning to-orange-500" padding="lg">
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
              <Trophy size={40} className="text-white" strokeWidth={3} />
            </div>
            <h2 className="text-2xl font-black text-white mb-1">Glückwunsch!</h2>
            {language === 'DE_AR' && <p className="text-white/80 mb-2 font-bold">تهانينا!</p>}
            <p className="text-white/90 text-sm font-medium">Du hast alle Fragen in diesem Thema beantwortet!</p>
            {language === 'DE_AR' && <p className="text-white/70 text-xs mt-1" dir="rtl">لقد أجبت على جميع الأسئلة في هذا الموضوع!</p>}
          </Card>

          {/* Module Title */}
          {moduleTitle && (
            <Card className="mb-4 text-center" padding="md">
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-black tracking-wider mb-1">Thema abgeschlossen</p>
              <h3 className="font-bold text-slate-900 dark:text-white text-lg">{moduleTitle.de}</h3>
              {language === 'DE_AR' && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1" dir="rtl">{moduleTitle.ar}</p>}
            </Card>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <Card className="bg-primary-light dark:bg-primary/10 border-primary/20 text-center" padding="sm">
              <p className="text-2xl font-black text-primary-dark dark:text-primary">{queue.length}</p>
              <p className="text-xs font-bold text-primary-dark dark:text-primary">Fragen</p>
            </Card>
            <Card className="bg-success-light dark:bg-success/10 border-success/20 text-center" padding="sm">
              <CheckCircle className="text-success mx-auto mb-1" size={20} />
              <p className="text-2xl font-black text-success-dark dark:text-success">{correctCount}</p>
              <p className="text-xs font-bold text-success-dark dark:text-success">Richtig</p>
            </Card>
            <Card className="bg-error-light dark:bg-error/10 border-error/20 text-center" padding="sm">
              <XCircle className="text-error mx-auto mb-1" size={20} />
              <p className="text-2xl font-black text-error-dark dark:text-error">{wrongCount}</p>
              <p className="text-xs font-bold text-error-dark dark:text-error">Falsch</p>
            </Card>
          </div>

          {/* Progress Bar */}
          <Card className="mb-6" padding="md">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Erfolgsquote</span>
              <span className="text-sm font-black text-slate-900 dark:text-white">{percentage}%</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-4 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ease-out ${percentage >= 50 ? 'bg-success' : 'bg-error'}`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </Card>

          {/* Action Buttons */}
          <div className="space-y-3">
            {/* Wissen testen Button - Hidden for bookmarks as requested */}
            {!fromBookmarks && (
              <Button
                fullWidth
                size="lg"
                variant="primary"
                onClick={() => navigate(`/quiz?mode=module-test&module=${currentModuleId}`)}
                leftIcon={<Play size={22} fill="currentColor" />}
                className="bg-gradient-to-r from-success to-emerald-600 border-none shadow-lg hover:shadow-xl hover:-translate-y-1"
              >
                <div className="text-left">
                  <p className="font-bold">Wissen testen</p>
                  <p className="text-xs text-green-100 font-normal">Mini-Prüfung starten</p>
                </div>
              </Button>
            )}

            {/* Next Module Button */}
            {nextModule && !fromBookmarks && (
              <Button
                fullWidth
                size="lg"
                variant="primary"
                onClick={() => navigate(`/practice/${nextModule.id}`)}
                rightIcon={<ChevronRight size={24} />}
                className="h-auto py-4 flex items-center justify-between shadow-lg"
              >
                <div className="text-left">
                  <p className="font-bold">Nächstes Thema</p>
                  <p className="text-xs text-blue-200 line-clamp-1 font-normal">{nextModule.titleDE}</p>
                </div>
              </Button>
            )}

            <Button
              fullWidth
              variant="secondary"
              onClick={() => navigate(fromBookmarks ? '/bookmarks' : `/practice/${currentModuleId}`)}
            >
              {fromBookmarks ? 'Zurück zu den Favoriten' : 'Zurück zur Fragenliste'}
            </Button>

            <Button
              fullWidth
              variant="ghost"
              onClick={() => navigate('/')}
              className="text-slate-500"
            >
              Zum Dashboard
            </Button>
          </div>
        </div>
      );
    }

    // Regular exam result (random mode or exam mode)
    const passed = (examScore / queue.length) >= 0.5;
    return (
      <div className="pt-16 px-4 min-h-screen flex flex-col items-center justify-center text-center pb-20">
        <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-xl ${passed ? 'bg-success-light dark:bg-success/20 text-success' : 'bg-error-light dark:bg-error/20 text-error'}`}>
          {passed ? <Check size={48} strokeWidth={3} /> : <X size={48} strokeWidth={3} />}
        </div>
        <h2 className="text-3xl font-black mb-2 text-slate-900 dark:text-white">{passed ? 'Bestanden!' : 'Nicht bestanden'}</h2>
        {language === 'DE_AR' && <p className="text-lg text-slate-500 dark:text-slate-400 mb-4 font-bold">{passed ? 'نجح!' : 'رسب'}</p>}

        <p className="text-slate-600 dark:text-slate-300 mb-8 text-lg font-medium max-w-xs mx-auto">
          Du hast <span className="font-black text-slate-900 dark:text-white">{examScore}</span> von <span className="font-black text-slate-900 dark:text-white">{queue.length}</span> Fragen richtig beantwortet.
        </p>

        <Button
          size="lg"
          variant="primary"
          onClick={() => navigate('/')}
          className="px-12 shadow-xl hover:shadow-2xl hover:-translate-y-1"
        >
          <div className="flex flex-col items-center">
            <span>Zurück zum Dashboard</span>
            {language === 'DE_AR' && <span className="text-[10px] font-normal opacity-80">العودة للوحة القيادة</span>}
          </div>
        </Button>
      </div>
    );
  }

  const isBookmarked = currentQuestion ? progress.bookmarks.includes(currentQuestion.id) : false;

  // Show popup for module-test intro even if questions are still loading
  if (mode === 'module-test' && !testStarted && !examFinished) {
    return (
      <div className="min-h-screen bg-[#F2F4F6] dark:bg-slate-950">
        {/* Module Test Intro Popup */}
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <Card className="max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl relative" padding="none">
            <div className="sticky top-0 bg-white dark:bg-slate-850 p-4 flex justify-end z-10">
              <button
                onClick={() => navigate(`/practice/${moduleId}`)}
                className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X size={24} className="text-slate-500 dark:text-slate-400" />
              </button>
            </div>

            <div className="px-6 pb-8">
              {/* Header */}
              <Card
                variant="interactive"
                onClick={() => queue.length > 0 && setTestStarted(true)}
                className={`mb-6 text-center border-none bg-gradient-to-br from-success to-emerald-600 ${queue.length === 0 ? 'opacity-80 cursor-wait' : ''}`}
                padding="lg"
              >
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
                  <Play size={40} className="text-white ml-1" fill="currentColor" />
                </div>
                <h2 className="text-2xl font-black text-white mb-1">Wissen testen</h2>
                {language === 'DE_AR' && <p className="text-white/80 mb-2 font-bold">اختبار المعرفة</p>}
                <p className="text-white/90 text-sm font-medium">Mini-Prüfung für dieses Thema</p>
              </Card>

              {/* Module Title */}
              {moduleTitle && (
                <Card className="mb-6 text-center" padding="md">
                  <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-black tracking-wider mb-1">Thema</p>
                  <h3 className="font-bold text-slate-900 dark:text-white text-lg">{moduleTitle.de}</h3>
                  {language === 'DE_AR' && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1" dir="rtl">{moduleTitle.ar}</p>}
                </Card>
              )}

              {/* Info Cards */}
              <div className="space-y-3 mb-8">
                <Card className="flex items-center gap-4 bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/30" padding="md">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center flex-shrink-0 text-blue-600 dark:text-blue-400">
                    <AlertCircle size={24} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white text-sm">{queue.length > 0 ? `${queue.length} Fragen` : 'Lade Fragen...'}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Alle Fragen werden zufällig gemischt</p>
                  </div>
                </Card>

                <Card className="flex items-center gap-4 bg-warning-light/30 dark:bg-warning/5 border-warning/20" padding="md">
                  <div className="w-12 h-12 bg-warning-light dark:bg-warning/20 rounded-2xl flex items-center justify-center flex-shrink-0 text-warning-dark dark:text-warning">
                    <Clock size={24} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white text-sm">1:30 Min. pro Frage</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Beantworte schnell, die Zeit läuft!</p>
                  </div>
                </Card>

                <Card className="flex items-center gap-4 bg-success-light/30 dark:bg-success/5 border-success/20" padding="md">
                  <div className="w-12 h-12 bg-success-light dark:bg-success/20 rounded-2xl flex items-center justify-center flex-shrink-0 text-success-dark dark:text-success">
                    <Trophy size={24} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white text-sm">50% zum Bestehen</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Mindestens die Hälfte richtig beantworten</p>
                  </div>
                </Card>

                <Card className="flex items-center gap-4 bg-error-light/30 dark:bg-error/5 border-error/20" padding="md">
                  <div className="w-12 h-12 bg-error-light dark:bg-error/20 rounded-2xl flex items-center justify-center flex-shrink-0 text-error-dark dark:text-error">
                    <XCircle size={24} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white text-sm">Falsche Antworten</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Werden zur Wiederholung gespeichert</p>
                  </div>
                </Card>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <Button
                  fullWidth
                  size="lg"
                  variant="primary"
                  onClick={() => setTestStarted(true)}
                  disabled={queue.length === 0}
                  leftIcon={<Play size={24} fill="currentColor" />}
                  className="bg-gradient-to-r from-success to-emerald-600 border-none shadow-lg hover:shadow-xl hover:-translate-y-1"
                >
                  {queue.length > 0 ? 'Test starten' : 'Lade...'}
                </Button>

                <Button
                  fullWidth
                  variant="secondary"
                  onClick={() => navigate(`/practice/${moduleId}`)}
                >
                  Abbrechen
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // If no question and not in intro mode, show loading


  return (
    <div className="bg-[#F2F4F6] dark:bg-slate-950 pb-6 lg:pb-8">
      {/* Desktop Layout: Sidebar + Main Content */}
      <div className="lg:flex lg:gap-6 lg:px-6 lg:pt-6">

        {/* Desktop Question List Sidebar - Hidden on mobile */}
        <div className="hidden lg:block lg:w-72 lg:flex-shrink-0">
          <div className="sticky top-6">
            <Card className="overflow-hidden" padding="none">
              <div className="bg-slate-50 dark:bg-slate-800 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Fragenliste
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {queue.filter(q => progress.answeredQuestions.hasOwnProperty(q.id)).length} von {queue.length} beantwortet
                </p>
              </div>

              <div className="max-h-[calc(100vh-200px)] overflow-y-auto p-2 space-y-1 desktop-scrollbar">
                {queue.map((q, idx) => {
                  const isAnswered = progress.answeredQuestions.hasOwnProperty(q.id);
                  const isCorrect = progress.answeredQuestions[q.id] === true;
                  const isWrong = progress.answeredQuestions[q.id] === false;
                  const isCurrent = idx === currentIndex;
                  const questionNum = idx + 1;
                  const isLocked = !isQuestionAccessible(q);

                  return (
                    <button
                      key={q.id}
                      onClick={() => {
                        // Check if question is accessible
                        if (isLocked) {
                          openPaywall('Premium Fragen');
                          return;
                        }
                        setCurrentIndex(idx);
                        setIsChecked(false);
                        setSelectedAnswers([]);

                        setShowExplanation(false);
                        setExplanationExpanded(false);
                        setQualityResult(null);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 group ${isLocked
                        ? 'bg-amber-50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/20 cursor-pointer'
                        : isCurrent
                          ? 'bg-primary text-white shadow-md'
                          : isCorrect
                            ? 'bg-success-light dark:bg-success/10 hover:bg-success-light/80 dark:hover:bg-success/20'
                            : isWrong
                              ? 'bg-error-light dark:bg-error/10 hover:bg-error-light/80 dark:hover:bg-error/20'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                    >
                      {/* Question Number Badge */}
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${isLocked
                        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-500'
                        : isCurrent
                          ? 'bg-white/20 text-white'
                          : isCorrect
                            ? 'bg-success text-white'
                            : isWrong
                              ? 'bg-error text-white'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                        }`}>
                        {isLocked ? <Lock size={12} /> :
                          isCorrect && !isCurrent ? <Check size={14} strokeWidth={3} /> :
                            isWrong && !isCurrent ? <X size={14} strokeWidth={3} /> :
                              questionNum}
                      </div>

                      {/* Question Text Preview */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium leading-snug line-clamp-2 ${isLocked
                          ? 'text-amber-700 dark:text-amber-400'
                          : isCurrent
                            ? 'text-white'
                            : isCorrect
                              ? 'text-success-dark dark:text-success'
                              : isWrong
                                ? 'text-error-dark dark:text-error'
                                : 'text-slate-700 dark:text-slate-300'
                          }`}>
                          {q.textDE}
                        </p>
                      </div>

                      {/* Indicator for current or locked */}
                      {isLocked ? (
                        <Crown size={14} className="text-amber-500 flex-shrink-0" />
                      ) : isCurrent && (
                        <ChevronRight size={16} className="text-white/80 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>

        {/* Main Quiz Content */}
        <div className="flex-1 lg:max-w-3xl">
          {/* Scrollable Content Area */}
          <div className="pt-4 px-3.5 pb-4 lg:pt-0 lg:px-0">
            {/* New Unified Quiz Header */}
            <Card className="mb-4 shadow-sm border-slate-200 dark:border-slate-800" padding="md">
              <div className="flex flex-col gap-4">
                {/* Top Row: Back, Title, Settings */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        if (isLessonMode && moduleId && lessonId) {
                          navigate(`/learn/${moduleId}/lesson/${lessonId}`, {
                            state: {
                              ...(location.state as Record<string, unknown> || {}),
                              scrollToQuestions: true,
                            },
                          });
                        } else if (moduleId) {
                          // Save current question position for auto-scroll on return
                          if (queue[currentIndex]) {
                            sessionStorage.setItem('last_viewed_question_id', queue[currentIndex].id);
                            sessionStorage.setItem('returning_from_quiz', 'true');
                          }
                          navigate(`/practice/${moduleId}`);
                        } else if (fromBookmarks) {
                          navigate('/bookmarks');
                        } else if (mode === 'module-wrong') {
                          navigate('/wrong-answers');
                        } else {
                          navigate('/practice');
                        }
                      }}
                      className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-500 dark:text-slate-400"
                    >
                      <ArrowLeft size={24} />
                    </button>
                    <div>
                      {moduleTitle && (
                        <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-tight line-clamp-2">
                          {isLessonMode && lessonMeta?.titleDE ? lessonMeta.titleDE : moduleTitle.de}
                        </h2>
                      )}
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                        {isLessonMode
                          ? 'Fragen zu dieser Lektion'
                          : mode === 'module-test'
                            ? 'Wissenstest'
                            : mode === 'exam'
                              ? 'Prüfungssimulation'
                              : 'Übungsmodus'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Language Toggle */}
                    {settings.showLanguageToggle && (
                      <button
                        onClick={toggleLanguage}
                        className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${language === 'DE_AR'
                          ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                          }`}
                      >
                        <Languages size={20} />
                      </button>
                    )}

                    {/* Settings */}
                    <button
                      onClick={() => setShowSettingsDialog(true)}
                      className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
                    >
                      <Settings size={20} />
                    </button>
                  </div>
                </div>

                {/* Divider */}
                <div className="h-px bg-slate-100 dark:bg-slate-800 w-full" />

                {/* Bottom Row: Progress, Arrows, Bookmark */}
                <div className="flex items-center justify-between">
                  {/* Progress Counter */}
                  <div className="min-w-[60px] sm:min-w-[80px]">
                    {(() => {
                      const currentQuestionNum = currentIndex + 1;
                      const totalQuestions = queue.length;

                      return (
                        <div className="flex flex-col">
                          <span className="text-[12px] font-black text-slate-900 dark:text-white">
                            Frage {currentQuestionNum} <span className="text-slate-400 text-[10px] font-normal">/ {totalQuestions}</span>
                          </span>
                          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all duration-300"
                              style={{ width: `${(currentQuestionNum / totalQuestions) * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Navigation Arrows */}
                  <div className="flex items-center gap-2 sm:gap-3">
                    <button
                      onClick={() => {
                        if (currentIndex > 0) {
                          const prevId = queue[currentIndex - 1]?.id;
                          setCurrentIndex(prev => prev - 1);
                          setIsChecked(false);
                          setSelectedAnswers([]);

                          setShowExplanation(false);
                          setExplanationExpanded(false);
                          setQualityResult(null);
                        }
                      }}
                      disabled={currentIndex === 0}
                      className="w-[34px] h-[34px] rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 transition-all"
                    >
                      <ChevronLeft size={17} />
                    </button>

                    {/* Timer (if needed) */}
                    {mode === 'module-test' && !isChecked && (
                      <div className={`flex items-center gap-1.5 px-2 py-1.5 sm:px-3 rounded-lg font-bold text-sm ${timeLeft > 20 ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' :
                        timeLeft > 10 ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' :
                          'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 animate-pulse'
                        }`}>
                        <Clock size={16} />
                        <span className="tabular-nums">{timeLeft}s</span>
                      </div>
                    )}

                    {/* Mini-Exam Global Timer */}
                    {isMiniExam && (
                      <div className={`flex items-center gap-1.5 px-2 py-1.5 sm:px-3 rounded-lg font-bold text-sm ${miniExamTimeLeft > 300 ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' :
                        miniExamTimeLeft > 60 ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' :
                          'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 animate-pulse'
                        }`}>
                        <Clock size={16} />
                        <span className="tabular-nums">
                          {Math.floor(miniExamTimeLeft / 60)}:{(miniExamTimeLeft % 60).toString().padStart(2, '0')}
                        </span>
                      </div>
                    )}

                    <button
                      onClick={() => {
                        if (currentIndex < queue.length - 1) {
                          const nextQuestion = queue[currentIndex + 1];
                          if (!isQuestionAccessible(nextQuestion)) {
                            openPaywall('Premium Fragen');
                            return;
                          }
                          setCurrentIndex(prev => prev + 1);
                          setIsChecked(false);
                          setSelectedAnswers([]);

                          setShowExplanation(false);
                          setExplanationExpanded(false);
                          setQualityResult(null);
                        }
                      }}
                      disabled={currentIndex === queue.length - 1}
                      className="w-[34px] h-[34px] rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 transition-all"
                    >
                      <ChevronRight size={17} />
                    </button>
                  </div>

                  {/* Bookmark + Admin Reviewed */}
                  <div className="min-w-[60px] sm:min-w-[80px] flex justify-end items-center gap-1">
                    {/* Admin: Reviewed Checkbox */}
                    {isAdmin && currentQuestion && (
                      <button
                        onClick={async () => {
                          const newVal = !reviewedMap[currentQuestion.id];
                          setReviewedMap(prev => ({ ...prev, [currentQuestion.id]: newVal }));
                          try {
                            await db.updateQuestion(currentQuestion.id, { reviewed: newVal });
                          } catch (e) {
                            console.warn('Failed to save reviewed status:', e);
                            setReviewedMap(prev => ({ ...prev, [currentQuestion.id]: !newVal }));
                          }
                        }}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${reviewedMap[currentQuestion.id]
                          ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500'
                          }`}
                        title={reviewedMap[currentQuestion.id] ? 'Überprüft ✓' : 'Als überprüft markieren'}
                      >
                        {reviewedMap[currentQuestion.id]
                          ? <CheckCircle size={20} />
                          : <Circle size={20} />
                        }
                      </button>
                    )}
                    {mode !== 'module-test' && (
                      <button
                        onClick={() => {
                          if (!user?.isLoggedIn) navigate('/profile');
                          else toggleBookmark(currentQuestion.id);
                        }}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isBookmarked
                          ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500'
                          }`}
                      >
                        <Bookmark size={20} fill={isBookmarked ? "currentColor" : "none"} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {/* Quiz Settings Dialog */}
            {showSettingsDialog && (
              <QuizSettingsDialog
                onClose={() => setShowSettingsDialog(false)}
              />
            )}

            {/* Question Card */}
            {!currentQuestion ? (
              <div className="mb-8 lg:mx-0">
                <Card className="border-2 border-slate-200 dark:border-slate-800" padding="none">
                  <div className="p-6 bg-slate-50 dark:bg-slate-800/50 space-y-4 animate-pulse">
                    <div className="h-6 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
                    <div className="h-4 w-1/2 bg-slate-200 dark:bg-slate-700 rounded" />
                  </div>
                  <div className="p-4 space-y-4 animate-pulse">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700" />
                    ))}
                  </div>
                </Card>
              </div>
            ) : (
              <div className="mb-8 lg:mx-0">
                <Card className={`relative border-2 border-slate-200 dark:border-slate-800 transition-all duration-300 ${isChecked ? (() => {
                  const correctIds = currentQuestion.answers.filter(a => a.isCorrect).map(a => a.id);
                  const selectedCorrectCount = selectedAnswers.filter(id => correctIds.includes(id)).length;
                  const isFullyCorrect = correctIds.length === selectedAnswers.length && correctIds.every(id => selectedAnswers.includes(id));
                  const isPartiallyCorrect = selectedCorrectCount > 0 && !isFullyCorrect;

                  if (isFullyCorrect) return 'shadow-[0_0_30px_-5px_rgba(16,185,129,0.4)] dark:shadow-[0_0_30px_-5px_rgba(16,185,129,0.3)] border-success/50';
                  if (isPartiallyCorrect) return 'shadow-[0_0_30px_-5px_rgba(245,158,11,0.4)] dark:shadow-[0_0_30px_-5px_rgba(245,158,11,0.3)] border-warning/50';
                  return 'shadow-[0_0_30px_-5px_rgba(239,68,68,0.4)] dark:shadow-[0_0_30px_-5px_rgba(239,68,68,0.3)] border-error/50';
                })() : ''}`} padding="none">
                  {/* Question Section with distinct background */}
                  <div className="relative">
                    <div className="bg-slate-50/50 dark:bg-slate-800/50 p-6 border-b border-slate-100 dark:border-slate-700/50 rounded-t-[14px] overflow-hidden">
                      <h2 className={`${currentFontSize.question} font-bold text-slate-900 dark:text-white leading-relaxed`}>{currentQuestion.textDE}</h2>
                      {language === 'DE_AR' && (
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1.5 text-left font-normal leading-relaxed" dir="rtl">{currentQuestion.textAR}</p>
                      )}
                    </div>

                    {/* Floating Multi-Choice Badge on Divider Line - Left Aligned */}
                    {currentQuestion.type === QuestionType.MULTIPLE_CHOICE && (
                      <div className="absolute bottom-0 left-6 translate-y-1/2 z-10 flex flex-col items-center text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900 px-3 py-0.5 rounded-full shadow-sm border border-blue-100 dark:border-blue-800">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <AlertCircle size={8} strokeWidth={2} />
                          <span className="text-[7.5px] font-bold uppercase tracking-wider">Bitte 2 Antworten wählen</span>
                        </div>
                        {language === 'DE_AR' && <span className="text-[8px] font-medium mt-0.5" dir="rtl">يرجى اختيار إجابتين</span>}
                      </div>
                    )}
                  </div>

                  {/* Answers Section */}
                  <div className={`flex flex-col gap-1.5 p-3 ${currentQuestion.type === QuestionType.MULTIPLE_CHOICE ? 'pt-5' : ''}`}>
                    {currentQuestion.answers.map((answer) => {
                      const isSelected = isMiniExam
                        ? (miniExamAnswers[currentQuestion.id] || []).includes(answer.id)
                        : selectedAnswers.includes(answer.id);
                      const isCorrect = answer.isCorrect;

                      let rowClass = "w-full text-left transition-all duration-200 flex items-center py-2 px-3 rounded-xl border group active:scale-[0.99] border-slate-200 dark:border-slate-800";

                      if (isChecked) {
                        if (isCorrect) {
                          rowClass += " bg-success-light dark:bg-success/20 border-success/30";
                        } else if (isSelected && !isCorrect) {
                          rowClass += " bg-error-light dark:bg-error/20 border-error/30";
                        } else {
                          rowClass += " opacity-50";
                        }
                      } else {
                        if (isSelected) {
                          rowClass += " bg-primary-light dark:bg-primary/20 border-primary/30";
                        } else {
                          rowClass += " bg-white dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-700";
                        }
                      }

                      return (
                        <button
                          key={answer.id}
                          onClick={() => isMiniExam ? handleMiniExamSelect(answer.id) : handleSelect(answer.id)}
                          className={rowClass}
                          disabled={isChecked}
                        >
                          <div className={`flex items-center w-full ${language === 'DE_AR' ? 'gap-2.5' : 'gap-3'}`}>
                            <div className={`${language === 'DE_AR' ? 'w-6' : 'w-7'} flex items-center justify-center flex-shrink-0 transition-colors`}>
                              {isChecked ? (
                                isCorrect ? (
                                  <div className={`${language === 'DE_AR' ? 'w-5 h-5' : 'w-6 h-6'} rounded-full bg-success flex items-center justify-center text-white`}>
                                    <Check size={currentFontSize.icon - 2} strokeWidth={4} />
                                  </div>
                                ) : isSelected ? (
                                  <div className={`${language === 'DE_AR' ? 'w-5 h-5' : 'w-6 h-6'} rounded-full bg-error flex items-center justify-center text-white`}>
                                    <X size={currentFontSize.icon - 2} strokeWidth={4} />
                                  </div>
                                ) : (
                                  <span className={`${currentFontSize.index} font-black text-slate-300 dark:text-slate-700`}>
                                    {String.fromCharCode(65 + currentQuestion.answers.indexOf(answer))}
                                  </span>
                                )
                              ) : (
                                <span className={`${currentFontSize.index} font-black transition-all duration-200 ${isSelected ? 'text-primary' : 'text-slate-300 dark:text-slate-600 group-hover:text-primary'}`}>
                                  {String.fromCharCode(65 + currentQuestion.answers.indexOf(answer))}
                                </span>
                              )}
                            </div>

                            <div className="flex-1">
                              <p className={`${currentFontSize.answer} font-semibold leading-normal transition-colors ${isChecked && isCorrect ? 'text-success-dark dark:text-success' :
                                isChecked && isSelected && !isCorrect ? 'text-error-dark dark:text-error' :
                                  isSelected ? 'text-primary-dark dark:text-primary' :
                                    'text-slate-700 dark:text-slate-200'
                                }`}>
                                {answer.textDE}
                              </p>
                              {language === 'DE_AR' && (
                                <p className={`text-[10.5px] ${language === 'DE_AR' ? 'mt-1' : 'mt-2'} text-left font-normal leading-relaxed ${isChecked && isCorrect ? 'text-success-dark/70 dark:text-success/70' :
                                  isChecked && isSelected && !isCorrect ? 'text-error-dark/70 dark:text-error/70' :
                                    isSelected ? 'text-primary-dark/70 dark:text-primary/70' :
                                      'text-slate-500 dark:text-slate-400'
                                  }`} dir="rtl">
                                  {answer.textAR}
                                </p>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </Card>

                {/* Explanation Section - directly under question card */}
                {isChecked && !isModuleTest && !isMiniExam && (
                  <div className="mt-3 pb-36">
                    {showExplanation ? (
                      <div ref={explanationRef}>
                        <ExplanationRenderer
                          text={currentQuestion.explanationDE}
                          textAR={currentQuestion.explanationAR}
                          language={language}
                        />

                        {/* Link to Lesson - Only if lessonId is available */}
                        {currentQuestion.lessonId && (
                          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
                            <button
                              onClick={() => {
                                const correctAnswer = currentQuestion.answers.find(a => a.isCorrect)?.textDE || "";
                                const combinedText = `${currentQuestion.textDE} ${correctAnswer}`;

                                navigate(`/learn/${currentQuestion.moduleId}/lesson/${currentQuestion.lessonId}`, {
                                  state: {
                                    fromQuestion: currentQuestion.id,
                                    highlightText: combinedText,
                                    anchorId: currentQuestion.anchorId
                                  }
                                });
                              }}
                              className="flex items-center gap-2 text-primary hover:text-primary-dark font-bold text-sm transition-colors group"
                            >
                              <span className="bg-primary/10 p-1.5 rounded-full group-hover:bg-primary/20 transition-colors">
                                <BookOpen size={16} />
                              </span>
                              <span>Lektion ansehen & vertiefen</span>
                              <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      // Button nur zeigen wenn Antwort richtig war
                      <button
                        onClick={() => {
                          setShowExplanation(true);
                          setExplanationExpanded(true);
                          setTimeout(() => {
                            explanationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }, 50);
                        }}
                        className="w-full bg-white/60 dark:bg-slate-800/60 backdrop-blur-md text-slate-600 dark:text-slate-300 font-medium py-3 rounded-xl flex items-center justify-center gap-2 text-sm border border-slate-200/50 dark:border-slate-700/50 transition-all hover:bg-white/80 dark:hover:bg-slate-700/80 shadow-sm"
                      >
                        <Lightbulb size={16} />
                        <span>Erklärung zeigen</span>
                        {language === 'DE_AR' && <span className="text-xs opacity-70">| عرض الشرح</span>}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Admin Actions Toggle */}
            {isAdmin && currentQuestion && (
              <div className="mb-4 lg:mx-0">
                <button
                  onClick={() => setShowAdminActions(!showAdminActions)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all duration-200 ${showAdminActions
                    ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700'}`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${showAdminActions ? 'bg-indigo-100 dark:bg-indigo-800' : 'bg-slate-100 dark:bg-slate-700'}`}>
                      <Settings size={16} className={showAdminActions ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'} />
                    </div>
                    <span className={`font-bold text-sm ${showAdminActions ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'}`}>
                      Admin Aktionen
                    </span>
                  </div>
                  {showAdminActions ? (
                    <ChevronUp size={20} className="text-indigo-500" />
                  ) : (
                    <ChevronDown size={20} className="text-slate-400" />
                  )}
                </button>

                {showAdminActions && (
                  <div className="mt-4 space-y-4">
                    {/* Optimized Question Preview Card */}
                    {isAdmin && qualityResult?.optimized_question && (
                      <div className="mt-4 mb-4 lg:mx-0">
                        <div className="relative">
                          <div className="absolute -top-3 left-4 px-3 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] font-black rounded-full shadow-md z-10 flex items-center gap-1">
                            <Sparkles size={10} />
                            KI-Optimierter Vorschlag
                          </div>
                          <div className="border-2 border-blue-400 dark:border-blue-600 rounded-2xl overflow-hidden shadow-sm">
                            <div className="p-5 pb-4 bg-blue-50/30 dark:bg-blue-950/20">
                              <div className="flex items-center gap-2 mb-3">
                                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                  {moduleTitle?.de || currentQuestion.moduleId}
                                </span>
                                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${qualityResult.optimized_question.correct_answer.includes(',')
                                  ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
                                  : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                  }`}>
                                  {qualityResult.optimized_question.correct_answer.includes(',') ? 'Multiple Choice' : 'Single Choice'}
                                </span>
                              </div>
                              <p className="text-sm font-semibold text-slate-900 dark:text-white leading-relaxed mb-1">
                                {qualityResult.optimized_question.question_text_de}
                              </p>
                            </div>
                            <div className="px-5 pb-5 space-y-2 bg-blue-50/30 dark:bg-blue-950/20">
                              {Object.entries(qualityResult.optimized_question.answers).map(([letter, ans]) => {
                                if (!ans.text_de) return null;
                                const isCorrectAnswer = qualityResult.optimized_question!.correct_answer.split(',').includes(letter);
                                return (
                                  <div key={letter} className={`w-full text-left p-3.5 rounded-xl border-2 transition-all flex items-start gap-3 ${isCorrectAnswer ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700' : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'}`}>
                                    <span className={`text-[11px] font-black mt-0.5 flex-shrink-0 ${isCorrectAnswer ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                      {letter}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-sm leading-snug ${isCorrectAnswer ? 'text-emerald-700 dark:text-emerald-300 font-medium' : 'text-slate-700 dark:text-slate-300'}`}>
                                        {ans.text_de}
                                      </p>
                                    </div>
                                    {isCorrectAnswer && (
                                      <CheckCircle size={18} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            <div className="px-5 pb-5 bg-blue-50/30 dark:bg-blue-950/20">
                              <button
                                onClick={applyOptimizedQuestion}
                                className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-md"
                              >
                                <Sparkles size={16} />
                                Vorschlag übernehmen
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* AI Quality Check Card - Admin Only */}
                    {isAdmin && currentQuestion && (
                      <div className="mt-4 mb-4 lg:mx-0">
                        {/* Letzte Änderung - above KI card */}
                        {currentQuestion.updated_at && (
                          <div className="mb-3 flex items-center gap-2 px-1">
                            <Clock size={13} className="text-slate-400 dark:text-slate-500" />
                            <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                              Letzte Änderung: {new Date(currentQuestion.updated_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        )}
                        <Card className="border-2 border-purple-200 dark:border-purple-800/50 shadow-sm" padding="none">
                          <div className="p-4 flex items-center justify-between flex-wrap gap-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                onClick={handleQualityAnalysis}
                                disabled={qualityChecking}
                                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold text-xs transition-all disabled:opacity-50 shadow-md"
                              >
                                {qualityChecking ? (
                                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                  <Sparkles size={14} />
                                )}
                                {qualityChecking ? 'Analyse läuft...' : 'KI-Qualitätsprüfung'}
                              </button>
                              <button
                                onClick={handleArabicAnalysis}
                                disabled={arabicChecking}
                                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-bold text-xs transition-all disabled:opacity-50 shadow-md"
                              >
                                {arabicChecking ? (
                                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                  <Languages size={14} />
                                )}
                                {arabicChecking ? 'Übersetzung läuft...' : 'KI arabische Analyse'}
                              </button>
                            </div>
                            <div className="flex items-center gap-1">
                              {qualityResult && (
                                <button
                                  onClick={() => setIsAnalysisExpanded(!isAnalysisExpanded)}
                                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-500"
                                >
                                  {isAnalysisExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Quality Analysis Result - Markdown */}
                          {qualityResult && isAnalysisExpanded && (
                            <div className="px-4 pb-4 space-y-4">
                              <div className="prose prose-sm dark:prose-invert max-w-none overflow-x-auto rounded-xl bg-slate-50 dark:bg-slate-800/50 p-4 border border-slate-200 dark:border-slate-700">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{qualityResult.analysis}</ReactMarkdown>
                              </div>
                            </div>
                          )}

                          {/* Arabic Translation Result - Markdown */}
                          {arabicResult && isArabicExpanded && (
                            <div className="px-4 pb-4 space-y-4">
                              <div className="flex items-center gap-2 mb-1">
                                <Languages size={14} className="text-emerald-600 dark:text-emerald-400" />
                                <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">Arabische Analyse</span>
                                <button
                                  onClick={() => setIsArabicExpanded(false)}
                                  className="ml-auto p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-400"
                                >
                                  <ChevronUp size={16} />
                                </button>
                              </div>
                              <div className="prose prose-sm dark:prose-invert max-w-none overflow-x-auto rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 p-4 border border-emerald-200 dark:border-emerald-800/40">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{arabicResult.analysis}</ReactMarkdown>
                              </div>
                            </div>
                          )}
                          {arabicResult && !isArabicExpanded && (
                            <div className="px-4 pb-3">
                              <button
                                onClick={() => setIsArabicExpanded(true)}
                                className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700"
                              >
                                <ChevronDown size={14} />
                                Arabische Analyse anzeigen
                              </button>
                            </div>
                          )}
                        </Card>

                        {/* Arabic Translation Preview Card */}
                        {arabicResult?.translated_question && (
                          <div className="relative mt-4">
                            <div className="absolute -top-3 left-4 px-3 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-[10px] font-black rounded-full shadow-md z-10 flex items-center gap-1">
                              <Languages size={10} />
                              KI-Übersetzungsvorschlag
                            </div>
                            <div className="border-2 border-emerald-400 dark:border-emerald-600 rounded-2xl overflow-hidden shadow-sm">
                              <div className="p-5 pb-4 bg-emerald-50/30 dark:bg-emerald-950/20">
                                <p className="text-sm font-semibold text-slate-900 dark:text-white leading-relaxed mb-1">
                                  {currentQuestion.textDE}
                                </p>
                                <p className="text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed text-right mt-1" dir="rtl">
                                  {arabicResult.translated_question.question_text_ar}
                                </p>
                              </div>
                              <div className="px-5 pb-5 space-y-2 bg-emerald-50/30 dark:bg-emerald-950/20">
                                {Object.entries(arabicResult.translated_question.answers).map(([letter, ans]) => {
                                  if (!ans.text_ar) return null;
                                  const idx = letter.charCodeAt(0) - 65;
                                  const textDE = currentQuestion.answers[idx]?.textDE || '';
                                  return (
                                    <div key={letter} className="w-full text-left p-3.5 rounded-xl border-2 bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
                                      <div className="flex items-start gap-3">
                                        <span className="text-[11px] font-black mt-0.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400">{letter}</span>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm leading-snug text-slate-700 dark:text-slate-300">{textDE}</p>
                                          <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1 text-right" dir="rtl">{ans.text_ar}</p>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="px-5 pb-5 bg-emerald-50/30 dark:bg-emerald-950/20">
                                <button
                                  onClick={applyArabicTranslation}
                                  className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-bold text-sm transition-all shadow-md"
                                >
                                  <Languages size={16} />
                                  Übersetzung übernehmen
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Arabic Translation Preview Card - Error Fallback */}
                        {arabicResult && !arabicResult.translated_question && (
                          <div className="relative mt-4">
                            <div className="absolute -top-3 left-4 px-3 py-1 bg-gradient-to-r from-red-600 to-rose-600 text-white text-[10px] font-black rounded-full shadow-md z-10 flex items-center gap-1">
                              <AlertTriangle size={10} />
                              KI-Übersetzungsfehler
                            </div>
                            <div className="border-2 border-red-400 dark:border-red-600 rounded-2xl overflow-hidden shadow-sm p-5 bg-red-50/30 dark:bg-red-950/20">
                              <p className="text-sm font-semibold text-red-900 dark:text-red-300 leading-relaxed">
                                Die KI konnte keinen strukturierten Übersetzungsvorschlag generieren. Das Ausgabeformat der KI war ungültig oder unvollständig.
                              </p>
                              <p className="text-xs text-red-700 dark:text-red-400 mt-2">
                                Bitte versuche es erneut oder passe den Code der Edge Function an, um robustere JSON-Extrahierung zu ermöglichen.
                              </p>
                            </div>
                          </div>
                        )}

                      </div>
                    )}

                    {/* Admin Inline Edit Card */}
                    {isAdmin && currentQuestion && (
                      <div id="admin-edit-panel" className="mt-6 mb-4 lg:mx-0">
                        <Card className="border-2 border-indigo-200 dark:border-indigo-800/50 shadow-sm" padding="none">
                          {/* Admin Card Header */}
                          <div
                            className="p-4 bg-indigo-50/50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800/30 cursor-pointer flex items-center justify-between"
                            onClick={() => {
                              if (!adminEditing) {
                                // Convert current question to DB format for editing
                                const q = currentQuestion;
                                const editObj: any = {
                                  text_de: q.textDE,
                                  text_ar: q.textAR || '',
                                  type: q.type === QuestionType.MULTIPLE_CHOICE ? 'MULTIPLE_CHOICE' : 'SINGLE_CHOICE',
                                  explanation_de: q.explanationDE || '',
                                  explanation_ar: q.explanationAR || '',
                                  correct_answer: q.answers.filter(a => a.isCorrect).map((a, i) => {
                                    const idx = q.answers.indexOf(a);
                                    return String.fromCharCode(65 + idx);
                                  }).join(','),
                                };
                                // Map answers to letter keys
                                q.answers.forEach((a, i) => {
                                  const letter = String.fromCharCode(97 + i); // a, b, c...
                                  editObj[`answer_${letter}_de`] = a.textDE || '';
                                  editObj[`answer_${letter}_ar`] = a.textAR || '';
                                });
                                setAdminEditData(editObj);
                                setAdminEditing(true);
                                setAdminShowExplanations(false);
                              } else {
                                setAdminEditing(false);
                                setAdminEditData(null);
                              }
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 bg-indigo-100 dark:bg-indigo-800/40 rounded-lg flex items-center justify-center">
                                <Pencil size={14} className="text-indigo-600 dark:text-indigo-400" />
                              </div>
                              <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">Admin: Frage bearbeiten</span>
                            </div>
                            <div className="text-indigo-400 dark:text-indigo-500">
                              {adminEditing ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                            </div>
                          </div>

                          {/* Admin Edit Form */}
                          {adminEditing && adminEditData && (
                            <div className="p-4 space-y-4">
                              {/* Question Text DE */}
                              <div>
                                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">Fragetext (Deutsch)</label>
                                <textarea
                                  value={adminEditData.text_de}
                                  onChange={e => setAdminEditData({ ...adminEditData, text_de: e.target.value })}
                                  rows={3}
                                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none"
                                />
                              </div>

                              {/* Question Text AR */}
                              <div>
                                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">Fragetext (Arabisch)</label>
                                <textarea
                                  value={adminEditData.text_ar || ''}
                                  onChange={e => setAdminEditData({ ...adminEditData, text_ar: e.target.value })}
                                  rows={2}
                                  dir="rtl"
                                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none"
                                />
                              </div>

                              {/* Type */}
                              <div>
                                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">Fragetyp</label>
                                <select
                                  value={adminEditData.type}
                                  onChange={e => setAdminEditData({ ...adminEditData, type: e.target.value })}
                                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                                >
                                  <option value="SINGLE_CHOICE">Single Choice</option>
                                  <option value="MULTIPLE_CHOICE">Multiple Choice</option>
                                </select>
                              </div>

                              {/* Answers */}
                              <div>
                                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2 block">Antworten</label>
                                <div className="space-y-2">
                                  {ANSWER_LETTERS.map((letter, index) => {
                                    const key = letter.toLowerCase();
                                    const textDE = adminEditData[`answer_${key}_de`];
                                    if (textDE === null || textDE === undefined || textDE === '') {
                                      // Check if it's a real empty vs non-existent
                                      if (!currentQuestion.answers[ANSWER_LETTERS.indexOf(letter)]) return null;
                                    }
                                    if (textDE === null || textDE === undefined) return null;

                                    const correctAnswers = adminEditData.correct_answer ? adminEditData.correct_answer.split(',').map((a: string) => a.trim()) : [];
                                    const isCorrect = correctAnswers.includes(letter);

                                    const canMoveUp = index > 0 && adminEditData[`answer_${ANSWER_LETTERS[index - 1].toLowerCase()}_de`] !== null && adminEditData[`answer_${ANSWER_LETTERS[index - 1].toLowerCase()}_de`] !== undefined;
                                    const canMoveDown = index < ANSWER_LETTERS.length - 1 && adminEditData[`answer_${ANSWER_LETTERS[index + 1].toLowerCase()}_de`] !== null && adminEditData[`answer_${ANSWER_LETTERS[index + 1].toLowerCase()}_de`] !== undefined;

                                    return (
                                      <div key={letter} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
                                        <div className="flex items-center justify-between mb-2">
                                          <div className="flex items-center gap-2">
                                            <button
                                              onClick={() => {
                                                const current = adminEditData.correct_answer ? adminEditData.correct_answer.split(',').map((a: string) => a.trim()) : [];
                                                if (adminEditData.type === 'SINGLE_CHOICE') {
                                                  setAdminEditData({ ...adminEditData, correct_answer: letter });
                                                } else {
                                                  if (current.includes(letter)) {
                                                    setAdminEditData({ ...adminEditData, correct_answer: current.filter((a: string) => a !== letter).join(',') });
                                                  } else {
                                                    setAdminEditData({ ...adminEditData, correct_answer: [...current, letter].sort().join(',') });
                                                  }
                                                }
                                              }}
                                              className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${isCorrect ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                                                }`}
                                            >
                                              {isCorrect ? <CheckCircle size={14} /> : <Circle size={14} />}
                                            </button>
                                            <span className="text-xs font-black text-slate-500 dark:text-slate-400">{letter}</span>
                                          </div>
                                          <div className="flex bg-slate-200 dark:bg-slate-700 rounded-lg overflow-hidden">
                                            <button
                                              onClick={() => swapAnswers(index, index - 1)}
                                              disabled={!canMoveUp}
                                              className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-300 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                            >
                                              <ChevronUp size={16} />
                                            </button>
                                            <div className="w-px bg-slate-300 dark:bg-slate-600"></div>
                                            <button
                                              onClick={() => swapAnswers(index, index + 1)}
                                              disabled={!canMoveDown}
                                              className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-300 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                            >
                                              <ChevronDown size={16} />
                                            </button>
                                          </div>
                                        </div>
                                        <input
                                          value={textDE || ''}
                                          onChange={e => setAdminEditData({ ...adminEditData, [`answer_${key}_de`]: e.target.value })}
                                          placeholder="Antwort (Deutsch)"
                                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 mb-1.5"
                                        />
                                        <input
                                          value={adminEditData[`answer_${key}_ar`] || ''}
                                          onChange={e => setAdminEditData({ ...adminEditData, [`answer_${key}_ar`]: e.target.value })}
                                          placeholder="Antwort (Arabisch)"
                                          dir="rtl"
                                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Explanations - Collapsible */}
                              <div>
                                <button
                                  type="button"
                                  onClick={() => setAdminShowExplanations(!adminShowExplanations)}
                                  className="flex items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                                >
                                  {adminShowExplanations ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                  Erklärung bearbeiten
                                </button>
                                {adminShowExplanations && (
                                  <div className="space-y-3 pl-1">
                                    <div>
                                      <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">Erklärung (Deutsch)</label>
                                      <textarea
                                        value={adminEditData.explanation_de || ''}
                                        onChange={e => setAdminEditData({ ...adminEditData, explanation_de: e.target.value })}
                                        rows={3}
                                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">Erklärung (Arabisch)</label>
                                      <textarea
                                        value={adminEditData.explanation_ar || ''}
                                        onChange={e => setAdminEditData({ ...adminEditData, explanation_ar: e.target.value })}
                                        rows={3}
                                        dir="rtl"
                                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Save / Cancel */}
                              <div className="flex gap-2 pt-2">
                                <button
                                  onClick={async () => {
                                    if (!adminEditData || !currentQuestion) return;
                                    setAdminSaving(true);
                                    try {
                                      const updates: any = {
                                        text_de: adminEditData.text_de,
                                        text_ar: adminEditData.text_ar || null,
                                        type: adminEditData.type,
                                        correct_answer: adminEditData.correct_answer,
                                        explanation_de: adminEditData.explanation_de,
                                        explanation_ar: adminEditData.explanation_ar || null,
                                      };
                                      for (const letter of ANSWER_LETTERS) {
                                        const key = letter.toLowerCase();
                                        updates[`answer_${key}_de`] = adminEditData[`answer_${key}_de`] || null;
                                        updates[`answer_${key}_ar`] = adminEditData[`answer_${key}_ar`] || null;
                                      }
                                      await db.updateQuestion(currentQuestion.id, updates);

                                      // Live-update: Map DB fields back to Question format
                                      const correctAnswers = (updates.correct_answer || '').split(',').map((s: string) => s.trim().toUpperCase());
                                      const answerLetters = ['a', 'b', 'c', 'd', 'e', 'f'];
                                      const mappedAnswers = answerLetters
                                        .map((letter, index) => {
                                          const textDE = updates[`answer_${letter}_de`];
                                          if (!textDE) return null;
                                          return {
                                            id: `${currentQuestion.id}-${letter.toUpperCase()}`,
                                            textDE,
                                            textAR: updates[`answer_${letter}_ar`] || null,
                                            isCorrect: correctAnswers.includes(letter.toUpperCase()),
                                          };
                                        })
                                        .filter(Boolean);

                                      setLocalQuestionOverrides(prev => ({
                                        ...prev,
                                        [currentQuestion.id]: {
                                          textDE: updates.text_de,
                                          textAR: updates.text_ar,
                                          type: updates.type === 'MULTIPLE_CHOICE' ? QuestionType.MULTIPLE_CHOICE : QuestionType.SINGLE_CHOICE,
                                          explanationDE: updates.explanation_de || '',
                                          explanationAR: updates.explanation_ar,
                                          answers: mappedAnswers,
                                        }
                                      }));

                                      setAdminToast({ message: 'Gespeichert ✓', type: 'success' });
                                      setTimeout(() => setAdminToast(null), 2000);
                                      setAdminEditing(false);
                                      setAdminEditData(null);
                                    } catch (err: any) {
                                      console.error('Admin save failed:', err);
                                      setAdminToast({ message: `Fehler: ${err.message || 'Speichern fehlgeschlagen'}`, type: 'error' });
                                      setTimeout(() => setAdminToast(null), 3000);
                                    } finally {
                                      setAdminSaving(false);
                                    }
                                  }}
                                  disabled={adminSaving}
                                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50"
                                >
                                  {adminSaving ? (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  ) : (
                                    <Save size={16} />
                                  )}
                                  Speichern
                                </button>
                                <button
                                  onClick={() => { setAdminEditing(false); setAdminEditData(null); }}
                                  className="flex items-center justify-center gap-2 px-5 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                                >
                                  <XCircle size={16} />
                                  Abbrechen
                                </button>
                              </div>
                            </div>
                          )}
                        </Card>

                        {/* Admin Toast */}
                        {adminToast && (
                          <div className={`mt-2 px-4 py-2 rounded-xl text-sm font-bold text-center transition-all ${adminToast.type === 'success'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            }`}>
                            {adminToast.message}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                )}
              </div>
            )}

            {/* Fixed Bottom Actions Area - Always visible on mobile, static on desktop */}
            <div className="fixed bottom-0 left-0 right-0 p-3 pb-6 z-50 lg:static lg:p-0 lg:mt-6 lg:bg-transparent lg:z-auto">
              {/* Mini-Exam Mode - Always show navigation and submit */}
              {isMiniExam ? (
                <div className="space-y-2">
                  {/* Navigation Buttons */}
                  <div className="flex gap-2">
                    <Button
                      fullWidth
                      size="md"
                      variant="secondary"
                      disabled={currentIndex === 0}
                      onClick={handleMiniExamPrev}
                      leftIcon={<ChevronLeft size={18} />}
                      className="shadow-md"
                    >
                      Zurück
                    </Button>
                    {currentIndex < queue.length - 1 ? (
                      <Button
                        fullWidth
                        size="md"
                        variant="primary"
                        onClick={handleMiniExamNext}
                        rightIcon={<ChevronRight size={18} />}
                        className="shadow-md"
                      >
                        Weiter
                      </Button>
                    ) : (
                      <Button
                        fullWidth
                        size="md"
                        variant="primary"
                        onClick={handleMiniExamSubmit}
                        leftIcon={<Check size={18} />}
                        className="shadow-md bg-emerald-500 hover:bg-emerald-600"
                      >
                        Abgeben
                      </Button>
                    )}
                  </div>
                  {/* Progress indicator */}
                  <p className="text-xs text-center text-slate-500 dark:text-slate-400">
                    {Object.keys(miniExamAnswers).length} von {queue.length} beantwortet
                  </p>
                </div>
              ) : !isChecked ? (
                selectedAnswers.length > 0 && (
                  <Button
                    fullWidth
                    size="lg"
                    onClick={checkAnswer}
                    variant="primary"
                    className="shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-300"
                  >
                    <div className="flex flex-col items-center leading-tight">
                      <span>Überprüfen</span>
                      {language === 'DE_AR' && <span className="text-[10px] font-medium opacity-80">تحقق</span>}
                    </div>
                  </Button>
                )
              ) : isModuleTest ? (
                // Module test - show brief feedback then auto-advance
                <div className="text-center py-2">
                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-bold ${questionResults[questionResults.length - 1]?.isCorrect
                    ? 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                    : 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                    }`}>
                    {questionResults[questionResults.length - 1]?.isCorrect ? (
                      <><CheckCircle size={20} /> Richtig!</>
                    ) : (
                      <><XCircle size={20} /> Falsch</>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Nächste Frage...</p>
                </div>
              ) : (
                <div className="space-y-2.5">

                  {/* Mini-Exam Action Buttons */}
                  {isMiniExam && (
                    <div className="space-y-3">
                      {/* Navigation Buttons */}
                      <div className="flex gap-3">
                        <Button
                          fullWidth
                          size="md"
                          variant="secondary"
                          disabled={currentIndex === 0}
                          onClick={handleMiniExamPrev}
                          leftIcon={<ChevronLeft size={20} />}
                        >
                          Zurück
                        </Button>
                        <Button
                          fullWidth
                          size="md"
                          variant="primary"
                          disabled={currentIndex >= queue.length - 1}
                          onClick={handleMiniExamNext}
                          rightIcon={<ChevronRight size={20} />}
                        >
                          Weiter
                        </Button>
                      </div>

                      {/* Submit Button */}
                      <Button
                        fullWidth
                        size="md"
                        variant="ghost"
                        onClick={handleMiniExamSubmit}
                        className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800"
                        leftIcon={<Check size={20} />}
                      >
                        Prüfung abgeben ({Object.keys(miniExamAnswers).length}/{queue.length} beantwortet)
                      </Button>
                    </div>
                  )}

                  {/* Regular Action Buttons (non-mini-exam) */}
                  {!isMiniExam && (() => {
                    // Check if all questions are answered (only relevant when on last question and in module practice mode)
                    const isLastQuestion = currentIndex >= queue.length - 1;
                    const isModulePracticeMode = isLessonMode || (moduleId && !mode); // Require all answers in lesson flow too

                    const allQueueQuestionsAnswered = isModulePracticeMode
                      ? queue.every(q => progress.answeredQuestions.hasOwnProperty(q.id))
                      : true; // Allow completion in other modes
                    const unansweredCount = isModulePracticeMode
                      ? queue.filter(q => !progress.answeredQuestions.hasOwnProperty(q.id)).length
                      : 0;
                    const shouldDisable = isLastQuestion && isModulePracticeMode && !allQueueQuestionsAnswered;

                    return (
                      <>
                        <Button
                          fullWidth
                          size="lg"
                          variant="primary"
                          disabled={shouldDisable}
                          onClick={() => {
                            if (currentIndex < queue.length - 1) {
                              handleNext();
                            } else {
                              // All questions are answered (button is only enabled if so in module mode)
                              if (isLessonMode) {
                                handleNext();
                              } else {
                                setExamFinished(true);
                              }
                            }
                          }}
                          rightIcon={currentIndex < queue.length - 1 ? <ArrowRight size={20} /> : <CheckCircle size={20} />}
                          className={`shadow-lg ${shouldDisable ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {currentIndex < queue.length - 1
                            ? 'Weiter'
                            : isLessonMode
                              ? 'Lektion abschließen'
                              : 'Abschließen'}
                        </Button>
                        {isLastQuestion && isModulePracticeMode && !allQueueQuestionsAnswered && (
                          <p className="text-xs text-center text-slate-500 dark:text-slate-400 mt-2">
                            Noch {unansweredCount} von {queue.length} Fragen offen
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Auth Dialog */}
      {showAuthDialog && (
        <AuthDialog
          onClose={() => {
            setShowAuthDialog(false);
            executeNextStep(); // proceed after closing auth dialog
          }}
          initialMode="register"
        />
      )}

      {/* Guest Progress Popup */}
      {showGuestPopup && (
        <GuestProgressPopup
          correctAnswersCount={currentSessionCorrectCount}
          onClose={() => {
            setShowGuestPopup(false);
            executeNextStep(); // proceed when user closes the popup to continue learning
          }}
          onRegister={() => {
            setShowGuestPopup(false);
            setShowAuthDialog(true);
          }}
        />
      )}
    </div>
  );
}

const QuizSkeleton = () => (
  <div className="min-h-screen bg-[#F2F4F6] dark:bg-slate-950 pb-32 lg:pb-8 animate-pulse">
    <div className="lg:flex lg:gap-6 lg:px-6 lg:pt-6">
      {/* Sidebar Skeleton - Desktop */}
      <div className="hidden lg:block lg:w-72 lg:flex-shrink-0">
        <Card padding="none" className="h-[calc(100vh-100px)]">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
          </div>
          <div className="p-2 space-y-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
              <div key={i} className="h-10 bg-slate-100 dark:bg-slate-800 rounded-xl"></div>
            ))}
          </div>
        </Card>
      </div>

      {/* Main Content Skeleton */}
      <div className="flex-1 lg:max-w-3xl">
        <div className="pt-4 px-3.5 pb-4 lg:pt-0 lg:px-0">
          {/* Header/Nav row */}
          <div className="flex justify-between items-center mb-4">
            <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded"></div>
            <div className="h-8 w-24 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
            <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
          </div>

          {/* Question Card */}
          <Card className="mb-4" padding="md">
            <div className="h-6 w-3/4 bg-slate-200 dark:bg-slate-700 rounded mb-4"></div>
            <div className="h-6 w-1/2 bg-slate-200 dark:bg-slate-700 rounded mb-8"></div>

            {/* Answers */}
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700"></div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>

    {/* Bottom Bar Skeleton */}
    <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 p-3 pb-6 z-50">
      <div className="h-12 bg-slate-200 dark:bg-slate-700 rounded-xl"></div>
    </div>
  </div>
);
