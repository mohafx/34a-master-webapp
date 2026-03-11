import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../App';
import { useDataCache } from '../../contexts/DataCacheContext';
import { useAuth } from '../../contexts/AuthContext';
import * as Icons from 'lucide-react';
import { Module } from '../../types';
import { PlayCircle, CheckCircle2, ArrowLeft, Lock, X, Languages, Crown } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { db } from '../../services/database';
import { supabase } from '../../lib/supabase';

const stripMarkdown = (text: string) => {
    return text
        .replace(/[#*`~]/g, '') // Remove basic markdown chars
        .replace(/\_{2,}/g, '') // Remove underscores used for bold/italic
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Keep link text, remove url
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .trim();
};

const HighlightMatch = ({ text, highlight }: { text: string, highlight: string }) => {
    if (!highlight.trim()) return <span>{stripMarkdown(text)}</span>;
    // Strip markdown from the full text first
    const cleanText = stripMarkdown(text);
    const parts = cleanText.split(new RegExp(`(${highlight})`, 'gi'));
    return (
        <span>
            {parts.map((part, i) =>
                part.toLowerCase() === highlight.toLowerCase()
                    ? <span key={i} className="bg-blue-100 dark:bg-blue-900/40 text-slate-900 dark:text-blue-100 font-bold rounded px-0.5">{part}</span>
                    : <span key={i}>{part}</span>
            )}
        </span>
    );
};

export default function ModuleList({ embedded = false }: { embedded?: boolean }) {
    const navigate = useNavigate();
    const { language, progress, user, showLanguageToggle, toggleLanguage, isPremium, openPaywall } = useApp();
    const { modules } = useDataCache();
    const { user: authUser } = useAuth();


    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'search' | 'stats' | null>(null);
    const [showLockedModal, setShowLockedModal] = useState(false);

    // Search state
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // Lesson completion state
    const [completedLessonIds, setCompletedLessonIds] = useState<string[]>([]);
    const [totalLessonsCountFromDB, setTotalLessonsCountFromDB] = useState(0);

    // Smart Sticky Button Logic
    const [showFloatingButton, setShowFloatingButton] = useState(false);
    const lastScrollY = React.useRef(0);
    const ticking = React.useRef(false);

    useEffect(() => {
        const handleScroll = (e: Event) => {
            if (embedded) return; // Don't show sticky button in embedded mode

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
    }, [embedded]);




    // Fetch completed lessons and total count
    useEffect(() => {
        const fetchStats = async () => {
            // 1. Fetch total count
            try {
                const { count } = await supabase.from('lessons').select('*', { count: 'exact', head: true });
                if (count !== null) setTotalLessonsCountFromDB(count);
            } catch (e) {
                console.error("Error fetching total count:", e);
            }

            // 2. Fetch completion
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
    }, []); // Only fetch once on mount

    // Search effect
    useEffect(() => {
        if (!searchQuery || searchQuery.length < 2) {
            setSearchResults([]);
            return;
        }

        const delayDebounce = setTimeout(async () => {
            setIsSearching(true);
            try {
                const results = await db.searchLessons(searchQuery);
                setSearchResults(results);
            } catch (err) {
                console.error(err);
            } finally {
                setIsSearching(false);
            }
        }, 500);

        return () => clearTimeout(delayDebounce);
    }, [searchQuery]);

    // Calculate progress for a given module based on answered questions
    // Check if module is locked (has no lessons)
    const isModuleLocked = (module: Module) => {
        return !module.lessons || module.lessons.length === 0;
    };

    // Calculate progress for a given module based on completed lessons
    const getModuleProgress = (module: Module) => {
        const moduleLessons = module.lessons || [];
        if (moduleLessons.length === 0) return 0;
        const completedCount = moduleLessons.filter(l => completedLessonIds.includes(l.id)).length;
        return (completedCount / moduleLessons.length) * 100;
    };

    // Handle module click
    const handleModuleClick = (module: Module, moduleIndex: number) => {
        if (isModuleLocked(module)) {
            setShowLockedModal(true);
            return;
        }

        // All modules are accessible - first lesson of each module is free
        // Premium check is done at the lesson level, not module level
        navigate(`/learn/${module.id}`);
    };

    // Calculate overall progress across all modules
    const getOverallProgress = () => {
        let totalLessons = 0;
        let totalCompleted = 0;
        for (const mod of modules) {
            const moduleLessons = mod.lessons || [];
            totalLessons += moduleLessons.length;
            totalCompleted += moduleLessons.filter(l => completedLessonIds.includes(l.id)).length;
        }

        const finalTotal = totalLessons === 0 ? totalLessonsCountFromDB : totalLessons;
        return finalTotal > 0 ? (totalCompleted / finalTotal) * 100 : 0;
    };

    // Calculate total completed lessons count for stats
    const getTotalCompletedLessons = () => {
        let total = 0;
        for (const mod of modules) {
            const moduleLessons = mod.lessons || [];
            total += moduleLessons.filter(l => completedLessonIds.includes(l.id)).length;
        }
        return total;
    };

    const overallProgress = getOverallProgress();
    const totalCompletedLessons = getTotalCompletedLessons();

    return (
        <div className={embedded ? '' : 'pt-3 px-3 pb-32 lg:px-0 lg:pt-0 lg:pb-8'}>
            {/* Floating Smart Back Button */}
            {!embedded && (
                <div
                    className={`fixed top-4 left-4 z-50 transition-all duration-300 transform ${showFloatingButton ? 'translate-y-0 opacity-100' : '-translate-y-16 opacity-0 pointer-events-none'}`}
                >
                    <button
                        onClick={() => navigate('/')}
                        className="w-12 h-12 rounded-full bg-white dark:bg-slate-800 shadow-lg border border-slate-100 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                        <ArrowLeft size={24} strokeWidth={2.5} />
                    </button>
                </div>
            )}
            {/* Unified Header & Controls Card */}
            {!embedded && (
                <Card className="mb-8 shadow-card border-none" padding="md">
                    {/* Integrated Header */}
                    <div className="flex flex-col">
                        <div className="flex items-center justify-between pt-2 pb-6">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => navigate('/')}
                                    className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-500 dark:text-slate-400"
                                >
                                    <ArrowLeft size={24} />
                                </button>
                                <div>
                                    <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-tight">
                                        Lernen
                                    </h2>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                                        Deine Lernreise
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
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
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2.5 pt-2">
                            <button
                                onClick={() => setActiveTab(activeTab === 'search' ? null : 'search')}
                                className={`flex-1 relative overflow-hidden py-3 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 group ${activeTab === 'search'
                                    ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                                    : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                                    }`}
                            >
                                <Icons.Search size={18} strokeWidth={2.5} />
                                <span className="font-bold text-sm">Suchen</span>
                            </button>

                            <button
                                onClick={() => setActiveTab(activeTab === 'stats' ? null : 'stats')}
                                className={`flex-1 relative overflow-hidden py-3 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 group ${activeTab === 'stats'
                                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                                    : 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30'
                                    }`}
                            >
                                <Icons.PieChart size={18} strokeWidth={2.5} />
                                <span className="font-bold text-sm">Fortschritt</span>
                            </button>
                        </div>
                    </div>
                </Card>
            )
            }

            {/* Expandable Content Area */}
            {
                !embedded && (
                    <div className={`transition-all duration-500 ease-in-out overflow-hidden ${activeTab ? 'mb-8 opacity-100' : 'h-0 opacity-0 mb-0'}`}>
                        <Card className="shadow-card border-none animate-in fade-in slide-in-from-top-4 duration-300" padding="lg">

                            {/* Search Content */}
                            {activeTab === 'search' && (
                                <div>
                                    <div className="relative mb-2">
                                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                                            <Icons.Search size={20} className="text-slate-400" />
                                        </div>
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Nach Themen suchen..."
                                            autoFocus
                                            className="w-full pl-12 pr-12 py-4 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-100 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-medium"
                                        />
                                        {searchQuery && (
                                            <button
                                                onClick={() => setSearchQuery('')}
                                                className="absolute inset-y-0 right-4 flex items-center"
                                            >
                                                <Icons.X size={20} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Stats Content */}
                            {activeTab === 'stats' && (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3.5">
                                        <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                            <Icons.PieChart size={20} strokeWidth={2.5} />
                                        </div>
                                        <div>
                                            <h3 className="font-black text-lg text-slate-900 dark:text-white leading-tight">Dein Gesamtfortschritt</h3>
                                            <p className="text-xs text-slate-500 font-medium">So weit bist du schon!</p>
                                            {language === 'DE_AR' && <p className="text-[10px] text-slate-400 text-left mt-0.5" dir="rtl">لقد وصلت إلى هنا!</p>}
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-2 font-bold uppercase tracking-wider">
                                            <span>{totalCompletedLessons} Lektionen abgeschlossen</span>
                                            <span>{Math.round(overallProgress)}%</span>
                                        </div>
                                        <div className="h-3.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden flex">
                                            <div
                                                className={`h-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(59,130,246,0.4)] ${overallProgress === 100 ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-primary'}`}
                                                style={{ width: `${overallProgress}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Show all statistics button */}
                                    <button
                                        onClick={() => navigate('/statistics')}
                                        className="w-full flex items-center justify-center gap-2 py-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 rounded-xl text-slate-600 dark:text-slate-300 text-xs font-bold transition-all active:scale-[0.98]"
                                    >
                                        <Icons.BarChart3 size={14} />
                                        <span>Alle Statistiken zeigen</span>
                                        {language === 'DE_AR' && <span className="text-[10px] opacity-70 ml-1" dir="rtl">(إظهار جميع الإحصائيات)</span>}
                                    </button>
                                </div>
                            )}
                        </Card>
                    </div>
                )
            }

            {/* App-Einführung removed as requested */}

            {/* Search Results or Module List */}
            {
                searchQuery ? (
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
                            {isSearching ? 'Suche...' : `Gefundene Lektionen (${searchResults.length})`}
                        </h3>

                        {!isSearching && searchResults.length === 0 && (
                            <div className="text-center p-8 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                                <Icons.Search className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                <p className="text-slate-500 font-medium">Keine Lektionen gefunden für "{searchQuery}"</p>
                            </div>
                        )}

                        {!isSearching && searchResults.map((lesson) => (
                            <button
                                key={lesson.id}
                                onClick={() => navigate(`/learn/${lesson.moduleId}/lesson/${lesson.id}`)}
                                className="w-full bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-between group active:scale-[0.98] transition-all text-left"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                        <Icons.BookOpen size={20} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors">
                                            {lesson.titleDE}
                                        </h4>
                                        {language === 'DE_AR' && lesson.titleAR && (
                                            <p className="text-xs text-slate-400 text-left mt-0.5" dir="rtl">{lesson.titleAR}</p>
                                        )}
                                        {lesson.snippet && (
                                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                                                <HighlightMatch text={lesson.snippet} highlight={searchQuery} />
                                            </p>
                                        )}
                                    </div>
                                    <Icons.ChevronRight size={20} className="text-slate-400" />
                                </div>
                            </button>
                        ))}
                    </div>
                ) : (
                    /* Module cards - compact horizontal list like /practice */
                    <Card className="divide-y divide-slate-100 dark:divide-slate-700/50 overflow-hidden shadow-card border-none" padding="none">
                        {modules.map((module, index) => {
                            // @ts-ignore
                            const IconComponent = Icons[module.icon] || Icons.HelpCircle;
                            const prog = getModuleProgress(module);

                            const titleDE = (module as any).title_de || module.titleDE;
                            const titleAR = (module as any).title_ar || module.titleAR;

                            const isCompleted = prog === 100;
                            const isLocked = isModuleLocked(module);
                            const stepNumber = index + 1;

                            return (
                                <button
                                    key={module.id}
                                    onClick={() => {
                                        const originalIndex = modules.findIndex(m => m.id === module.id);
                                        handleModuleClick(module, originalIndex);
                                    }}
                                    className="w-full text-left p-4 sm:p-5 flex items-center justify-between group hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                    <div className="flex items-center gap-3.5 flex-1">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all
                                            ${isCompleted
                                                ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                                                : isLocked
                                                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                                                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 group-hover:bg-blue-500/10 group-hover:text-blue-500/60 dark:group-hover:bg-blue-400/10 dark:group-hover:text-blue-400/60'
                                            }`}>
                                            {isCompleted ? (
                                                <CheckCircle2 size={24} strokeWidth={1.5} />
                                            ) : isLocked ? (
                                                <Lock size={24} strokeWidth={1.5} />
                                            ) : (
                                                <IconComponent size={24} strokeWidth={1.5} />
                                            )}
                                        </div>
                                        <div className="text-left flex-1 min-w-0 pr-4">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Modul {stepNumber}</span>
                                            <h4 className="font-bold text-slate-900 dark:text-white text-sm leading-tight">{titleDE}</h4>
                                            {language === 'DE_AR' && titleAR && (
                                                <p className="text-xs text-slate-500 dark:text-slate-400 text-left mt-0.5" dir="rtl">{titleAR}</p>
                                            )}
                                            <div className="mt-2">
                                                <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 mb-1 font-medium">
                                                    <span>Fortschritt</span>
                                                    <span className={isCompleted ? 'text-green-600' : ''}>{Math.round(prog)}%</span>
                                                </div>
                                                <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden w-full">
                                                    <div
                                                        className={`h-full transition-all duration-500 ${isCompleted ? 'bg-green-500' : 'bg-blue-500'}`}
                                                        style={{ width: `${prog}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 group-hover:text-blue-500/70 group-hover:bg-blue-500/10 dark:group-hover:text-blue-400/70 dark:group-hover:bg-blue-400/10 transition-all flex-shrink-0">
                                        <Icons.ChevronRight size={20} strokeWidth={2.5} />
                                    </div>
                                </button>
                            );
                        })}
                    </Card>
                )
            }

            {/* Locked Module Modal */}
            {
                showLockedModal && (
                    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                        <Card className="max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
                            <div className="flex items-center justify-center mb-4">
                                <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
                                    <Lock className="text-slate-600 dark:text-slate-400" size={40} strokeWidth={2} />
                                </div>
                            </div>
                            <h3 className="font-black text-xl text-slate-900 dark:text-white mb-3 text-center">
                                Bald verfügbar
                            </h3>
                            <p className="text-slate-600 dark:text-slate-400 text-center leading-relaxed mb-6">
                                Dieses Modul wird gerade für dich vorbereitet und ist bald verfügbar. Schaue regelmäßig vorbei!
                            </p>
                            {language === 'DE_AR' && (
                                <p className="text-sm text-slate-500 dark:text-slate-500 text-center mb-6 leading-relaxed" dir="rtl">
                                    يتم حالياً تحضير هذه الوحدة من أجلك وستكون متاحة قريباً. تفقد التطبيق بانتظام!
                                </p>
                            )}
                            <Button
                                fullWidth
                                variant="primary"
                                onClick={() => setShowLockedModal(false)}
                                className="font-bold"
                            >
                                Alles klar!
                            </Button>
                        </Card>
                    </div>
                )
            }
        </div >
    );
}