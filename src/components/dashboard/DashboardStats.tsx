import { useState } from 'react';
import { Card } from '../ui/Card';
import { CircularProgress } from '../ui/CircularProgress';
import { CheckCircle2, Flame, BookOpen, Target, X, ChevronRight, ChevronDown, BarChart2, PieChart } from 'lucide-react';
import { useApp } from '../../App';
import { useNavigate } from 'react-router-dom';

interface DashboardStatsProps {
    totalQuestions: number;
    correctAnswers: number;
    lessonsCompleted: number;
    totalLessons: number;
    streak?: number;
    variant?: 'default' | 'header';
    moduleStats?: {
        id: string;
        title: string;
        titleAR?: string;
        correctCount: number;
        totalQuestions: number;
        lessonsTotal?: number;
        lessonsCompleted?: number;
        lessonsProgressPercentage?: number;
    }[];
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({
    totalQuestions,
    correctAnswers,
    lessonsCompleted,
    totalLessons,
    streak = 0,
    variant = 'default',
    moduleStats = []
}) => {
    const { language } = useApp();
    const navigate = useNavigate();
    const [expanded, setExpanded] = useState<'readiness' | 'questions' | 'lessons' | null>(null);

    // Calculate overall progress based on correct answers vs total pool
    // We cap it at 100% just in case
    const progressPercentage = Math.min(100, Math.round((correctAnswers / totalQuestions) * 100)) || 0;

    const toggle = (id: 'readiness' | 'questions' | 'lessons') => {
        setExpanded(prev => prev === id ? null : id);
    };

    if (variant === 'header') {
        return (
            <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-white/10">
                <div className="flex flex-col gap-3 sm:gap-4">
                    {/* Main Progress Ring - Expandable */}
                    <div
                        className={`bg-white/10 rounded-2xl backdrop-blur-sm border border-white/10 overflow-hidden transition-all duration-300 ${expanded === 'readiness' ? 'bg-white/15 shadow-lg' : 'hover:bg-white/20 active:scale-[0.99]'}`}
                    >
                        <button
                            onClick={() => toggle('readiness')}
                            className="w-full flex items-center gap-3 sm:gap-4 p-3 text-left outline-none"
                        >
                            <div className="flex-shrink-0 relative">
                                <CircularProgress
                                    percentage={progressPercentage}
                                    size={48}
                                    strokeWidth={5}
                                    color="text-white"
                                    trackColor="text-white/20"
                                    showValue={false}
                                />
                            </div>
                            <div className="flex flex-col min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xl sm:text-2xl font-black text-white leading-none">
                                        {progressPercentage}%
                                    </span>
                                    <ChevronDown
                                        size={20}
                                        className={`text-white/40 transition-transform duration-300 ${expanded === 'readiness' ? 'rotate-180 text-white' : ''}`}
                                    />
                                </div>
                                <span className="text-[10px] font-bold text-white/70 uppercase tracking-wide flex items-center justify-between">
                                    <span>Prüfungsreife</span>
                                    {language === 'DE_AR' && <span className="text-[9px] opacity-60 font-medium ml-1">الاستعداد للامتحان</span>}
                                </span>
                            </div>
                        </button>

                        {/* Expanded Content */}
                        <div className={`overflow-hidden transition-all duration-500 ease-in-out ${expanded === 'readiness' ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
                            <div className="px-4 pb-4 pt-1 space-y-3">
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    {/* Questions block */}
                                    <div className="bg-black/20 rounded-xl p-3 border border-white/5 flex flex-col justify-between">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                                                <CheckCircle2 size={14} className="text-white" />
                                            </div>
                                            <span className="text-xl font-black text-white leading-none">{correctAnswers}</span>
                                        </div>
                                        <span className="text-[9px] font-bold text-white/60 uppercase leading-snug">
                                            Richtig beantwortet
                                        </span>
                                    </div>

                                    {/* Lessons block */}
                                    <div className="bg-black/20 rounded-xl p-3 border border-white/5 flex flex-col justify-between">
                                        <div className="flex items-center gap-2 mb-2">
                                             <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                                                <BookOpen size={14} className="text-white" />
                                            </div>
                                            <span className="text-xl font-black text-white leading-none">
                                                {lessonsCompleted}<span className="text-white/50 text-sm font-bold">/{totalLessons}</span>
                                            </span>
                                        </div>
                                        <span className="text-[9px] font-bold text-white/60 uppercase leading-snug">
                                            Lektionen abgeschlossen
                                        </span>
                                    </div>
                                </div>

                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigate('/statistics');
                                    }}
                                    className="w-full py-2.5 mt-2 bg-white text-slate-900 rounded-lg font-bold text-xs hover:bg-indigo-50 transition-colors shadow-sm flex items-center justify-center gap-2"
                                >
                                    <BarChart2 size={16} />
                                    Zur detaillierten Statistik
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="mb-6">
            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <Target size={20} className="text-primary" />
                <span>Dein Fortschritt</span>
                {language === 'DE_AR' && (
                    <span className="text-sm text-slate-500 dark:text-slate-400 font-bold ml-auto" dir="rtl">
                        تقدمك
                    </span>
                )}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Main Progress Ring Card */}
                <Card className="flex items-center justify-between p-6 bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900">
                    <div className="flex flex-col gap-1">
                        <span className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            Prüfungsreife
                        </span>
                        {language === 'DE_AR' && (
                            <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 -mt-1 mb-1 block">
                                الاستعداد للامتحان
                            </span>
                        )}
                        <span className="text-3xl font-black text-slate-900 dark:text-white">
                            {progressPercentage}%
                        </span>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-[140px] leading-relaxed">
                            Basierend auf deinen Antworten
                        </p>
                    </div>
                    <div className="flex-shrink-0">
                        <CircularProgress
                            percentage={progressPercentage}
                            size={100}
                            strokeWidth={8}
                            color="text-primary"
                            showValue={false}
                        />
                    </div>
                </Card>

                {/* Grid of smaller stats */}
                <div className="grid grid-cols-2 gap-4">
                    {/* Questions Stat */}
                    <Card className="flex flex-col justify-center p-4" padding="none">
                        <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mb-3">
                            <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" />
                        </div>
                        <span className="text-2xl font-black text-slate-900 dark:text-white leading-none mb-1">
                            {correctAnswers}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1">
                            <span>Richtige Fragen</span>
                            {language === 'DE_AR' && <span className="text-[9px] opacity-50 font-medium">إجابات صحيحة</span>}
                        </span>
                    </Card>

                    {/* Lessons Stat */}
                    <Card className="flex flex-col justify-center p-4" padding="none">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mb-3">
                            <BookOpen size={16} className="text-blue-600 dark:text-blue-400" />
                        </div>
                        <span className="text-2xl font-black text-slate-900 dark:text-white leading-none mb-1">
                            {lessonsCompleted} <span className="text-sm text-slate-400 font-bold">/ {totalLessons}</span>
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1">
                            <span>Lektionen</span>
                            {language === 'DE_AR' && <span className="text-[9px] opacity-50 font-medium">الدروس</span>}
                        </span>
                    </Card>

                    {/* Streak Stat - For now using dummy streak or hiding if not tracked, 
                        assuming we want to show it based on design request. 
                        If no real streak data, we can repurpose this or hardcode '1' for now. */}
                    <div className="col-span-2">
                        <Card className="flex items-center justify-between p-4 bg-orange-50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-900/20" padding="none">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                                    <Flame size={20} className="text-orange-500 dark:text-orange-400" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-black text-slate-900 dark:text-white">
                                            {streak > 0 ? streak : 1} Tage Streak
                                        </span>
                                    </div>
                                    <span className="text-xs font-bold text-orange-600 dark:text-orange-400">
                                        Bleib dran! 🔥
                                    </span>
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
};
