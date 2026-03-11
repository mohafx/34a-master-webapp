import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronRight, Check, FileText, BarChart3, Cloud, LayoutList, Languages, BookOpen } from 'lucide-react';
import ProgressDots from './ProgressDots';

export interface OnboardingData {
    examDate: string | null;
    language: 'DE' | 'DE_AR';
    newsletter: boolean;
}

interface FirstTimeOnboardingProps {
    userName: string;
    onComplete: (data: OnboardingData) => void;
}

export default function FirstTimeOnboarding({ userName, onComplete }: FirstTimeOnboardingProps) {
    const [currentScreen, setCurrentScreen] = useState(0);
    const [examDate, setExamDate] = useState<string>('');
    const [skipDate, setSkipDate] = useState(false);
    const [selectedLanguage, setSelectedLanguage] = useState<'DE' | 'DE_AR'>('DE');
    const [newsletter, setNewsletter] = useState(true);

    const totalScreens = 2;

    // A date is invalid if it's in the past (today counts as past for an exam date)
    const isPastDate = examDate !== '' && new Date(examDate) <= new Date(new Date().setHours(0, 0, 0, 0));
    // Derived state for button enabled
    const screen1Complete = (skipDate || examDate !== '') && !isPastDate;

    const nextScreen = useCallback(() => {
        if (currentScreen < totalScreens - 1) {
            setCurrentScreen(prev => prev + 1);
        }
    }, [currentScreen]);

    const handleStart = useCallback(() => {
        onComplete({
            examDate: skipDate ? null : examDate,
            language: selectedLanguage,
            newsletter
        });
    }, [onComplete, examDate, skipDate, selectedLanguage, newsletter]);

    const handleLanguageSelect = useCallback((lang: 'DE' | 'DE_AR') => {
        setSelectedLanguage(lang);
    }, []);

    const handleDotClick = useCallback((index: number) => {
        // Prevent skipping ahead if date not set
        if (index === 1 && !screen1Complete) return;
        setCurrentScreen(index);
    }, [screen1Complete]);

    // Calculate days until exam for preview
    const daysUntilExam = examDate && !skipDate 
        ? Math.ceil((new Date(examDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) 
        : null;

    // Auto-scroll to top on screen change
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        containerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    }, [currentScreen]);

    const FeatureItem = ({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string, subtitle: string }) => {
        return (
            <div className="flex items-center gap-4 bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-slate-100 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-blue-600" strokeWidth={2.5} />
                </div>
                <div className="flex flex-col flex-1">
                    <span className="font-bold text-[15px] text-slate-900 leading-tight mb-0.5">{title}</span>
                    <span className="text-[13px] text-slate-500 font-medium leading-tight">{subtitle}</span>
                </div>
            </div>
        );
    };

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 z-50 overflow-y-auto bg-white flex flex-col font-sans"
        >

            {/* HEADER CARD */}
            <div className="mx-4 mt-4 sm:mx-6 sm:mt-6 shrink-0 relative z-20">
                <div className="bg-[#3B65F5] rounded-[28px] shadow-xl shadow-blue-500/10 overflow-hidden relative">

                    {/* Decorative background elements inside the card */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <div className="absolute -top-16 -right-16 w-64 h-64 bg-white/10 rounded-full blur-3xl opacity-50" />
                        <div className="absolute top-1/2 -left-10 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl" />
                    </div>

                    {/* Nav Bar */}
                    <div className="flex items-center justify-between px-6 pt-4 relative z-10">
                        {/* Progress Dots */}
                        <div className="flex gap-2 scale-[0.8] origin-left">
                            <ProgressDots
                                total={totalScreens}
                                current={currentScreen}
                                onDotClick={handleDotClick}
                            />
                        </div>
                    </div>

                    {/* Header Content Area */}
                    <div className="px-6 pb-5 pt-3 relative z-10 flex flex-col justify-center">
                        {/* Screen 1 Title */}
                        {currentScreen === 0 && (
                            <div className="animate-fadeSlideIn">
                                <h1 className="text-[26px] sm:text-[32px] leading-[1.1] font-black text-white mb-2 tracking-tight">
                                    Willkommen, {userName}!
                                </h1>
                                <p className="text-white/90 text-[14px] leading-relaxed font-medium">
                                    Du hast den ersten Schritt gemacht. Wir begleiten dich bis zur bestandenen Prüfung.
                                </p>
                            </div>
                        )}

                        {/* Screen 2 Title */}
                        {currentScreen === 1 && (
                            <div className="animate-fadeSlideIn">
                                <h1 className="text-[26px] sm:text-[32px] leading-[1.1] font-black text-white mb-2 tracking-tight">
                                    Alles bereit für deine Prüfung.
                                </h1>
                                <p className="text-white/90 text-[14px] leading-relaxed font-medium">
                                    Alle Inhalte. Komplett kostenlos.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* BODY CONTENT */}
            <div className="flex-1 flex flex-col relative z-10 w-full mb-32">
                <div className="px-6 pt-6 pb-4">

                    <div className="animate-fadeUp">

                        {/* Screen 1 Content */}
                        {currentScreen === 0 && (
                            <div className="space-y-6">
                                
                                {/* Exam Date Section */}
                                <div className="space-y-3">
                                    <h3 className="font-bold text-[17px] text-slate-800">
                                        Hast du schon einen Prüfungstermin?
                                    </h3>
                                    
                                    {!skipDate && (
                                        <div className="animate-fadeIn">
                                            <input
                                                type="date"
                                                value={examDate}
                                                min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    const selected = new Date(val);
                                                    const today = new Date();
                                                    today.setHours(0, 0, 0, 0);
                                                    if (val && selected <= today) {
                                                        // Past date — show error but keep value for display
                                                        setExamDate(val);
                                                    } else {
                                                        setExamDate(val);
                                                    }
                                                }}
                                                className={`w-full px-4 py-3.5 border-2 rounded-2xl focus:outline-none text-slate-900 bg-white font-medium text-[15px] transition-colors ${
                                                    examDate && new Date(examDate) <= new Date(new Date().setHours(0,0,0,0))
                                                        ? 'border-red-400 focus:border-red-500'
                                                        : 'border-slate-200 focus:border-[#3B65F5]'
                                                }`}
                                                autoComplete="off"
                                            />

                                            {/* Past date error */}
                                            {examDate && new Date(examDate) <= new Date(new Date().setHours(0,0,0,0)) && (
                                                <div className="mt-2 bg-red-50 rounded-xl p-3 border border-red-200 animate-fadeIn">
                                                    <p className="text-red-600 text-[13px] font-semibold text-center">
                                                        Dieses Datum liegt in der Vergangenheit. Bitte wähle ein zukünftiges Datum.
                                                    </p>
                                                </div>
                                            )}
                                            
                                            {/* Future date countdown */}
                                            {daysUntilExam !== null && daysUntilExam > 0 && (
                                                <div className="mt-3 bg-blue-50/80 rounded-xl p-3 border border-blue-100 animate-fadeUp">
                                                    <p className="text-[#3B65F5] text-[14px] font-bold text-center">
                                                        Noch {daysUntilExam} Tage — gemeinsam schaffen wir das!
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {!skipDate && (
                                        <button 
                                            onClick={() => {
                                                setSkipDate(true);
                                                setExamDate('');
                                            }}
                                            className="w-full text-center text-[13px] text-slate-500 font-medium py-2 hover:text-slate-700 active:text-slate-700 underline decoration-slate-300 underline-offset-4"
                                        >
                                            Ich weiß mein Datum noch nicht
                                        </button>
                                    )}

                                    {skipDate && (
                                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between animate-fadeIn">
                                            <span className="text-slate-600 text-[14px] font-medium">Ohne Datum fortfahren</span>
                                            <button 
                                                onClick={() => setSkipDate(false)}
                                                className="text-[#3B65F5] text-[13px] font-bold py-1 px-3 bg-blue-50 rounded-lg"
                                            >
                                                Ändern
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="h-px bg-slate-100 w-full my-6"></div>

                                {/* Arabic Toggle Section - Restored from old onboarding */}
                                <div className="pt-2">
                                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <Languages className="w-5 h-5 text-slate-600" />
                                                <div>
                                                    <p className="text-slate-900 font-bold text-[14px]">Arabische Übersetzung</p>
                                                    <p className="text-slate-500 text-[11px] mt-0.5">Aktiviere deutsche + arabische Texte</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleLanguageSelect(selectedLanguage === 'DE' ? 'DE_AR' : 'DE')}
                                                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors touch-manipulation cursor-pointer ${selectedLanguage === 'DE_AR' ? 'bg-[#3B65F5]' : 'bg-slate-300'
                                                    }`}
                                            >
                                                <span
                                                    className="inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200"
                                                    style={{ transform: `translateX(${selectedLanguage === 'DE_AR' ? '26px' : '2px'})` }}
                                                />
                                            </button>
                                        </div>

                                        {/* Arabic Confirmation Text */}
                                        {selectedLanguage === 'DE_AR' && (
                                            <div className="mt-3 pt-3 border-t border-slate-100 animate-fadeIn">
                                                <p className="text-emerald-600 text-[13px] font-bold text-center" dir="rtl">
                                                    تم تفعيل الترجمة العربية بنجاح ✅
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                            </div>
                        )}

                        {/* Screen 2 Content */}
                        {currentScreen === 1 && (
                            <div className="space-y-6">
                                
                                {/* Features List Cards */}
                                <div className="space-y-3">
                                    <FeatureItem icon={FileText} title="Realitätsnahe Simulationen" subtitle="700+ aktuelle Fragen" />
                                    <FeatureItem icon={BookOpen} title="Verständlich lernen" subtitle="130+ strukturierte Lektionen" />
                                    <FeatureItem icon={BarChart3} title="Erkenne deine Lücken" subtitle="Detaillierte Prüfungsauswertungen" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Fixed Footer Buttons */}
                <div className="fixed bottom-0 left-0 right-0 px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 bg-gradient-to-t from-white via-white to-white/90 z-50 pointer-events-none">
                    <div className="pointer-events-auto flex flex-col gap-3">
                        {/* Newsletter Checkbox integrated with footer on Screen 2 */}
                        {currentScreen === 1 && (
                            <div 
                                className="flex items-start gap-3 px-3 py-2 cursor-pointer transition-colors animate-fadeIn"
                                onClick={() => setNewsletter(!newsletter)}
                            >
                                <div className="mt-0.5 shrink-0">
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${newsletter ? 'bg-[#3B65F5] border-[#3B65F5]' : 'border-slate-300 bg-white'}`}>
                                        {newsletter && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                                    </div>
                                </div>
                                <div className="select-none">
                                    <p className="text-[13px] font-bold text-slate-800 leading-snug mb-0.5">
                                        Prüfungstipps & Updates erhalten
                                    </p>
                                    <p className="text-[11px] text-slate-500 leading-snug">
                                        Wir senden dir gelegentlich hilfreiche Tipps für deine Prüfung. Keine Werbung, versprochen.
                                    </p>
                                </div>
                            </div>
                        )}

                        <button
                            onClick={currentScreen === totalScreens - 1 ? handleStart : nextScreen}
                            disabled={currentScreen === 0 && !screen1Complete}
                            className={`w-full font-bold py-4 px-6 rounded-2xl text-[17px] transition-all flex items-center justify-center gap-2 group ${
                                currentScreen === 0 && !screen1Complete 
                                    ? 'bg-slate-200 text-slate-400 shadow-none'
                                    : 'bg-[#3B65F5] text-white shadow-lg shadow-blue-500/20 active:bg-blue-600 active:shadow-blue-500/30'
                            }`}
                        >
                            <span>{currentScreen === totalScreens - 1 ? 'Jetzt loslegen' : 'Weiter'}</span>
                            <ChevronRight className="w-5 h-5 transition-transform" strokeWidth={3} />
                        </button>
                    </div>
                </div>
            </div>

            <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fadeSlideIn { animation: fadeSlideIn 0.5s ease-out forwards; }
        .animate-fadeUp { animation: fadeUp 0.5s ease-out forwards; }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out forwards; }
      `}</style>
        </div>
    );
}
