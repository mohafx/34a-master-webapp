import { useState, useEffect, cloneElement } from 'react';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../App';
import { usePostHog } from '../contexts/PostHogProvider';
import { X, Crown, Check, MessageCircle, Lightbulb, Infinity, ShieldCheck, Rocket, Languages, ChevronDown, Users, BookOpen, Timer, Blocks, Calendar, Mic, Sparkles, Pencil, GraduationCap, Layers, Target, Trophy } from 'lucide-react';
import { EmbeddedPayment } from './EmbeddedPayment';

const SloganSlideshow = ({ showArabic }: { showArabic: boolean }) => {
    const slogans = [
        { de: 'Lerne smart.', de2: 'Bestehe sicher.', ar1: 'تعلم بذكاء.', ar2: 'انجح بثقة.' },
        { de: 'Wissen statt', de2: 'pures Glück.', ar1: 'المعرفة بدلاً من', ar2: 'مجرد الحظ.' },
        { de: 'Einfach erklärt.', de2: 'Sicher gelernt.', ar1: 'شرح بسيط.', ar2: 'تعلم آمن.' },
        { de: 'Dein Erfolg.', de2: 'Unser Fokus.', ar1: 'نجاحك.', ar2: 'تركيزنا.' },
        { de: 'Top Training.', de2: 'Top Ergebnis.', ar1: 'تدريب ممتاز.', ar2: 'نتيجة ممتازة.' },
        { de: 'Bestens bereit.', de2: 'Prüfung fit.', ar1: 'مستعد تماماً.', ar2: 'جاهز للامتحان.' }
    ];

    const [currentSlogan, setCurrentSlogan] = useState(0);
    const [charIndex, setCharIndex] = useState(0);
    const [fadeState, setFadeState] = useState<'typing' | 'waiting' | 'out'>('typing');

    useEffect(() => {
        setCharIndex(0);
        setFadeState('typing');
    }, [currentSlogan]);

    useEffect(() => {
        if (fadeState === 'out') {
            const tm = setTimeout(() => {
                setCurrentSlogan((prev) => (prev + 1) % slogans.length);
            }, 500);
            return () => clearTimeout(tm);
        }

        if (fadeState === 'waiting') {
            const tm = setTimeout(() => {
                setFadeState('out');
            }, 3000);
            return () => clearTimeout(tm);
        }

        if (fadeState === 'typing') {
            const slogan = slogans[currentSlogan];
            const totalChars = slogan.de.length + slogan.de2.length;

            if (charIndex < totalChars) {
                const tm = setTimeout(() => {
                    setCharIndex((prev) => prev + 1);
                }, 90);
                return () => clearTimeout(tm);
            } else {
                setFadeState('waiting');
            }
        }
    }, [fadeState, charIndex, currentSlogan]);

    const slogan = slogans[currentSlogan];
    const line1 = slogan.de;
    const line2 = slogan.de2;

    const showLine1 = charIndex <= line1.length ? line1.slice(0, charIndex) : line1;
    const showLine2 = charIndex > line1.length ? line2.slice(0, charIndex - line1.length) : '';

    return (
        <>
            <div className="relative h-[64px] sm:h-[72px] flex flex-col justify-center">
                <div className={`transition-opacity duration-500 ${fadeState === 'out' ? 'opacity-0' : 'opacity-100'}`}>
                    <h2 className="text-[21.5px] sm:text-2xl font-black leading-tight tracking-tight text-white">
                        {showLine1}
                        {charIndex <= line1.length && fadeState === 'typing' && <span className="animate-pulse text-blue-300">|</span>}
                        <br />
                        {charIndex > line1.length ? (
                            <>
                                {showLine2}
                                {fadeState === 'typing' && <span className="animate-pulse text-blue-300">|</span>}
                            </>
                        ) : (
                            <span className="opacity-0">.</span>
                        )}
                    </h2>
                </div>
            </div>

            <div className="mt-3 pt-3 border-t border-white/10">
                <p className="text-blue-50 font-normal text-sm opacity-75 leading-snug">
                    Hol dir jetzt strukturiertes Prüfungswissen statt chaotisches Auswendiglernen
                </p>
            </div>

            {showArabic && (
                <div className="mt-2 pt-2 border-t border-white/10 relative h-[48px] flex flex-col justify-center" dir="rtl">
                    <div className={`transition-opacity duration-500 ease-in-out ${fadeState === 'out' ? 'opacity-0' : 'opacity-100'}`}>
                        <p className="text-base font-bold text-white leading-none mb-1">
                            {slogan.ar1} {slogan.ar2}
                        </p>
                        <p className="text-[10px] text-blue-100 font-medium opacity-70">
                            احصل الآن على معرفة منظمة بدلاً من الحفظ العشوائي
                        </p>
                    </div>
                </div>
            )}
        </>
    );
};

