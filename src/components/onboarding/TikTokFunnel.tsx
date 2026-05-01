import React, { useRef } from 'react';
import { ClipboardList, Gift, Languages, UserX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePostHog } from '../../contexts/PostHogProvider';
import { useApp } from '../../App';
import { getTikTokAnalyticsContext, resetTikTokFunnelSession, trackTikTokServerEvent } from '../../utils/tiktokAnalytics';

export default function TikTokFunnel() {
    const navigate = useNavigate();
    const { trackEvent } = usePostHog();
    const { toggleLanguage, language } = useApp();
    const containerRef = useRef<HTMLDivElement>(null);
    const initialTrackedRef = useRef(false);

    React.useEffect(() => {
        if (initialTrackedRef.current) return;
        initialTrackedRef.current = true;
        resetTikTokFunnelSession();
        const context = getTikTokAnalyticsContext('start', language, { source: 'tiktok' });
        trackEvent('tiktok_funnel_viewed', context);
        trackTikTokServerEvent('tiktok_funnel_viewed', context);
        trackEvent('tiktok_funnel_started', context);
        trackTikTokServerEvent('tiktok_funnel_started', context);
    }, [trackEvent, language]);

    const isAr = language === 'DE_AR';

    return (
        <div ref={containerRef} className="fixed inset-0 z-50 overflow-y-auto bg-[#F8FAFC] flex flex-col font-sans">
            {/* Nav Card / Header area - Vertikale Höhe um 15% reduziert */}
            <div className="w-full max-w-lg mx-auto px-3.5 mt-5 shrink-0 relative z-20 text-left">
                <div className="rounded-[30px] shadow-xl overflow-hidden relative transition-colors duration-500 bg-[#3B65F5] shadow-blue-500/10">
                    
                    {/* Decorative background elements inside the card */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <div className="absolute -top-16 -right-16 w-64 h-64 bg-white/10 rounded-full blur-3xl opacity-40" />
                        <div className="absolute top-1/2 -left-10 w-32 h-32 bg-white/10 rounded-full blur-2xl opacity-20" />
                    </div>

                    <div className="px-5 py-[14px] relative z-10 flex flex-col justify-center">
                        <div className="animate-fadeSlideIn">
                            {/* Logo & Login Area */}
                             <div className="flex items-center justify-between">
                                <h1 className="text-[25px] font-black tracking-tighter leading-tight text-white mb-0 ml-1">34a Master</h1>
                                
                                <button 
                                    onClick={() => navigate('/dashboard?auth=login')}
                                    className="text-[13px] font-medium text-white/90 hover:text-white transition-colors flex flex-col items-end gap-0.5"
                                >
                                    <span className="opacity-80">Bereits registriert?</span>
                                    <span className="font-bold underline decoration-white/40 underline-offset-2">Einloggen</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Hauptinhalt */}
            <div 
                className="flex-1 flex flex-col relative z-10 mx-8 sm:mx-6 pt-10 pb-10 max-w-lg md:mx-auto text-left transition-all duration-700 cubic-bezier(0.34, 1.56, 0.64, 1) origin-top scale-100"
            >
                <div className="animate-fadeUp space-y-7 flex-1">
                    
                    <div className="space-y-[22px]">
                        {/* Headline */}
                        <div className="space-y-2">
                            <h1 className="text-[30.4px] sm:text-[36.1px] leading-[1.05] font-black text-[#0F172A] tracking-tight text-left">
                                Würdest du die echte IHK <span className="text-[#3B65F5]">§34a-Prüfung</span> heute bestehen?
                            </h1>
                            {isAr && (
                                <p dir="rtl" className="text-[17.1px] sm:text-[20.4px] font-bold text-slate-600 leading-tight animate-reveal text-left">
                                    هل ستنجح اليوم في امتحان <span dir="ltr">IHK §34a</span> الحقيقي؟
                                </p>
                            )}
                        </div>

                        {/* Toggle Style */}
                        <div className="flex justify-start">
                            <div className="bg-[#1E293B] rounded-[28px] p-1 inline-flex relative overflow-hidden h-[46px] items-center shadow-sm">
                                <div 
                                    className="absolute top-1 bottom-1 rounded-[24px] bg-white transition-all duration-300 ease-out shadow-sm"
                                    style={{ 
                                        left: '4px',
                                        width: 'calc(50% - 4px)',
                                        transform: isAr ? 'translateX(100%)' : 'translateX(0%)'
                                    }}
                                />
                                
                                <button
                                    onClick={() => {
                                        if (!isAr) return;
                                        trackEvent('language_toggled', getTikTokAnalyticsContext('start', language, { from_language: language, to_language: 'DE' }));
                                        trackEvent('tiktok_language_toggled', getTikTokAnalyticsContext('start', language, { from_language: language, to_language: 'DE' }));
                                        trackTikTokServerEvent('tiktok_language_toggled', getTikTokAnalyticsContext('start', language, { from_language: language, to_language: 'DE' }));
                                        toggleLanguage();
                                    }}
                                    className={`relative z-10 px-6.5 py-1.5 text-[13.3px] font-extrabold transition-colors duration-300 flex items-center justify-center min-w-[85px] ${!isAr ? 'text-[#0F172A]' : 'text-slate-400'}`}
                                >
                                    DE
                                </button>
                                <button
                                    onClick={() => {
                                        if (isAr) return;
                                        trackEvent('language_toggled', getTikTokAnalyticsContext('start', language, { from_language: language, to_language: 'DE_AR' }));
                                        trackEvent('tiktok_language_toggled', getTikTokAnalyticsContext('start', language, { from_language: language, to_language: 'DE_AR' }));
                                        trackTikTokServerEvent('tiktok_language_toggled', getTikTokAnalyticsContext('start', language, { from_language: language, to_language: 'DE_AR' }));
                                        toggleLanguage();
                                    }}
                                    className={`relative z-10 px-6.5 py-1.5 text-[15.2px] font-extrabold transition-colors duration-300 flex items-center justify-center gap-2 min-w-[104px] ${isAr ? 'text-[#3B65F5]' : 'text-slate-400'}`}
                                >
                                    <Languages className={`w-[17px] h-[17px] ${isAr ? 'text-[#3B65F5]' : 'text-slate-400'}`} />
                                    <span className="mb-0.5">عربي</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Einstufungstest Karte */}
                    <div className="relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-[#3B65F5] to-blue-400 rounded-[28px] blur opacity-10 group-hover:opacity-20 transition duration-1000"></div>
                        
                        <div className="relative bg-white p-7 rounded-[28px] shadow-[0_8px_40px_rgba(59,101,245,0.08)] border border-blue-50/50 space-y-7 overflow-hidden">
                            <div className="text-left space-y-3">
                                <h4 className="text-[#0F172A] font-extrabold text-[16.1px] leading-tight tracking-tight">
                                    Teste dich mit 9 typischen Prüfungsfragen
                                </h4>
                                {isAr && (
                                    <p dir="rtl" className="text-[15.3px] font-bold text-slate-600 leading-tight animate-reveal">
                                        اختبر نفسك مع 9 أسئلة امتحان نموذجية
                                    </p>
                                )}
                                <div className="space-y-2 text-slate-500 text-[13.3px] leading-relaxed font-bold">
                                    <p className="flex items-center gap-2">
                                        <Gift className="h-4 w-4 text-[#3B65F5]" strokeWidth={2.5} />
                                        <span>Kostenloser Prüfungscheck</span>
                                    </p>
                                    <p className="flex items-center gap-2">
                                        <Languages className="h-4 w-4 text-[#3B65F5]" strokeWidth={2.5} />
                                        <span>Deutsch + Arabisch</span>
                                    </p>
                                    <p className="flex items-center gap-2">
                                        <UserX className="h-4 w-4 text-[#3B65F5]" strokeWidth={2.5} />
                                        <span>Keine Anmeldung nötig</span>
                                    </p>
                                </div>
                                {isAr && (
                                    <p dir="rtl" className="text-[12.6px] font-medium text-slate-400 leading-tight mt-1 animate-reveal">
                                        يستغرق حوالي 3 دقائق · ألماني + عربي · بدون تسجيل.
                                    </p>
                                )}
                            </div>

                            <button
                                onClick={() => {
                                    const context = getTikTokAnalyticsContext('start', language, {
                                        cta: 'pruefungscheck_starten',
                                    });
                                    trackEvent('tiktok_funnel_cta_clicked', context);
                                    trackTikTokServerEvent('tiktok_funnel_cta_clicked', context);
                                    navigate('/tiktok/loading');
                                }}
                                className="w-full font-black min-h-[57px] px-6 rounded-[28px] text-[17.1px] transition-all flex flex-col items-center justify-center bg-[#3B65F5] hover:bg-[#3256D6] text-white active:scale-[0.98] shadow-lg shadow-blue-500/20 relative overflow-hidden group/btn py-2"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover/btn:animate-shimmer" />
                                
                                <div className="flex flex-col items-center justify-center relative z-10">
                                    <div className="flex items-center gap-3">
                                        <span>Prüfungscheck starten</span>
                                        <ClipboardList className="w-[19px] h-[19px]" strokeWidth={2.5} />
                                    </div>
                                    {isAr && (
                                        <span dir="rtl" className="text-[13.6px] opacity-90 font-bold animate-reveal mt-0.5">
                                            ابدأ فحص الامتحان المجاني
                                        </span>
                                    )}
                                </div>
                            </button>

                        </div>
                    </div>
                </div>

                {/* Trust Element */}
                <div className="mt-9 pb-7 flex flex-col items-center gap-2 animate-fadeUp shrink-0">
                    <div className="flex -space-x-1.5">
                        <div className="w-[26.6px] h-[26.6px] rounded-full border-2 border-white bg-blue-100 flex items-center justify-center text-[8.5px] font-bold text-blue-600 shadow-sm">AM</div>
                        <div className="w-[26.6px] h-[26.6px] rounded-full border-2 border-white bg-emerald-100 flex items-center justify-center text-[8.5px] font-bold text-emerald-600 shadow-sm">SK</div>
                        <div className="w-[26.6px] h-[26.6px] rounded-full border-2 border-white bg-orange-100 flex items-center justify-center text-[8.5px] font-bold text-orange-600 shadow-sm">MY</div>
                    </div>
                    <div className="text-center space-y-0.5">
                        <p className="text-[12.3px] text-slate-500 font-bold">
                            Für arabischsprachige Prüflinge in Deutschland gemacht.
                        </p>
                        {isAr && (
                            <p dir="rtl" className="text-[11.7px] text-slate-400 font-black animate-reveal">
                                مصنوع للمتقدمين العرب في ألمانيا.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes fadeUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fadeUp { animation: fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                
                @keyframes fadeSlideIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fadeSlideIn { animation: fadeSlideIn 0.5s ease-out forwards; }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .fade-in { animation: fadeIn 0.5s ease-out forwards; }

                @keyframes slideInFromBottom {
                    from { transform: translateY(8px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .slide-in-from-bottom-2 { animation: slideInFromBottom 0.5s ease-out forwards; }

                @keyframes reveal {
                    from { 
                        opacity: 0; 
                        transform: translateY(-12px); 
                        filter: blur(8px);
                    }
                    to { 
                        opacity: 1; 
                        transform: translateY(0); 
                        filter: blur(0);
                    }
                }
                .animate-reveal { animation: reveal 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
                
                @keyframes shimmer {
                    100% { transform: translateX(100%); }
                }
                .animate-shimmer { animation: shimmer 1.5s infinite; }
            `}</style>
        </div>
    );
}
