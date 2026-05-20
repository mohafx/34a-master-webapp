import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useApp } from '../../App';
import { usePostHog } from '../../contexts/PostHogProvider';
import { db } from '../../services/database';
import { generateExamQuestions, calculateExamPoints } from '../../services/writtenExam';
import { FULL_EXAM_PASSING_POINTS, FULL_EXAM_TOTAL_POINTS, WrittenExamQuestion, WrittenExamSession } from '../../types';
import { Clock, ChevronLeft, ChevronRight, CheckCircle, AlertTriangle, Save, Info, ArrowLeft, Settings, Bookmark } from 'lucide-react';
import { QuizSettingsDialog } from './QuizSettingsDialog';

const ACTIVE_FULL_EXAM_SESSION_KEY = 'active_written_exam_session_id';
const SESSION_STORAGE_PREFIX = 'written_exam_session_';
const SESSION_SNAPSHOT_PREFIX = 'written_exam_session_snapshot_';

function getRemainingSeconds(session: WrittenExamSession): number {
  const startTime = new Date(session.startedAt).getTime();
  const limitSeconds = (session.timeLimitMinutes || 120) * 60;
  const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
  return Math.max(0, limitSeconds - elapsedSeconds);
}

function readStoredSession(sessionId: string | null): WrittenExamSession | null {
  if (!sessionId) return null;

  try {
    const data = localStorage.getItem(`${SESSION_STORAGE_PREFIX}${sessionId}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error reading stored written exam session:', error);
    return null;
  }
}

function writeStoredSession(session: WrittenExamSession) {
  localStorage.setItem(`${SESSION_STORAGE_PREFIX}${session.id}`, JSON.stringify(session));
}

function readAnswerSnapshot(sessionId: string): Record<string, string> | null {
  try {
    const data = localStorage.getItem(`${SESSION_SNAPSHOT_PREFIX}${sessionId}`);
    if (!data) return null;
    const parsed = JSON.parse(data);
    return parsed?.userAnswers && typeof parsed.userAnswers === 'object'
      ? parsed.userAnswers
      : null;
  } catch (error) {
    console.error('Error reading written exam answer snapshot:', error);
    return null;
  }
}

export default function WrittenExam() {
  const navigate = useNavigate();
  const { user: authUser, loading: authLoading } = useAuth();
  const { settings } = useApp();

  const { trackEvent } = usePostHog();

  // Font size configuration - responsive classes integrated
  const fontSizes = {
    large: {
      question: 'text-base sm:text-xl md:text-lg lg:text-base',
      answer: 'text-sm sm:text-base md:text-sm lg:text-xs',
      topic: 'text-xs',
      hint: 'text-xs'
    },
    normal: {
      question: 'text-sm sm:text-lg md:text-base lg:text-sm',
      answer: 'text-xs sm:text-sm md:text-xs lg:text-[10px]',
      topic: 'text-[10px]',
      hint: 'text-[10px]'
    },
    small: {
      question: 'text-xs sm:text-base md:text-sm lg:text-xs',
      answer: 'text-[10px] sm:text-xs md:text-[10px] lg:text-[9px]',
      topic: 'text-[9px]',
      hint: 'text-[9px]'
    },
    smaller: {
      question: 'text-[10px] sm:text-sm md:text-xs lg:text-[10px]',
      answer: 'text-[9px] sm:text-[10px] md:text-[9px] lg:text-[8px]',
      topic: 'text-[8px]',
      hint: 'text-[8px]'
    }
  };
  const currentFontSize = fontSizes[settings?.cardSize || 'normal'];

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<WrittenExamSession | null>(null);
  const [questions, setQuestions] = useState<WrittenExamQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [timeRemaining, setTimeRemaining] = useState(120 * 60); // 120 minutes in seconds
  const [isSaving, setIsSaving] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const [showQuizSettings, setShowQuizSettings] = useState(false);
  const [showQuestionGrid, setShowQuestionGrid] = useState(false);
  const [markedQuestions, setMarkedQuestions] = useState<string[]>([]);

  const handleToggleMark = () => {
    if (!questions[currentIndex]) return;
    const currentQuestionId = questions[currentIndex].id;
    setMarkedQuestions(prev => {
      const isMarked = prev.includes(currentQuestionId);
      if (isMarked) {
        return prev.filter(id => id !== currentQuestionId);
      } else {
        if (!showQuestionGrid) {
          setShowQuestionGrid(true);
          setTimeout(() => {
            setShowQuestionGrid(false);
          }, 1500);
        }
        return [...prev, currentQuestionId];
      }
    });
  };

  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sessionRef = useRef<WrittenExamSession | null>(null);
  const answersRef = useRef<Record<string, string>>({});
  const initializeKeyRef = useRef<string | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    answersRef.current = userAnswers;
  }, [userAnswers]);

  const persistLocalExamState = useCallback((targetSession: WrittenExamSession | null, answers: Record<string, string>) => {
    if (!targetSession || targetSession.completedAt) return;

    localStorage.setItem(`${SESSION_SNAPSHOT_PREFIX}${targetSession.id}`, JSON.stringify({
      userAnswers: answers,
      updatedAt: new Date().toISOString()
    }));

    if (targetSession.userId === 'guest') {
      writeStoredSession({ ...targetSession, userAnswers: answers });
      localStorage.setItem(ACTIVE_FULL_EXAM_SESSION_KEY, targetSession.id);
    }
  }, []);

  const getBestAvailableAnswers = useCallback((targetSession: WrittenExamSession): Record<string, string> => {
    const storedAnswers = targetSession.userAnswers || {};
    const snapshotAnswers = readAnswerSnapshot(targetSession.id);

    if (snapshotAnswers && Object.keys(snapshotAnswers).length > Object.keys(storedAnswers).length) {
      return snapshotAnswers;
    }

    return storedAnswers;
  }, []);

  const completeSession = useCallback(async (
    targetSession: WrittenExamSession,
    targetQuestions: WrittenExamQuestion[],
    answers: Record<string, string>
  ) => {
    const score = calculateExamPoints(targetQuestions, answers);

    trackEvent('written_exam_completed', {
      total_questions: targetQuestions.length,
      answered_count: Object.keys(answers).length,
      score_points: score,
      score_percent: Math.round((score / FULL_EXAM_TOTAL_POINTS) * 100),
      passed: score >= FULL_EXAM_PASSING_POINTS,
      duration_seconds: Math.round((Date.now() - new Date(targetSession.startedAt).getTime()) / 1000),
    });

    if (authUser) {
      await db.completeWrittenExamSession(targetSession.id, score, answers);
    } else {
      const completedSession = {
        ...targetSession,
        completedAt: new Date().toISOString(),
        score,
        userAnswers: answers
      };
      writeStoredSession(completedSession);
    }

    if (localStorage.getItem(ACTIVE_FULL_EXAM_SESSION_KEY) === targetSession.id) {
      localStorage.removeItem(ACTIVE_FULL_EXAM_SESSION_KEY);
    }
    localStorage.removeItem(`${SESSION_SNAPSHOT_PREFIX}${targetSession.id}`);

    navigate(`/written-exam/results/${targetSession.id}`);
  }, [authUser, navigate, trackEvent]);

  // Initialize exam session
  useEffect(() => {
    if (authLoading) return;
    if (sessionRef.current) return;

    const initializeKey = authUser?.id || 'guest';
    if (initializeKeyRef.current === initializeKey) return;
    initializeKeyRef.current = initializeKey;

    async function initializeExam() {
      try {
        setLoading(true);

        let newSession: WrittenExamSession;
        let isResumedSession = false;

        if (authUser) {
          const activeSession = await db.getActiveWrittenExamSession(authUser.id, 'full');
          if (activeSession) {
            const remaining = getRemainingSeconds(activeSession);
            if (remaining <= 0) {
              console.log(`Auto-completing stale session ${activeSession.id} in the background.`);
              try {
                const answers = getBestAvailableAnswers(activeSession);
                const loadedQuestions = await db.getWrittenExamQuestionsByIds(activeSession.questionIds);
                const score = calculateExamPoints(loadedQuestions as WrittenExamQuestion[], answers);
                await db.completeWrittenExamSession(activeSession.id, score, answers);
                localStorage.removeItem(`${SESSION_SNAPSHOT_PREFIX}${activeSession.id}`);
              } catch (err) {
                console.error('Error auto-completing stale session:', err);
              }
              // Proceed to create a new session
              const questionIds = await generateExamQuestions(authUser.id);
              newSession = await db.createWrittenExamSession(authUser.id, questionIds);
            } else {
              newSession = activeSession;
              isResumedSession = true;
            }
          } else {
            const questionIds = await generateExamQuestions(authUser.id);
            newSession = await db.createWrittenExamSession(authUser.id, questionIds);
          }
        } else {
          const activeGuestSession = readStoredSession(localStorage.getItem(ACTIVE_FULL_EXAM_SESSION_KEY));
          if (activeGuestSession && !activeGuestSession.completedAt && activeGuestSession.totalQuestions === 82) {
            const remaining = getRemainingSeconds(activeGuestSession);
            if (remaining <= 0) {
              console.log(`Auto-completing stale guest session ${activeGuestSession.id} in the background.`);
              try {
                const answers = getBestAvailableAnswers(activeGuestSession);
                const loadedQuestions = await db.getWrittenExamQuestionsByIds(activeGuestSession.questionIds);
                const score = calculateExamPoints(loadedQuestions as WrittenExamQuestion[], answers);
                const completedSession = {
                  ...activeGuestSession,
                  completedAt: new Date().toISOString(),
                  score,
                  userAnswers: answers
                };
                writeStoredSession(completedSession);
                localStorage.removeItem(ACTIVE_FULL_EXAM_SESSION_KEY);
                localStorage.removeItem(`${SESSION_SNAPSHOT_PREFIX}${activeGuestSession.id}`);
              } catch (err) {
                console.error('Error auto-completing stale guest session:', err);
              }
              // Proceed to create a new session
              const questionIds = await generateExamQuestions();
              const guestSessionId = `guest_${Date.now()}`;
              newSession = {
                id: guestSessionId,
                userId: 'guest',
                questionIds,
                userAnswers: {},
                startedAt: new Date().toISOString(),
                timeLimitMinutes: 120,
                totalQuestions: 82,
                examType: 'full'
              };

              writeStoredSession(newSession);
              localStorage.setItem(ACTIVE_FULL_EXAM_SESSION_KEY, guestSessionId);
            } else {
              newSession = activeGuestSession;
              isResumedSession = true;
            }
          } else {
            const questionIds = await generateExamQuestions();
            const guestSessionId = `guest_${Date.now()}`;
            newSession = {
              id: guestSessionId,
              userId: 'guest',
              questionIds,
              userAnswers: {},
              startedAt: new Date().toISOString(),
              timeLimitMinutes: 120,
              totalQuestions: 82,
              examType: 'full'
            };

            writeStoredSession(newSession);
            localStorage.setItem(ACTIVE_FULL_EXAM_SESSION_KEY, guestSessionId);
          }
        }

        const answers = getBestAvailableAnswers(newSession);
        const sessionWithBestAnswers = { ...newSession, userAnswers: answers };
        setSession(sessionWithBestAnswers);
        setUserAnswers(answers);

        // Load questions
        const loadedQuestions = await db.getWrittenExamQuestionsByIds(sessionWithBestAnswers.questionIds);
        setQuestions(loadedQuestions as WrittenExamQuestion[]);

        if (authUser && answers !== newSession.userAnswers && Object.keys(answers).length > 0) {
          await db.updateWrittenExamSession(newSession.id, answers);
        }

        const remaining = getRemainingSeconds(sessionWithBestAnswers);
        setTimeRemaining(remaining);

        setLoading(false);

        if (remaining <= 0) {
          await completeSession(sessionWithBestAnswers, loadedQuestions as WrittenExamQuestion[], answers);
          return;
        }

        if (!isResumedSession) {
          trackEvent('written_exam_started', {
            question_count: loadedQuestions.length
          });
        }
      } catch (error: any) {
        console.error('Error initializing exam:', error);
        const errorMessage = error?.message || 'Unbekannter Fehler beim Starten der Prüfung';
        alert(`Fehler: ${errorMessage}\n\nBitte versuchen Sie es erneut oder kontaktieren Sie den Support.`);
        console.error('Full error details:', error);
        navigate('/exam');
      }
    }

    initializeExam();
  }, [authLoading, authUser, navigate, trackEvent, getBestAvailableAnswers, completeSession]);

  // Handle complete exam
  const handleCompleteExam = useCallback(async () => {
    if (!session || !questions.length) return;

    try {
      const finalAnswers = answersRef.current;
      persistLocalExamState(session, finalAnswers);
      await completeSession(session, questions, finalAnswers);
    } catch (error) {
      console.error('Error completing exam:', error);
      alert('Fehler beim Abschließen der Prüfung. Bitte versuchen Sie es erneut.');
    }
  }, [session, questions, persistLocalExamState, completeSession]);



  // Handle back navigation
  const handleBack = () => {
    setShowLeaveWarning(true);
  };

  // Timer countdown
  useEffect(() => {
    if (loading || !session || timeRemaining <= 0) return;

    timerIntervalRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          // Time's up - auto-submit
          handleCompleteExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [loading, session, timeRemaining, handleCompleteExam]);

  // Auto-save answers
  const saveAnswers = useCallback(async (answers: Record<string, string>) => {
    if (!session) return;

    persistLocalExamState(session, answers);
    setIsSaving(true);
    try {
      if (authUser) {
        // Logged in: save to database
        await db.updateWrittenExamSession(session.id, answers);
      } else {
        // Guest: save to localStorage
        const updatedSession = { ...session, userAnswers: answers };
        localStorage.setItem(`written_exam_session_${session.id}`, JSON.stringify(updatedSession));
        setSession(updatedSession);
      }
    } catch (error) {
      console.error('Error saving answers:', error);
    } finally {
      setIsSaving(false);
    }
  }, [session, authUser, persistLocalExamState]);

  // Debounced save
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    if (Object.keys(userAnswers).length > 0) {
      saveTimeoutRef.current = setTimeout(() => {
        saveAnswers(userAnswers);
      }, 1000); // Save after 1 second of no changes
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [userAnswers, saveAnswers]);

  // Warn before leaving
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (session && !session.completedAt) {
        persistLocalExamState(sessionRef.current, answersRef.current);
        e.preventDefault();
        e.returnValue = '';
        setShowLeaveWarning(true);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [session, persistLocalExamState]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        persistLocalExamState(sessionRef.current, answersRef.current);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [persistLocalExamState]);

  const handleAnswerSelect = (answerKey: string) => {
    if (!questions[currentIndex]) return;

    const question = questions[currentIndex];
    const currentAnswer = userAnswers[question.id] || '';

    // Check if multiple choice (correct answer contains comma)
    const isMultipleChoice = question.correctAnswer.includes(',');

    if (isMultipleChoice) {
      // Toggle answer in comma-separated list
      const answers = currentAnswer.split(',').map(a => a.trim()).filter(Boolean);
      const index = answers.indexOf(answerKey);

      if (index > -1) {
        // Answer already selected - remove it
        answers.splice(index, 1);
      } else {
        // Answer not selected - add it, but only if we have less than 2
        if (answers.length < 2) {
          answers.push(answerKey);
        }
        // If already 2 selected, don't add more
      }

      setUserAnswers(prev => {
        const nextAnswers = {
          ...prev,
          [question.id]: answers.sort().join(',')
        };
        persistLocalExamState(sessionRef.current, nextAnswers);
        return nextAnswers;
      });
    } else {
      // Single choice - replace answer
      setUserAnswers(prev => {
        const nextAnswers = {
          ...prev,
          [question.id]: answerKey
        };
        persistLocalExamState(sessionRef.current, nextAnswers);
        return nextAnswers;
      });
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };


  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;

    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getAnsweredCount = (): number => {
    return Object.keys(userAnswers).length;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">Prüfung wird vorbereitet...</p>
        </div>
      </div>
    );
  }

  if (!session || questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-4 text-amber-500" size={48} />
          <p className="text-slate-600 dark:text-slate-400">Fehler beim Laden der Prüfung</p>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const currentAnswer = userAnswers[currentQuestion.id] || '';
  const isMultipleChoice = currentQuestion.correctAnswer.includes(',');

  return (
    <div className="min-h-screen bg-[#F2F4F6] dark:bg-slate-950 pb-32">
      {/* Header with Timer and Progress */}
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="w-full px-2 py-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <button
                onClick={handleBack}
                className="p-1 -ml-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="w-px h-4 bg-slate-200 dark:bg-slate-800"></div>
              <div className="flex items-center gap-2">
                <Clock className={`${timeRemaining < 300 ? 'text-red-500' : 'text-slate-600 dark:text-slate-400'}`} size={18} />
                <span className={`text-sm font-bold ${timeRemaining < 300 ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}>
                  {formatTime(timeRemaining)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isSaving && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <Save size={12} className="text-slate-400 animate-pulse" />
                  <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wider">Gespeichert</span>
                </div>
              )}
              <button
                onClick={() => setShowQuizSettings(true)}
                className="p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors active:scale-95"
              >
                <Settings size={18} />
              </button>
            </div>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1">
            <div
              className="bg-primary h-1 rounded-full transition-all"
              style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] font-medium text-slate-500 dark:text-slate-400">
            <span>{getAnsweredCount()} von {questions.length} beantwortet</span>
            <div className="flex items-center gap-2">
              <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-primary dark:text-primary-light font-bold">
                Frage {currentIndex + 1} / {questions.length}
              </span>
              <button
                onClick={handleToggleMark}
                className={`p-1 rounded transition-colors ${markedQuestions.includes(questions[currentIndex]?.id)
                  ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-500'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400'
                  }`}
              >
                <Bookmark size={14} className={markedQuestions.includes(questions[currentIndex]?.id) ? 'fill-current' : ''} />
              </button>
              <button
                onClick={() => setShowQuestionGrid(!showQuestionGrid)}
                className="md:hidden p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
              >
                <ChevronRight size={14} className={`transform transition-transform ${showQuestionGrid ? 'rotate-90' : ''}`} />
              </button>
            </div>
          </div>

          {/* Question Grid Navigation */}
          <div className={`overflow-hidden transition-all duration-300 ${showQuestionGrid ? 'max-h-48 md:max-h-32' : 'max-h-0 md:max-h-32'}`}>
            <div className="pt-2 pb-1 max-h-32 overflow-y-auto">
              <div className="flex flex-wrap justify-center gap-1">
                {questions.map((q, idx) => {
                  const isAnswered = !!userAnswers[q.id];
                  const isCurrent = idx === currentIndex;
                  return (
                    <button
                      key={q.id}
                      onClick={() => setCurrentIndex(idx)}
                      className={`w-5 h-5 rounded text-[8px] font-bold transition-all flex items-center justify-center border ${markedQuestions.includes(q.id)
                        ? 'border-amber-400 bg-amber-400 text-white shadow-sm'
                        : isCurrent
                          ? 'border-primary bg-primary text-white shadow-sm ring-1 ring-primary/20'
                          : isAnswered
                            ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-400'
                        } hover:scale-110`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Question Area */}
      <div className="max-w-xl mx-auto px-0 md:px-4 pt-0 md:pt-4 pb-4 w-full">
        <div className="bg-white dark:bg-slate-800 rounded-none md:rounded-[20px] p-6 pt-8 md:p-4 md:pt-5 shadow-sm border-y md:border border-slate-100 dark:border-slate-700">
          <div className="mb-4">
            <h2 className={`${currentFontSize.question} font-bold text-slate-900 dark:text-white leading-relaxed mb-2`}>
              {currentQuestion.questionTextDE}
            </h2>
            {isMultipleChoice && (
              <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-medium bg-blue-50/50 dark:bg-blue-900/20 px-2 py-0.5 rounded-lg w-fit">
                <Info size={11} />
                <span className={`${currentFontSize.hint}`}>Bitte 2 Antworten wählen</span>
              </div>
            )}
          </div>

          {/* Answers */}
          <div className="space-y-1.5 mt-4">
            {(Object.keys(currentQuestion.answers) as Array<keyof typeof currentQuestion.answers>).map((key) => {
              const answer = currentQuestion.answers[key];
              if (!answer) return null;

              const answerText = answer.de;
              const isSelected = isMultipleChoice
                ? currentAnswer.split(',').map(a => a.trim()).includes(key)
                : currentAnswer === key;

              // Check if limit reached for multiple choice
              const selectedCount = isMultipleChoice
                ? currentAnswer.split(',').filter(a => a.trim()).length
                : 0;
              const isDisabled = isMultipleChoice && !isSelected && selectedCount >= 2;

              return (
                <button
                  key={key}
                  onClick={() => handleAnswerSelect(key)}
                  disabled={isDisabled}
                  className={`w-full text-left p-2 md:p-2 rounded-lg border-2 transition-all ${isSelected
                    ? 'border-primary bg-primary/5 dark:bg-primary/10'
                    : isDisabled
                      ? 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 opacity-50 cursor-not-allowed'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-primary/50'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-[22px] h-[22px] md:w-5 md:h-5 rounded-md flex items-center justify-center font-bold text-[11px] md:text-[10px] ${isSelected
                        ? 'bg-primary text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                        }`}
                    >
                      {key}
                    </div>
                    <span className={`flex-1 ${currentFontSize.answer} ${isSelected ? 'font-medium text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                      {answerText}
                    </span>
                    {isSelected && (
                      <CheckCircle className="text-primary" size={20} />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        {/* Navigation - Static on Desktop */}
        <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-3 py-3 md:py-2 z-40 lg:static lg:bg-transparent lg:border-none lg:p-0 lg:mt-6 lg:z-auto">
          <div className="w-full space-y-3">
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={handlePrevious}
                disabled={currentIndex === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <ChevronLeft size={18} className="md:w-4 md:h-4" />
                <span className="text-sm font-medium">Zurück</span>
              </button>

              <button
                onClick={() => setShowCompleteDialog(true)}
                className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold py-2 px-4 rounded-xl transition-all text-xs uppercase tracking-wide border border-slate-200 dark:border-slate-700"
              >
                Prüfung beenden
              </button>

              <button
                onClick={handleNext}
                disabled={currentIndex === questions.length - 1}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <span className="text-sm font-medium">Weiter</span>
                <ChevronRight size={18} className="md:w-4 md:h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Complete Dialog */}
      {showCompleteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white dark:bg-slate-800 rounded-[20px] p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              Prüfung abschließen?
            </h3>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Möchten Sie die Prüfung jetzt abschließen? Sie haben {getAnsweredCount()} von {questions.length} Fragen beantwortet.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCompleteDialog(false)}
                className="flex-1 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleCompleteExam}
                className="flex-1 px-4 py-2 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 transition-colors"
              >
                Abschließen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Warning Dialog */}
      {showLeaveWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white dark:bg-slate-800 rounded-[20px] p-6 max-w-md w-full">
            <div className="flex items-center gap-3 text-red-500 mb-2">
              <AlertTriangle size={24} />
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                Prüfung abbrechen?
              </h3>
            </div>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Wenn Sie die Prüfung jetzt verlassen, geht Ihr aktueller Fortschritt verloren. Sind Sie sicher?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLeaveWarning(false)}
                className="flex-1 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Bleiben
              </button>
              <button
                onClick={() => navigate('/')}
                className="flex-1 px-4 py-2 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 transition-colors"
              >
                Verlassen
              </button>
            </div>
          </div>
        </div>
      )}

      {showQuizSettings && <QuizSettingsDialog onClose={() => setShowQuizSettings(false)} />}
    </div>
  );
}
