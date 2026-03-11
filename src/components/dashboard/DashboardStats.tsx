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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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
                        <div className={`overflow-hidden transition-all duration-300 ease-in-out ${expanded === 'readiness' ? 'max-h-60 opacity-100' : 'max-h-0 opacity-0'}`}>
                            <div className="px-4 pb-4 pt-1 space-y-3">
                                <p className="text-white/80 font-medium text-xs leading-relaxed bg-white/5 rounded-lg p-2 border border-white/5">
                                    Berechnet aus deinen richtig beantworteten Fragen.
                                </p>
                                <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-white/60 text-[10px] uppercase font-bold tracking-wider">Fortschritt</span>
                                        <span className="text-white font-bold text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-xs">{progressPercentage}%</span>
                                    </div>
                                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden p-[1px]">
                                        <div style={{ width: `${progressPercentage}%` }} className="h-full bg-gradient-to-r from-indigo-400 to-purple-400 rounded-full shadow-sm" />
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigate('/statistics');
                                    }}
                                    className="w-full py-2 mt-3 bg-white text-slate-900 rounded-lg font-bold text-xs hover:bg-indigo-50 transition-colors shadow-sm flex items-center justify-center gap-2"
                                >
                                    <BarChart2 size={14} />
                                    Zur Statistik
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Stats Grid - Expandable items */}
                    <div className="grid grid-cols-2 sm:grid-cols-1 sm:grid-rows-2 gap-3 sm:gap-4 items-stretch">
                        {/* Questions Card */}
                        <div
                            className={`bg-white/10 rounded-xl backdrop-blur-sm border border-white/10 overflow-hidden transition-all duration-300 w-full ${expanded === 'questions' ? 'bg-white/15 shadow-lg col-span-2 sm:col-span-1 z-10' : 'hover:bg-white/20 active:scale-[0.99]'}`}
                        >
                            <button
                                onClick={() => toggle('questions')}
                                className="w-full flex items-center gap-3 sm:gap-4 p-4 text-left outline-none"
                            >
                                <CheckCircle2 size={24} className={`flex-shrink-0 transition-colors ${expanded === 'questions' ? 'text-green-400' : 'text-white/80'}`} />
                                <div className="flex flex-col min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-1">
                                        <span className="text-lg sm:text-xl font-black text-white leading-none">
                                            {correctAnswers}
                                        </span>
                                        {expanded === 'questions' && <ChevronDown size={16} className="text-white animate-in fade-in zoom-in" />}
                                    </div>
                                    <span className="text-[8px] sm:text-xs font-bold text-white/60 uppercase leading-tight mt-0.5 flex items-center justify-between">
                                        <span>Richtig beantwortet</span>
                                        {language === 'DE_AR' && <span className="text-[8px] opacity-50 font-medium ml-1">إجابات صحيحة</span>}
                                    </span>
                                </div>
                            </button>

                            {/* Expanded Content */}
                            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${expanded === 'questions' ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'}`}>
                                <div className="px-4 pb-4 pt-1 space-y-3">
                                    {moduleStats.length > 0 ? (
                                        <div className="max-h-60 overflow-y-auto pr-1 space-y-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                                            {moduleStats.map(stat => (
                                                <div key={stat.id} className="bg-black/20 rounded-lg p-2 border border-white/5">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-white font-bold text-[10px] truncate max-w-[70%]">
                                                            {language === 'DE_AR' && stat.titleAR ? stat.titleAR : stat.title}
                                                        </span>
                                                        <span className="text-white/60 text-[10px] font-medium">
                                                            <span className="text-green-400 font-bold">{stat.correctCount}</span>
                                                            <span className="mx-0.5">/</span>
                                                            {stat.totalQuestions}
                                                        </span>
                                                    </div>
                                                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                        <div
                                                            style={{ width: `${Math.round((stat.correctCount / stat.totalQuestions) * 100)}%` }}
                                                            className="h-full bg-green-400 rounded-full opacity-80"
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-2 text-center">
                                            <div className="bg-black/20 rounded-lg p-2 border border-white/5">
                                                <span className="block text-lg font-black text-green-400 leading-none">{correctAnswers}</span>
                                                <span className="text-[8px] font-bold text-white/50 uppercase">Richtig</span>
                                            </div>
                                            <div className="bg-black/20 rounded-lg p-2 border border-white/5">
                                                <span className="block text-lg font-black text-white leading-none">{totalQuestions}</span>
                                                <span className="text-[8px] font-bold text-white/50 uppercase">Gesamt</span>
                                            </div>
                                        </div>
                                    )}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            navigate('/practice');
                                        }}
                                        className="w-full py-2 bg-white text-slate-900 rounded-lg font-bold text-xs hover:bg-indigo-50 transition-colors shadow-sm"
                                    >
                                        Jetzt Üben
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Lessons Card */}
                        <div
                            className={`bg-white/10 rounded-xl backdrop-blur-sm border border-white/10 overflow-hidden transition-all duration-300 w-full ${expanded === 'lessons' ? 'bg-white/15 shadow-lg col-span-2 sm:col-span-1 z-10' : 'hover:bg-white/20 active:scale-[0.99]'}`}
                        >
                            <button
                                onClick={() => toggle('lessons')}
                                className="w-full flex items-center gap-3 sm:gap-4 p-4 text-left outline-none"
                            >
                                <BookOpen size={24} className={`flex-shrink-0 transition-colors ${expanded === 'lessons' ? 'text-blue-400' : 'text-white/80'}`} />
                                <div className="flex flex-col min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-1">
                                        <span className="text-lg sm:text-xl font-black text-white leading-none">
                                            {lessonsCompleted}<span className="text-white/50">/{totalLessons}</span>
                                        </span>
                                        {expanded === 'lessons' && <ChevronDown size={16} className="text-white animate-in fade-in zoom-in" />}
                                    </div>
                                    <span className="text-[8px] sm:text-xs font-bold text-white/60 uppercase leading-tight mt-0.5 flex items-center justify-between">
                                        <span>Lektionen abgeschlossen</span>
                                        {language === 'DE_AR' && <span className="text-[8px] opacity-50 font-medium ml-1">دروس مكتملة</span>}
                                    </span>
                                </div>
                            </button>

                            {/* Expanded Content */}
                            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${expanded === 'lessons' ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'}`}>
                                <div className="px-4 pb-4 pt-1 space-y-3">
                                    {moduleStats.length > 0 ? (
                                        <div className="max-h-60 overflow-y-auto pr-1 space-y-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                                            {moduleStats.filter(m => (m.lessonsTotal || 0) > 0).map(stat => (
                                                <div key={stat.id} className="bg-black/20 rounded-lg p-2 border border-white/5">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-white font-bold text-[10px] truncate max-w-[70%]">
                                                            {language === 'DE_AR' && stat.titleAR ? stat.titleAR : stat.title}
                                                        </span>
                                                        <span className="text-white/60 text-[10px] font-medium">
                                                            <span className="text-blue-400 font-bold">{stat.lessonsCompleted || 0}</span>
                                                            <span className="mx-0.5">/</span>
                                                            {stat.lessonsTotal}
                                                        </span>
                                                    </div>
                                                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                        <div
                                                            style={{ width: `${stat.lessonsProgressPercentage || 0}%` }}
                                                            className="h-full bg-blue-400 rounded-full opacity-80"
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-white/80 font-bold text-[10px]">Fortschritt</span>
                                                <span className="text-white/50 text-[10px]">{Math.round((lessonsCompleted / totalLessons) * 100) || 0}%</span>
                                            </div>
                                            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                <div style={{ width: `${(lessonsCompleted / totalLessons) * 100}%` }} className="h-full bg-blue-400 rounded-full" />
                                            </div>
                                        </div>
                                    )}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            navigate('/learn');
                                        }}
                                        className="w-full py-2 bg-white text-slate-900 rounded-lg font-bold text-xs hover:bg-indigo-50 transition-colors shadow-sm"
                                    >
                                        Weiter Lernen
                                    </button>
                                </div>
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
