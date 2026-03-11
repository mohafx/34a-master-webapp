import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { HelpCircle, ArrowLeft, Play, Search, Bookmark, X, Circle, CheckCircle, XCircle, Lock } from 'lucide-react';
import { useApp } from '../../App';
import { useDataCache } from '../../contexts/DataCacheContext';
import { Card } from '../ui/Card';
import { supabase } from '../../lib/supabase';
import * as Icons from 'lucide-react';
import { abbreviateModuleTitle } from '../../utils/moduleUtils';

export default function FlashcardSelection() {
    const navigate = useNavigate();
    const { language, showLanguageToggle, toggleLanguage, progress, isPremium, openPaywall } = useApp();
    const { modules: cachedModules, loading: cacheLoading } = useDataCache();
    const [stats, setStats] = useState<Record<string, { total: number, known: number, unknown: number }>>({});
    const [statsLoading, setStatsLoading] = useState(true);

    // Fetch Flashcard Stats
    useEffect(() => {
        const fetchStats = async () => {
            try {
                // Fetch all flashcards with their module_id
                const { data: flashcardsData } = await supabase
                    .from('flashcards')
                    .select('id, module_id');

                const totals: Record<string, number> = {};
                flashcardsData?.forEach(f => {
                    totals[f.module_id] = (totals[f.module_id] || 0) + 1;
                });

                // Use progress from context (works for both logged-in and guest users)
                const known: Record<string, number> = {};
                const unknown: Record<string, number> = {};

                flashcardsData?.forEach(f => {
                    const flashcardStatus = progress.flashcardProgress[f.id];
                    if (flashcardStatus !== undefined) {
                        if (flashcardStatus === true) {
                            known[f.module_id] = (known[f.module_id] || 0) + 1;
                        } else {
                            unknown[f.module_id] = (unknown[f.module_id] || 0) + 1;
                        }
                    }
                });

                const newStats: Record<string, { total: number, known: number, unknown: number }> = {};
                Object.keys(totals).forEach(mid => {
                    newStats[mid] = {
                        total: totals[mid],
                        known: known[mid] || 0,
                        unknown: unknown[mid] || 0
                    };
                });
                setStats(newStats);
            } catch (err) {
                console.error('Error fetching flashcard stats:', err);
            } finally {
                setStatsLoading(false);
            }
        };

        fetchStats();
    }, [progress.flashcardProgress]);

    // Calculate total flashcard stats
    const totalFlashcardStats = useMemo(() => {
        const total = Object.values(stats).reduce((acc, s) => acc + s.total, 0);
        const known = Object.values(stats).reduce((acc, s) => acc + s.known, 0);
        const unknown = Object.values(stats).reduce((acc, s) => acc + s.unknown, 0);
        return { total, known, unknown };
    }, [stats]);

    // Search State
    const [activeTab, setActiveTab] = useState<'search' | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);

    // Search Effect
    useEffect(() => {
        const delaySearch = setTimeout(async () => {
            if (searchQuery.trim().length > 2) {
                setSearching(true);
                try {
                    // Search in both German and Arabic questions/answers
                    const { data, error } = await supabase
                        .from('flashcards')
                        .select('*')
                        .or(`question_de.ilike.%${searchQuery}%,answer_de.ilike.%${searchQuery}%`) // Simplified search for now
                        .limit(20);

                    if (data) setSearchResults(data);
                } catch (err) {
                    console.error('Search error:', err);
                } finally {
                    setSearching(false);
                }
            } else {
                setSearchResults([]);
            }
        }, 300); // Debounce

        return () => clearTimeout(delaySearch);
    }, [searchQuery]);


    // Module Item Skeleton
    const ModuleItemSkeleton = () => (
        <div className="w-full p-4 sm:p-5 flex items-center justify-between animate-pulse">
            <div className="flex items-center gap-3.5 flex-1">
                <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex-shrink-0"></div>
                <div className="flex-1 min-w-0 pr-4">
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-2"></div>
                    <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-1/4 mb-3"></div>
                    <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full w-full"></div>
                </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800"></div>
        </div>
    );

    const modules = cachedModules.filter((m) => m.titleDE !== 'Einführung und Grundlagen');

    return (
        <div className="pt-4 px-4 pb-32 lg:px-0 lg:pt-0 lg:pb-8">
            <Card className="mb-8 shadow-card border-none" padding="md">
                {/* Unified Header Style */}
                <div className="flex flex-col">
                    {/* Top Row: Back, Title, Language */}
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
                                    Lernkarten
                                </h2>
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
                                <Icons.Languages size={20} />
                            </button>
                        )}
                    </div>

                    {/* Divider */}
                    <div className="h-px bg-slate-100 dark:bg-slate-800 w-full" />

                    {/* Bottom Row: Progress & Stats */}
                    <div className="flex items-center justify-between">
                        <div className="flex-1 mr-6">
                            <div className="flex justify-between items-center mb-1.5">
                                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                                    Gesamtfortschritt
                                </span>
                                <span className="text-[11px] font-black text-slate-900 dark:text-white">
                                    {totalFlashcardStats.known} <span className="text-slate-400 font-normal">/ {totalFlashcardStats.total}</span>
                                </span>
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden flex">
                                <div
                                    className="h-full bg-emerald-500 transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                                    style={{ width: `${totalFlashcardStats.total > 0 ? (totalFlashcardStats.known / totalFlashcardStats.total) * 100 : 0}%` }}
                                ></div>
                                <div
                                    className="h-full bg-red-500 transition-all duration-1000 ease-out"
                                    style={{ width: `${totalFlashcardStats.total > 0 ? (totalFlashcardStats.unknown / totalFlashcardStats.total) * 100 : 0}%` }}
                                ></div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="flex flex-col items-end">
                                <div className="flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">{totalFlashcardStats.known} Richtig</span>
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">{totalFlashcardStats.unknown} Falsch</span>
                                </div>
                            </div>
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
                            <Search size={18} strokeWidth={2.5} />
                            <span className="font-bold text-sm">Suchen</span>
                        </button>

                        <button
                            onClick={() => navigate('/bookmarks')}
                            className={`flex-1 relative overflow-hidden py-3 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 group bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30`}
                        >
                            <div className="relative flex items-center justify-center">
                                <Bookmark size={18} strokeWidth={2.5} />
                            </div>
                            <span className="font-bold text-sm">Gemerkt</span>
                        </button>
                    </div>
                </div>
            </Card>

            {/* Search Content Area */}
            <div className={`transition-all duration-500 ease-in-out overflow-hidden ${activeTab === 'search' ? 'mb-8 opacity-100' : 'h-0 opacity-0 mb-0'}`}>
                <Card className="shadow-card border-none animate-in fade-in slide-in-from-top-4 duration-300" padding="lg">
                    <div className="relative mb-6">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                            <Search size={20} className="text-slate-400" />
                        </div>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Lernkarten durchsuchen..."
                            autoFocus
                            className="w-full pl-12 pr-12 py-4 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-100 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-medium"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute inset-y-0 right-4 flex items-center"
                            >
                                <X size={20} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
                            </button>
                        )}
                    </div>

                    {searchQuery.length > 2 ? (
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                    {searching ? 'Suche...' : `${searchResults.length} Ergebnisse gefunden`}
                                </h3>
                            </div>

                            {searchResults.length > 0 ? (
                                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                    {searchResults.map((card) => {
                                        // Check if this flashcard is locked (premium only)
                                        // First 3 flashcards per module are free
                                        const isLocked = !isPremium && card.order_index > 3;

                                        return (
                                            <button
                                                key={card.id}
                                                onClick={() => {
                                                    if (isLocked) {
                                                        openPaywall('Lernkarten');
                                                    } else {
                                                        navigate(`/flashcards/${card.module_id}/play?start=${card.order_index - 1}`);
                                                    }
                                                }}
                                                className={`w-full bg-white dark:bg-slate-850 p-4 rounded-xl border text-left flex items-start gap-3 transition-all active:scale-[0.99] ${isLocked
                                                    ? 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 hover:shadow-sm'
                                                    : 'border-slate-100 dark:border-slate-800 hover:shadow-md'
                                                    }`}
                                            >
                                                <div className="mt-0.5 flex-shrink-0">
                                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${isLocked
                                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                                        : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
                                                        }`}>
                                                        {isLocked ? <Lock size={12} /> : <Search size={12} />}
                                                    </div>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-sm font-medium leading-snug line-clamp-2 ${isLocked
                                                        ? 'text-blue-900 dark:text-blue-100'
                                                        : 'text-slate-900 dark:text-white'
                                                        }`}>
                                                        {card.question_de}
                                                    </p>
                                                    {language === 'DE_AR' && card.question_ar && (
                                                        <p className={`text-xs mt-1 text-left line-clamp-1 ${isLocked
                                                            ? 'text-blue-700 dark:text-blue-300'
                                                            : 'text-slate-500 dark:text-slate-400'
                                                            }`} dir="rtl">
                                                            {card.question_ar}
                                                        </p>
                                                    )}
                                                    {isLocked && (
                                                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1.5 font-medium">
                                                            🔒 Premium
                                                        </p>
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                !searching && (
                                    <div className="bg-slate-50 dark:bg-slate-850 rounded-xl p-6 text-center border border-slate-100 dark:border-slate-800">
                                        <p className="text-slate-500 dark:text-slate-400 text-sm">
                                            Keine Lernkarten gefunden für "{searchQuery}"
                                        </p>
                                    </div>
                                )
                            )}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-slate-400">
                            <Search size={48} className="mx-auto mb-3 opacity-20" />
                            <p className="text-sm font-medium">Tippe oben, um zu suchen (min. 3 Zeichen)</p>
                        </div>
                    )}
                </Card>
            </div>

            {/* Topic List - Grid on Desktop, Regular list on Mobile */}
            <div className="hidden lg:grid lg:grid-cols-2 lg:gap-4">
                {cacheLoading ? (
                    [1, 2, 3, 4, 5].map(i => (
                        <Card key={i} className="shadow-card border-none" padding="none">
                            <ModuleItemSkeleton />
                        </Card>
                    ))
                ) : (
                    modules.map(module => {
                        // @ts-ignore
                        const IconComponent = Icons[module.icon] || HelpCircle;
                        const moduleStats = stats[module.id] || { total: 0, known: 0, unknown: 0 };
                        const knownPercentage = moduleStats.total > 0 ? (moduleStats.known / moduleStats.total) * 100 : 0;
                        const unknownPercentage = moduleStats.total > 0 ? (moduleStats.unknown / moduleStats.total) * 100 : 0;

                        return (
                            <Card key={module.id} className="shadow-card border-none hover:shadow-lg transition-shadow" padding="none">
                                <button
                                    onClick={() => {
                                        navigate(`/flashcards/${module.id}`);
                                    }}
                                    className="w-full text-left p-4 sm:p-5 flex items-center justify-between group hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors rounded-2xl"
                                >
                                    <div className="flex items-center gap-3.5 flex-1">
                                        <div className="w-10 h-10 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/10 group-hover:text-blue-500/60 dark:group-hover:bg-blue-400/10 dark:group-hover:text-blue-400/60 transition-all">
                                            <IconComponent size={20} strokeWidth={1.5} />
                                        </div>
                                        <div className="text-left flex-1 min-w-0 pr-4">
                                            <h4 className="font-bold text-slate-900 dark:text-white text-sm leading-tight">{abbreviateModuleTitle(module.titleDE)}</h4>
                                            {language === 'DE_AR' && <p className="text-xs text-slate-500 dark:text-slate-400 text-left mt-0.5" dir="rtl">{module.titleAR}</p>}

                                            <div className="mt-2">
                                                <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 mb-1 font-medium">
                                                    <span>{moduleStats.known} / {moduleStats.total} richtig</span>
                                                    <span>{Math.round(knownPercentage)}%</span>
                                                </div>
                                                <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden w-full flex">
                                                    <div
                                                        className="h-full bg-green-500 transition-all duration-500"
                                                        style={{ width: `${knownPercentage}%` }}
                                                    />
                                                    <div
                                                        className="h-full bg-red-400 transition-all duration-500"
                                                        style={{ width: `${unknownPercentage}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 group-hover:text-blue-500/70 group-hover:bg-blue-500/10 dark:group-hover:text-blue-400/70 dark:group-hover:bg-blue-400/10 transition-all flex-shrink-0">
                                        <Icons.ChevronRight size={20} strokeWidth={2.5} />
                                    </div>
                                </button>
                            </Card>
                        )
                    })
                )}
            </div>

            {/* Mobile Topic List - Original single card layout */}
            <Card className="lg:hidden divide-y divide-slate-100 dark:divide-slate-700/50 overflow-hidden shadow-card border-none" padding="none">
                {cacheLoading ? (
                    [1, 2, 3, 4, 5].map(i => <ModuleItemSkeleton key={i} />)
                ) : (
                    modules.map(module => {
                        // @ts-ignore
                        const IconComponent = Icons[module.icon] || HelpCircle;
                        const moduleStats = stats[module.id] || { total: 0, known: 0, unknown: 0 };
                        const knownPercentage = moduleStats.total > 0 ? (moduleStats.known / moduleStats.total) * 100 : 0;
                        const unknownPercentage = moduleStats.total > 0 ? (moduleStats.unknown / moduleStats.total) * 100 : 0;

                        return (
                            <button
                                key={module.id}
                                onClick={() => {
                                    navigate(`/flashcards/${module.id}`);
                                }}
                                className="w-full text-left p-4 sm:p-5 flex items-center justify-between group hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                                <div className="flex items-center gap-3.5 flex-1">
                                    <div className="w-10 h-10 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/10 group-hover:text-blue-500/60 dark:group-hover:bg-blue-400/10 dark:group-hover:text-blue-400/60 transition-all">
                                        <IconComponent size={20} strokeWidth={1.5} />
                                    </div>
                                    <div className="text-left flex-1 min-w-0 pr-4">
                                        <h4 className="font-bold text-slate-900 dark:text-white text-sm leading-tight">{abbreviateModuleTitle(module.titleDE)}</h4>
                                        {language === 'DE_AR' && <p className="text-xs text-slate-500 dark:text-slate-400 text-left mt-0.5" dir="rtl">{module.titleAR}</p>}

                                        <div className="mt-2">
                                            <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 mb-1 font-medium">
                                                <span>{moduleStats.known} / {moduleStats.total} richtig</span>
                                                <span>{Math.round(knownPercentage)}%</span>
                                            </div>
                                            <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden w-full flex">
                                                <div
                                                    className="h-full bg-green-500 transition-all duration-500"
                                                    style={{ width: `${knownPercentage}%` }}
                                                />
                                                <div
                                                    className="h-full bg-red-400 transition-all duration-500"
                                                    style={{ width: `${unknownPercentage}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 group-hover:text-blue-500/70 group-hover:bg-blue-500/10 dark:group-hover:text-blue-400/70 dark:group-hover:bg-blue-400/10 transition-all flex-shrink-0">
                                    <Icons.ChevronRight size={20} strokeWidth={2.5} />
                                </div>
                            </button>
                        )
                    })
                )}
            </Card>
        </div>
    );
}