interface PaywallDialogProps {
    onClose: () => void;
    featureName?: string;
}

export function PaywallDialog({ onClose, featureName }: PaywallDialogProps) {
    const { openCheckout, loading: subscriptionLoading, processPaymentSuccess } = useSubscription();
    const { user } = useAuth();
    const { language, openAuthDialog, toggleLanguage } = useApp();
    const { trackEvent } = usePostHog();
    const showArabic = language === 'DE_AR';

    const [selectedPlan, setSelectedPlan] = useState<'monthly' | '6months'>('6months');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [successMode, setSuccessMode] = useState(false);
    const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
    const [shakeTerms, setShakeTerms] = useState(false);

    // Collapsible state
    const [earlyAdopterOpen, setEarlyAdopterOpen] = useState(false);
    const [valueStackOpen, setValueStackOpen] = useState(window.innerWidth >= 768);
    const [manuallyToggledEA, setManuallyToggledEA] = useState(false);
    const [manuallyToggledVS, setManuallyToggledVS] = useState(false);

    // Check if cards should auto-open on scroll
    const scrollContainerRef = useState<HTMLDivElement | null>(null);
    const earlyAdopterRef = useState<HTMLDivElement | null>(null);
    const valueStackRef = useState<HTMLDivElement | null>(null);

    // Helper to set refs (since we can't use useRef inside callback refs easily in TS for this pattern)
    // We'll use standard refs for simplicity
    const scrollRef = { current: null as HTMLDivElement | null };
    const eaRef = { current: null as HTMLDivElement | null };
    const vsRef = { current: null as HTMLDivElement | null };

    // Function to run on scroll
    const checkScroll = () => {
        if (!scrollRef.current) return;

        // Auto-open logic for "Was du bekommst" (Benefits Stack)
        if (vsRef.current && !manuallyToggledVS && !valueStackOpen) {
            const rect = vsRef.current.getBoundingClientRect();
            const parentRect = scrollRef.current.getBoundingClientRect();

            // Sanftes Öffnen: Trigger when the section header is visible
            if (rect.top < parentRect.bottom - 100) {
                setValueStackOpen(true);
            }
        }
    };

    useEffect(() => {
        // Initial check with small delay to allow render
        setTimeout(checkScroll, 100);
    }, []);

    // Track paywall shown on mount
    useEffect(() => {
        trackEvent('paywall_shown', {
            feature_name: featureName,
            source: window.location.hash
        });
    }, []);

    const handleCheckout = async () => {
        if (!user) {
            onClose();
            openAuthDialog('register', {
                de: 'Bitte erst anmelden oder registrieren, um Premium-Inhalte freizuschalten.',
                ar: 'يرجى تسجيل الدخول أو إنشاء حساب أولاً لفتح المحتوى المميز.'
            });
            return;
        }

        if (!hasAcceptedTerms) {
            setShakeTerms(true);
            setTimeout(() => setShakeTerms(false), 500);
            return;
        }

        trackEvent('upgrade_clicked', {
            plan: selectedPlan,
            price: selectedPlan === '6months' ? 49 : 19.90,
            source: 'paywall_dialog_redesign'
        });

        setLoading(true);
        setError('');
        try {
            const secret = await openCheckout(selectedPlan);
            if (secret && typeof secret === 'string' && secret.length > 0) {
                setClientSecret(secret);
            } else {
                throw new Error("Invalid session created");
            }
        } catch (err: any) {
            console.error("Checkout error:", err);
            // DEBUG: Show actual error message to user
            let errorMessage = err?.message || JSON.stringify(err) || "Unbekannter Fehler";

            const friendlyMessage = showArabic
                ? 'Ein Fehler ist aufgetreten. Bitte versuche es später erneut oder kontaktiere den Support.\nحدث خطأ. يرجى المحاولة مرة أخرى لاحقاً أو التواصل مع الدعم.'
                : 'Ein Fehler ist aufgetreten. Bitte versuche es später erneut oder kontaktiere den Support.';
            setError(friendlyMessage);
            setLoading(false);
        }
    };

    const handlePaymentComplete = async () => {
        setSuccessMode(true);
        await processPaymentSuccess();
        setTimeout(() => {
            onClose();
        }, 2000);
    };

    const benefitGroups = [
        {
            nameDE: 'Lernen & Prüfung',
            nameAR: 'التعلم والامتحان',
            items: [
                {
                    icon: <Pencil size={20} />,
                    titleDE: 'Prüfungsfragen',
                    titleAR: 'أسئلة الامتحان',
                    descDE: 'Nach Themen sortiert, mit Erklärungen',
                    descAR: 'مرتبة حسب المواضيع مع شرح',
                    badge: '700+',
                    badgeType: 'quantity'
                },
                {
                    icon: <GraduationCap size={20} />,
                    titleDE: 'Prüfungssimulation',
                    titleAR: 'محاكاة الامتحان',
                    descDE: 'Trainiere Zeit & Format wie in der Prüfung',
                    descAR: 'تدرب على الوقت والتنسيق كما في الامتحان',
                    badge: 'IHK-NAH',
                    badgeType: 'quality'
                },
                {
                    icon: <BookOpen size={20} />,
                    titleDE: 'Module',
                    titleAR: 'الوحدات',
                    descDE: 'Komplettes Prüfungswissen freigeschaltet',
                    descAR: 'تم فتح معرفة الامتحان كاملة',
                    badge: '9 MODULE',
                    badgeType: 'quantity'
                },
                {
                    icon: <Target size={20} />,
                    titleDE: 'Lernplan',
                    titleAR: 'خطة دراسية',
                    descDE: 'Schritt für Schritt bis zur Prüfung',
                    descAR: 'خطوة بخطوة حتى الامتحان',
                    badge: 'GEFÜHRT',
                    badgeType: 'quality'
                },
                {
                    icon: <Layers size={20} />,
                    titleDE: 'Mündliche Prüfung',
                    titleAR: 'الامتحان الشفهي',
                    descDE: 'Typische Fragen + sichere Antworten',
                    descAR: 'أسئلة شائعة + إجابات آمنة',
                    badge: 'LERNKARTEN',
                    badgeType: 'quality'
                }
            ]
        }
    ];

    return (
        <div
            className="fixed inset-0 z-50 overflow-y-auto bg-slate-100/90 dark:bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-300 flex min-h-screen sm:min-h-full items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={onClose}
        >
            <div
                className="relative transform bg-[#F2F4F6] dark:bg-slate-950 sm:rounded-[3rem] text-left shadow-2xl transition-all w-full sm:max-w-[420px] md:max-w-[950px] h-[95vh] md:h-auto md:max-h-[90vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-300 ease-out overflow-hidden flex flex-col my-auto border border-white/50 dark:border-slate-800"
                onClick={(e) => e.stopPropagation()}
            >

                {/* Content Container (Header + Body are both here to scroll together) */}
                <div
                    className="flex-1 overflow-y-auto px-3 sm:px-4 pb-10 relative z-0"
                    ref={(el) => { if (el) { scrollRef.current = el; el.addEventListener('scroll', checkScroll); } }}
                >

                    {/* Header - Matching Dashboard Style Exact Copy */}
                    <div className="bg-[#2663EB] p-5 sm:p-6 relative overflow-hidden z-10 mt-3 sm:mt-4 mb-5 rounded-3xl text-white shadow-xl shadow-blue-500/20">


                        <div className="flex flex-row items-center justify-between relative z-10 mb-6 md:mb-8">
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                <span className="text-[22.5px] sm:text-2xl md:text-3xl font-black text-white tracking-tight whitespace-nowrap">34a Master</span>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleLanguage();
                                    }}
                                    className={`w-[43px] h-[43px] rounded-full flex items-center justify-center transition-all active:scale-95 shadow-sm ${language === 'DE_AR'
                                        ? 'bg-white/30 text-white shadow-inner'
                                        : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                                        }`}
                                >
                                    <Languages size={22} strokeWidth={2} />
                                </button>

                                {/* Close Button (Replacing Settings) */}
                                <button
                                    onClick={onClose}
                                    className="w-[43px] h-[43px] rounded-full flex items-center justify-center shadow-sm border-2 border-white/20 transition-transform active:scale-95 bg-white/10 hover:bg-white/20 text-white"
                                >
                                    <X size={22} strokeWidth={2.5} />
                                </button>
                            </div>
                        </div>



                        {/* Banner Content - Slideshow */}
                        <div className="relative z-10 min-h-[80px] md:min-h-[100px] md:mt-2">
                            <SloganSlideshow showArabic={showArabic} />
                        </div>
                    </div>
                    {successMode ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center animate-in zoom-in duration-300">
                            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-6">
                                <Check size={40} className="text-green-600 dark:text-green-400" strokeWidth={3} />
                            </div>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
                                Zahlung erfolgreich!
                            </h3>
                            <p className="text-slate-500 dark:text-slate-400">
                                Dein Premium-Zugang wird aktiviert...
                            </p>
                        </div>
                    ) : clientSecret ? (
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl shadow-sm">
                            <button
                                onClick={() => {
                                    setClientSecret(null);
                                    setLoading(false);
                                }}
                                className="mb-4 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1"
                            >
                                ← Zurück
                            </button>
                            <EmbeddedPayment
                                clientSecret={clientSecret}
                                onComplete={handlePaymentComplete}
                            />
                        </div>
                    ) : (
                        <div className="md:grid md:grid-cols-2 md:gap-x-12 md:gap-y-6 md:items-start max-w-full">
                            {/* Left Column: Benefits */}
                            <div className="space-y-6">
                                {/* Benefits Stack - Collapsible */}
                                <div className="relative mb-6 mt-10" ref={(el) => { eaRef.current = el; }}>
                                    {/* Premium Badge Centered & Connected */}
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-1.5 rounded-full border-2 border-[#F2F4F6] dark:border-slate-950 shadow-lg whitespace-nowrap">
                                        <Crown size={12} className="text-yellow-300 fill-yellow-300" />
                                        <span className="text-[10px] font-black text-white tracking-widest uppercase">Premium Zugang</span>
                                    </div>

                                    <div className="relative bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-inner-sm border border-slate-200/60 dark:border-slate-800 overflow-hidden pt-7">
                                        <div
                                            className="flex items-center justify-between relative cursor-pointer group"
                                            onClick={() => {
                                                setValueStackOpen(!valueStackOpen);
                                                setManuallyToggledVS(true);
                                            }}
                                            ref={(el) => { vsRef.current = el; }}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 shrink-0">
                                                    <Trophy size={20} className="fill-blue-600/20" />
                                                </div>
                                                <div className="flex flex-col text-left">
                                                    <h3 className="font-bold text-slate-900 dark:text-white leading-tight text-[15px]">
                                                        Was du bekommst
                                                    </h3>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                                            Alles für deinen Erfolg
                                                        </p>
                                                        {showArabic && <span className="text-[10px] opacity-60 ml-1" dir="rtl">ما ستحصل عليه</span>}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all duration-300 ${valueStackOpen
                                                ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                                : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'}`}>
                                                <span className="text-[11px] font-bold">
                                                    {valueStackOpen ? 'Schließen' : 'Details'}
                                                </span>
                                                <ChevronDown size={14} className={`transition-transform duration-300 ${valueStackOpen ? 'rotate-180' : ''}`} strokeWidth={2.5} />
                                            </div>
                                        </div>

                                        <div className={`grid transition-all duration-500 ease-out ${valueStackOpen ? 'grid-rows-[1fr] opacity-100 mt-5 pt-5 border-t border-slate-100 dark:border-slate-800' : 'grid-rows-[0fr] opacity-0'}`}>
                                            <div className="overflow-hidden">
                                                {/* Benefits Blocks */}
                                                <div className="space-y-6 pb-1">
                                                    {benefitGroups.map((group, groupIdx) => (
                                                        <div key={groupIdx} className={`space-y-3 ${groupIdx > 0 ? 'mt-6' : ''}`}>
                                                            <div className="flex flex-col px-1">
                                                                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                                                    {group.nameDE}
                                                                </p>
                                                            </div>
                                                            <div className="space-y-3">
                                                                {group.items.map((item: any, i) => (
                                                                    <div
                                                                        key={i}
                                                                        className="flex items-start gap-3 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                                                                    >
                                                                        <div className="relative shrink-0 mt-0.5">
                                                                            <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                                                                                {cloneElement(item.icon as any, { size: 16 })}
                                                                            </div>
                                                                            <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-white dark:border-slate-900 flex items-center justify-center">
                                                                                <Check size={8} strokeWidth={4} className="text-white" />
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex-1 pt-0.5">
                                                                            <div className="flex items-center gap-2 mb-0.5">
                                                                                <span className="text-[13px] font-bold text-slate-700 dark:text-slate-200">
                                                                                    {item.titleDE}
                                                                                </span>
                                                                                <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide">
                                                                                    {item.badge}
                                                                                </span>
                                                                            </div>
                                                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                                                                                {item.descDE}
                                                                            </p>
                                                                            {showArabic && (
                                                                                <div className="mt-1 opacity-70 border-t border-slate-100 dark:border-slate-800/50 pt-1" dir="rtl">
                                                                                    <p className="text-[10px]">{item.titleAR} - {item.descAR}</p>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Plans & Actions */}
                            <div className="space-y-6">
                                {/* Combined Early Adopter & 6 Months Plan Card */}
                                <div
                                    className={`mb-6 rounded-[2rem] transition-all relative overflow-hidden group p-0.5 ${selectedPlan === '6months'
                                        ? 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-xl shadow-blue-500/20 scale-[1.02]'
                                        : 'bg-slate-200 dark:bg-slate-800 scale-100 hover:scale-[1.01]'
                                        }`}
                                    onClick={() => setSelectedPlan('6months')}
                                >
                                    <div className="rounded-[1.85rem] overflow-hidden bg-white dark:bg-slate-900">
                                        {/* Early Adopter Section - Top Half */}
                                        <div className="relative bg-gradient-to-br from-[#FFF8F3] to-[#FFF5EB] dark:from-slate-900 dark:to-slate-900 p-5 border-b border-orange-100/50 dark:border-orange-900/30">
                                            <div
                                                className="flex items-center justify-between relative cursor-pointer group/ea"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEarlyAdopterOpen(!earlyAdopterOpen);
                                                    setManuallyToggledEA(true);
                                                }}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-100 to-amber-100 dark:from-orange-900/30 dark:to-amber-900/20 flex items-center justify-center text-orange-600 dark:text-orange-500 shrink-0 shadow-sm border border-orange-200/50 dark:border-orange-500/10">
                                                        <Rocket size={18} className="fill-orange-500/20" />
                                                    </div>
                                                    <div className="flex flex-col text-left">
                                                        <h3 className="font-bold text-slate-900 dark:text-white leading-tight text-[12px]">
                                                            Early-Adopter
                                                        </h3>
                                                        <div className="flex flex-col mt-0.5">
                                                            <p className="text-[9px] font-bold text-orange-600 dark:text-orange-500 tracking-tight uppercase">
                                                                Nur für kurze Zeit
                                                            </p>
                                                            {showArabic && (
                                                                <p className="text-[7.5px] font-bold text-orange-500/80 dark:text-orange-400/80 tracking-tight" dir="rtl">
                                                                    لفترة محدودة فقط
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all duration-300 ${earlyAdopterOpen
                                                    ? 'bg-orange-100/50 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400'
                                                    : 'bg-white text-orange-600 dark:bg-slate-800 dark:text-orange-400 shadow-sm'}`}>
                                                    <span className="text-[9px] font-bold">
                                                        {earlyAdopterOpen ? 'Schließen' : 'Weitere Vorteile'}
                                                    </span>
                                                    <ChevronDown size={14} className={`transition-transform duration-300 ${earlyAdopterOpen ? 'rotate-180' : ''}`} strokeWidth={2.5} />
                                                </div>
                                            </div>

                                            <div className={`grid transition-all duration-500 ease-out ${earlyAdopterOpen ? 'grid-rows-[1fr] opacity-100 mt-5 pt-5 border-t border-orange-200/50 dark:border-orange-900/30' : 'grid-rows-[0fr] opacity-0'}`}>
                                                <div className="overflow-hidden">
                                                    <div className="space-y-4 pb-1">
                                                        <div className="flex items-start gap-3">
                                                            <div className="mt-1 w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0">
                                                                <MessageCircle size={14} />
                                                            </div>
                                                            <div>
                                                                <p className="text-[13px] font-bold text-slate-800 dark:text-slate-200">WhatsApp-Support</p>
                                                                <p className="text-[11px] text-slate-500 dark:text-slate-400">Direkter Draht • Antwort binnen 24h</p>
                                                                {showArabic && (
                                                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 opacity-70" dir="rtl">
                                                                        دعم واتساب - مساعدة سريعة إذا واجهت مشكلة
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-start gap-3">
                                                            <div className="mt-1 w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0">
                                                                <Lightbulb size={14} />
                                                            </div>
                                                            <div>
                                                                <p className="text-[13px] font-bold text-slate-800 dark:text-slate-200">Feature-Wünsche</p>
                                                                <p className="text-[11px] text-slate-500 dark:text-slate-400">Gestalte die App mit • Deine Wünsche zuerst</p>
                                                                {showArabic && (
                                                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 opacity-70" dir="rtl">
                                                                        طلبات الميزات - شارك في تطوير التطبيق • أولوياتك أولاً
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-start gap-3">
                                                            <div className="mt-1 w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0">
                                                                <Infinity size={14} />
                                                            </div>
                                                            <div>
                                                                <p className="text-[13px] font-bold text-slate-800 dark:text-slate-200">Einmalzahlung statt Abo</p>
                                                                <p className="text-[11px] text-slate-500 dark:text-slate-400">Zugriff für 6 Monate für weniger als die Hälfte des Preises</p>
                                                                {showArabic && (
                                                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 opacity-70" dir="rtl">
                                                                        دفع لمرة واحدة بدلاً من الاشتراك - وصول لمدة 6 أشهر بأقل من نصف السعر
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Pricing Section - Bottom Half */}
                                        <div className="p-5 flex items-center justify-between relative">
                                            <div className="flex flex-col gap-2">
                                                <div className="flex items-baseline gap-2">
                                                    <span className="font-black text-[18px] text-slate-900 dark:text-white tracking-tight leading-none">€49</span>
                                                    <span className="font-bold text-[10px] text-slate-400 dark:text-slate-500">Early-Adopter-Preis statt <span className="line-through">€119</span></span>
                                                </div>

                                                <div className="flex flex-col gap-0.5">
                                                    <p className="font-black text-[10px] text-slate-900 dark:text-white leading-tight">Einmalzahlung für 6 Monate</p>
                                                    <p className="text-[8px] font-bold text-slate-500 dark:text-slate-400">
                                                        Kein Abo • Voller Zugriff
                                                    </p>
                                                </div>

                                                {showArabic && (
                                                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 mt-1" dir="rtl">
                                                        <p className="text-xs font-bold mb-0.5">6 أشهر - دفعة واحدة</p>
                                                        <p className="text-[10px] opacity-70">بدون اشتراك • وصول كامل</p>
                                                    </div>
                                                )}
                                            </div>

                                            {selectedPlan === '6months' && (
                                                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center shadow-md">
                                                    <Check size={14} strokeWidth={4} className="text-white" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Monthly Plan Divider */}
                                <div className="space-y-4 mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Oder</span>
                                        <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
                                    </div>
                                </div>

                                {/* Monthly Plan */}
                                <button
                                    onClick={() => setSelectedPlan('monthly')}
                                    className={`w-full p-5 rounded-3xl transition-all text-left flex items-center justify-between group border-2 ${selectedPlan === 'monthly'
                                        ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-500 shadow-md'
                                        : 'bg-transparent border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                        }`}
                                >
                                    <div className="flex flex-col">
                                        <p className="font-bold text-slate-800 dark:text-slate-200 text-[12px] mb-1">Monatlich kündbar</p>
                                        <div className="flex items-baseline gap-1.5">
                                            <span className="font-black text-[18px] text-slate-900 dark:text-white">€19,90</span>
                                            <span className="text-[10px] font-medium text-slate-500">/ Monat</span>
                                        </div>
                                        <p className="text-[8px] text-slate-400 mt-2 font-medium">
                                            Jederzeit kündbar • Laufende Updates
                                        </p>

                                        {showArabic && (
                                            <div className="mt-2 pt-2 border-t border-slate-200/50 dark:border-slate-800/50" dir="rtl">
                                                <p className="text-[8px] font-medium opacity-80">قابل للإلغاء شهرياً</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedPlan === 'monthly'
                                        ? 'border-blue-500 bg-blue-500'
                                        : 'border-slate-300 dark:border-slate-600'
                                        }`}>
                                        {selectedPlan === 'monthly' && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                                    </div>
                                </button>

                                {/* Actions Area */}
                                <div className="mt-6">
                                    {/* Terms Checkbox */}
                                    <div className={`mb-4 flex items-start gap-3 px-1 transition-all ${shakeTerms ? 'animate-shake' : ''}`}>
                                        <div className="pt-0.5">
                                            <button
                                                onClick={() => setHasAcceptedTerms(!hasAcceptedTerms)}
                                                className={`w-4 h-4 rounded border transition-all flex items-center justify-center ${hasAcceptedTerms
                                                    ? 'bg-blue-600 border-blue-600'
                                                    : 'border-slate-300 dark:border-slate-600 hover:border-blue-400'
                                                    }`}
                                            >
                                                {hasAcceptedTerms && <Check size={12} strokeWidth={4} className="text-white" />}
                                            </button>
                                        </div>
                                        <p className="text-[11px] leading-tight text-slate-500 dark:text-slate-400 cursor-pointer" onClick={() => setHasAcceptedTerms(!hasAcceptedTerms)}>
                                            Ich willige in den sofortigen Zugang ein und bestätige, dass mein <a href="#/agb#widerruf" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline font-medium" onClick={(e) => e.stopPropagation()}>Widerrufsrecht</a> mit Nutzungsbeginn erlischt.
                                        </p>
                                    </div>

                                    {/* Error Message Display */}
                                    {error && (
                                        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
                                            <div className="text-red-500 mt-0.5">
                                                <X size={16} />
                                            </div>
                                            <p className="text-sm text-red-400 whitespace-pre-wrap">
                                                {error}
                                            </p>
                                        </div>
                                    )}

                                    <button
                                        onClick={handleCheckout}
                                        disabled={loading || subscriptionLoading}
                                        className={`w-full bg-[#2563EB] text-white font-black py-[18px] rounded-2xl shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 hover:scale-[1.01] active:scale-[0.99] transition-all flex flex-col items-center justify-center gap-1 ${!hasAcceptedTerms ? 'opacity-80' : ''}`}
                                    >
                                        <div className="flex flex-col items-center">
                                            <span className="flex items-center gap-2 text-[15px]">
                                                {loading ? 'Wird geladen...' : 'Jetzt Zugang freischalten'}
                                            </span>
                                            {showArabic && !loading && (
                                                <span className="text-xs font-medium opacity-80 -mt-0.5" dir="rtl">
                                                    فتح الوصول الآن
                                                </span>
                                            )}
                                            {showArabic && loading && (
                                                <span className="text-xs font-medium opacity-80 -mt-0.5" dir="rtl">
                                                    جارٍ التحميل...
                                                </span>
                                            )}
                                        </div>
                                    </button>

                                    <div className="flex flex-col items-center gap-3 mt-6 opacity-40 grayscale">
                                        <div className="flex items-center gap-1.5">
                                            <ShieldCheck size={14} className="text-slate-500" />
                                            <span className="text-[11px] text-slate-500 font-bold tracking-widest uppercase whitespace-nowrap">Sichere Zahlung</span>
                                        </div>
                                        <div className="flex items-center justify-center flex-wrap gap-x-5 gap-y-3 px-4">
                                            <img src="/Zahlungen%20Logo/Apple_Pay_logo.svg.webp" alt="Apple Pay" className="h-4 w-auto object-contain" />
                                            <img src="/Zahlungen%20Logo/Google_Pay_Logo.svg.png" alt="Google Pay" className="h-3.5 w-auto object-contain" />
                                            <img src="/Zahlungen%20Logo/PayPal.svg.png" alt="PayPal" className="h-3.5 w-auto object-contain" />
                                            <img src="/Zahlungen%20Logo/klarna_kco.webp" alt="Klarna" className="h-3 w-auto object-contain" />
                                            <img src="/Zahlungen%20Logo/Visa_2021.svg.png" alt="Visa" className="h-1.5 w-auto object-contain" />
                                            <img src="/Zahlungen%20Logo/payment-logo-mastercard_width600.png" alt="Mastercard" className="h-3.5 w-auto object-contain" />
                                        </div>
                                    </div>
                                    {showArabic && (
                                        <div className="flex justify-center mt-1 opacity-20">
                                            <span className="text-[9px] text-slate-500 font-medium tracking-wide uppercase" dir="rtl">دفع آمن</span>
                                        </div>
                                    )}

                                    {/* Legal Links */}
                                    <div className="flex justify-center items-center gap-2 mt-8 mb-4 opacity-30">
                                        <a href="#/agb" onClick={onClose} className="text-[9px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                                            AGB
                                        </a>
                                        <span className="text-[9px] text-slate-400">•</span>
                                        <a href="#/datenschutz" onClick={onClose} className="text-[9px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                                            Datenschutz
                                        </a>
                                        <span className="text-[9px] text-slate-400">•</span>
                                        <a href="#/impressum" onClick={onClose} className="text-[9px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                                            Impressum
                                        </a>
                                        <span className="text-[9px] text-slate-400">•</span>
                                        <a href="#/widerrufsbelehrung" onClick={onClose} className="text-[9px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                                            Widerruf
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
