import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, CheckCircle, XCircle, ChevronRight, ChevronLeft,
    Trophy, RotateCcw, BookOpen, HelpCircle, Check, X, AlertCircle, Lightbulb, ArrowRight, Languages, Settings
} from 'lucide-react';
import { QuizSettingsDialog } from './QuizSettingsDialog';
import { db } from '../../services/database';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../App';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { GuestProgressPopup } from '../ui/GuestProgressPopup';
import { AuthDialog } from '../auth/AuthDialog';

interface QuizAnswer {
    id: string;
    answerNumber: number;
    textDE: string;
    textAR?: string;
    isCorrect: boolean;
}

interface QuizQuestion {
    id: string;
    lessonId: string;
    questionNumber: number;
    questionType: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';
    questionTextDE: string;
    questionTextAR?: string;
    explanationDE: string;
    explanationAR?: string;
    answers: QuizAnswer[];
}

export default function LessonQuiz() {
    const { moduleId, lessonId } = useParams();
    const navigate = useNavigate();
    const { language, settings, toggleLanguage, showLanguageToggle, isPremium, openPaywall } = useApp();

    // Font size configuration (matching QuestionView)
    const fontSizes = {
        large: {
            question: language === 'DE_AR' ? 'text-base' : 'text-lg',
            answer: language === 'DE_AR' ? 'text-sm' : 'text-base',
            index: language === 'DE_AR' ? 'text-[10px]' : 'text-xs',
            icon: language === 'DE_AR' ? 16 : 18,
            explanation: language === 'DE_AR' ? 'text-sm' : 'text-base'
        },
        normal: {
            question: language === 'DE_AR' ? 'text-sm' : 'text-base',
            answer: language === 'DE_AR' ? 'text-xs' : 'text-sm',
            index: language === 'DE_AR' ? 'text-[9px]' : 'text-[10px]',
            icon: language === 'DE_AR' ? 14 : 16,
            explanation: language === 'DE_AR' ? 'text-xs' : 'text-sm'
        },
        small: {
            question: language === 'DE_AR' ? 'text-xs' : 'text-sm',
            answer: language === 'DE_AR' ? 'text-[10px]' : 'text-xs',
            index: language === 'DE_AR' ? 'text-[8px]' : 'text-[9px]',
            icon: language === 'DE_AR' ? 13 : 15,
            explanation: language === 'DE_AR' ? 'text-[10px]' : 'text-xs'
        },
        smaller: {
            question: language === 'DE_AR' ? 'text-[11px]' : 'text-xs',
            answer: language === 'DE_AR' ? 'text-[9px]' : 'text-[11px]',
            index: language === 'DE_AR' ? 'text-[7px]' : 'text-[8px]',
            icon: language === 'DE_AR' ? 12 : 14,
            explanation: language === 'DE_AR' ? 'text-[9px]' : 'text-[11px]'
        }
    };

    const currentFontSize = fontSizes[settings?.cardSize || 'normal'];

    const [questions, setQuestions] = useState<QuizQuestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [results, setResults] = useState<boolean[]>([]);
    const [showSummary, setShowSummary] = useState(false);
    const [lessonTitle, setLessonTitle] = useState('');
    const [showSettings, setShowSettings] = useState(false);

    // Guest motivation popup state
    const [showGuestPopup, setShowGuestPopup] = useState(false);
    const [currentSessionCorrectCount, setCurrentSessionCorrectCount] = useState(0);
    const [showAuthDialog, setShowAuthDialog] = useState(false);

    // Fetch lesson details for the header
    useEffect(() => {
        if (moduleId && lessonId) {
            db.getLessonsByModuleId(moduleId).then(lessons => {
                const current = lessons.find(l => l.id === lessonId);
                if (current) {
                    setLessonTitle(current.titleDE);
                }
            });
        }
    }, [moduleId, lessonId]);

    // Load quiz questions (with premium check)
    useEffect(() => {
        if (lessonId && moduleId) {
            setLoading(true);

            // First check if this lesson is accessible
            db.getLessonsByModuleId(moduleId).then(lessons => {
                const lessonIndex = lessons.findIndex(l => l.id === lessonId);
                const isFirstLesson = lessonIndex === 0;

                // Need to fetch module info to check if it's the intro module
                db.getModules().then(modules => {
                    const currentModule = modules.find(m => m.id === moduleId);
                    const isIntroModule = currentModule?.titleDE === 'Einführung und Grundlagen';

                    // All lessons in "Einführung und Grundlagen" module are free
                    if (!isFirstLesson && !isPremium && !isIntroModule) {
                        console.warn('🔒 [LessonQuiz] Access denied - Premium quiz');
                        openPaywall('Premium Lektionen');
                        // Navigate away immediately and return
                        navigate(`/learn/${moduleId}`, { replace: true });
                        return;
                    }

                    // Lesson is accessible, load questions
                    db.getLessonQuizQuestions(lessonId)
                        .then(data => {
                            setQuestions(data);
                            setLoading(false);
                        })
                        .catch(err => {
                            console.error('Error loading quiz:', err);
                            setLoading(false);
                        });
                }).catch(err => {
                    console.error('Error loading modules:', err);
                    setLoading(false);
                });
            }).catch(err => {
                console.error('Error loading lessons:', err);
                setLoading(false);
            });
        }
    }, [lessonId, moduleId, isPremium]);


    const currentQuestion = questions[currentIndex];

    const handleAnswerSelect = (answerId: string) => {
        if (hasSubmitted) return;

        if (currentQuestion?.questionType === 'SINGLE_CHOICE') {
            setSelectedAnswers([answerId]);
        } else {
            // Multiple choice - toggle selection, max 2
            if (selectedAnswers.includes(answerId)) {
                setSelectedAnswers(selectedAnswers.filter(id => id !== answerId));
            } else {
                if (selectedAnswers.length < 2) {
                    setSelectedAnswers([...selectedAnswers, answerId]);
                }
            }
        }
    };

    const handleSubmit = () => {
        if (selectedAnswers.length === 0) return;

        const correctAnswerIds = currentQuestion.answers
            .filter(a => a.isCorrect)
            .map(a => a.id);

        const isCorrect =
            selectedAnswers.length === correctAnswerIds.length &&
            selectedAnswers.every(id => correctAnswerIds.includes(id));

        setResults([...results, isCorrect]);
        setHasSubmitted(true);
        if (isCorrect) {
            setCurrentSessionCorrectCount(prev => prev + 1);
        }
    };

    const executeNextStep = () => {
        if (currentIndex < questions.length - 1) {
            setCurrentIndex(currentIndex + 1);
            setSelectedAnswers([]);
            setHasSubmitted(false);
            setShowExplanation(false);
        } else {
            // Quiz finished - show summary
            setShowSummary(true);
            saveResult();
        }
    };

    const handleNext = () => {
        const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            const correctIds = currentQuestion?.answers.filter(a => a.isCorrect).map(a => a.id) || [];
            const wasAnsweredCorrectly = hasSubmitted && correctIds.length === selectedAnswers.length &&
                correctIds.every(id => selectedAnswers.includes(id));

            if (!user && wasAnsweredCorrectly && !showExplanation) {
                setShowGuestPopup(true);
            } else {
                executeNextStep();
            }
        };
        checkUser();
    };

    const saveResult = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && lessonId) {
            const score = results.filter(Boolean).length + (hasSubmitted && results[results.length] ? 0 : 1);
            try {
                await db.saveLessonQuizResult(user.id, lessonId, score, questions.length);
            } catch (e) {
                console.error('Error saving quiz result:', e);
            }
        }
    };

    const handleCompleteLesson = async () => {
        const { data: { user } } = await supabase.auth.getUser();

        if (user && lessonId) {
            try {
                await db.toggleLessonCompletion(user.id, lessonId);
            } catch (e) {
                console.error('Error completing lesson:', e);
            }
        } else if (lessonId) {
            // Guest - use localStorage
            const completed = JSON.parse(localStorage.getItem('guest_completed_lessons') || '[]');
            if (!completed.includes(lessonId)) {
                completed.push(lessonId);
                localStorage.setItem('guest_completed_lessons', JSON.stringify(completed));
            }
        }

        navigate(`/learn/${moduleId}`);
    };

    const handleRetry = () => {
        setCurrentIndex(0);
        setSelectedAnswers([]);
        setHasSubmitted(false);
        setResults([]);
        setShowSummary(false);
        setShowExplanation(false);
    };

    // Unified Skeleton for Question Card
    const QuizSkeleton = () => (
        <div className="pt-4 px-3.5 lg:pt-0 lg:px-0">
            <div className="flex justify-between items-center mb-4 relative">
                <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
            </div>
            <Card className="overflow-hidden border-2 border-slate-200 dark:border-slate-800" padding="none">
                <div className="bg-slate-50/50 dark:bg-slate-800/50 p-6 border-b border-slate-100 dark:border-slate-700/50 space-y-3">
                    <div className="h-6 w-3/4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
                    <div className="h-6 w-1/2 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="p-4 flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse flex-shrink-0"></div>
                            <div className="flex-1 space-y-2">
                                <div className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
                                <div className="h-3 w-1/2 bg-slate-100 dark:bg-slate-800 rounded animate-pulse"></div>
                            </div>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );

    // No questions - handle this after rendering basic structure
    const NoQuestionsView = () => (
        <div className="pt-4 px-4">
            <Card className="text-center py-12" padding="lg">
                <HelpCircle size={48} className="mx-auto text-slate-300 mb-4" />
                <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200 mb-2">
                    Kein Quiz verfügbar
                </h2>
                <p className="text-slate-500 mb-6">
                    Für diese Lektion gibt es noch kein Quiz.
                </p>
                <Button onClick={() => navigate(`/learn/${moduleId}/lesson/${lessonId}`)}>
                    Zurück zur Lektion
                </Button>
            </Card>
        </div>
    );

    // Summary view
    if (showSummary) {
        const correctCount = results.filter(Boolean).length;
        const totalCount = questions.length;
        const percentage = Math.round((correctCount / totalCount) * 100);
        const passed = percentage >= 60;

        return (
            <div className="pt-4 px-4 pb-32">
                {/* Result Header */}
                <Card className={`mb-6 text-center border-none ${passed ? 'bg-gradient-to-br from-success to-emerald-600' : 'bg-gradient-to-br from-error to-rose-600'}`} padding="lg">
                    <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
                        {passed ? <Check size={40} className="text-white" strokeWidth={3} /> : <X size={40} className="text-white" strokeWidth={3} />}
                    </div>
                    <h2 className="text-2xl font-black text-white mb-1">{passed ? 'Bestanden!' : 'Nicht bestanden'}</h2>
                    {language === 'DE_AR' && <p className="text-white/80 mb-2 font-bold">{passed ? 'نجح!' : 'رسب'}</p>}
                    <p className="text-white/90 text-lg font-bold">{percentage}%</p>
                    <p className="text-white/70 text-sm font-medium">{correctCount} von {totalCount} richtig</p>
                </Card>

                {/* Stats Cards */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                    <Card className="bg-primary-light dark:bg-primary/10 border-primary/20 text-center" padding="sm">
                        <p className="text-2xl font-black text-primary-dark dark:text-primary">{totalCount}</p>
                        <p className="text-xs font-bold text-primary-dark dark:text-primary">Fragen</p>
                    </Card>
                    <Card className="bg-success-light dark:bg-success/10 border-success/20 text-center" padding="sm">
                        <CheckCircle className="text-success mx-auto mb-1" size={20} />
                        <p className="text-2xl font-black text-success-dark dark:text-success">{correctCount}</p>
                        <p className="text-xs font-bold text-success-dark dark:text-success">Richtig</p>
                    </Card>
                    <Card className="bg-error-light dark:bg-error/10 border-error/20 text-center" padding="sm">
                        <XCircle className="text-error mx-auto mb-1" size={20} />
                        <p className="text-2xl font-black text-error-dark dark:text-error">{totalCount - correctCount}</p>
                        <p className="text-xs font-bold text-error-dark dark:text-error">Falsch</p>
                    </Card>
                </div>

                {/* Questions Summary */}
                <div className="mb-6">
                    <h3 className="font-black text-lg text-slate-900 dark:text-white mb-3">Alle Fragen</h3>
                    <div className="space-y-2">
                        {questions.map((q, idx) => (
                            <Card
                                key={q.id}
                                className={`border-l-4 ${results[idx]
                                    ? 'border-l-success bg-success-light/30 dark:bg-success/5 border-y-slate-100 border-r-slate-100 dark:border-y-slate-800 dark:border-r-slate-800'
                                    : 'border-l-error bg-error-light/30 dark:bg-error/5 border-y-slate-100 border-r-slate-100 dark:border-y-slate-800 dark:border-r-slate-800'
                                    }`}
                                padding="sm"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="flex-shrink-0 mt-0.5">
                                        {results[idx] ? (
                                            <CheckCircle size={18} className="text-success" />
                                        ) : (
                                            <XCircle size={18} className="text-error" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Frage {idx + 1}</span>
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${results[idx]
                                                ? 'bg-success-light dark:bg-success/20 text-success-dark dark:text-success'
                                                : 'bg-error-light dark:bg-error/20 text-error-dark dark:text-error'
                                                }`}>
                                                {results[idx] ? 'Richtig' : 'Falsch'}
                                            </span>
                                        </div>
                                        <p className="text-sm font-medium text-slate-900 dark:text-white line-clamp-2">{q.questionTextDE}</p>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                    <Button
                        fullWidth
                        onClick={handleCompleteLesson}
                        rightIcon={<BookOpen size={20} />}
                    >
                        Lektion abschließen
                    </Button>

                    <Button
                        fullWidth
                        variant="secondary"
                        onClick={handleRetry}
                        leftIcon={<RotateCcw size={20} />}
                    >
                        Quiz wiederholen
                    </Button>
                </div>
            </div>
        );
    }

    const cleanTitle = (title: string) => {
        return title.replace(/^Lektion\s+\d+\s*[:\-.]?\s*/i, '');
    };

    // Question view (matching QuestionView layout)
    return (
        <div className="min-h-screen bg-[#F2F4F6] dark:bg-slate-950 pb-32 lg:pb-8">
            {/* Header */}
            <div className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 h-[72px] flex items-center justify-between transition-all duration-300 shadow-sm">
                <button
                    onClick={() => navigate(`/learn/${moduleId}/lesson/${lessonId}`)}
                    className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-800 border-2 border-transparent text-slate-600 dark:text-slate-300 hover:border-slate-200 dark:hover:border-slate-700 active:scale-95 transition-all flex items-center justify-center p-0"
                >
                    <ArrowLeft size={28} strokeWidth={2.5} />
                </button>

                <div className="flex-1 flex flex-col items-center px-4">
                    {!lessonTitle && loading ? (
                        <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
                    ) : (
                        <span className="font-bold text-slate-900 dark:text-white text-sm text-center leading-tight line-clamp-2">
                            {cleanTitle(lessonTitle) || 'Quiz'}
                        </span>
                    )}
                    {language === 'DE_AR' && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">Arabisch aktiv</span>
                    )}
                </div>

                {/* Header ActionsGroup */}
                <div className="flex items-center bg-white dark:bg-slate-800 rounded-xl border-2 border-slate-100 dark:border-slate-700 p-1 shadow-sm h-14">
                    {/* Language Toggle */}
                    {showLanguageToggle && (
                        <>
                            <button
                                onClick={toggleLanguage}
                                className={`w-14 h-full rounded-lg flex items-center justify-center transition-all active:scale-95 ${language === 'DE_AR'
                                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                                    : 'text-slate-400 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                                    }`}
                            >
                                <Languages size={24} strokeWidth={2} />
                            </button>
                            {/* Divider */}
                            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />
                        </>
                    )}

                    {/* Settings Button */}
                    <button
                        onClick={() => setShowSettings(true)}
                        className="w-14 h-full rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-95"
                    >
                        <Settings size={24} strokeWidth={2} />
                    </button>
                </div>
            </div>

            {/* Settings Dialog */}
            {showSettings && (
                <QuizSettingsDialog onClose={() => setShowSettings(false)} />
            )}

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
                                {loading ? (
                                    <div className="h-3 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mt-1"></div>
                                ) : (
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        {results.length} von {questions.length} beantwortet
                                    </p>
                                )}
                            </div>

                            <div className="max-h-[calc(100vh-200px)] overflow-y-auto p-2 space-y-1 desktop-scrollbar">
                                {loading ? (
                                    [1, 2, 3, 4, 5].map(i => (
                                        <div key={i} className="h-10 w-full bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse"></div>
                                    ))
                                ) : (
                                    questions.map((q, idx) => {
                                        const isAnswered = idx < results.length;
                                        const isCorrect = results[idx] === true;
                                        const isWrong = results[idx] === false;
                                        const isCurrent = idx === currentIndex;

                                        return (
                                            <button
                                                key={q.id}
                                                onClick={() => {
                                                    setCurrentIndex(idx);
                                                    setSelectedAnswers([]);
                                                    setHasSubmitted(idx < results.length);
                                                    setShowExplanation(false);
                                                }}
                                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 group ${isCurrent
                                                    ? 'bg-primary text-white shadow-md'
                                                    : isCorrect
                                                        ? 'bg-success-light dark:bg-success/10 hover:bg-success-light/80 dark:hover:bg-success/20'
                                                        : isWrong
                                                            ? 'bg-error-light dark:bg-error/10 hover:bg-error-light/80 dark:hover:bg-error/20'
                                                            : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                                                    }`}
                                            >
                                                {/* Question Number Badge */}
                                                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${isCurrent
                                                    ? 'bg-white/20 text-white'
                                                    : isCorrect
                                                        ? 'bg-success text-white'
                                                        : isWrong
                                                            ? 'bg-error text-white'
                                                            : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                                    }`}>
                                                    {isCorrect && !isCurrent ? <Check size={14} strokeWidth={3} /> :
                                                        isWrong && !isCurrent ? <X size={14} strokeWidth={3} /> :
                                                            idx + 1}
                                                </div>

                                                {/* Question Text Preview */}
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-xs font-medium leading-snug line-clamp-2 ${isCurrent
                                                        ? 'text-white'
                                                        : isCorrect
                                                            ? 'text-success-dark dark:text-success'
                                                            : isWrong
                                                                ? 'text-error-dark dark:text-error'
                                                                : 'text-slate-700 dark:text-slate-300'
                                                        }`}>
                                                        {q.questionTextDE}
                                                    </p>
                                                </div>

                                                {/* Indicator for current */}
                                                {isCurrent && (
                                                    <ChevronRight size={16} className="text-white/80 flex-shrink-0" />
                                                )}
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </Card>
                    </div>
                </div>

                {/* Main Quiz Content */}
                <div className="flex-1 lg:max-w-3xl">
                    {loading ? (
                        <QuizSkeleton />
                    ) : questions.length === 0 ? (
                        <NoQuestionsView />
                    ) : (
                        /* Scrollable Content Area */
                        <div className="pt-4 px-3.5 pb-4 lg:pt-0 lg:px-0">
                            {/* Progress Header */}
                            <div className="flex justify-between items-center mb-4 relative">
                                <div>
                                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">Frage {currentIndex + 1} / {questions.length}</span>
                                    {language === 'DE_AR' && <span className="text-[10px] text-slate-400 dark:text-slate-500 block text-left" dir="rtl">سؤال {currentIndex + 1} / {questions.length}</span>}
                                </div>

                                {/* Navigation Arrows (Middle) */}
                                <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-4">
                                    <button
                                        onClick={() => {
                                            if (currentIndex > 0) {
                                                setCurrentIndex(prev => prev - 1);
                                                setSelectedAnswers([]);
                                                setHasSubmitted(currentIndex - 1 < results.length);
                                                setShowExplanation(false);
                                            }
                                        }}
                                        disabled={currentIndex === 0}
                                        className="p-1.5 rounded-full bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                    >
                                        <ChevronLeft size={18} />
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (currentIndex < questions.length - 1) {
                                                setCurrentIndex(prev => prev + 1);
                                                setSelectedAnswers([]);
                                                setHasSubmitted(currentIndex + 1 < results.length);
                                                setShowExplanation(false);
                                            }
                                        }}
                                        disabled={currentIndex === questions.length - 1}
                                        className="p-1.5 rounded-full bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                </div>

                                <div className="w-10" />
                            </div>

                            {/* Question Card */}
                            <Card className={`overflow-hidden border-2 border-slate-200 dark:border-slate-800 transition-all duration-300 ${hasSubmitted ? (() => {
                                const correctIds = currentQuestion.answers.filter(a => a.isCorrect).map(a => a.id);
                                const selectedCorrectCount = selectedAnswers.filter(id => correctIds.includes(id)).length;
                                const isFullyCorrect = correctIds.length === selectedAnswers.length && correctIds.every(id => selectedAnswers.includes(id));
                                const isPartiallyCorrect = selectedCorrectCount > 0 && !isFullyCorrect;

                                if (isFullyCorrect) return 'shadow-[0_0_30px_-5px_rgba(16,185,129,0.4)] dark:shadow-[0_0_30px_-5px_rgba(16,185,129,0.3)] border-success/50';
                                if (isPartiallyCorrect) return 'shadow-[0_0_30px_-5px_rgba(245,158,11,0.4)] dark:shadow-[0_0_30px_-5px_rgba(245,158,11,0.3)] border-warning/50';
                                return 'shadow-[0_0_30px_-5px_rgba(239,68,68,0.4)] dark:shadow-[0_0_30px_-5px_rgba(239,68,68,0.3)] border-error/50';
                            })() : ''}`} padding="none">
                                {/* Question Section with distinct background */}
                                <div className="bg-slate-50/50 dark:bg-slate-800/50 p-6 border-b border-slate-100 dark:border-slate-700/50">
                                    <h2 className={`${currentFontSize.question} font-bold text-slate-900 dark:text-white leading-relaxed`}>{currentQuestion.questionTextDE}</h2>
                                    {language === 'DE_AR' && (
                                        <p className="text-xs text-blue-800 dark:text-blue-300 mt-2 text-left font-medium leading-relaxed" dir="rtl">{currentQuestion.questionTextAR}</p>
                                    )}

                                    {currentQuestion.questionType === 'MULTIPLE_CHOICE' && (
                                        <div className={`${language === 'DE_AR' ? 'mt-3' : 'mt-4'} flex flex-col items-start text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded-lg w-fit`}>
                                            <div className="flex items-center gap-1.5">
                                                <AlertCircle size={8} strokeWidth={2} />
                                                <span className="text-[7px] font-bold uppercase tracking-wide">Bitte 2 Antworten wählen</span>
                                            </div>
                                            {language === 'DE_AR' && <span className="text-[6px] font-medium self-end mt-0.5" dir="rtl">يرجى اختيار إجابتين</span>}
                                        </div>
                                    )}
                                </div>

                                {/* Answers Section */}
                                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {currentQuestion.answers.map((answer) => {
                                        const isSelected = selectedAnswers.includes(answer.id);
                                        const isCorrect = answer.isCorrect;

                                        let rowClass = "w-full text-left transition-all duration-200 flex items-start p-4 group active:scale-[0.99]";

                                        if (hasSubmitted) {
                                            if (isCorrect) {
                                                rowClass += " bg-success-light dark:bg-success/20";
                                            } else if (isSelected && !isCorrect) {
                                                rowClass += " bg-error-light dark:bg-error/20";
                                            } else {
                                                rowClass += " opacity-50";
                                            }
                                        } else {
                                            if (isSelected) {
                                                rowClass += " bg-primary-light dark:bg-primary/20";
                                            } else {
                                                rowClass += " hover:bg-slate-50 dark:hover:bg-slate-800/50";
                                            }
                                        }

                                        return (
                                            <button
                                                key={answer.id}
                                                onClick={() => handleAnswerSelect(answer.id)}
                                                className={rowClass}
                                                disabled={hasSubmitted}
                                            >
                                                <div className={`flex items-start w-full ${language === 'DE_AR' ? 'gap-2.5' : 'gap-3'}`}>
                                                    <div className={`${language === 'DE_AR' ? 'w-6 h-6' : 'w-7 h-7'} rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-colors mt-0.5 ${hasSubmitted
                                                        ? isCorrect
                                                            ? "bg-success border-success text-white"
                                                            : isSelected && !isCorrect
                                                                ? "bg-error border-error text-white"
                                                                : "border-slate-300 dark:border-slate-600"
                                                        : isSelected
                                                            ? "bg-primary border-primary text-white"
                                                            : "border-slate-300 dark:border-slate-600 group-hover:border-primary"
                                                        }`}>
                                                        {hasSubmitted ? (
                                                            isCorrect ? <Check size={currentFontSize.icon} strokeWidth={3} /> : isSelected ? <X size={currentFontSize.icon} strokeWidth={3} /> : <span className={`${currentFontSize.index} font-bold text-slate-400`}>{String.fromCharCode(65 + currentQuestion.answers.indexOf(answer))}</span>
                                                        ) : (
                                                            isSelected ? <div className={`${language === 'DE_AR' ? 'w-2 h-2' : 'w-2.5 h-2.5'} bg-white rounded-full`} /> : <span className={`${currentFontSize.index} font-bold text-slate-400 group-hover:text-primary`}>{String.fromCharCode(65 + currentQuestion.answers.indexOf(answer))}</span>
                                                        )}
                                                    </div>

                                                    <div className="flex-1">
                                                        <p className={`${currentFontSize.answer} font-semibold leading-normal transition-colors ${hasSubmitted && isCorrect ? 'text-success-dark dark:text-success' :
                                                            hasSubmitted && isSelected && !isCorrect ? 'text-error-dark dark:text-error' :
                                                                isSelected ? 'text-primary-dark dark:text-primary' :
                                                                    'text-slate-700 dark:text-slate-200'
                                                            }`}>
                                                            {answer.textDE}
                                                        </p>
                                                        {language === 'DE_AR' && (
                                                            <p className={`text-[11px] ${language === 'DE_AR' ? 'mt-1.5' : 'mt-2'} text-left font-medium leading-relaxed ${hasSubmitted && isCorrect ? 'text-success-dark/80 dark:text-success/80' :
                                                                hasSubmitted && isSelected && !isCorrect ? 'text-error-dark/80 dark:text-error/80' :
                                                                    isSelected ? 'text-primary-dark/80 dark:text-primary/80' :
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
                        </div>
                    )}

                    {/* Bottom Actions Area - Fixed on Mobile, Static on Desktop */}
                    {!loading && questions.length > 0 && (
                        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 p-3 pb-6 z-50 lg:static lg:bg-transparent lg:dark:bg-transparent lg:border-none lg:p-0 lg:mt-6">
                            <div className="lg:w-full">
                                {!hasSubmitted ? (
                                    <Button
                                        fullWidth
                                        size={window.innerWidth >= 1024 ? "md" : "lg"}
                                        disabled={selectedAnswers.length === 0}
                                        onClick={handleSubmit}
                                        variant="primary"
                                        className="shadow-lg lg:shadow-none"
                                    >
                                        <div className="flex flex-col items-center leading-tight">
                                            <span>Überprüfen</span>
                                            {language === 'DE_AR' && <span className="text-[10px] font-medium opacity-80">تحقق</span>}
                                        </div>
                                    </Button>
                                ) : (
                                    <div className="space-y-2.5 lg:space-y-4">
                                        {/* Explanation Toggle/Box */}
                                        {showExplanation ? (
                                            <div className={`bg-slate-50 dark:bg-slate-800 p-3 lg:p-4 rounded-lg border border-slate-200 dark:border-slate-700 ${currentFontSize.explanation} text-slate-700 dark:text-slate-300`}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="font-bold">Erklärung:</span>
                                                    <button
                                                        onClick={() => setShowExplanation(false)}
                                                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                                                    >
                                                        <X size={currentFontSize.icon} />
                                                    </button>
                                                </div>
                                                <div>
                                                    {currentQuestion.explanationDE}
                                                    {language === 'DE_AR' && (
                                                        <>
                                                            <p className="mt-2 text-left font-bold text-slate-400 dark:text-slate-500" dir="rtl">الشرح:</p>
                                                            <p className="text-left text-slate-600 dark:text-slate-400" dir="rtl">{currentQuestion.explanationAR}</p>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setShowExplanation(true)}
                                                className="w-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-medium py-2.5 lg:py-3 rounded-xl flex items-center justify-center gap-2 text-xs lg:text-sm border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                                            >
                                                <Lightbulb size={16} />
                                                <span>Erklärung zeigen</span>
                                                {language === 'DE_AR' && <span className="text-[9px]">| عرض الشرح</span>}
                                            </button>
                                        )}

                                        <Button
                                            fullWidth
                                            size={window.innerWidth >= 1024 ? "md" : "lg"}
                                            variant="primary"
                                            onClick={handleNext}
                                            rightIcon={currentIndex < questions.length - 1 ? <ArrowRight size={20} /> : <CheckCircle size={20} />}
                                            className="shadow-lg lg:shadow-none"
                                        >
                                            {currentIndex < questions.length - 1 ? 'Weiter' : 'Ergebnis anzeigen'}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
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
