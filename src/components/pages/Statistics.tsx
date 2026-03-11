import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../App';
import { useDataCache } from '../../contexts/DataCacheContext';
import { ArrowLeft, BarChart3, TrendingUp, CheckCircle2, XCircle, BookOpen, Languages, Calendar, UserPlus, ChevronLeft, ChevronRight, RotateCw, ChevronDown } from 'lucide-react';
import { Card } from '../ui/Card';
import { db } from '../../services/database';
import { supabase } from '../../lib/supabase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useAuth } from '../../contexts/AuthContext';

// Type for daily activity data
interface DailyActivity {
    date: string;
    lessons: number;
    questions: number;
}

// Helper to get start/end date of a week
const getWeekRange = (data: DailyActivity[]) => {
    if (data.length === 0) return "";
    const start = new Date(data[0].date);
    const end = new Date(data[data.length - 1].date);
    const format = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.`;
    return `${format(start)} - ${format(end)}`;
};

export default function Statistics() {
    const navigate = useNavigate();
    const { language, progress, toggleLanguage, showLanguageToggle, openAuthDialog } = useApp();
    const { modules, questions } = useDataCache();
    const { user: authUser } = useAuth();
    const [completedLessonIds, setCompletedLessonIds] = useState<string[]>([]);
    const [totalLessonsCountFromDB, setTotalLessonsCountFromDB] = useState(0);
    const [dailyActivity, setDailyActivity] = useState<DailyActivity[]>([]);
    const [isLoadingActivity, setIsLoadingActivity] = useState(true);
    const [weekIndex, setWeekIndex] = useState(0); // 0 = first week (oldest)
    const [detailsExpanded, setDetailsExpanded] = useState(false);
    const [lessonsExpanded, setLessonsExpanded] = useState(false);

    const isLoggedIn = !!authUser;

    // Fetch total lessons count and completed lessons
    useEffect(() => {
        const fetchStats = async () => {
            // 1. Fetch total lessons count
            try {
                const { count } = await supabase.from('lessons').select('*', { count: 'exact', head: true });
                if (count !== null) setTotalLessonsCountFromDB(count);
            } catch (e) {
                console.error("Error fetching total lessons count:", e);
            }

            // 2. Fetch completed lessons
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                try {
                    const completed = await db.getCompletedLessons(user.id);
                    setCompletedLessonIds(completed);
                } catch (e) {
                    console.error("Error fetching completed lessons:", e);
                }
            } else {
                // Guest - use localStorage
                const completed = JSON.parse(localStorage.getItem('guest_completed_lessons') || '[]');
                setCompletedLessonIds(completed);
            }
        };
        fetchStats();
    }, []);

    // Fetch daily activity for charts (registered users only)
    useEffect(() => {
        if (!authUser) {
            setIsLoadingActivity(false);
            return;
        }

        const fetchActivity = async () => {
            setIsLoadingActivity(true);
            try {
                const data = await db.getFullActivityHistory(authUser.id);
                setDailyActivity(data);
                // Start at the last week (most recent)
                if (data.length > 0) {
                    const totalWeeks = Math.ceil(data.length / 7);
                    setWeekIndex(totalWeeks - 1);
                }
            } catch (e) {
                console.error("Error fetching activity history:", e);
            } finally {
                setIsLoadingActivity(false);
            }
        };
        fetchActivity();
    }, [authUser]);

    // Flashcard State
    const [allFlashcards, setAllFlashcards] = useState<{ id: string, module_id: string }[]>([]);
    const [flashcardProgress, setFlashcardProgress] = useState<Record<string, boolean>>({});
    const [flashcardsExpanded, setFlashcardsExpanded] = useState(false);

    // Fetch flashcards and progress
    useEffect(() => {
        const fetchFlashcards = async () => {
            // 1. Fetch all flashcards (just IDs and Module IDs needed for stats)
            const { data: cards } = await supabase.from('flashcards').select('id, module_id');
            if (cards) setAllFlashcards(cards);

            // 2. Fetch User Progress
            if (authUser) {
                const { data: progress } = await supabase.from('user_flashcard_progress').select('flashcard_id, known');
                if (progress) {
                    const map: Record<string, boolean> = {};
                    progress.forEach((p: any) => map[p.flashcard_id] = p.known);
                    setFlashcardProgress(map);
                }
            } else {
                // Should we support guest flashcard stats? Probably yes via local storage if we implement guest logic there. 
                // For now, only DB users.
            }
        };
        fetchFlashcards();
    }, [authUser]);

    // Calculate overall statistics
    const stats = useMemo(() => {
        const totalQuestions = questions.length;

        // Create a Set of valid question IDs for fast lookup
        const validQuestionIds = new Set(questions.map(q => q.id));

        // Filter answered questions to only include those in current dataset
        const validAnsweredEntries = Object.entries(progress.answeredQuestions)
            .filter(([id]) => validQuestionIds.has(id));

        const answeredQuestions = validAnsweredEntries.length;
        const correctAnswers = validAnsweredEntries.filter(([_, isCorrect]) => isCorrect === true).length;
        const wrongAnswers = answeredQuestions - correctAnswers;

        // Calculate lesson stats
        let totalLessonsCount = 0;
        let completedLessonsCount = 0;

        for (const mod of modules) {
            const moduleLessons = mod.lessons || [];
            totalLessonsCount += moduleLessons.length;
            completedLessonsCount += moduleLessons.filter(l => completedLessonIds.includes(l.id)).length;
        }

        // Use totalLessonsCountFromDB if modules don't have lessons populated
        const finalTotalLessonsCount = totalLessonsCount === 0 ? totalLessonsCountFromDB : totalLessonsCount;

        // Flashcard Stats
        const totalFlashcards = allFlashcards.length;
        const correctFlashcards = allFlashcards.filter(f => flashcardProgress[f.id] === true).length;
        const flashcardProgressPercent = totalFlashcards > 0 ? Math.round((correctFlashcards / totalFlashcards) * 100) : 0;

        return {
            totalQuestions,
            answeredQuestions,
            correctAnswers,
            wrongAnswers,
            totalLessons: finalTotalLessonsCount,
            completedLessons: completedLessonsCount,
            totalFlashcards,
            correctFlashcards,
            flashcardProgressPercent,
            practiceProgress: totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0,
            learnProgress: finalTotalLessonsCount > 0 ? Math.round((completedLessonsCount / finalTotalLessonsCount) * 100) : 0,
        };
    }, [questions, progress, modules, completedLessonIds, totalLessonsCountFromDB, allFlashcards, flashcardProgress]);

    // Calculate per-module statistics
    const moduleStats = useMemo(() => {
        return modules.map(module => {
            const moduleQuestions = questions.filter(q => q.moduleId === module.id);
            const totalQuestions = moduleQuestions.length;

            let correctCount = 0;
            let answeredCount = 0;

            moduleQuestions.forEach(q => {
                if (progress.answeredQuestions.hasOwnProperty(q.id)) {
                    answeredCount++;
                    if (progress.answeredQuestions[q.id]) {
                        correctCount++;
                    }
                }
            });

            // Flashcard stats
            const moduleFlashcards = allFlashcards.filter(f => f.module_id === module.id);
            const totalFlashcards = moduleFlashcards.length;
            const correctFlashcards = moduleFlashcards.filter(f => flashcardProgress[f.id] === true).length;
            const wrongFlashcards = moduleFlashcards.filter(f => flashcardProgress[f.id] === false).length;

            return {
                id: module.id,
                titleDE: module.titleDE,
                titleAR: module.titleAR,
                totalQuestions,
                correctCount,
                answeredCount,
                wrongCount: answeredCount - correctCount,
                practiceProgress: totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0,
                // Lesson stats
                totalLessons: module.lessons ? module.lessons.length : 0,
                completedLessons: module.lessons ? module.lessons.filter(l => completedLessonIds.includes(l.id)).length : 0,
                learnProgress: (module.lessons && module.lessons.length > 0)
                    ? Math.round((module.lessons.filter(l => completedLessonIds.includes(l.id)).length / module.lessons.length) * 100)
                    : 0,
                // Flashcard stats
                totalFlashcards,
                correctFlashcards,
                wrongFlashcards,
                flashcardProgress: totalFlashcards > 0 ? Math.round((correctFlashcards / totalFlashcards) * 100) : 0,
            };
        }).filter(m => m.totalQuestions > 0 || m.totalLessons > 0 || m.totalFlashcards > 0);
    }, [modules, questions, progress.answeredQuestions, completedLessonIds, allFlashcards, flashcardProgress]);

    // Format date for chart display
    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return `${d.getDate()}.${d.getMonth() + 1}`;
    };

    // Calculate weeks and current week data
    const totalWeeks = Math.ceil(dailyActivity.length / 7);
    const currentWeekData = useMemo(() => {
        const startIdx = weekIndex * 7;
        // Ensure we always have 7 days for the chart, filling with empty if needed for the last week
        const weekData = dailyActivity.slice(startIdx, startIdx + 7);
        return weekData;
    }, [dailyActivity, weekIndex]);

    // Jump to current week (today)
    const goToCurrentWeek = () => {
        if (totalWeeks > 0) setWeekIndex(totalWeeks - 1);
    };

    // Calculate stats for current week
    const weekStats = useMemo(() => {
        let totalLessons = 0;
        let totalQuestions = 0;
        currentWeekData.forEach(day => {
            totalLessons += day.lessons;
            totalQuestions += day.questions;
        });
        return { totalLessons, totalQuestions };
    }, [currentWeekData]);

    // Calculate cumulative totals for display (entire history)
    const cumulativeStats = useMemo(() => {
        let totalLessons = 0;
        let totalQuestions = 0;
        dailyActivity.forEach(day => {
            totalLessons += day.lessons;
            totalQuestions += day.questions;
        });
        return { totalLessons, totalQuestions };
    }, [dailyActivity]);

    // Navigation handlers
    const canGoPrev = weekIndex > 0;
    const canGoNext = weekIndex < totalWeeks - 1;
    const goToPrevWeek = () => setWeekIndex(prev => Math.max(0, prev - 1));
    const goToNextWeek = () => setWeekIndex(prev => Math.min(totalWeeks - 1, prev + 1));

    const weekRange = useMemo(() => getWeekRange(currentWeekData), [currentWeekData]);

    const isCurrentWeek = weekIndex === totalWeeks - 1;


    const [showFloatingButton, setShowFloatingButton] = useState(false);
    const lastScrollY = React.useRef(0);
    const ticking = React.useRef(false);

    useEffect(() => {
        const handleScroll = (e: Event) => {
            const target = e.target as HTMLElement;
            if (!ticking.current) {
                window.requestAnimationFrame(() => {
                    const currentScrollY = target.scrollTop || window.scrollY;

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

        window.addEventListener('scroll', handleScroll, { capture: true });
        return () => window.removeEventListener('scroll', handleScroll, { capture: true });
    }, []);

    return (
        <div className="pt-4 px-4 pb-32 lg:px-0 lg:pt-0 lg:pb-8">
            {/* Sticky Back Button */}
            <button
                onClick={() => navigate('/')}
                className={`fixed top-4 left-4 z-50 w-14 h-14 bg-white dark:bg-slate-800 rounded-full shadow-lg border border-slate-100 dark:border-slate-700 flex items-center justify-center text-slate-900 dark:text-white transition-all duration-300 ${showFloatingButton
                    ? 'translate-y-0 opacity-100'
                    : '-translate-y-20 opacity-0 pointer-events-none'
                    }`}
            >
                <ArrowLeft size={28} strokeWidth={2.5} />
            </button>

            {/* Header Card */}
            <Card className="mb-6 shadow-card border-none" padding="lg">
                <div className="flex flex-col gap-6">
                    {/* Header Row */}
                    <div className="grid grid-cols-[56px_1fr_56px] items-center">
                        <button
                            onClick={() => navigate('/')}
                            className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95 shadow-sm"
                        >
                            <ArrowLeft size={28} strokeWidth={2.5} />
                        </button>

                        <div className="flex items-center justify-center gap-2">
                            <BarChart3 size={24} className="text-slate-900 dark:text-white" strokeWidth={2.5} />
                            <h1 className="text-xl font-black text-slate-900 dark:text-white">Statistik</h1>
                        </div>

                        {showLanguageToggle ? (
                            <button
                                onClick={toggleLanguage}
                                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95 ${language === 'DE_AR'
                                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                                    }`}
                            >
                                <Languages size={24} strokeWidth={2} />
                            </button>
                        ) : (
                            <div className="w-12" />
                        )}
                    </div>

                    {/* Subtitle Section */}
                    <div className="text-center">
                        <p className="text-slate-600 dark:text-slate-400 text-lg leading-relaxed font-medium">
                            Dein Lernfortschritt auf einen Blick
                        </p>
                        {language === 'DE_AR' && (
                            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1 font-bold" dir="rtl">
                                تقدمك في التعلم بنظرة واحدة
                            </p>
                        )}
                    </div>
                </div>
            </Card>

            {/* Daily Activity Chart - Registered Users Only */}
            {isLoggedIn ? (
                <Card className="mb-6" padding="lg">
                    <div className="mb-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400">
                                <Calendar size={20} />
                            </div>
                            <div>
                                <h3 className="font-black text-lg text-slate-900 dark:text-white leading-tight">Tägliche Aktivität</h3>
                                <p className="text-xs text-slate-500 font-bold mt-0.5">{weekRange}</p>
                            </div>
                        </div>
                    </div>

                    {isLoadingActivity ? (
                        <div className="h-[200px] flex items-center justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        </div>
                    ) : dailyActivity.length > 0 ? (
                        <>
                            {/* Summary Text + Navigation */}
                            <div className="flex flex-col sm:flex-row justify-between items-end gap-4 mb-4">
                                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-lg">
                                    Du hast in diesem Zeitraum <span className="font-bold text-blue-600 dark:text-blue-400">{weekStats.totalQuestions} Fragen</span> beantwortet und <span className="font-bold text-emerald-600 dark:text-emerald-400">{weekStats.totalLessons} Lektionen</span> abgeschlossen.
                                </p>

                                {/* Week Navigation - Now above chart */}
                                <div className="flex items-center gap-2">
                                    {!isCurrentWeek && (
                                        <button
                                            onClick={goToCurrentWeek}
                                            className="px-3 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors mr-1"
                                        >
                                            Heute
                                        </button>
                                    )}
                                    <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/50 p-1 rounded-lg">
                                        <button
                                            onClick={goToPrevWeek}
                                            disabled={!canGoPrev}
                                            className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${canGoPrev ? 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-600' : 'opacity-30 cursor-not-allowed text-slate-400'}`}
                                        >
                                            <ChevronLeft size={16} />
                                        </button>
                                        <button
                                            onClick={goToNextWeek}
                                            disabled={!canGoNext}
                                            className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${canGoNext ? 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-600' : 'opacity-30 cursor-not-allowed text-slate-400'}`}
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Chart */}
                            <div className="h-[200px] w-full mb-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={currentWeekData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }} barGap={2}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                        <XAxis
                                            dataKey="date"
                                            tickFormatter={formatDate}
                                            tick={{ fontSize: 10, fill: '#94a3b8' }}
                                            axisLine={false}
                                            tickLine={false}
                                            dy={10}
                                        />
                                        <YAxis
                                            tick={{ fontSize: 10, fill: '#94a3b8' }}
                                            allowDecimals={false}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(241, 245, 249, 0.4)' }}
                                            contentStyle={{ backgroundColor: '#1e293b', borderRadius: '8px', border: 'none', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            labelStyle={{ color: '#94a3b8', marginBottom: '0.25rem' }}
                                            itemStyle={{ color: '#f1f5f9', padding: 0 }}
                                            formatter={(value: number) => [value, '']}
                                            labelFormatter={(label) => formatDate(label)}
                                        />
                                        <Bar dataKey="questions" name="Fragen" radius={[4, 4, 0, 0]} maxBarSize={40}>
                                            {currentWeekData.map((entry, index) => (
                                                <Cell key={`cell-q-${index}`} fill="#3b82f6" fillOpacity={0.8} />
                                            ))}
                                        </Bar>
                                        <Bar dataKey="lessons" name="Lektionen" radius={[4, 4, 0, 0]} maxBarSize={40}>
                                            {currentWeekData.map((entry, index) => (
                                                <Cell key={`cell-l-${index}`} fill="#10b981" fillOpacity={0.8} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Legend + Total Summary */}
                            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 mt-2 border-t border-slate-100 dark:border-slate-800">
                                <div className="flex gap-4">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                        <span className="text-[10px] uppercase font-bold text-slate-500">Fragen</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                        <span className="text-[10px] uppercase font-bold text-slate-500">Lektionen</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-0.5">Gesamt</p>
                                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                        <span className="font-bold text-slate-900 dark:text-white">{cumulativeStats.totalQuestions}</span> Fragen &bull; <span className="font-bold text-slate-900 dark:text-white">{cumulativeStats.totalLessons}</span> Lektionen
                                    </p>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-8 text-slate-400">
                            <TrendingUp size={40} className="mx-auto mb-2 opacity-50" />
                            <p className="text-sm font-medium">Noch keine Aktivität</p>
                            <p className="text-xs">Beginne zu lernen, um hier deine Statistiken zu sehen!</p>
                        </div>
                    )}
                </Card>
            ) : (
                /* CTA for guests to register */
                <Card className="mb-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800/50 border-blue-100 dark:border-slate-700" padding="lg">
                    <div className="text-center py-4">
                        <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-600 dark:text-blue-400">
                            <UserPlus size={28} />
                        </div>
                        <h3 className="font-black text-lg text-slate-900 dark:text-white mb-2">Detaillierte Statistiken freischalten</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                            Registriere dich, um deine tägliche Lernaktivität zu verfolgen und Diagramme zu sehen.
                        </p>
                        <button
                            onClick={() => openAuthDialog()}
                            className="px-6 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-hover transition-all active:scale-95"
                        >
                            Jetzt registrieren
                        </button>
                    </div>
                </Card>
            )
            }

            {/* Progress Bars */}
            <Card className="mb-8" padding="lg">
                <h3 className="font-black text-lg text-slate-900 dark:text-white mb-4">Gesamtfortschritt</h3>

                <div className="space-y-4">
                    <div>
                        <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400 mb-2 font-medium">
                            <span>Übungsfragen</span>
                            <span>{stats.correctAnswers} / {stats.totalQuestions} richtig</span>
                        </div>
                        <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-primary transition-all duration-500 rounded-full"
                                style={{ width: `${stats.practiceProgress}%` }}
                            />
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400 mb-2 font-medium">
                            <span>Lektionen</span>
                            <span>{stats.completedLessons} / {stats.totalLessons} abgeschlossen</span>
                        </div>
                        <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-secondary transition-all duration-500 rounded-full"
                                style={{ width: `${stats.learnProgress}%` }}
                            />
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400 mb-2 font-medium">
                            <span>Lernkarten</span>
                            <span>{stats.correctFlashcards} / {stats.totalFlashcards} richtig</span>
                        </div>
                        <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-purple-500 transition-all duration-500 rounded-full"
                                style={{ width: `${stats.flashcardProgressPercent}%` }}
                            />
                        </div>
                    </div>
                </div>
            </Card>

            {/* Per-Module Statistics (Collapsible) */}
            <button
                onClick={() => setDetailsExpanded(!detailsExpanded)}
                className="w-full flex items-center justify-between group cursor-pointer mb-4"
            >
                <h3 className="font-black text-lg text-slate-900 dark:text-white group-hover:text-primary transition-colors">Übungsfragen Fortschritt</h3>
                <div className={`p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-500 group-hover:text-primary group-hover:bg-primary/10 transition-all ${detailsExpanded ? 'rotate-180' : ''}`}>
                    <ChevronDown size={20} />
                </div>
            </button>

            {detailsExpanded && (
                <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 animate-slideDown">
                    {moduleStats
                        .filter(module => module.titleDE !== 'Einführung und Grundlagen')
                        .map(module => (
                            <Card key={module.id} padding="md">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                                            {module.titleDE}
                                        </h4>
                                        {language === 'DE_AR' && module.titleAR && (
                                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate text-left mt-0.5" dir="rtl">
                                                {module.titleAR}
                                            </p>
                                        )}
                                    </div>
                                    <div className="ml-4 flex items-center gap-3">
                                        <span className="text-sm font-bold text-slate-600 dark:text-slate-300">
                                            {module.correctCount}/{module.totalQuestions}
                                        </span>
                                        <span className={`text-xs font-black px-2 py-1 rounded-full ${module.practiceProgress >= 80
                                            ? 'bg-success/10 text-success'
                                            : module.practiceProgress >= 50
                                                ? 'bg-warning/10 text-warning'
                                                : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                                            }`}>
                                            {module.practiceProgress}%
                                        </span>
                                    </div>
                                </div>

                                <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden flex">
                                    <div
                                        className="h-full bg-success transition-all duration-500"
                                        style={{ width: `${(module.correctCount / module.totalQuestions) * 100}%` }}
                                    />
                                    <div
                                        className="h-full bg-error transition-all duration-500"
                                        style={{ width: `${(module.wrongCount / module.totalQuestions) * 100}%` }}
                                    />
                                </div>
                            </Card>
                        ))}
                </div>
            )}

            {/* Lessons Progress Section (Collapsible) */}
            <button
                onClick={() => setLessonsExpanded(!lessonsExpanded)}
                className="w-full flex items-center justify-between group cursor-pointer mb-4 mt-8"
            >
                <h3 className="font-black text-lg text-slate-900 dark:text-white group-hover:text-primary transition-colors">Lektionen Fortschritt</h3>
                <div className={`p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-500 group-hover:text-primary group-hover:bg-primary/10 transition-all ${lessonsExpanded ? 'rotate-180' : ''}`}>
                    <ChevronDown size={20} />
                </div>
            </button>

            {lessonsExpanded && (
                <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 animate-slideDown">
                    {moduleStats
                        .map(module => (
                            <Card key={module.id} padding="md">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                                            {module.titleDE}
                                        </h4>
                                        {language === 'DE_AR' && module.titleAR && (
                                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate text-left mt-0.5" dir="rtl">
                                                {module.titleAR}
                                            </p>
                                        )}
                                    </div>
                                    <div className="ml-4 flex items-center gap-3">
                                        <span className="text-sm font-bold text-slate-600 dark:text-slate-300">
                                            {module.completedLessons}/{module.totalLessons}
                                        </span>
                                        <span className={`text-xs font-black px-2 py-1 rounded-full ${module.learnProgress >= 80
                                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                            : module.learnProgress >= 50
                                                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-500 dark:text-blue-400'
                                                : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                                            }`}>
                                            {module.learnProgress}%
                                        </span>
                                    </div>
                                </div>

                                <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-secondary transition-all duration-500 rounded-full"
                                        style={{ width: `${module.learnProgress}%` }}
                                    />
                                </div>
                            </Card>
                        ))}
                </div>
            )}
            {/* Flashcards Progress Section (Collapsible) */}
            <button
                onClick={() => setFlashcardsExpanded(!flashcardsExpanded)}
                className="w-full flex items-center justify-between group cursor-pointer mb-4 mt-8"
            >
                <h3 className="font-black text-lg text-slate-900 dark:text-white group-hover:text-primary transition-colors">Mündliche Prüfung Fortschritt</h3>
                <div className={`p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-500 group-hover:text-primary group-hover:bg-primary/10 transition-all ${flashcardsExpanded ? 'rotate-180' : ''}`}>
                    <ChevronDown size={20} />
                </div>
            </button>

            {flashcardsExpanded && (
                <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 animate-slideDown">
                    {moduleStats.map(module => (
                        <Card key={module.id} padding="md">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                                        {module.titleDE}
                                    </h4>
                                    {language === 'DE_AR' && module.titleAR && (
                                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate text-left mt-0.5" dir="rtl">
                                            {module.titleAR}
                                        </p>
                                    )}
                                </div>
                                <div className="ml-4 flex items-center gap-3">
                                    <span className="text-sm font-bold text-slate-600 dark:text-slate-300">
                                        {module.correctFlashcards}/{module.totalFlashcards}
                                    </span>
                                    <span className={`text-xs font-black px-2 py-1 rounded-full ${module.flashcardProgress >= 80
                                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                                        : module.flashcardProgress >= 50
                                            ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-500 dark:text-purple-400'
                                            : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                                        }`}>
                                        {module.flashcardProgress}%
                                    </span>
                                </div>
                            </div>

                            <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden flex">
                                <div
                                    className="h-full bg-purple-500 transition-all duration-500"
                                    style={{ width: `${(module.correctFlashcards / module.totalFlashcards) * 100}%` }}
                                />
                                <div
                                    className="h-full bg-red-400 transition-all duration-500"
                                    style={{ width: `${(module.wrongFlashcards / module.totalFlashcards) * 100}%` }}
                                />
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div >
    );
}
