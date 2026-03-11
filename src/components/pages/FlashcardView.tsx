import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, CheckCircle, XCircle, ChevronLeft, ChevronRight, Languages, Bookmark, Lightbulb, Info } from 'lucide-react';
import { useApp } from '../../App';
import { supabase } from '../../lib/supabase';
import { Card } from '../ui/Card';

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
}

export default function FlashcardView() {
    const { moduleId } = useParams<{ moduleId: string }>();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { language, isPremium, toggleLanguage, showLanguageToggle, openPaywall, progress, toggleBookmark, answerFlashcard } = useApp();

    const [cards, setCards] = useState<Flashcard[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [loading, setLoading] = useState(true);

    const [isFinished, setIsFinished] = useState(false);

    // Track known status for session feedback
    const [sessionResults, setSessionResults] = useState<Record<string, boolean>>({});

    const [moduleTitle, setModuleTitle] = useState('');

    useEffect(() => {
        if (moduleId) {
            loadCards();
        }
    }, [moduleId]);

    const loadCards = async () => {
        try {
            setLoading(true);

            // Fetch module info
            const { data: moduleData } = await supabase
                .from('modules')
                .select('title_de')
                .eq('id', moduleId)
                .single();
            if (moduleData) setModuleTitle(moduleData.title_de);

            const { data, error } = await supabase
                .from('flashcards')
                .select('*')
                .eq('module_id', moduleId)
                .order('order_index');

            if (error) throw error;
            setCards(data || []);

            const isIntroModule = (moduleData?.title_de === 'Einführung und Grundlagen');

            // Start at requested index if provided
            const startParam = searchParams.get('start');
            if (startParam) {
                const startIndex = parseInt(startParam);
                if (!isNaN(startIndex) && startIndex >= 0 && startIndex < (data?.length || 0)) {
                    // Check paywall again just in case URL manipulation
                    // Logic: Locked only if NOT premium AND NOT intro module AND beyond free cards
                    if (!isPremium && !isIntroModule && startIndex >= 3) {
                        openPaywall('Lernkarten');
                        navigate(`/flashcards/${moduleId}`);
                        return;
                    }
                    setCurrentIndex(startIndex);
                }
            }
        } catch (error) {
            console.error('Error loading cards:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleNext = () => {
        const isIntroModule = (moduleTitle === 'Einführung und Grundlagen');
        if (currentIndex < cards.length - 1) {
            const nextIndex = currentIndex + 1;
            // Paywall Check: Only if NOT premium AND NOT intro module AND beyond free cards
            if (!isPremium && !isIntroModule && nextIndex >= 3) {
                openPaywall('Lernkarten');
                return;
            }
            setCurrentIndex(nextIndex);
            setIsFlipped(false);
        } else {
            setIsFinished(true);
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
            setIsFlipped(false);
        }
    };

    const handleResult = async (known: boolean) => {
        const card = cards[currentIndex];
        if (!card) return;

        // Save progress globally
        answerFlashcard(card.id, known);

        // Auto-advance after short delay
        setTimeout(() => {
            handleNext();
        }, 300);
    };

    if (loading) return null; // Or skeleton

    if (isFinished) {
        return (
            <div className="min-h-screen bg-[#F2F4F6] dark:bg-slate-950 flex flex-col items-center justify-center p-6">
                <Card className="w-full max-w-md text-center p-8 border-none shadow-card bg-white dark:bg-slate-800">
                    <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle size={40} />
                    </div>

                    <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
                        Klasse gemacht!
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-8">
                        Du hast alle Lernkarten in diesem Modul durchgearbeitet.
                    </p>

                    <div className="space-y-3">
                        <button
                            onClick={() => {
                                setIsFinished(false);
                                setCurrentIndex(0);
                                setIsFlipped(false);
                            }}
                            className="w-full py-4 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                        >
                            Nochmal wiederholen
                        </button>

                        <button
                            onClick={() => navigate(`/flashcards/${moduleId}`)}
                            className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30"
                        >
                            Zurück zur Übersicht
                        </button>
                    </div>
                </Card>
            </div>
        );
    }

    const currentCard = cards[currentIndex];

    if (!currentCard) return <div>Keine Karten gefunden.</div>;

    const isBookmarked = progress.bookmarks.includes(currentCard.id);

    return (
        <div className="min-h-screen bg-[#F2F4F6] dark:bg-slate-950 flex flex-col items-center pt-6 px-4 pb-12">
            {/* Header */}
            <div className="w-full max-w-md flex items-center justify-between mb-8">
                <button
                    onClick={() => navigate(`/flashcards/${moduleId}`)}
                    className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors flex items-center gap-2"
                >
                    <ArrowLeft size={24} />
                    <span className="font-bold">Zurück</span>
                </button>

                <span className="font-mono text-sm font-bold text-slate-400">
                    {currentIndex + 1} / {cards.length}
                </span>

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

            {/* Main Flashcard Container */}
            <div className="w-full max-w-md perspective-1000 h-[450px]">
                <div
                    className={`relative w-full h-full transition-all duration-500 transform-style-3d cursor-pointer ${isFlipped ? 'rotate-y-180' : ''}`}
                    onClick={() => setIsFlipped(!isFlipped)}
                >
                    {/* FRONT */}
                    <div className="absolute inset-0 backface-hidden">
                        <Card className="w-full h-full flex flex-col items-center justify-center p-8 text-center hover:shadow-lg transition-shadow border-none shadow-card bg-white dark:bg-slate-800" padding="none">
                            {!isFlipped && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleBookmark(currentCard.id);
                                    }}
                                    className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors z-10"
                                >
                                    <Bookmark
                                        size={24}
                                        className={isBookmarked ? "fill-blue-500 text-blue-500" : "text-slate-300 dark:text-slate-600"}
                                    />
                                </button>
                            )}

                            <div className="flex-1 flex flex-col justify-center overflow-y-auto w-full custom-scrollbar px-10 py-4">
                                <h2 className="text-xl font-black text-slate-900 dark:text-white leading-tight mb-4">
                                    {currentCard.question_de}
                                </h2>

                                {language === 'DE_AR' && currentCard.question_ar && (
                                    <p className="text-lg text-slate-500 dark:text-slate-400 leading-relaxed" dir="rtl">
                                        {currentCard.question_ar}
                                    </p>
                                )}
                            </div>

                            <p className="absolute bottom-8 text-sm font-medium text-blue-500 animate-pulse">
                                Zum Umdrehen tippen
                            </p>
                        </Card>
                    </div>

                    {/* BACK SHADOW/DECORATION */}
                    <div className="absolute inset-0 backface-hidden rotate-y-180">
                        <Card className="w-full h-full flex flex-col items-center p-0 border-none shadow-card bg-white dark:bg-slate-900 overflow-hidden" padding="none">
                            {/* Header Strip */}
                            <div className="w-full h-2 bg-blue-600 dark:bg-blue-500" />

                            <div className="flex-1 w-full flex flex-col p-8 pt-6 relative overflow-hidden">
                                {isFlipped && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleBookmark(currentCard.id);
                                        }}
                                        className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors z-10"
                                    >
                                        <Bookmark
                                            size={22}
                                            className={isBookmarked ? "fill-blue-500 text-blue-500" : "text-slate-300 dark:text-slate-700"}
                                        />
                                    </button>
                                )}

                                <div className="flex-1 flex flex-col justify-center overflow-y-auto w-full custom-scrollbar pr-12">
                                    {(() => {
                                        // Remove bookmark-like emojis that may appear on iOS Safari
                                        const cleanText = (text: string) => {
                                            // More comprehensive regex for bookmark emojis and symbols including potential variation selectors
                                            return text.replace(/[\u{1F516}\u{1F517}\u{1F4CC}\u{1F4CD}\u{1F4D1}\u{1F4CE}\u{1F3F7}\u{1F516}\u{FE0F}\u{FE0E}]/gu, '').trim();
                                        };

                                        const renderContent = (text: string, isArabic: boolean) => {
                                            if (!text) return null;

                                            // Clean the text first
                                            const cleanedText = cleanText(text);

                                            // Split by bullet point or check for "Beispiel:"
                                            // Some cards use "•" as separators
                                            const parts = cleanedText.split('•').map(p => p.trim()).filter(Boolean);

                                            return parts.map((part, idx) => {
                                                const isExample = part.toLowerCase().startsWith('beispiel:') || part.startsWith('مثال:');
                                                const cleanPart = isExample
                                                    ? part.replace(/^(beispiel:|مثال:)\s*/i, '')
                                                    : part;

                                                if (isExample) {
                                                    return (
                                                        <div key={idx} className="mt-6 mb-2">
                                                            <div className={`p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-900/10 border border-amber-100/50 dark:border-amber-900/20 relative overflow-hidden group`}>
                                                                {/* Decorative Icon Background */}
                                                                <div className="absolute -right-2 -bottom-2 text-amber-500/5 opacity-10 group-hover:scale-110 transition-transform">
                                                                    <Lightbulb size={64} />
                                                                </div>

                                                                <div className={`flex gap-3 ${isArabic ? 'flex-row-reverse' : 'flex-row'}`}>
                                                                    <div className="mt-1 flex-shrink-0 w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                                                                        <Lightbulb size={16} strokeWidth={2.5} />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <span className={`block text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-500 mb-1 ${isArabic ? 'text-right' : 'text-left'}`}>
                                                                            {isArabic ? 'مثال' : 'Beispiel'}
                                                                        </span>
                                                                        <p className={`text-xs md:text-sm font-medium text-slate-700 dark:text-slate-300 leading-relaxed ${isArabic ? 'text-right' : 'text-left'}`} dir={isArabic ? 'rtl' : 'ltr'}>
                                                                            {cleanPart}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                }

                                                return (
                                                    <div key={idx} className="mb-4 last:mb-0">
                                                        <div className={`flex gap-3 ${isArabic ? 'flex-row-reverse' : 'flex-row'}`}>
                                                            <div className="mt-2.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 opacity-50" />
                                                            <p className={`text-base md:text-lg font-bold text-slate-800 dark:text-slate-100 leading-[1.6] ${isArabic ? 'text-right' : 'text-left'}`} dir={isArabic ? 'rtl' : 'ltr'}>
                                                                {cleanPart}
                                                            </p>
                                                        </div>
                                                    </div>
                                                );
                                            });
                                        };

                                        return (
                                            <div className="space-y-6">
                                                <div className="space-y-4">
                                                    {renderContent(currentCard.answer_de, false)}
                                                </div>
                                                {language === 'DE_AR' && currentCard.answer_ar && (
                                                    <div className="pt-6 border-t border-slate-100 dark:border-slate-800/50 space-y-4">
                                                        {renderContent(currentCard.answer_ar, true)}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="w-full max-w-md mt-8">
                {!isFlipped ? (
                    // Navigation Only when Front
                    <div className="flex justify-between items-center">
                        <button
                            onClick={handlePrev}
                            disabled={currentIndex === 0}
                            className="p-4 rounded-full bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 disabled:opacity-50 text-slate-600 dark:text-slate-300"
                        >
                            <ChevronLeft size={24} />
                        </button>

                        <button
                            onClick={() => setIsFlipped(true)}
                            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-95"
                        >
                            Antwort zeigen
                        </button>

                        <button
                            onClick={handleNext}
                            disabled={currentIndex === cards.length - 1}
                            className="p-4 rounded-full bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 disabled:opacity-50 text-slate-600 dark:text-slate-300"
                        >
                            <ChevronRight size={24} />
                        </button>
                    </div>
                ) : (
                    // Assessment Buttons when Back
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={(e) => { e.stopPropagation(); handleResult(false); }}
                            className="flex flex-col items-center justify-center gap-2 p-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-2xl border-2 border-red-200 dark:border-red-900 hover:bg-red-200 dark:hover:bg-red-900/50 transition-all active:scale-95"
                        >
                            <XCircle size={32} />
                            <span className="font-bold">Falsch</span>
                        </button>

                        <button
                            onClick={(e) => { e.stopPropagation(); handleResult(true); }}
                            className="flex flex-col items-center justify-center gap-2 p-4 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-2xl border-2 border-green-200 dark:border-green-900 hover:bg-green-200 dark:hover:bg-green-900/50 transition-all active:scale-95"
                        >
                            <CheckCircle size={32} />
                            <span className="font-bold">Richtig</span>
                        </button>
                    </div>
                )}
            </div>

            <style>{`
        .rotate-y-180 {
          transform: rotateY(180deg);
        }
        .perspective-1000 {
          perspective: 1000px;
        }
        .transform-style-3d {
          transform-style: preserve-3d;
        }
        .backface-hidden {
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
      `}</style>
        </div>
    );
}
