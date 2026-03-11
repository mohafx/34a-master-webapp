import React, { useMemo, useRef, useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../../App';
import { useDataCache } from '../../contexts/DataCacheContext';
import { ArrowLeft, CheckCircle, CheckCircle2, XCircle, Circle, Lock, Play, HelpCircle, BookOpen, Languages, Crown } from 'lucide-react';
import { Card } from '../ui/Card';
import * as Icons from 'lucide-react';
import { ExamConfigDialog } from './ExamConfigDialog';
import { abbreviateModuleTitle } from '../../utils/moduleUtils';



export default function ModuleQuestionsList() {
    const { moduleId } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { language, progress, user, showLanguageToggle, toggleLanguage, isPremium, openPaywall } = useApp();
    const { getModuleById, getQuestionsByModule, loading: cacheLoading } = useDataCache();
    const lastAnsweredQuestionRef = useRef<HTMLDivElement | null>(null);
    const hasScrolledRef = useRef(false);
    // First lesson of each module is free for non-premium users
    // No URL parameter needed - logic is applied consistently

    // Module data from cache (synchronous if loaded)
    const module = moduleId ? getModuleById(moduleId) : undefined;

    // Lessons are already part of the module object in our data structure
    // We can use them directly without async loading
    const lessons = useMemo(() => module?.lessons || [], [module]);
    const lessonsLoading = !module && cacheLoading;

    const questions = useMemo(() => {
        if (!moduleId) return [];
        return getQuestionsByModule(moduleId);
    }, [moduleId, getQuestionsByModule]);

    // Sort questions by lesson order first, then by global_order_index
    // This matches the sorting in QuestionView.tsx for consistent numbering
    const sortedQuestions = useMemo(() => {
        // Create a map of lessonId -> orderIndex for quick lookup
        const lessonOrderMap: Record<string, number> = {};
        lessons.forEach((lesson: any) => {
            lessonOrderMap[lesson.id] = lesson.orderIndex ?? 0;
        });

        return [...questions].sort((a, b) => {
            // First sort by Lesson Order (questions without lesson go to the end)
            const lessonOrderA = a.lessonId ? (lessonOrderMap[a.lessonId] ?? 999999) : 999999;
            const lessonOrderB = b.lessonId ? (lessonOrderMap[b.lessonId] ?? 999999) : 999999;

            if (lessonOrderA !== lessonOrderB) {
                return lessonOrderA - lessonOrderB;
            }

            // Then by global_order_index within same lesson
            const globalA = a.global_order_index ?? a.orderIndex ?? 0;
            const globalB = b.global_order_index ?? b.orderIndex ?? 0;

            if (globalA !== globalB) {
                return globalA - globalB;
            }

            // Final tie-breaker: sort by text for stable ordering
            return (a.textDE || '').localeCompare(b.textDE || '');
        });
    }, [questions, lessons]);

    // Find last answered question based on answer order (not question number)
    const lastAnsweredQuestion = useMemo(() => {
        const answeredQuestions = sortedQuestions.filter(q => progress.answeredQuestions.hasOwnProperty(q.id));
        if (answeredQuestions.length === 0) return null;

        // Get the order of answered questions from localStorage
        const answeredOrder = JSON.parse(localStorage.getItem('answered_order') || '[]');

        // Find the question that was answered last (last in the order array)
        let lastQuestionId: string | null = null;
        for (let i = answeredOrder.length - 1; i >= 0; i--) {
            const questionId = answeredOrder[i];
            if (answeredQuestions.some(q => q.id === questionId)) {
                lastQuestionId = questionId;
                break;
            }
        }

        // If we found a last answered question, return it
        if (lastQuestionId) {
            return answeredQuestions.find(q => q.id === lastQuestionId) || null;
        }

        // Fallback: if no order found, use the last one by global_order_index
        const sortedAnswered = [...answeredQuestions].sort((a, b) => {
            const globalA = a.global_order_index ?? a.orderIndex ?? 0;
            const globalB = b.global_order_index ?? b.orderIndex ?? 0;
            return globalB - globalA; // Descending order
        });

        return sortedAnswered[0];
    }, [sortedQuestions, progress.answeredQuestions]);

    const [isRestoringScroll, setIsRestoringScroll] = React.useState(() => sessionStorage.getItem('returning_from_quiz') === 'true');
    const [expandedLessons, setExpandedLessons] = useState<Record<string, boolean>>({});

    // Reset scroll flag when module changes
    useEffect(() => {
        hasScrolledRef.current = false;
        // Don't reset isRestoringScroll here, as it might be set for the initial load
    }, [moduleId]);

    // Initial Expansion Logic - SYNCHRONOUS derivation if possible
    // This runs once when module/lessons are ready to ensure target lesson is expanded BEFORE paint
    useEffect(() => { // Changed to useEffect to avoid build errors with SSR, but logically runs early
        if (lessonsLoading) return;

        // 1. Recover expansion state from localStorage
        let initialExpanded: Record<string, boolean> = {};
        if (moduleId) {
            try {
                const stored = localStorage.getItem('34a_module_expansion');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (parsed[moduleId]) {
                        initialExpanded = parsed[moduleId];
                    }
                }
            } catch (e) {
                console.error('Error loading expansion state', e);
            }
        }

        // 2. Default expansion (all open if no state)
        if (Object.keys(initialExpanded).length === 0) {
            lessons.forEach((l: any) => {
                initialExpanded[l.id] = true;
            });
            initialExpanded['general'] = true;
        }

        // 3. If returning from quiz, FORCE expand the lesson of the target question
        const returningFromQuiz = sessionStorage.getItem('returning_from_quiz') === 'true';
        if (returningFromQuiz) {
            const lastViewedId = sessionStorage.getItem('last_viewed_question_id');
            // Try last viewed, then last answered
            let targetId = lastViewedId;
            if (!targetId && lastAnsweredQuestion) targetId = lastAnsweredQuestion.id;

            if (targetId) {
                const targetQ = sortedQuestions.find(q => q.id === targetId);
                if (targetQ) {
                    const lessonId = targetQ.lessonId || 'general';
                    initialExpanded[lessonId] = true;
                    console.log(`[Expansion] Force expanding ${lessonId} for target ${targetId}`);
                }
            }
        }

        setExpandedLessons(prev => ({
            ...prev,
            ...initialExpanded
        }));
    }, [moduleId, lessonsLoading, lessons, sortedQuestions, lastAnsweredQuestion]);

    // SCROLL RESTORATION - useLayoutEffect for synchronous scroll before paint
    React.useLayoutEffect(() => {
        // Only run if we are supposed to restore scroll and data is ready
        if (!isRestoringScroll || lessonsLoading || sortedQuestions.length === 0) {
            if (!isRestoringScroll && !lessonsLoading) {
                // Optimization: if we are not restoring scroll, ensure we are visible immediately
                // But wait for lessons to be loaded to avoid flash of content
            }
            return;
        }

        const restoreScroll = () => {
            const lastViewedId = sessionStorage.getItem('last_viewed_question_id');
            let targetQuestion: any = null;

            if (lastViewedId) {
                targetQuestion = sortedQuestions.find(q => q.id === lastViewedId);
            }
            if (!targetQuestion && lastAnsweredQuestion) {
                targetQuestion = lastAnsweredQuestion;
            }

            if (targetQuestion) {
                const elementId = `question-${targetQuestion.id}`;
                const element = document.getElementById(elementId);

                if (element) {
                    console.log(`[Scroll] Instant jumping to ${targetQuestion.id}`);
                    element.scrollIntoView({ block: 'center', behavior: 'auto' });

                    // Cleanup flags
                    sessionStorage.removeItem('returning_from_quiz');
                    sessionStorage.removeItem('last_viewed_question_id');

                    // Instant reveal
                    setIsRestoringScroll(false);
                    hasScrolledRef.current = true;
                } else {
                    // Element not found yet? Might be in a collapsed section (shouldn't happen due to expansion logic above)
                    // or not rendered yet. 
                    console.warn(`[Scroll] Element ${elementId} not found`);
                }
            } else {
                // No target found, just reveal
                setIsRestoringScroll(false);
                sessionStorage.removeItem('returning_from_quiz');
            }
        };

        // Attempt scroll immediately
        restoreScroll();

        // Fallback: If it failed (layout shifting?), try once more in next frame
        // requestAnimationFrame(() => restoreScroll());

    }, [isRestoringScroll, lessonsLoading, sortedQuestions, lastAnsweredQuestion, expandedLessons]); // expandedLessons dependency ensures we wait for expansion


    // Smart Sticky Header Logic
    const [showFloatingButton, setShowFloatingButton] = React.useState(false);
    const lastScrollY = useRef(0);
    const ticking = useRef(false);

    useEffect(() => {
        const handleScroll = (e: Event) => {
            const target = e.target as HTMLElement;
            // We only care about the main scroll container. 
            // Since we don't know exactly which one it is, we'll check if it's likely the main one (e.g. root or has significant height)
            // or simply use the target that is scrolling.

            if (!ticking.current) {
                window.requestAnimationFrame(() => {
                    const currentScrollY = target.scrollTop || window.scrollY;

                    // Show button if we scrolled UP and are not at the very top
                    if (currentScrollY < lastScrollY.current && currentScrollY > 100) {
                        setShowFloatingButton(true);
                    } else if (currentScrollY > lastScrollY.current || currentScrollY <= 100) {
                        setShowFloatingButton(false);
                    }

                    lastScrollY.current = currentScrollY;
                    ticking.current = false;
                });
                ticking.current = true;
            }
        };

        // Use capture: true to catch scroll events from children (since scroll doesn't bubble)
        window.addEventListener('scroll', handleScroll, { capture: true });
        return () => window.removeEventListener('scroll', handleScroll, { capture: true });
    }, []);



    const moduleTitle = module ? {
        de: (module as any).title_de || module.titleDE,
        ar: (module as any).title_ar || module.titleAR
    } : null;

    const totalQuestions = questions.length;
    const answeredQuestions = questions.filter(q => progress.answeredQuestions.hasOwnProperty(q.id)).length;
    const correctAnswers = questions.filter(q => progress.answeredQuestions[q.id] === true).length;
    const wrongAnswers = questions.filter(q => progress.answeredQuestions[q.id] === false).length;
    const unansweredQuestions = totalQuestions - answeredQuestions;
    const allAnswered = totalQuestions > 0 && answeredQuestions === totalQuestions;

    const isTestUnlocked = answeredQuestions >= 5 || allAnswered;
    const remainingToUnlock = 5 - answeredQuestions;

    // Exam Config Dialog state
    const [showExamConfig, setShowExamConfig] = useState(false);

    const handleStartExam = (questionCount: number, timeInSeconds: number) => {
        setShowExamConfig(false);
        sessionStorage.setItem('returning_from_quiz', 'true');
        const modName = encodeURIComponent(moduleTitle?.de || '');
        const modIcon = (module as any)?.icon || 'BookOpen';
        navigate(`/quiz?mode=mini-exam&module=${moduleId}&moduleName=${modName}&moduleIcon=${modIcon}&questionCount=${questionCount}&timeLimit=${timeInSeconds}`);
    };

    const WissenTestenButton = () => (
        isTestUnlocked ? (
            <button
                onClick={() => setShowExamConfig(true)}
                className="flex-1 relative overflow-hidden py-3 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2.5 group bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
            >
                <Play size={18} strokeWidth={2.5} fill="currentColor" />
                <span className="font-bold text-sm">Wissen testen</span>
            </button>
        ) : (
            <div className="flex-1 relative overflow-hidden py-3 px-4 rounded-xl flex items-center justify-center gap-2.5 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed">
                <Lock size={18} />
                <div className="flex flex-col items-start translate-y-[1px]">
                    <span className="font-bold text-sm">Wissen testen</span>
                    <span className="text-[9px] font-medium leading-none opacity-70">Noch {remainingToUnlock} Fragen</span>
                </div>
            </div>
        )
    );

    const RepeatWrongButton = () => (
        <button
            onClick={() => navigate(`/wrong-answers?expandModule=${moduleId}`)}
            className="flex-1 relative overflow-hidden py-3 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2.5 group bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30"
        >
            <XCircle size={18} strokeWidth={2.5} />
            <span className="font-bold text-sm">Falsch ({wrongAnswers})</span>
        </button>
    );



    const toggleLesson = (lessonId: string) => {
        setExpandedLessons(prev => {
            const newState = {
                ...prev,
                [lessonId]: !prev[lessonId]
            };

            // Persist to localStorage
            if (moduleId) {
                try {
                    const stored = localStorage.getItem('34a_module_expansion');
                    const parsed = stored ? JSON.parse(stored) : {};
                    parsed[moduleId] = newState;
                    localStorage.setItem('34a_module_expansion', JSON.stringify(parsed));
                } catch (e) {
                    console.error('Error saving expansion state', e);
                }
            }

            return newState;
        });
    };

    // Calculate sequential numbering based on visual order (Lesson by Lesson)
    const questionNumberMap = useMemo(() => {
        const map: Record<string, number> = {};
        let counter = 1;

        // 1. Iterate through lessons in order
        lessons.forEach(lesson => {
            // Get questions for this lesson, maintaining the sort order from sortedQuestions
            const lessonQuestions = sortedQuestions.filter(q => q.lessonId === lesson.id);
            lessonQuestions.forEach(q => {
                map[q.id] = counter++;
            });
        });

        // 2. Handle general questions (no lessonId)
        const generalQuestions = sortedQuestions.filter(q => !q.lessonId);
        generalQuestions.forEach(q => {
            map[q.id] = counter++;
        });

        return map;
    }, [lessons, sortedQuestions]);

    const renderQuestionList = (list: typeof questions) => {
        // Group questions by lesson
        const questionsByLesson: Record<string, typeof questions> = {};
        const generalQuestions: typeof questions = [];

        list.forEach(q => {
            if (q.lessonId) {
                if (!questionsByLesson[q.lessonId]) {
                    questionsByLesson[q.lessonId] = [];
                }
                questionsByLesson[q.lessonId].push(q);
            } else {
                generalQuestions.push(q);
            }
        });

        // Determine which lessons to render and in what order
        // Use 'lessons' state to define order
        // Add 'general' group at the end if needed

        return (

            <Card className="mb-8 overflow-hidden shadow-card border-none" padding="none">
                <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-700/50">
                    {lessons.map((lesson, lessonIndex) => {
                        const lessonQuestions = questionsByLesson[lesson.id] || [];
                        if (lessonQuestions.length === 0) return null;

                        const isExpanded = expandedLessons[lesson.id];

                        // Check if this lesson is locked for free users
                        // All lessons in "Einführung und Grundlagen" module are free
                        const isFirstLesson = lessonIndex === 0;
                        const isIntroModule = (module as any)?.title_de === 'Einführung und Grundlagen' || module?.titleDE === 'Einführung und Grundlagen';
                        const isLessonLocked = !isFirstLesson && !isPremium && !isIntroModule;

                        // Stats for this lesson
                        const lTotal = lessonQuestions.length;
                        const lCorrect = lessonQuestions.filter(q => progress.answeredQuestions[q.id] === true).length;
                        const lWrong = lessonQuestions.filter(q => progress.answeredQuestions[q.id] === false).length;
                        const lUnanswered = lTotal - lCorrect - lWrong;
                        const isLessonComplete = lTotal > 0 && lCorrect === lTotal;

                        return (
                            <div key={lesson.id} className={`transition-colors duration-200 ${isLessonLocked ? 'bg-blue-50/20 dark:bg-blue-900/5' : isLessonComplete ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : isExpanded ? 'bg-slate-50 dark:bg-slate-900/30' : 'bg-white dark:bg-slate-800'}`}>
                                <div className={`flex items-stretch group relative overflow-hidden ${isLessonLocked ? 'hover:bg-blue-50/40 dark:hover:bg-blue-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/80'} transition-colors`}>
                                    <button
                                        onClick={() => toggleLesson(lesson.id)}
                                        className="flex-1 flex items-center gap-4 p-5 text-left min-w-0"
                                    >
                                        <div className={`transition-transform duration-200 flex-shrink-0 ${isLessonLocked ? 'text-blue-500' : 'text-slate-400 group-hover:text-primary'} ${isExpanded ? 'rotate-90' : ''}`}>
                                            {isLessonLocked ? <Crown size={20} /> : <Icons.ChevronRight size={20} />}
                                        </div>
                                        <div className="text-left flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <div className="flex flex-col">
                                                    <h3 className={`font-bold text-sm leading-snug pr-2 ${isLessonLocked ? 'text-blue-700 dark:text-blue-400' : 'text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400'} transition-colors`}>
                                                        {lesson.titleDE}
                                                    </h3>
                                                    {language === 'DE_AR' && lesson.titleAR && (
                                                        <h4 className={`text-xs mt-0.5 ${isLessonLocked ? 'text-blue-600/80 dark:text-blue-500/80' : 'text-slate-500 dark:text-slate-400'} truncate`} dir="rtl">
                                                            {lesson.titleAR}
                                                        </h4>
                                                    )}
                                                </div>
                                            </div>

                                        </div>
                                    </button>

                                    {/* Navigation Button */}
                                    <div className="flex items-center px-4 flex-shrink-0 border-l border-slate-100 dark:border-slate-700/50">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (isLessonLocked) {
                                                    openPaywall('Lektion lernen');
                                                } else {
                                                    navigate(`/learn/${moduleId}/lesson/${lesson.id}`, { state: { fromPractice: true } });
                                                }
                                            }}
                                            className="p-2.5 text-slate-400 hover:text-primary hover:bg-blue-50 dark:hover:bg-slate-700 rounded-xl transition-all active:scale-95"
                                            title="Zur Lektion lernen"
                                        >
                                            <BookOpen size={20} className="stroke-[2.5px]" />
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-slate-50/50 dark:bg-slate-900/20">
                                    {isExpanded && lessonQuestions.map((q, qIndex) => {
                                        const isAnswered = progress.answeredQuestions.hasOwnProperty(q.id);
                                        const isCorrect = progress.answeredQuestions[q.id] === true;
                                        const globalIndex = q.global_order_index || 0;

                                        // Determine styling based on lock status and answer status
                                        let rowClass = "";
                                        let iconColor = "";
                                        let RenderIcon = Circle;

                                        const qIsLocked = isLessonLocked && !q.isFree;

                                        if (qIsLocked) {
                                            rowClass = "hover:bg-blue-50/50 dark:hover:bg-blue-900/20 opacity-75";
                                            iconColor = "text-blue-400";
                                            RenderIcon = Lock;
                                        } else if (isAnswered) {
                                            if (isCorrect) {
                                                rowClass = "bg-emerald-50/30 dark:bg-emerald-900/10 hover:bg-emerald-50/60 dark:hover:bg-emerald-900/20";
                                                iconColor = "text-emerald-500";
                                                RenderIcon = CheckCircle2;
                                            } else {
                                                rowClass = "bg-red-50/30 dark:bg-red-900/10 hover:bg-red-50/60 dark:hover:bg-red-900/20";
                                                iconColor = "text-red-500";
                                                RenderIcon = XCircle;
                                            }
                                        } else {
                                            rowClass = "hover:bg-white dark:hover:bg-slate-800";
                                            iconColor = "text-slate-300 dark:text-slate-600 group-hover:text-slate-400";
                                        }

                                        return (
                                            <div
                                                id={`question-${q.id}`}
                                                role="button"
                                                tabIndex={0}
                                                ref={q.id === lastAnsweredQuestion?.id ? lastAnsweredQuestionRef : null}
                                                onClick={() => {
                                                    const qIsLocked = isLessonLocked && !q.isFree;
                                                    if (qIsLocked) {
                                                        openPaywall('Einzelne Frage');
                                                        return;
                                                    }
                                                    sessionStorage.setItem('returning_from_quiz', 'true');
                                                    const modName = encodeURIComponent(moduleTitle?.de || '');
                                                    const modIcon = (module as any)?.icon || 'BookOpen';
                                                    navigate(`/quiz?single=${q.id}&module=${moduleId}&moduleName=${modName}&moduleIcon=${modIcon}`);
                                                }}
                                                onKeyDown={(e) => {
                                                    const qIsLocked = isLessonLocked && !q.isFree;
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        if (qIsLocked) {
                                                            openPaywall('Einzelne Frage');
                                                            return;
                                                        }
                                                        sessionStorage.setItem('returning_from_quiz', 'true');
                                                        const modName = encodeURIComponent(moduleTitle?.de || '');
                                                        const modIcon = (module as any)?.icon || 'BookOpen';
                                                        navigate(`/quiz?single=${q.id}&module=${moduleId}&moduleName=${modName}&moduleIcon=${modIcon}`);
                                                    }
                                                }}
                                                className={`w-full flex items-center gap-3.5 p-3.5 border-t border-slate-100 dark:border-slate-800 transition-colors text-left group/item cursor-pointer ${rowClass}`}
                                            >
                                                {/* Status Icon */}
                                                <div className={`transition-transform duration-200 group-hover/item:scale-110 flex-shrink-0 ${iconColor}`}>
                                                    <RenderIcon size={16} strokeWidth={isAnswered ? 2.5 : 2} />
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-[13px] font-medium leading-snug transition-colors line-clamp-2 ${isLessonLocked ? 'text-slate-500 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200 group-hover/item:text-blue-600 dark:group-hover/item:text-blue-400'}`}>
                                                        {q.textDE || 'Text fehlt'}
                                                    </p>
                                                    {language === 'DE_AR' && q.textAR && (
                                                        <p className={`text-[11px] mt-1 leading-snug transition-colors line-clamp-2 ${isLessonLocked ? 'text-slate-400 dark:text-slate-600' : 'text-slate-500 dark:text-slate-400'}`} dir="rtl">
                                                            {q.textAR}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}

                    {/* General Questions (Unassigned) */}
                    {generalQuestions.length > 0 && (
                        <div className="bg-slate-50 dark:bg-slate-900/20">
                            <button
                                onClick={() => toggleLesson('general')}
                                className="w-full flex items-center justify-between p-5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
                            >
                                <h3 className="font-bold text-slate-800 dark:text-slate-200">Allgemeine Fragen</h3>
                                <div className={`transition-transform duration-200 text-slate-400 ${expandedLessons['general'] ? 'rotate-90' : ''}`}>
                                    <Icons.ChevronRight size={20} />
                                </div>
                            </button>
                            {expandedLessons['general'] && (
                                <div className="p-4 space-y-3 border-t border-slate-100 dark:border-slate-700/50">
                                    {generalQuestions.map(q => {
                                        const isLocked = !isPremium && !q.isFree;
                                        return (
                                            <Card
                                                key={q.id}
                                                className={`p-3 cursor-pointer active:scale-95 transition-all ${isLocked ? 'opacity-75' : ''}`}
                                                variant="interactive"
                                                padding="none"
                                                onClick={() => {
                                                    if (isLocked) {
                                                        openPaywall('Einzelne Frage');
                                                        return;
                                                    }
                                                    sessionStorage.setItem('returning_from_quiz', 'true');
                                                    const modName = encodeURIComponent(moduleTitle?.de || '');
                                                    const modIcon = (module as any)?.icon || 'BookOpen';
                                                    navigate(`/quiz?single=${q.id}&module=${moduleId}&moduleName=${modName}&moduleIcon=${modIcon}`);
                                                }}
                                            >
                                                <div className="p-3 flex items-center gap-3">
                                                    {isLocked ? (
                                                        <Lock size={14} className="text-blue-500 flex-shrink-0" />
                                                    ) : (
                                                        <Circle size={14} className="text-slate-300 flex-shrink-0" />
                                                    )}
                                                    <div className="min-w-0">
                                                        <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200 line-clamp-2">
                                                            {q.textDE}
                                                        </p>
                                                        {language === 'DE_AR' && q.textAR && (
                                                            <p className="text-[11px] mt-1 text-slate-500 dark:text-slate-400 line-clamp-2" dir="rtl">
                                                                {q.textAR}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </Card>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Card>
        );

    };




    // Unified Header Progress Skeleton
    const HeaderProgressSkeleton = () => (
        <div className="flex items-center justify-between">
            <div className="flex-1 mr-6">
                <div className="flex justify-between items-center mb-1.5">
                    <div className="h-3 w-16 bg-slate-100 dark:bg-slate-800 rounded animate-pulse"></div>
                    <div className="h-3 w-10 bg-slate-100 dark:bg-slate-800 rounded animate-pulse"></div>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="h-full w-0 bg-slate-200 dark:bg-slate-700 animate-pulse"></div>
                </div>
            </div>
            <div className="flex flex-col items-end gap-1">
                <div className="h-3 w-14 bg-slate-100 dark:bg-slate-800 rounded animate-pulse"></div>
                <div className="h-3 w-12 bg-slate-100 dark:bg-slate-800 rounded animate-pulse"></div>
            </div>
        </div>
    );

    return (
        <div className={`pt-4 px-4 pb-32 transition-opacity duration-300 ${isRestoringScroll ? 'opacity-0' : 'opacity-100'}`}>
            {/* Scroll Restoration Overlay */}
            {/* Scroll Restoration Overlay - Removed for instant feeling */}

            {/* Floating Smart Back Button */}
            <div
                className={`fixed top-4 left-4 z-40 transition-all duration-300 transform ${showFloatingButton ? 'translate-y-0 opacity-100' : '-translate-y-16 opacity-0 pointer-events-none'}`}
            >
                <button
                    onClick={() => navigate('/practice')}
                    className="w-14 h-14 rounded-full bg-white dark:bg-slate-800 shadow-lg border border-slate-100 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                    <ArrowLeft size={28} strokeWidth={2.5} />
                </button>
            </div>

            {/* New Unified Header Style */}
            <Card className="mb-8 shadow-card border-none" padding="md">
                <div className="flex flex-col">
                    {/* Top Row: Back, Title, Language */}
                    <div className="flex items-center justify-between pt-2 pb-6">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => navigate('/practice')}
                                className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-500 dark:text-slate-400"
                            >
                                <ArrowLeft size={24} />
                            </button>
                            <div>
                                {!module ? (
                                    <div className="h-5 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-1"></div>
                                ) : (
                                    <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-tight line-clamp-2">
                                        {moduleTitle?.de || ''}
                                    </h2>
                                )}
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                                    Fragenkatalog
                                </p>
                            </div>
                        </div>

                        {showLanguageToggle && (
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
                    </div>

                    {/* Divider */}
                    <div className="h-px bg-slate-100 dark:bg-slate-800 w-full" />

                    {/* Bottom Row: Progress & Stats */}
                    {!module || cacheLoading ? (
                        <HeaderProgressSkeleton />
                    ) : (
                        <div className="flex items-center justify-between">
                            <div className="flex-1 mr-4">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">
                                        Fortschritt
                                    </span>
                                    <span className="text-[10px] font-black text-slate-900 dark:text-white">
                                        {correctAnswers} <span className="text-slate-400 font-normal">/ {totalQuestions}</span>
                                    </span>
                                </div>
                                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden flex">
                                    <div
                                        className="h-full bg-emerald-500 transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                                        style={{ width: `${totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0}%` }}
                                    ></div>
                                    <div
                                        className="h-full bg-red-500 transition-all duration-1000 ease-out"
                                        style={{ width: `${totalQuestions > 0 ? (wrongAnswers / totalQuestions) * 100 : 0}%` }}
                                    ></div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="flex flex-col items-end">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-1 m-0.5 h-1 rounded-full bg-emerald-500" />
                                        <span className="text-[9px] font-bold text-slate-600 dark:text-slate-400">{correctAnswers} Richtig</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <div className="w-1 m-0.5 h-1 rounded-full bg-red-500" />
                                        <span className="text-[9px] font-bold text-slate-600 dark:text-slate-400">{wrongAnswers} Falsch</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2.5 pt-2">
                        <WissenTestenButton />
                        {wrongAnswers > 0 && <RepeatWrongButton />}
                    </div>
                </div>
            </Card>

            {language === 'DE_AR' && (
                <div className="mb-6 px-4">
                    <p className="text-lg text-slate-500 dark:text-slate-400 text-right font-bold leading-relaxed" dir="rtl">{moduleTitle?.ar}</p>
                </div>
            )
            }


            {/* All Questions - with loading state */}
            {
                lessonsLoading ? (
                    <div className="space-y-4 animate-pulse">
                        {/* Skeleton for lesson sections */}
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                                <div className="p-4 border-b border-slate-100 dark:border-slate-700">
                                    <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded-lg w-2/3 mb-2"></div>
                                    <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-1/3"></div>
                                </div>
                                <div className="p-3 space-y-2">
                                    {[1, 2, 3].map((j) => (
                                        <div key={j} className="bg-slate-50 dark:bg-slate-850 rounded-xl p-3 flex gap-3">
                                            <div className="w-5 h-5 bg-slate-200 dark:bg-slate-700 rounded-full flex-shrink-0 mt-0.5"></div>
                                            <div className="flex-1">
                                                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/4 mb-2"></div>
                                                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full mb-1"></div>
                                                <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-3/4"></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    renderQuestionList(sortedQuestions)
                )
            }


            {/* Exam Configuration Dialog */}
            <ExamConfigDialog
                isOpen={showExamConfig}
                onClose={() => setShowExamConfig(false)}
                onStart={handleStartExam}
                moduleTitle={moduleTitle?.de || ''}
                moduleIcon={(() => {
                    const iconName = (module as any)?.icon || 'BookOpen';
                    const IconComponent = (Icons as any)[iconName] || Icons.BookOpen;
                    return <IconComponent size={20} className="text-white" />;
                })()}
                totalQuestions={answeredQuestions}
                language={language}
            />
        </div >
    );
}

const ModuleListSkeleton = () => (
    <div className="pt-4 px-4 pb-32">
        <Card className="mb-8 shadow-card border-none animate-pulse" padding="lg">
            {/* Header skeleton */}
            <div className="flex items-center justify-between mb-6">
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700"></div>
                <div className="flex-1 flex justify-center">
                    <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded-lg w-48"></div>
                </div>
                <div className="w-10"></div>
            </div>

            {/* Stats skeleton */}
            <div className="mb-6">
                <div className="flex justify-between items-center mb-3">
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-32"></div>
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-12"></div>
                </div>
                <div className="w-full h-6 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
                <div className="flex items-center gap-4 mt-3">
                    <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-16"></div>
                    <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-16"></div>
                    <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-16"></div>
                </div>
            </div>

            {/* Button skeleton */}
            <div className="h-12 bg-slate-200 dark:bg-slate-700 rounded-2xl"></div>
        </Card>

        {/* Question list skeletons */}
        <div className="space-y-4">
            {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-700">
                        <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded-lg w-2/3 mb-2"></div>
                        <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-1/3"></div>
                    </div>
                    <div className="p-3 space-y-2">
                        {[1, 2].map((j) => (
                            <div key={j} className="bg-slate-50 dark:bg-slate-850 rounded-xl p-3 flex gap-3">
                                <div className="w-5 h-5 bg-slate-200 dark:bg-slate-700 rounded-full flex-shrink-0"></div>
                                <div className="flex-1">
                                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full mb-1"></div>
                                    <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-3/4"></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    </div>
);



