import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useApp } from '../../App';
import { usePostHog } from '../../contexts/PostHogProvider';
import { db } from '../../services/database';
import { generateExamQuestions, calculateScore } from '../../services/writtenExam';
import { WrittenExamQuestion, WrittenExamSession } from '../../types';
import { Clock, ChevronLeft, ChevronRight, CheckCircle, AlertTriangle, Save, Info, ArrowLeft, Settings, Bookmark } from 'lucide-react';
import { QuizSettingsDialog } from './QuizSettingsDialog';



export default function WrittenExam() {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
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
  const [examStartTime] = useState(Date.now());
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

  // Initialize exam session
  useEffect(() => {
    async function initializeExam() {
      try {
        setLoading(true);

        // Generate 82 random questions
        const questionIds = await generateExamQuestions();

        // Create session (for logged in users) or use localStorage (for guests)
        let newSession: WrittenExamSession;

        if (authUser) {
          // Logged in: create session in database
          newSession = await db.createWrittenExamSession(authUser.id, questionIds);
        } else {
          // Guest: create session in localStorage
          const guestSessionId = `guest_${Date.now()}`;
          newSession = {
            id: guestSessionId,
            userId: 'guest',
            questionIds: questionIds,
            userAnswers: {},
            startedAt: new Date().toISOString(),
            timeLimitMinutes: 120,
            totalQuestions: 82
          };

          // Save to localStorage
          localStorage.setItem(`written_exam_session_${guestSessionId}`, JSON.stringify(newSession));
        }

        setSession(newSession);

        // Load questions
        const loadedQuestions = await db.getWrittenExamQuestionsByIds(questionIds);
        setQuestions(loadedQuestions as WrittenExamQuestion[]);

        // Initialize timer from session start time
        const startTime = new Date(newSession.startedAt).getTime();
        const now = Date.now();
        const elapsedSeconds = Math.floor((now - startTime) / 1000);
        const remaining = Math.max(0, 120 * 60 - elapsedSeconds);
        setTimeRemaining(remaining);

        // Track written exam started
        trackEvent('written_exam_started', {
          question_count: loadedQuestions.length
        });

        setLoading(false);
      } catch (error: any) {
        console.error('Error initializing exam:', error);
        const errorMessage = error?.message || 'Unbekannter Fehler beim Starten der Prüfung';
        alert(`Fehler: ${errorMessage}\n\nBitte versuchen Sie es erneut oder kontaktieren Sie den Support.`);
        console.error('Full error details:', error);
        navigate('/exam');
      }
    }

    initializeExam();
  }, [authUser, navigate]);

  // Handle complete exam
  const handleCompleteExam = useCallback(async () => {
    if (!session || !questions.length) return;

    try {
      // Calculate score
      const score = calculateScore(questions, userAnswers);

      // Complete session
      if (authUser) {
        // Logged in: save to database
        await db.completeWrittenExamSession(session.id, score);
      } else {
        // Guest: save to localStorage
        const completedSession = {
          ...session,
          completedAt: new Date().toISOString(),
          score: score,
          userAnswers: userAnswers
        };
        localStorage.setItem(`written_exam_session_${session.id}`, JSON.stringify(completedSession));
      }

      // Navigate to results
      navigate(`/written-exam/results/${session.id}`);
    } catch (error) {
      console.error('Error completing exam:', error);
      alert('Fehler beim Abschließen der Prüfung. Bitte versuchen Sie es erneut.');
    }
  }, [session, questions, userAnswers, navigate, authUser]);



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
  }, [session, authUser]);

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
        e.preventDefault();
        e.returnValue = '';
        setShowLeaveWarning(true);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [session]);

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

      setUserAnswers(prev => ({
        ...prev,
        [question.id]: answers.sort().join(',')
      }));
    } else {
      // Single choice - replace answer
      setUserAnswers(prev => ({
        ...prev,
        [question.id]: answerKey
      }));
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

