import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronRight, CheckCircle2, XCircle, Award, Users, Target, BookOpen, MessageCircle, Smartphone, Briefcase, MessageSquare, Banknote, Rocket, TrendingUp, Languages, GraduationCap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ProgressDots from './ProgressDots';
import { usePostHog } from '../../contexts/PostHogProvider';

export default function TikTokOnboarding() {
    const navigate = useNavigate();
    const { trackEvent } = usePostHog();
    const [currentScreen, setCurrentScreen] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    // State
    const [isUnemployed, setIsUnemployed] = useState<boolean | null>(null);
    const [languageLevel, setLanguageLevel] = useState<'native' | 'b1_plus' | 'below_b1' | null>(null);

    const totalScreens = 4; // Hero -> Employment -> Language -> Result

    // Log start event
    useEffect(() => {
        trackEvent('tiktok_onboarding_started', { source: 'tiktok' });
    }, [trackEvent]);

    const nextScreen = useCallback(() => {
        containerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
        setCurrentScreen(prev => prev + 1);
    }, []);

    const handleEmploymentSelect = (unemployed: boolean) => {
        setIsUnemployed(unemployed);
        trackEvent('tiktok_employment_answered', { status: unemployed ? 'unemployed' : 'employed' });
        
        if (unemployed) {
            // Next question
            nextScreen();
        } else {
            // Skip directly to result (not qualified)
            setCurrentScreen(3);
        }
    };

    const handleLanguageSelect = (level: 'native' | 'b1_plus' | 'below_b1') => {
        setLanguageLevel(level);
        trackEvent('tiktok_language_answered', { level });
        nextScreen();
    };

    const isQualified = isUnemployed === true && (languageLevel === 'native' || languageLevel === 'b1_plus');
    const notQualifiedReason = isUnemployed === false ? 'employed' : (languageLevel === 'below_b1' ? 'language_below_b1' : null);

    useEffect(() => {
        if (currentScreen === 3) {
            if (isQualified) {
                trackEvent('tiktok_qualified', { employment: 'unemployed', language: languageLevel });
            } else {
                trackEvent('tiktok_not_qualified', { reason: notQualifiedReason });
            }
        }
    }, [currentScreen, isQualified, notQualifiedReason, trackEvent, languageLevel]);

    const handleWhatsAppClick = () => {
        trackEvent('tiktok_whatsapp_clicked', { phone: '491782907020' });
        const text = "Hallo! Ich komme von TikTok und interessiere mich für die kostenlose 34a Weiterbildung. Ich bin arbeitslos und spreche Deutsch auf B1-Niveau oder besser.";
        window.location.href = `https://wa.me/491782907020?text=${encodeURIComponent(text)}`;
    };

    const handleAppRedirect = () => {
        trackEvent('tiktok_redirect_to_app', {});
        navigate('/dashboard');
    };

    const row1Features = [
        { icon: Award, title: "Zertifizierte Schulung", subtitle: "Vor Ort oder online — von anerkannten Bildungsträgern" },
        { icon: Users, title: "Persönliche Betreuung", subtitle: "Erfahrene Dozenten begleiten dich durch den gesamten Kurs" },
        { icon: Target, title: "Der sicherste Weg", subtitle: "Strukturierte Prüfungsvorbereitung mit höchster Bestehensquote" },
        { icon: Smartphone, title: "Inklusive Lern-App", subtitle: "Bereite dich bequem von überall mit dem Smartphone vor" },
    ];

    const row2Features = [
        { icon: CheckCircle2, title: "100% Kostenübernahme", subtitle: "Komplett vom Jobcenter oder der Arbeitsagentur bezahlt" },
        { icon: MessageSquare, title: "Mündliches Training", subtitle: "Gezielte Vorbereitung durch Fallbeispiele und Rollenspiele" },
        { icon: Briefcase, title: "Job-Netzwerk", subtitle: "Vermittlung an Top-Arbeitgeber in der Sicherheitsbranche" },
        { icon: BookOpen, title: "Einfach erklärt", subtitle: "Keine dicken Bücher — alles auf den Punkt zusammengefasst" },
    ];

    const MarqueeCard = ({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string, subtitle: string }) => {
        return (
            <div className="flex bg-white gap-3 sm:gap-4 shadow-sm border border-slate-100 p-4 sm:p-5 rounded-3xl w-[320px] sm:w-[400px] shrink-0 self-stretch">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" strokeWidth={2.5} />
                </div>
                <div className="flex flex-col flex-1 justify-center">
                    <span className="font-bold text-[14px] sm:text-[15px] text-slate-800 leading-tight mb-0.5">{title}</span>
                    <span className="text-[12px] sm:text-[13px] text-slate-500 font-medium leading-snug">{subtitle}</span>
                </div>
            </div>
        );
    };

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

    const SelectableCard = ({ title, subtitle, icon, lucideIcon, isSelected, onClick, colorClass = "text-[#3B65F5]" }: { title: string, subtitle?: string, icon?: string, lucideIcon?: React.ReactNode, isSelected: boolean, onClick: () => void, colorClass?: string }) => {
        return (
            <div 
                onClick={onClick}
                className={`cursor-pointer transition-all border-2 rounded-2xl p-4 flex flex-col gap-2 ${
                    isSelected 
                    ? 'border-[#3B65F5] bg-blue-50/50 shadow-md shadow-blue-500/10 scale-[1.02]' 
                    : 'border-slate-100 hover:border-slate-200 bg-white hover:bg-slate-50'
                }`}
            >
                <div className="flex items-center gap-3">
                    {icon && <span className="text-2xl shrink-0">{icon}</span>}
                    {lucideIcon && <div className="shrink-0">{lucideIcon}</div>}
                    <span className="font-semibold text-[16px] text-slate-800 leading-tight flex-1">{title}</span>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isSelected ? 'border-[#3B65F5] bg-[#3B65F5]' : 'border-slate-300'
                    }`}>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-white" strokeWidth={3} />}
                    </div>
                </div>
                {subtitle && (
                    <span className="text-[13px] text-slate-500 font-medium leading-tight ml-1 pl-10 border-l-2 border-transparent">{subtitle}</span>
                )}
            </div>
        );
    };

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 z-50 overflow-y-auto bg-white flex flex-col font-sans"
        >
            {/* Nav Card / Header area */}
            <div className="mx-4 mt-4 sm:mx-6 sm:mt-6 shrink-0 relative z-20">
                <div className={`rounded-[28px] shadow-xl overflow-hidden relative transition-colors duration-500 ${currentScreen === 3 && isQualified ? 'bg-emerald-500 shadow-emerald-500/20' : 'bg-[#3B65F5] shadow-blue-500/10'}`}>
                    
                    {/* Decorative background elements inside the card */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <div className="absolute -top-16 -right-16 w-64 h-64 bg-white/10 rounded-full blur-3xl opacity-50" />
                        <div className="absolute top-1/2 -left-10 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
                    </div>

                    <div className="px-6 pb-5 pt-4 relative z-10 flex flex-col justify-center min-h-[140px]">
                        {currentScreen === 0 && (
                            <div className="animate-fadeSlideIn">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="inline-block px-3 py-1 bg-white/20 rounded-full text-white text-xs font-bold whitespace-nowrap">100% Gefördert</span>
                                    <div className="flex gap-2 scale-[0.8] origin-right">
                                        <ProgressDots
                                            total={3}
                                            current={currentScreen}
                                        />
                                    </div>
                                </div>
                                <h1 className="text-[26px] sm:text-[32px] leading-[1.1] font-black text-white mb-2 tracking-tight">
                                    Kostenlos zum §34a Sachkundenachweis
                                </h1>
                            </div>
                        )}

                        {currentScreen === 1 && (
                            <div className="animate-fadeSlideIn">
                                <div className="flex justify-end mb-3">
                                    <div className="flex gap-2 scale-[0.8] origin-right">
                                        <ProgressDots
                                            total={3}
                                            current={currentScreen}
                                        />
                                    </div>
                                </div>
                                <h1 className="text-[26px] sm:text-[32px] leading-[1.1] font-black text-white mb-2 tracking-tight">
                                    Prüfe deine Förderberechtigung
                                </h1>
                            </div>
                        )}

                        {currentScreen === 2 && (
                            <div className="animate-fadeSlideIn">
                                <div className="flex justify-end mb-3">
                                    <div className="flex gap-2 scale-[0.8] origin-right">
                                        <ProgressDots
                                            total={3}
                                            current={currentScreen}
                                        />
                                    </div>
                                </div>
                                <h1 className="text-[26px] sm:text-[32px] leading-[1.1] font-black text-white mb-2 tracking-tight">
                                    Noch eine Frage...
                                </h1>
                                <p className="text-white/90 text-[14px] leading-relaxed font-medium">
                                    Fast geschafft!
                                </p>
                            </div>
                        )}

                        {currentScreen === 3 && isQualified && (
                            <div className="animate-fadeSlideIn">
                                <h1 className="text-[26px] sm:text-[32px] leading-[1.1] font-black text-white mb-2 tracking-tight">
                                    Super, du bist qualifiziert!
                                </h1>
                                <p className="text-white/90 text-[14px] leading-relaxed font-medium">
                                    Deine Weiterbildung kann kostenlos gefördert werden.
                                </p>
                            </div>
                        )}

                        {currentScreen === 3 && !isQualified && (
                            <div className="animate-fadeSlideIn">
                                <h1 className="text-[26px] sm:text-[32px] leading-[1.1] font-black text-white mb-2 tracking-tight">
                                    Du kannst trotzdem durchstarten!
                                </h1>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 flex flex-col relative z-10 w-full mb-32">
                {currentScreen === 0 && (
                    <div className="pt-4 pb-4 w-full flex flex-col animate-fadeUp">
                        {/* 3 Top Features block - Perfectly scaled and balanced (Reduced size by 6%) */}
                        <div className="px-6 flex flex-col gap-5 mt-5">
                            {[
                                {
                                    Icon: Banknote,
                                    title: "100% Kostenübernahme",
                                    description: "Komplett vom Jobcenter oder der Agentur bezahlt."
                                },
                                {
                                    Icon: Rocket,
                                    title: "Sicherer Job nach Prüfung",
                                    description: "Über 40.000 offene Stellen (z.B. Airport, Events)."
                                },
                                {
                                    Icon: TrendingUp,
                                    title: "Sehr guter Verdienst",
                                    description: "Krisensicher mit hohen steuerfreien Zuschlägen."
                                }
                            ].map((feature, idx) => (
                                <div key={idx} className="flex gap-3.5 items-start">
                                    <div className="w-[45px] h-[45px] rounded-[13px] bg-[#EEF2FF] flex items-center justify-center shrink-0">
                                        <feature.Icon className="w-[22px] h-[22px] text-[#3B65F5]" strokeWidth={2} />
                                    </div>
                                    <div className="flex-1 pt-0.5">
                                        <h4 className="text-slate-800 font-extrabold text-[15px] leading-tight mb-0.5 tracking-tight">{feature.title}</h4>
                                        <p className="text-slate-500 text-[13px] leading-snug">{feature.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Reviews Marquee Section - Balanced & Slower */}
                        <div className="mt-10 mb-8 overflow-hidden relative w-full">
                            <style>{`
                                @keyframes scroll-reviews-left {
                                    0% { transform: translateX(0); }
                                    100% { transform: translateX(-50%); }
                                }
                            `}</style>
                            <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
                            <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />

                            <div 
                                className="flex w-max"
                                style={{ animation: 'scroll-reviews-left 100s linear infinite' }}
                            >
                                {/* Group 1 */}
                                <div className="flex gap-4 pr-4 pl-4 sm:pl-6">
                                    {[
                                        { name: "Ali M.", text: "Jobcenter hat alles übernommen. Direkt bestanden!" },
                                        { name: "Sarah K.", text: "Dozenten nehmen sich Zeit. Genau was dran kommt." },
                                        { name: "Murat Y.", text: "Lernen am Handy war perfekt. Einfach top!" },
                                        { name: "David S.", text: "Training für die mündliche Prüfung war super." },
                                        { name: "Janina L.", text: "Endlich ein sicherer Job am Airport mit gutem Gehalt." }
                                    ].map((review, rIdx) => (
                                        <div key={`rev1-${rIdx}`} className="bg-white border border-[#F1F5F9] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] rounded-[20px] p-5 w-[260px] flex flex-col gap-2">
                                            <div className="flex gap-1 mb-1">
                                                {[1,2,3,4,5].map(s => (
                                                    <svg key={s} className="w-3.5 h-3.5 text-[#F59E0B] fill-current" viewBox="0 0 20 20">
                                                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                                    </svg>
                                                ))}
                                            </div>
                                            <p className="text-[14px] text-slate-600 italic leading-snug flex-1">"{review.text}"</p>
                                            <span className="text-[12px] font-bold text-slate-900 tracking-wide uppercase mt-1">{review.name}</span>
                                        </div>
                                    ))}
                                </div>
                                
                                {/* Group 2 (Identical for seamless looping) */}
                                <div className="flex gap-4 pr-4 pl-4 sm:pl-6" aria-hidden="true">
                                    {[
                                        { name: "Ali M.", text: "Jobcenter hat alles übernommen. Direkt bestanden!" },
                                        { name: "Sarah K.", text: "Dozenten nehmen sich Zeit. Genau was dran kommt." },
                                        { name: "Murat Y.", text: "Lernen am Handy war perfekt. Einfach top!" },
                                        { name: "David S.", text: "Training für die mündliche Prüfung war super." },
                                        { name: "Janina L.", text: "Endlich ein sicherer Job am Airport mit gutem Gehalt." }
                                    ].map((review, rIdx) => (
                                        <div key={`rev2-${rIdx}`} className="bg-white border border-[#F1F5F9] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] rounded-[20px] p-5 w-[260px] flex flex-col gap-2">
                                            <div className="flex gap-1 mb-1">
                                                {[1,2,3,4,5].map(s => (
                                                    <svg key={s} className="w-3.5 h-3.5 text-[#F59E0B] fill-current" viewBox="0 0 20 20">
                                                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                                    </svg>
                                                ))}
                                            </div>
                                            <p className="text-[14px] text-slate-600 italic leading-snug flex-1">"{review.text}"</p>
                                            <span className="text-[12px] font-bold text-slate-900 tracking-wide uppercase mt-1">{review.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                <div className={`${currentScreen !== 0 ? 'px-6 pt-6 pb-4' : 'px-6 pb-4'}`}>
                    {currentScreen === 1 && (
                        <div className="animate-fadeUp space-y-4">
                            <h3 className="font-bold text-[17px] text-slate-800 mb-1">
                                Bist du aktuell arbeitslos?
                            </h3>
                            <SelectableCard 
                                lucideIcon={
                                    <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center relative">
                                        <Briefcase className="w-6 h-6 text-blue-600" strokeWidth={2} />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="w-8 h-[2px] bg-red-500/80 rotate-[45deg] rounded-full" />
                                        </div>
                                    </div>
                                }
                                title="Ja, ich beziehe Leistungen (Jobcenter / Agentur)"
                                isSelected={isUnemployed === true}
                                onClick={() => handleEmploymentSelect(true)}
                            />
                            
                            <SelectableCard 
                                lucideIcon={
                                    <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
                                        <Briefcase className="w-6 h-6 text-blue-600" strokeWidth={2} />
                                    </div>
                                }
                                title="Nein, ich habe einen Job"
                                isSelected={isUnemployed === false}
                                onClick={() => handleEmploymentSelect(false)}
                            />
                        </div>
                    )}

                    {currentScreen === 2 && (
                        <div className="animate-fadeUp space-y-4">
                            <h3 className="font-bold text-[17px] text-slate-800 mb-1">
                                Wie gut sprichst du Deutsch?
                            </h3>
                            
                            <SelectableCard 
                                lucideIcon={
                                    <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
                                        <Languages className="w-6 h-6 text-blue-600" strokeWidth={2} />
                                    </div>
                                }
                                title="Muttersprachler"
                                isSelected={languageLevel === 'native'}
                                onClick={() => handleLanguageSelect('native')}
                            />
                            
                            <SelectableCard 
                                lucideIcon={
                                    <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
                                        <GraduationCap className="w-6 h-6 text-blue-600" strokeWidth={2} />
                                    </div>
                                }
                                title="B1 oder besser"
                                isSelected={languageLevel === 'b1_plus'}
                                onClick={() => handleLanguageSelect('b1_plus')}
                            />

                            <SelectableCard 
                                lucideIcon={
                                    <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
                                        <BookOpen className="w-6 h-6 text-blue-600" strokeWidth={2} />
                                    </div>
                                }
                                title="Unter B1"
                                isSelected={languageLevel === 'below_b1'}
                                onClick={() => handleLanguageSelect('below_b1')}
                            />
                        </div>
                    )}

                    {currentScreen === 3 && isQualified && (
                        <div className="animate-fadeUp flex flex-col items-center justify-center pt-8">
                            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                                <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                            </div>
                            <p className="text-center font-bold text-slate-800 text-[18px] mb-2">
                                Großartig!
                            </p>
                            <p className="text-center text-slate-500 font-medium text-[15px] max-w-sm">
                                Schreib uns auf WhatsApp — wir helfen dir, die Förderung zu beantragen.
                            </p>
                        </div>
                    )}

                    {currentScreen === 3 && !isQualified && (
                        <div className="animate-fadeUp space-y-6 pt-2">
                            <p className="text-slate-600 font-medium text-[15px] leading-relaxed">
                                Auch ohne Förderung kannst du auf unserer Lernplattform lernen. Starte deine Vorbereitung noch heute.
                            </p>
                            <div className="space-y-3">
                                <FeatureItem icon={BookOpen} title="700+ Prüfungsfragen" subtitle="Alle aktuellen Fragen der IHK zum Üben" />
                                <FeatureItem icon={Target} title="130+ Lektionen" subtitle="Verständliche Zusammenfassungen zu jedem Thema" />
                                <FeatureItem icon={CheckCircle2} title="Prüfungssimulationen" subtitle="Wie in der echten IHK-Prüfung testen" />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Buttons */}
                <div className="fixed bottom-0 left-0 right-0 px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 bg-gradient-to-t from-white via-white to-white/90 z-50">
                    <div className="flex flex-col gap-3">
                        {currentScreen === 0 && (
                            <button
                                onClick={nextScreen}
                                className="w-full font-bold py-4 px-6 rounded-2xl text-[17px] transition-all flex items-center justify-center gap-2 bg-[#3B65F5] text-white shadow-lg shadow-blue-500/20 active:bg-blue-600 active:shadow-blue-500/30"
                            >
                                <span>Jetzt Förderung prüfen</span>
                                <ChevronRight className="w-5 h-5" strokeWidth={3} />
                            </button>
                        )}
                        
                        {/* Im Screen 1+2 geht der User automatisch weiter beim Klick auf die Karten, 
                            daher brauchen wir keinen Weiter-Button, oder wir könnten einen deaktivierten anzeigen.
                            Aber "automatischer" Weitergang (bzw. via handleSelect) ist flüssiger. */}
                        
                        {currentScreen === 3 && isQualified && (
                            <button
                                onClick={handleWhatsAppClick}
                                className="w-full font-bold py-4 px-6 rounded-2xl text-[17px] transition-all flex items-center justify-center gap-2 bg-[#25D366] text-white shadow-lg shadow-emerald-500/20 active:bg-[#128C7E] active:scale-[0.98]"
                            >
                                <MessageCircle className="w-6 h-6" />
                                <span>Förderung über WhatsApp sichern</span>
                            </button>
                        )}

                        {currentScreen === 3 && !isQualified && (
                            <button
                                onClick={handleAppRedirect}
                                className="w-full font-bold py-4 px-6 rounded-2xl text-[17px] transition-all flex items-center justify-center gap-2 bg-[#3B65F5] text-white shadow-lg shadow-blue-500/20 active:bg-blue-600 active:shadow-blue-500/30"
                            >
                                <span>Mit dem Training starten</span>
                                <ChevronRight className="w-5 h-5" strokeWidth={3} />
                            </button>
                        )}
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
        @keyframes marquee-left {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-33.3333%); }
        }
        @keyframes marquee-right {
        .animate-fadeSlideIn { animation: fadeSlideIn 0.5s ease-out forwards; }
        .animate-fadeUp { animation: fadeUp 0.5s ease-out forwards; }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out forwards; }
      `}</style>
        </div>
    );
}
