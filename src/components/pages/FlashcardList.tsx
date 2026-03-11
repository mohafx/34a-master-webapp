import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, CheckCircle, XCircle, Circle, Play, Languages } from 'lucide-react';
import { useApp } from '../../App';
import { supabase } from '../../lib/supabase';
import { Card } from '../ui/Card';
import * as Icons from 'lucide-react';
import { abbreviateModuleTitle } from '../../utils/moduleUtils';

interface Flashcard {
    id: string;
    module_id: string;
    order_index: number;
    question_de: string;
    question_ar?: string;
    answer_de: string;
    answer_ar?: string;
    hint_de?: string;
    hint_ar?: string;
    lesson_id?: string;
}

export default function FlashcardList() {
    const { moduleId } = useParams<{ moduleId: string }>();
    const navigate = useNavigate();
    const { language, isPremium, openPaywall, showLanguageToggle, toggleLanguage, progress: globalProgress } = useApp();

    // Data State
    const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
    const [loading, setLoading] = useState(true);
    const [moduleTitle, setModuleTitle] = useState('Lernkarten');
    const [moduleIcon, setModuleIcon] = useState<string | null>(null);

    // Smart Header Logic
    const [showFloatingButton, setShowFloatingButton] = useState(false);
    const lastScrollY = useRef(0);
    const ticking = useRef(false);

    useEffect(() => {
        if (moduleId) {
            loadData();
        }
    }, [moduleId]);

    // Scroll Listener for Floating Button
    useEffect(() => {
        const handleScroll = (e: Event) => {
            const target = e.target as HTMLElement;
            if (!ticking.current) {
                window.requestAnimationFrame(() => {
                    const currentScrollY = window.scrollY;
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

    const loadData = async () => {
        try {
            setLoading(true);

            // 1. Module Details
            const { data: moduleData } = await supabase
                .from('modules')
                .select('title_de, icon')
                .eq('id', moduleId)
                .single();

            if (moduleData) {
                setModuleTitle(moduleData.title_de);
                setModuleIcon(moduleData.icon);
            }

            // 2. Flashcards
            const { data: cards, error } = await supabase
                .from('flashcards')
                .select('*')
                .eq('module_id', moduleId)
                .order('order_index');

            if (error) throw error;
            setFlashcards(cards || []);

        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };


    const handleCardClick = (card: Flashcard, isLocked: boolean, displayIndex: number) => {
        if (isLocked) {
            openPaywall('Lernkarten');
            return;
        }

        // Use displayIndex directly for navigation (consistent with isLocked check)
        navigate(`/flashcards/${moduleId}/play?start=${displayIndex}`)
    };

    // Stats Calculation
    const totalCards = flashcards.length;
    const knownCards = flashcards.filter(c => globalProgress.flashcardProgress[c.id] === true).length;
    const unknownCards = flashcards.filter(c => globalProgress.flashcardProgress[c.id] === false).length;
    const openCards = totalCards - knownCards - unknownCards;

    const percentKnown = totalCards > 0 ? Math.round((knownCards / totalCards) * 100) : 0;

    // Skeleton component for stats (used when data is still loading)
    const StatsSkeleton = () => (
        <>
            {/* Progress Bar Skeleton */}
            <div className="flex-1 mr-6">
                <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                        Fortschritt
                    </span>
                    <div className="h-3 w-12 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="h-full w-0 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse"></div>
                </div>
            </div>

            {/* Stats Skeleton */}
            <div className="flex items-center gap-2">
                <div className="flex flex-col items-end gap-1">
                    <div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
                    <div className="h-3 w-14 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
                </div>
            </div>
        </>
    );

    // Flashcard List Skeleton
    const FlashcardsSkeleton = () => (
        <Card className="mb-8 overflow-hidden shadow-card border-none" padding="none">
            <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-700/50">
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="p-3.5 flex items-center gap-3.5 animate-pulse">
                        <div className="w-4 h-4 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
                        <div className="flex-1 space-y-2">
                            <div className="h-3 w-1/4 bg-slate-200 dark:bg-slate-700 rounded"></div>
                            <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded"></div>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );

    const isIntroModule = (moduleTitle === 'Einführung und Grundlagen');

    return (
        <div className="pt-4 px-4 pb-32 lg:px-0 lg:pt-0 lg:pb-8">
            {/* Floating Smart Back Button */}
            <div
                className={`fixed top-4 left-4 z-40 transition-all duration-300 transform ${showFloatingButton ? 'translate-y-0 opacity-100' : '-translate-y-16 opacity-0 pointer-events-none'}`}
            >
                <button
                    onClick={() => navigate('/flashcards')}
                    className="w-14 h-14 rounded-full bg-white dark:bg-slate-800 shadow-lg border border-slate-100 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                    <ArrowLeft size={28} strokeWidth={2.5} />
                </button>
            </div>

            {/* New Unified Header Style */}
            <Card className="mb-6 shadow-sm border-slate-200 dark:border-slate-800" padding="md">
                <div className="flex flex-col gap-4">
                    {/* Top Row: Back, Title, Language */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => navigate('/flashcards')}
                                className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-500 dark:text-slate-400"
                            >
                                <ArrowLeft size={24} />
                            </button>
                            <div>
                                <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-tight line-clamp-2">
                                    {moduleTitle || ''}
                                </h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                                    Lernkarten
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
                    <div className="flex items-center justify-between">
                        {loading ? (
                            <StatsSkeleton />
                        ) : (
                            <>
                                <div className="flex-1 mr-6">
                                    <div className="flex justify-between items-center mb-1.5">
                                        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                                            Fortschritt
                                        </span>
                                        <span className="text-[11px] font-black text-slate-900 dark:text-white">
                                            {knownCards} <span className="text-slate-400 font-normal">/ {totalCards}</span>
                                        </span>
                                    </div>
                                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden flex">
                                        <div
                                            className="h-full bg-emerald-500 transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                                            style={{ width: `${totalCards > 0 ? (knownCards / totalCards) * 100 : 0}%` }}
                                        ></div>
                                        <div
                                            className="h-full bg-red-500 transition-all duration-1000 ease-out"
                                            style={{ width: `${totalCards > 0 ? (unknownCards / totalCards) * 100 : 0}%` }}
                                        ></div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <div className="flex flex-col items-end">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">{knownCards} Richtig</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">{unknownCards} Falsch</span>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </Card>


            {loading ? (
                <FlashcardsSkeleton />
            ) : (
                <Card className="mb-8 overflow-hidden shadow-card border-none" padding="none">
                    <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-700/50">
                        {flashcards.map((card, idx) => {
                            const displayIndex = idx;
                            const isLocked = !isPremium && !isIntroModule && displayIndex >= 3;
                            const isKnown = globalProgress.flashcardProgress[card.id] === true;
                            const isUnknown = globalProgress.flashcardProgress[card.id] === false;
                            const hasSeen = globalProgress.flashcardProgress.hasOwnProperty(card.id);

                            let rowClass = "";
                            let iconColor = "text-slate-300 dark:text-slate-600";
                            let RenderIcon = Circle;

                            if (isLocked) {
                                rowClass = "hover:bg-blue-50/50 dark:hover:bg-blue-900/20 opacity-75";
                                iconColor = "text-blue-400";
                                RenderIcon = Lock;
                            } else if (hasSeen) {
                                if (isKnown) {
                                    rowClass = "bg-emerald-50/30 dark:bg-emerald-900/10 hover:bg-emerald-50/60 dark:hover:bg-emerald-900/20";
                                    iconColor = "text-emerald-500";
                                    RenderIcon = CheckCircle;
                                } else {
                                    rowClass = "bg-red-50/30 dark:bg-red-900/10 hover:bg-red-50/60 dark:hover:bg-red-900/20";
                                    iconColor = "text-red-500";
                                    RenderIcon = XCircle;
                                }
                            } else {
                                rowClass = "hover:bg-slate-100 dark:hover:bg-slate-800/50";
                            }

                            return (
                                <div
                                    key={card.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => handleCardClick(card, isLocked, displayIndex)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            handleCardClick(card, isLocked, displayIndex);
                                        }
                                    }}
                                    className={`w-full flex items-center gap-3.5 p-3.5 transition-colors text-left group/item cursor-pointer ${rowClass}`}
                                >
                                    <div className={`transition-transform duration-200 group-hover/item:scale-110 flex-shrink-0 ${iconColor}`}>
                                        <RenderIcon size={16} strokeWidth={hasSeen ? 2.5 : 2} />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                            <span className={`text-[9px] uppercase font-bold tracking-wider ${isLocked ? 'text-blue-500/70' : 'text-slate-400 dark:text-slate-500'}`}>
                                                Karte {displayIndex + 1}
                                            </span>
                                        </div>
                                        <p className={`text-[13px] font-medium leading-snug transition-colors line-clamp-2 ${isLocked ? 'text-slate-500 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200 group-hover/item:text-blue-600 dark:group-hover/item:text-blue-400'}`}>
                                            {card.question_de}
                                        </p>
                                        {language === 'DE_AR' && card.question_ar && (
                                            <p className={`text-[11px] mt-1 leading-snug transition-colors line-clamp-2 ${isLocked ? 'text-slate-400 dark:text-slate-600' : 'text-slate-500 dark:text-slate-400'}`} dir="rtl">
                                                {card.question_ar}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}

            {/* Empty State */}
            {!loading && flashcards.length === 0 && (
                <div className="text-center py-12 px-6 opacity-60">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Icons.Inbox className="text-slate-400" size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Keine Lernkarten
                    </h3>
                    <p className="text-sm text-slate-500 max-w-xs mx-auto">
                        Für dieses Modul sind noch keine Lernkarten verfügbar.
                    </p>
                </div>
            )}
        </div>
    );
}
