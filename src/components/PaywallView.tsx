import { useState, useEffect, cloneElement } from 'react';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../App';
import { usePostHog } from '../contexts/PostHogProvider';
import { supabase } from '../lib/supabase';
import { getEmailDomain, getTikTokAnalyticsContext, trackTikTokServerEvent } from '../utils/tiktokAnalytics';
import { trackServerEvent } from '../services/serverAnalytics';
import { X, Crown, Check, MessageCircle, Lightbulb, Infinity, ShieldCheck, Rocket, Languages, ChevronDown, Users, BookOpen, Timer, Blocks, Calendar, Mic, Sparkles, Pencil, GraduationCap, Layers, Target, Trophy, Mail, LogIn, Eye, EyeOff } from 'lucide-react';
import { EmbeddedPayment } from './EmbeddedPayment';
import { TransitionAccessNotice } from './TransitionAccessNotice';

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
                    <h2 className="text-[21.5px] sm:text-2xl font-black leading-tight tracking-tight text-white focus:outline-none">
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

interface PaywallViewProps {
    onClose?: () => void;
    featureName?: string;
    isEmbedded?: boolean;
    tiktokPlanPayload?: unknown;
}

export function PaywallView({ onClose, featureName, isEmbedded = false, tiktokPlanPayload }: PaywallViewProps) {
    const { openCheckout, loading: subscriptionLoading, processPaymentSuccess } = useSubscription();
    const { user } = useAuth();
    const { language, openAuthDialog, toggleLanguage } = useApp();
    const { trackEvent } = usePostHog();
    const showArabic = language === 'DE_AR';
    const forceLightMode = featureName === 'tiktok_onboarding_result';
    const isTikTokPaywall = featureName === 'tiktok_onboarding_result';
    const tiktokAnalytics = (tiktokPlanPayload as any)?.analytics || {};
    const getTikTokPaywallContext = (extra: Record<string, any> = {}) => getTikTokAnalyticsContext('paywall', language, {
        source: 'tiktok_result',
        has_tiktok_plan: Boolean(tiktokPlanPayload),
        test_score: tiktokAnalytics.score,
        percentage: tiktokAnalytics.percentage,
        risk_level: tiktokAnalytics.riskLevel,
        weak_topic_count: tiktokAnalytics.weakTopicCount,
        ...extra,
    });
    const trackTikTokPaywallEvent = (eventName: `tiktok_${string}`, extra: Record<string, any> = {}) => {
        const context = getTikTokPaywallContext(extra);
        trackEvent(eventName as any, context);
        trackTikTokServerEvent(eventName, context);
    };

    const selectedPlan = '6months';
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [successMode, setSuccessMode] = useState(false);
    const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
    const [shakeTerms, setShakeTerms] = useState(false);

    // Guest checkout state
    const [guestMode, setGuestMode] = useState<'email' | 'login' | null>(null);
    const [guestEmail, setGuestEmail] = useState('');
    const [loginEmail, setLoginEmail] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [showLoginPassword, setShowLoginPassword] = useState(false);
    const [guestError, setGuestError] = useState('');
    const [loginLoading, setLoginLoading] = useState(false);

    // Collapsible state
    const [earlyAdopterOpen, setEarlyAdopterOpen] = useState(false);
    const [valueStackOpen, setValueStackOpen] = useState(window.innerWidth >= 768);
    const [manuallyToggledEA, setManuallyToggledEA] = useState(false);
    const [manuallyToggledVS, setManuallyToggledVS] = useState(false);

    // Refs for scroll container auto-open
    const scrollRef = { current: null as HTMLDivElement | null };
    const vsRef = { current: null as HTMLDivElement | null };

    const checkScroll = () => {
        if (!scrollRef.current) return;
        if (vsRef.current && !manuallyToggledVS && !valueStackOpen) {
            const rect = vsRef.current.getBoundingClientRect();
            const parentRect = scrollRef.current.getBoundingClientRect();
            if (rect.top < parentRect.bottom - 100) {
                setValueStackOpen(true);
            }
        }
    };

    useEffect(() => {
        setTimeout(checkScroll, 100);
    }, []);

    useEffect(() => {
        trackEvent('paywall_shown', {
            feature_name: featureName,
            source: isEmbedded ? 'onboarding' : 'dialog'
        });
        if (isTikTokPaywall) {
            trackTikTokPaywallEvent('tiktok_paywall_opened');
        }
    }, []);

    useEffect(() => {
        if (!forceLightMode) return;

        const root = document.documentElement;
        const wasDark = root.classList.contains('dark');
        const previousTheme = localStorage.getItem('theme');

        root.classList.remove('dark');

        return () => {
            if (wasDark) {
                root.classList.add('dark');
            }
            if (previousTheme) {
                localStorage.setItem('theme', previousTheme);
            }
        };
    }, [forceLightMode]);

    // ── Authenticated user checkout ──────────────────────────────────────
    const proceedToCheckout = async () => {
        setLoading(true);
        setError('');
        try {
            const secret = await openCheckout(selectedPlan, { tiktokPlanPayload });
            if (secret && typeof secret === 'string' && secret.length > 0) {
                setClientSecret(secret);
                if (isTikTokPaywall) {
                    trackTikTokPaywallEvent('tiktok_checkout_session_created', {
                        checkout_mode: 'authenticated',
                    });
                }
            } else {
                throw new Error('Invalid session created');
            }
        } catch (err: any) {
            console.error('Checkout error:', err);
            if (isTikTokPaywall) {
                trackTikTokPaywallEvent('tiktok_checkout_poll_failed', {
                    checkout_mode: 'authenticated',
                    reason: 'session_create_failed',
                    error_message: err?.message,
                });
            }
            setError('Ein Fehler ist aufgetreten. Bitte versuche es später erneut oder kontaktiere den Support.');
        } finally {
            setLoading(false);
        }
    };

    // ── Guest checkout (email only) ───────────────────────────────────────
    const handleGuestCheckout = async () => {
        if (!guestEmail || !guestEmail.includes('@')) {
            setGuestError('Bitte gib eine gültige E-Mail-Adresse ein.');
            if (isTikTokPaywall) {
                trackTikTokPaywallEvent('tiktok_guest_email_failed', {
                    reason: 'invalid_email',
                    has_email: Boolean(guestEmail),
                });
            }
            return;
        }
        setLoading(true);
        setGuestError('');
        if (isTikTokPaywall) {
            trackTikTokPaywallEvent('tiktok_guest_email_submitted', {
                has_email: true,
                email_domain: getEmailDomain(guestEmail),
            });
        }
        try {
            const { data, error: fnError } = await supabase.functions.invoke('create-guest-checkout', {
                body: { email: guestEmail.trim().toLowerCase(), priceId: selectedPlan, tiktokPlanPayload }
            });

            if (fnError) throw new Error(fnError.message);

            if (data?.error === 'EMAIL_EXISTS') {
                // Switch to inline login
                setLoginEmail(guestEmail);
                setGuestMode('login');
                setGuestError('Diese E-Mail hat bereits ein Konto. Bitte melde dich an.');
                if (isTikTokPaywall) {
                    trackTikTokPaywallEvent('tiktok_existing_account_login_prompted', {
                        email_domain: getEmailDomain(guestEmail),
                    });
                }
                return;
            }
            if (data?.error) throw new Error(data.message || data.error);
            if (!data?.clientSecret) throw new Error('Kein Client Secret erhalten.');

            setClientSecret(data.clientSecret);
            setGuestMode(null);
            if (isTikTokPaywall) {
                trackTikTokPaywallEvent('tiktok_checkout_session_created', {
                    checkout_mode: 'guest',
                    email_domain: getEmailDomain(guestEmail),
                });
            }
        } catch (err: any) {
            console.error('Guest checkout error:', err);
            setGuestError(err.message || 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.');
            if (isTikTokPaywall) {
                trackTikTokPaywallEvent('tiktok_guest_email_failed', {
                    reason: 'checkout_create_failed',
                    error_message: err?.message,
                    email_domain: getEmailDomain(guestEmail),
                });
            }
        } finally {
            setLoading(false);
        }
    };

    // ── Inline login for existing users ──────────────────────────────────
    const handleInlineLogin = async () => {
        if (!loginEmail || !loginPassword) {
            setGuestError('Bitte E-Mail und Passwort eingeben.');
            return;
        }
        setLoginLoading(true);
        setGuestError('');
        try {
            const { data, error: signInError } = await supabase.auth.signInWithPassword({
                email: loginEmail.trim().toLowerCase(),
                password: loginPassword,
            });
            if (signInError) throw signInError;
            if (data.user) {
                trackServerEvent('user_logged_in_server', {
                    email: data.user.email,
                    method: 'email',
                    source: 'paywall_inline_login',
                });
            }
            // User is now logged in — close guest mode and proceed normally
            setGuestMode(null);
            // Small delay so auth state can update, then proceed
            setTimeout(() => proceedToCheckout(), 500);
        } catch (err: any) {
            setGuestError(err.message || 'Login fehlgeschlagen. Bitte prüfe deine Zugangsdaten.');
        } finally {
            setLoginLoading(false);
        }
    };

    // ── Main CTA click ────────────────────────────────────────────────────
    const handleCheckout = async () => {
        if (!hasAcceptedTerms) {
            setShakeTerms(true);
            setTimeout(() => setShakeTerms(false), 500);
            if (isTikTokPaywall) {
                trackTikTokPaywallEvent('tiktok_paywall_checkout_clicked', {
                    blocked: true,
                    blocked_reason: 'terms_not_accepted',
                });
            }
            return;
        }

        trackEvent('upgrade_clicked', {
            plan: selectedPlan,
            price: 49,
            source: isEmbedded ? 'onboarding' : 'paywall_dialog'
        });
        if (isTikTokPaywall) {
            trackTikTokPaywallEvent('tiktok_paywall_checkout_clicked', {
                blocked: false,
                checkout_mode: user ? 'authenticated' : 'guest',
            });
        }

        if (user) {
            // Authenticated user — normal flow
            await proceedToCheckout();
        } else {
            // Guest — show email input
            setGuestMode('email');
            setGuestError('');
            if (isTikTokPaywall) {
                trackTikTokPaywallEvent('tiktok_guest_email_started');
            }
        }
    };

    const handlePaymentComplete = async () => {
        setSuccessMode(true);
        if (isTikTokPaywall) {
            trackTikTokPaywallEvent('tiktok_checkout_completed_client', {
                checkout_mode: user ? 'authenticated' : 'guest',
                completion_source: 'paywall',
            });
        }
        if (user) {
            await processPaymentSuccess();
            setTimeout(() => { onClose?.(); }, 2000);
        }
        // Guest: redirect happens via return_url to /guest-payment-success
    };

    const benefitGroups = [
        {
            nameDE: 'Lernen & Prüfung',
            nameAR: 'التعلم والامتحان',
            items: [
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
        <div className={`flex flex-col h-full bg-[#F2F4F6] dark:bg-slate-950 ${isEmbedded ? 'w-full' : 'sm:rounded-[3rem] border border-white/50 dark:border-slate-800 shadow-2xl overflow-hidden'}`}>
            <div
                className={`flex-1 overflow-y-auto relative z-0 ${isEmbedded ? 'px-0 pb-0' : 'px-3 sm:px-4 pb-10'}`}
                ref={(el) => { if (el) { scrollRef.current = el; el.addEventListener('scroll', checkScroll); } }}
            >
                {/* Header Section */}
                <div className={`bg-[#2663EB] p-5 sm:p-6 relative overflow-hidden z-10 text-white shadow-xl shadow-blue-500/20 ${isEmbedded ? 'mx-4 mt-4 mb-5 rounded-[28px]' : 'mt-3 sm:mt-4 mb-5 rounded-3xl'}`}>
                    <div className="flex flex-row items-center justify-between relative z-10 mb-6 md:mb-8">
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-[25px] sm:text-[27px] md:text-[33px] font-black text-white tracking-tight whitespace-nowrap">34a Master</span>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleLanguage();
                                }}
                                className={`w-[43px] h-[43px] rounded-full flex items-center justify-center transition-all active:scale-95 shadow-sm ${language === 'DE_AR' ? 'bg-white/30 text-white' : 'bg-white/10 text-white/70'}`}
                            >
                                <Languages size={22} />
                            </button>

                            {onClose && (
                                <button
                                    onClick={onClose}
                                    className="w-[43px] h-[43px] rounded-full flex items-center justify-center shadow-sm border-2 border-white/20 transition-transform active:scale-95 bg-white/10 text-white"
                                >
                                    <X size={22} strokeWidth={2.5} />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="relative z-10 min-h-[80px] md:min-h-[100px] md:mt-2">
                        <SloganSlideshow showArabic={showArabic} />
                    </div>
                </div>

                {!clientSecret && !successMode && (
                    <div className={isEmbedded ? 'px-4 sm:px-6' : ''}>
                        <TransitionAccessNotice variant="paywall" />
                    </div>
                )}

                {successMode ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center animate-in zoom-in duration-300">
                        <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-6">
                            <Check size={40} className="text-green-600 dark:text-green-400" strokeWidth={3} />
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Zahlung erfolgreich!</h3>
                        <p className="text-slate-500 dark:text-slate-400">Dein Premium-Zugang wird aktiviert...</p>
                    </div>
                ) : clientSecret ? (
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl shadow-sm dark:shadow-black/20 border border-transparent dark:border-slate-800">
                        <button
                            onClick={() => { setClientSecret(null); setLoading(false); }}
                            className="mb-4 text-sm text-slate-500 dark:text-slate-300 flex items-center gap-1"
                        >
                            ← Zurück
                        </button>
                        <EmbeddedPayment
                            clientSecret={clientSecret}
                            onComplete={handlePaymentComplete}
                            trackingContext={isTikTokPaywall ? getTikTokPaywallContext({
                                checkout_mode: user ? 'authenticated' : 'guest',
                            }) : undefined}
                        />
                    </div>
                ) : (
                    <div className={`md:grid md:grid-cols-2 md:gap-x-12 md:gap-y-6 md:items-start max-w-full ${isEmbedded ? 'px-4 sm:px-6 pt-4 pb-6' : ''}`}>
                        {/* Benefits Column */}
                        <div className="space-y-6">
                            <div className="relative mb-6 mt-10">
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-blue-500 dark:from-blue-500 dark:to-blue-700 px-4 py-1.5 rounded-full border-2 border-[#F2F4F6] dark:border-slate-900 shadow-lg dark:shadow-blue-950/40">
                                    <Crown size={12} className="text-yellow-300 fill-yellow-300" />
                                    <span className="text-[10px] font-black text-white px-1 tracking-widest uppercase">Premium Zugang</span>
                                </div>

                                <div className="relative bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/60 dark:border-slate-800 overflow-hidden pt-7 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                                    <div
                                        className="flex items-center justify-between relative cursor-pointer group"
                                        onClick={() => { setValueStackOpen(!valueStackOpen); setManuallyToggledVS(true); }}
                                        ref={(el) => { vsRef.current = el; }}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-300">
                                                <Trophy size={20} className="fill-blue-600/20" />
                                            </div>
                                            <div className="flex flex-col text-left">
                                                <h3 className="font-bold text-slate-900 dark:text-white leading-tight text-[15px]">Was du bekommst</h3>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Alles für deinen Erfolg</p>
                                                    {showArabic && <span className="text-[10px] opacity-60 ml-1" dir="rtl">ما ستحصل عليه</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${valueStackOpen ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200' : 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300'} dark:border dark:border-slate-700/70`}>
                                            <span className="text-[11px] font-bold">{valueStackOpen ? 'Schließen' : 'Details'}</span>
                                            <ChevronDown size={14} className={`transition-transform duration-300 ${valueStackOpen ? 'rotate-180' : ''}`} />
                                        </div>
                                    </div>

                                    <div className={`grid transition-all duration-500 ease-out ${valueStackOpen ? 'grid-rows-[1fr] opacity-100 mt-5 pt-5 border-t border-slate-100 dark:border-slate-800' : 'grid-rows-[0fr] opacity-0'}`}>
                                        <div className="overflow-hidden">
                                            <div className="space-y-6 pb-1">
                                                {benefitGroups.map((group, gIdx) => (
                                                    <div key={gIdx} className="space-y-3">
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">{group.nameDE}</p>
                                                        <div className="space-y-3">
                                                            {group.items.map((item: any, i) => (
                                                                <div key={i} className="flex items-start gap-3 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors">
                                                                    <div className="relative shrink-0 mt-0.5">
                                                                        <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800/90 flex items-center justify-center text-slate-400 dark:text-slate-300">
                                                                            {cloneElement(item.icon as any, { size: 16 })}
                                                                        </div>
                                                                        <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-white dark:border-slate-900 flex items-center justify-center">
                                                                            <Check size={8} strokeWidth={4} className="text-white" />
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex-1 pt-0.5">
                                                                        <div className="flex items-center gap-2 mb-0.5">
                                                                            <span className="text-[13px] font-bold text-slate-700 dark:text-slate-200">{item.titleDE}</span>
                                                                            <span className="bg-slate-100 dark:bg-slate-800/90 text-slate-500 dark:text-slate-300 text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase">{item.badge}</span>
                                                                        </div>
                                                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{item.descDE}</p>
                                                                        {showArabic && <div className="mt-1 opacity-70 pt-1" dir="rtl"><p className="text-[10px]">{item.titleAR} - {item.descAR}</p></div>}
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

                        {/* Plans Column */}
                        <div className="space-y-6">
                            <div className="mb-6 rounded-[2rem] transition-all relative overflow-hidden group p-0.5 bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-500 dark:to-blue-700 shadow-xl shadow-blue-500/20 dark:shadow-blue-950/40 scale-[1.02]">
                                <div className="rounded-[1.85rem] overflow-hidden bg-white dark:bg-slate-900">
                                    <div className="relative bg-gradient-to-br from-[#F3F7FF] to-[#EEF4FF] dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 p-5 border-b border-blue-100/70 dark:border-slate-800">
                                        <div
                                            className="flex items-center justify-between relative cursor-pointer"
                                            onClick={(e) => { e.stopPropagation(); setEarlyAdopterOpen(!earlyAdopterOpen); }}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-950/70 dark:to-slate-800 flex items-center justify-center text-blue-600 dark:text-blue-300">
                                                    <Rocket size={18} className="fill-blue-500/20" />
                                                </div>
                                                <div className="flex flex-col text-left">
                                                    <p className="text-[11px] font-extrabold text-blue-600 dark:text-blue-300 uppercase tracking-[0.04em]">Nur für kurze Zeit</p>
                                                </div>
                                            </div>
                                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${earlyAdopterOpen ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300' : 'bg-white shadow-sm text-blue-600 dark:bg-slate-800 dark:text-slate-200 dark:shadow-none'} dark:border dark:border-slate-700/70`}>
                                                <span className="text-[9px] font-bold">{earlyAdopterOpen ? 'Schließen' : 'Weitere Vorteile'}</span>
                                                <ChevronDown size={14} className={`transition-transform duration-300 ${earlyAdopterOpen ? 'rotate-180' : ''}`} />
                                            </div>
                                        </div>

                                        <div className={`grid transition-all duration-500 ease-out ${earlyAdopterOpen ? 'grid-rows-[1fr] opacity-100 mt-5 pt-5 border-t border-blue-200/70 dark:border-slate-800' : 'grid-rows-[0fr] opacity-0'}`}>
                                            <div className="overflow-hidden space-y-4">
                                                <div className="flex items-start gap-3">
                                                    <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-300 shrink-0"><MessageCircle size={14} /></div>
                                                    <div><p className="text-[13px] font-bold dark:text-slate-100">WhatsApp-Support</p><p className="text-[11px] text-slate-500 dark:text-slate-400">Direkter Draht • Antwort binnen 24h</p></div>
                                                </div>
                                                <div className="flex items-start gap-3">
                                                    <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-300 shrink-0"><Infinity size={14} /></div>
                                                    <div><p className="text-[13px] font-bold dark:text-slate-100">Einmalzahlung statt Abo</p><p className="text-[11px] text-slate-500 dark:text-slate-400">6 Monate voller Zugriff ohne Abo-Falle</p></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-5 flex items-center justify-between dark:bg-slate-900">
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-baseline gap-2">
                                                <span className="font-black text-[18px] dark:text-white">€49</span>
                                                <span className="font-bold text-[10px] text-slate-400 dark:text-slate-400">statt <span className="line-through">€99</span></span>
                                            </div>
                                            <p className="font-black text-[10px] uppercase tracking-tight dark:text-slate-200">Einmalzahlung für 6 Monate</p>
                                        </div>
                                        <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center shadow-md">
                                            <Check size={14} strokeWidth={4} className="text-white" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6">
                                <div className={`mb-4 flex items-start gap-3 px-1 transition-all ${shakeTerms ? 'animate-shake' : ''}`}>
                                    <button
                                        onClick={() => {
                                            const nextAccepted = !hasAcceptedTerms;
                                            setHasAcceptedTerms(nextAccepted);
                                            if (isTikTokPaywall) {
                                                trackTikTokPaywallEvent('tiktok_paywall_terms_toggled', {
                                                    accepted: nextAccepted,
                                                });
                                            }
                                        }}
                                        className={`w-4 h-4 rounded border shrink-0 mt-0.5 ${hasAcceptedTerms ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-slate-600 dark:bg-slate-900'}`}
                                    >
                                        {hasAcceptedTerms && <Check size={12} strokeWidth={4} className="text-white" />}
                                    </button>
                                    <p
                                        className="text-[11px] text-slate-500 dark:text-slate-400 cursor-pointer"
                                        onClick={() => {
                                            const nextAccepted = !hasAcceptedTerms;
                                            setHasAcceptedTerms(nextAccepted);
                                            if (isTikTokPaywall) {
                                                trackTikTokPaywallEvent('tiktok_paywall_terms_toggled', {
                                                    accepted: nextAccepted,
                                                });
                                            }
                                        }}
                                    >
                                        Widerrufsrecht: Ich willige in sofortigen Zugang ein und bestätige, dass mein <a href="#/agb" target="_blank" className="text-blue-600 dark:text-blue-300 font-medium">Widerrufsrecht</a> mit Nutzungsbeginn erlischt.
                                    </p>
                                </div>

                                {error && (
                                    <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/70 text-red-600 dark:text-red-300 text-sm flex gap-2">
                                        <X size={16} className="shrink-0 mt-0.5" />
                                        <span>{error}</span>
                                    </div>
                                )}

                                 {/* Premium Summary above CTA */}
                                <div className="flex flex-col items-center gap-1 mb-6 animate-fadeIn">
                                    <div className="flex flex-wrap justify-center items-center gap-x-3 gap-y-1.5 text-[12px] sm:text-[13px] font-extrabold text-slate-700 dark:text-slate-200 bg-white/50 dark:bg-slate-900/80 px-4 py-2 rounded-2xl border border-slate-200/50 dark:border-slate-700">
                                        <div className="flex items-center gap-1.5">
                                            <BookOpen size={14} className="text-blue-500" />
                                            <span>136 Lektionen</span>
                                        </div>
                                        <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 hidden sm:block" />
                                        <div className="flex items-center gap-1.5">
                                            <Target size={14} className="text-blue-500" />
                                            <span>701 Testfragen</span>
                                        </div>
                                        <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 hidden sm:block" />
                                        <div className="flex items-center gap-1.5">
                                            <Mic size={14} className="text-blue-500" />
                                            <span>150+ Mündliche Fragen</span>
                                        </div>
                                    </div>
                                    {showArabic && (
                                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-0.5" dir="rtl">
                                            136 درس • 701 سؤال • 150+ سؤال شفهي
                                        </p>
                                    )}
                                </div>

                                {/* ── Guest: Email input panel ─────────────────────── */}
                                {guestMode === 'email' && !user && (
                                    <div className="mb-4 rounded-2xl border border-blue-100 dark:border-blue-900/50 bg-blue-50/50 dark:bg-slate-900 p-4 space-y-3 animate-in slide-in-from-bottom-2 duration-200">
                                        <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 mb-1">
                                            <Mail size={15} />
                                            <span className="text-[13px] font-bold">Deine E-Mail-Adresse</span>
                                        </div>
                                        <input
                                            type="email"
                                            value={guestEmail}
                                            onChange={(e) => { setGuestEmail(e.target.value); setGuestError(''); }}
                                            onKeyDown={(e) => e.key === 'Enter' && handleGuestCheckout()}
                                            placeholder="email@beispiel.de"
                                            autoFocus
                                            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                                        />
                                        {guestError && (
                                            <p className="text-red-500 text-[12px] flex items-center gap-1.5">
                                                <X size={12} />
                                                {guestError}
                                            </p>
                                        )}
                                        <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-snug">
                                            Nach dem Kauf erhältst du eine E-Mail, um dein Konto zu aktivieren.
                                        </p>
                                        <div className="flex items-center justify-between pt-1">
                                            <button
                                                onClick={() => { setGuestMode(null); setGuestError(''); }}
                                                className="text-[12px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                            >
                                                ← Zurück
                                            </button>
                                            <button
                                                onClick={() => { setGuestMode('login'); setLoginEmail(guestEmail); setGuestError(''); }}
                                                className="text-[12px] text-blue-600 dark:text-blue-300 font-semibold hover:underline flex items-center gap-1"
                                            >
                                                <LogIn size={12} />
                                                Bereits ein Konto?
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* ── Guest: Inline login panel ─────────────────────── */}
                                {guestMode === 'login' && !user && (
                                    <div className="mb-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 animate-in slide-in-from-bottom-2 duration-200 shadow-sm dark:shadow-black/20">
                                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 mb-1">
                                            <LogIn size={15} />
                                            <span className="text-[13px] font-bold">Anmelden</span>
                                        </div>
                                        <input
                                            type="email"
                                            value={loginEmail}
                                            onChange={(e) => { setLoginEmail(e.target.value); setGuestError(''); }}
                                            placeholder="E-Mail"
                                            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                                        />
                                        <div className="relative">
                                            <input
                                                type={showLoginPassword ? 'text' : 'password'}
                                                value={loginPassword}
                                                onChange={(e) => { setLoginPassword(e.target.value); setGuestError(''); }}
                                                onKeyDown={(e) => e.key === 'Enter' && handleInlineLogin()}
                                                placeholder="Passwort"
                                                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all pr-10"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowLoginPassword(!showLoginPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                                            >
                                                {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                        {guestError && (
                                            <p className="text-red-500 text-[12px] flex items-center gap-1.5">
                                                <X size={12} />
                                                {guestError}
                                            </p>
                                        )}
                                        <div className="flex items-center justify-between pt-1">
                                            <button
                                                onClick={() => { setGuestMode('email'); setGuestError(''); }}
                                                className="text-[12px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                            >
                                                ← Zurück
                                            </button>
                                            <button
                                                onClick={handleInlineLogin}
                                                disabled={loginLoading}
                                                className="bg-blue-600 dark:bg-blue-500 text-white text-[13px] font-bold px-4 py-2 rounded-xl hover:bg-blue-700 dark:hover:bg-blue-400 transition-colors flex items-center gap-1.5 disabled:opacity-60"
                                            >
                                                {loginLoading ? 'Wird angemeldet...' : 'Anmelden & zahlen'}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* ── CTA Button ───────────────────────────────────── */}
                                <button
                                    onClick={guestMode === 'email' ? handleGuestCheckout : guestMode === 'login' ? handleInlineLogin : handleCheckout}
                                    disabled={loading || subscriptionLoading || loginLoading}
                                    className="w-full bg-[#2563EB] dark:bg-blue-500 text-white font-black py-4 rounded-2xl shadow-lg dark:shadow-blue-950/40 hover:scale-[1.01] active:scale-[0.99] transition-all flex flex-col items-center justify-center gap-0.5 dark:hover:bg-blue-400"
                                >
                                    <span className="text-[15px]">
                                        {loading || loginLoading ? 'Wird geladen...'
                                            : guestMode === 'email' ? 'Weiter zur Zahlung →'
                                            : guestMode === 'login' ? 'Anmelden & zahlen'
                                            : 'Jetzt Zugang freischalten'}
                                    </span>
                                    {showArabic && !guestMode && <span className="text-[10px] opacity-80" dir="rtl">فتح الوصول الآن</span>}
                                </button>

                                {/* Payment Logos */}
                                <div className="mt-8 opacity-70 flex flex-col items-center gap-4">
                                    <div className="flex items-center gap-1.5">
                                        <ShieldCheck size={14} />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Sichere Zahlung</span>
                                    </div>
                                    <div className="flex justify-center flex-wrap gap-x-5 gap-y-3 px-4">
                                        <img src="/payment-logos/Apple_Pay_logo.svg.webp" alt="Apple Pay" className="h-4 w-auto" />
                                        <img src="/payment-logos/Google_Pay_Logo.svg.png" alt="Google Pay" className="h-3.5 w-auto" />
                                        <img src="/payment-logos/PayPal.svg.png" alt="PayPal" className="h-3.5 w-auto" />
                                        <img src="/payment-logos/klarna_kco.webp" alt="Klarna" className="h-3 w-auto" />
                                        <img src="/payment-logos/Visa_2021.svg.png" alt="Visa" className="h-4 w-auto" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            
            {/* Show a "Kostenlos fortfahren" button only if embedded in onboarding */}
            {isEmbedded && !clientSecret && !successMode && onClose && (
                <div className="px-6 pt-2 pb-6 flex flex-col items-center">
                    <button 
                        onClick={onClose}
                        className="text-slate-500 dark:text-slate-400 text-[13px] font-medium hover:text-slate-700 dark:hover:text-slate-200 underline underline-offset-4 decoration-slate-200 dark:decoration-slate-700"
                    >
                        Vielleicht später • Erstmal kostenlos testen
                    </button>
                    {showArabic && <p className="text-[11px] text-slate-400 mt-1" dir="rtl">ربما لاحقاً • جرب مجاناً أولاً</p>}
                </div>
            )}
        </div>
    );
}
