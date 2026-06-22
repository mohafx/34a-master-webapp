import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mic, Loader2, Sparkles, ShieldCheck, Ticket, VolumeX, X, AlertCircle, Crown, MessageCircle } from 'lucide-react';
import { useApp } from '../../App';
import { usePostHog } from '../../contexts/PostHogProvider';
import { supabase } from '../../lib/supabase';
import {
    getOralExamEntitlement,
    startOralExamSession,
    OralExamPaywallError,
    OralExamTicketLimitError,
} from '../../services/oralExam';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { openWhatsAppSupport } from '../../utils/whatsappSupport';
import type { OralExamEntitlement } from '../../types';

export default function OralExamIntro() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, openAuthDialog, openPaywall } = useApp();
    const { refreshSubscription } = useSubscription();
    const { trackEvent } = usePostHog();

    const [loading, setLoading] = useState(false);
    const [entitlementLoading, setEntitlementLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [entitlement, setEntitlement] = useState<OralExamEntitlement | null>(null);
    const [showPrepDialog, setShowPrepDialog] = useState(false);
    const devAutoStartRef = useRef(false);
    const ticketStatus = entitlement
        ? `${entitlement.remaining} / ${entitlement.limit} ${entitlement.isPremium ? 'Prüfungstickets' : 'Mini-Prüfung'} verfügbar`
        : user
            ? 'Prüfungstickets nicht geladen'
            : 'Gast';

    const handleWhatsAppSupport = (message?: string | null) => {
        openWhatsAppSupport({
            topic: 'mündlichen Prüfung',
            message,
            context: {
                Nutzerstatus: user ? (entitlement?.isPremium ? 'Premium' : 'Free') : 'Gast',
                Ticketstatus: ticketStatus,
            },
        });
    };

    const loadEntitlement = async () => {
        if (!user) {
            setEntitlement(null);
            setEntitlementLoading(false);
            return;
        }
        setEntitlementLoading(true);
        setError(null);
        try {
            try {
                const { error: syncError } = await supabase.functions.invoke('sync-subscription');
                if (syncError) {
                    console.warn('[oral-exam] Subscription sync before entitlement failed:', syncError.message);
                }
            } catch (syncError) {
                console.warn('[oral-exam] Subscription sync before entitlement failed:', syncError);
            }
            setEntitlement(await getOralExamEntitlement());
        } catch (err) {
            setEntitlement(null);
            setError(err instanceof Error ? err.message : 'Prüfungstickets konnten nicht geladen werden.');
        } finally {
            setEntitlementLoading(false);
        }
    };

    const handleStart = async (requestedMode?: 'free_test_3q' | 'full_simulation') => {
        if (!user) {
            setShowPrepDialog(false);
            openAuthDialog('register', {
                de: 'Registriere dich kostenlos und starte deine 1 Mini-Simulation der mündlichen Prüfung.',
                ar: 'سجّل مجاناً وابدأ محاكاة مصغّرة واحدة للامتحان الشفوي.'
            });
            return;
        }
        if (entitlement && entitlement.remaining <= 0) {
            setShowPrepDialog(false);
            if (entitlement.isPremium) {
                setError(`Du hast deine ${entitlement.limit} Prüfungstickets für diesen Abo-Zeitraum bereits genutzt.`);
            } else {
                openPaywall('Mündliche Prüfung');
            }
            return;
        }
        setLoading(true);
        setError(null);
        try {
            // Kein Mikrofon-Vorabcheck mehr: Der Start reserviert nur (status=pending) und verbraucht
            // KEIN Ticket. Mikrofon-Freigabe + Verbindung passieren im Live-Screen; erst beim echten
            // Verbinden (connected_at) zählt das Ticket.
            const session = await startOralExamSession(null, requestedMode ?? null);
            if (session.entitlement) {
                setEntitlement(session.entitlement);
            }
            void refreshSubscription();
            trackEvent('oral_exam_started', {
                mode: session.mode,
                topic: 'alle',
            });
            navigate('/oral-exam/live', {
                state: {
                    sessionId: session.sessionId,
                    signedUrl: session.signedUrl,
                    dynamicVariables: session.dynamicVariables,
                    maxDurationSec: session.maxDurationSec,
                    mode: session.mode,
                    focusTopic: null,
                },
            });
        } catch (err) {
            if (err instanceof OralExamPaywallError) {
                if (err.entitlement) setEntitlement(err.entitlement);
                openPaywall('Mündliche Prüfung');
            } else if (err instanceof OralExamTicketLimitError) {
                if (err.entitlement) setEntitlement(err.entitlement);
                setError(`Du hast deine ${err.entitlement?.limit ?? entitlement?.limit ?? 10} Prüfungstickets für diesen Abo-Zeitraum bereits genutzt.`);
            } else {
                setError(err instanceof Error ? err.message : 'Unbekannter Fehler.');
            }
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadEntitlement();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.isLoggedIn]);

    useEffect(() => {
        trackEvent('oral_exam_intro_viewed', {
            logged_in: Boolean(user?.isLoggedIn),
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (params.get('devStart') !== '1' || devAutoStartRef.current) return;
        devAutoStartRef.current = true;
        void handleStart();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.search]);

    return (
        <div className="max-w-4xl mx-auto px-4 pb-64 md:pb-32">
            {/* Nav */}
            <div className="flex items-center gap-3 pt-3 mb-8">
                <button
                    onClick={() => navigate(-1)}
                    className="w-10 h-10 flex-shrink-0 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center border border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-300 transition-all active:scale-95 shadow-sm"
                >
                    <ArrowLeft size={20} strokeWidth={2.5} />
                </button>
                <h1 className="flex-1 text-center font-black text-base text-slate-900 dark:text-white tracking-tight">
                    Mündliche Prüfung
                </h1>
                <div className="w-10 flex-shrink-0" />
            </div>

            {/* Hero */}
            <div className="flex flex-col items-center text-center mb-7">
                <div className="w-20 h-20 rounded-[24px] bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center mb-5 shadow-[0_4px_20px_-2px_rgba(79,70,229,0.12)]">
                    <Mic size={36} strokeWidth={2} className="text-indigo-600 dark:text-indigo-400" />
                </div>
                <p className="text-[13px] text-slate-500 dark:text-slate-400 max-w-[240px] leading-relaxed">
                    Antworte auf Fragen vom KI-Prüfer — genau wie bei der echten IHK.
                </p>
            </div>

            {/* Ticket Status */}
            <TicketPanel
                loading={entitlementLoading}
                entitlement={entitlement}
                loggedIn={Boolean(user)}
                onRegister={() => openAuthDialog('register', {
                    de: 'Registriere dich kostenlos und starte deine 1 Mini-Simulation der mündlichen Prüfung.',
                    ar: 'سجّل مجاناً وابدأ محاكاة مصغّرة واحدة للامتحان الشفوي.'
                })}
            />

            <InfoSummaryCard />

            {error && (
                <div className="mb-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3">
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
                    <button
                        type="button"
                        onClick={() => handleWhatsAppSupport(error)}
                        className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-black text-red-700 shadow-sm ring-1 ring-red-100 transition-all active:scale-95 dark:bg-slate-900 dark:text-red-200 dark:ring-red-900/50"
                    >
                        <MessageCircle size={15} strokeWidth={2.5} />
                        Fehler per WhatsApp melden
                    </button>
                </div>
            )}

            {/* Start */}
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/70 bg-slate-50/95 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 shadow-[0_-16px_35px_rgba(15,23,42,0.10)] backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/95 md:static md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-0">
                <div className="mx-auto max-w-4xl">
                    <button
                        onClick={() => {
                            if (!user) {
                                openAuthDialog('register', {
                                    de: 'Registriere dich kostenlos und starte deine 1 Mini-Simulation der mündlichen Prüfung.',
                                    ar: 'سجّل مجاناً وابدأ محاكاة مصغّرة واحدة للامتحان الشفوي.'
                                });
                                return;
                            }
                            if (entitlement && entitlement.remaining <= 0 && !entitlement.isPremium) {
                                openPaywall('Mündliche Prüfung');
                                return;
                            }
                            setShowPrepDialog(true);
                        }}
                        disabled={loading || entitlementLoading || Boolean(entitlement && entitlement.remaining <= 0 && entitlement.isPremium)}
                        className="w-full bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-[24px] p-4 shadow-lg shadow-indigo-500/20 font-black text-base flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <>
                                <Loader2 size={22} className="animate-spin" /> Prüfung wird vorbereitet…
                            </>
                        ) : (
                            <>
                                <Mic size={22} strokeWidth={2.5} /> {!user
                                    ? 'Kostenlos registrieren'
                                    : entitlement && entitlement.remaining <= 0 && !entitlement.isPremium
                                        ? 'Premium freischalten'
                                        : 'Mündliche Prüfung starten'}
                            </>
                        )}
                    </button>
                    <p className="text-center text-[11px] text-slate-400 dark:text-slate-500 mt-2">
                        Mikrofon-Erlaubnis wird nach dem Start abgefragt.
                    </p>
                </div>
            </div>

            {showPrepDialog && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 px-4 pb-4 pt-10 backdrop-blur-sm sm:items-center sm:pb-10">
                    <div className="relative w-full max-w-md rounded-[28px] bg-white p-5 shadow-2xl dark:bg-slate-900">
                        <button
                            type="button"
                            onClick={() => setShowPrepDialog(false)}
                            disabled={loading}
                            aria-label="Schließen"
                            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition-all active:scale-95 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-300"
                        >
                            <X size={20} strokeWidth={2.5} />
                        </button>
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                            <VolumeX size={24} strokeWidth={2.5} />
                        </div>
                        <h2 className="text-xl font-black text-slate-900 dark:text-white">
                            {entitlement?.isPremium ? 'Volle Simulation starten?' : 'Mini-Simulation starten?'}
                        </h2>
                        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                            Starte in einem ruhigen Raum ohne Hintergrundgeräusche und bestätige danach den
                            Mikrofon-Zugriff im Browser.
                        </p>
                        <div className="mt-6 space-y-3">
                            {entitlement?.isPremium ? (
                                <button
                                    type="button"
                                    onClick={() => void handleStart('full_simulation')}
                                    disabled={loading}
                                    className="w-full rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-700 px-5 py-4 text-left font-black text-white transition-all active:scale-95 disabled:opacity-60"
                                >
                                    <span className="block">Volle Prüfungssimulation</span>
                                    <span className="mt-0.5 block text-xs font-semibold text-indigo-200">
                                        Mehrere Fälle, tiefe Rückfragen · bis ~15 Min
                                    </span>
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => void handleStart('free_test_3q')}
                                    disabled={loading}
                                    className="w-full rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-700 px-5 py-4 text-left font-black text-white transition-all active:scale-95 disabled:opacity-60"
                                >
                                    <span className="block">Mini-Simulation starten</span>
                                    <span className="mt-0.5 block text-xs font-semibold text-indigo-200">
                                        3 kurze Fälle · ~3 Min
                                    </span>
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setShowPrepDialog(false)}
                                disabled={loading}
                                className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left font-black text-slate-800 transition-all active:scale-95 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            >
                                <span className="block">Noch nicht starten</span>
                                <span className="mt-0.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    Zurück zur Übersicht
                                </span>
                            </button>
                            {loading && (
                                <p className="pt-1 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
                                    Wird vorbereitet…
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}

function TicketPanel({
    loading,
    entitlement,
    loggedIn,
    variant = 'default',
    onRegister,
}: {
    loading: boolean;
    entitlement: OralExamEntitlement | null;
    loggedIn: boolean;
    variant?: 'default' | 'header';
    onRegister: () => void;
}) {
    const inHeader = variant === 'header';

    if (!loggedIn) {
        return (
            <div className={`${inHeader ? 'rounded-2xl bg-white/10 p-3 text-white backdrop-blur-md border-t border-white/20' : 'mb-6 rounded-[24px] border border-indigo-100 bg-white p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-indigo-900/30 dark:bg-slate-800'}`}>
                <div className="flex items-center gap-3">
                    <div className={`flex flex-shrink-0 items-center justify-center rounded-xl ${inHeader ? 'h-9 w-9 bg-white/16 text-white' : 'h-11 w-11 bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400'}`}>
                        <Ticket size={inHeader ? 18 : 22} strokeWidth={2.5} />
                    </div>
                    <div className="flex-1">
                        <h3 className={`font-bold ${inHeader ? 'text-sm text-white' : 'text-[15px] text-slate-900 dark:text-white'}`}>1 Mini-Prüfung kostenlos</h3>
                        <p className={`mt-0.5 leading-snug ${inHeader ? 'text-xs text-white/70' : 'text-[13px] text-[#4B5563] dark:text-[#9CA3AF]'}`}>
                            Erstelle ein kostenloses Konto, damit dein Versuch gespeichert wird.
                        </p>
                        {inHeader && (
                            <button
                                type="button"
                                onClick={onRegister}
                                className="mt-2 rounded-xl bg-white px-3 py-1.5 text-xs font-black text-indigo-600 transition-all active:scale-95"
                            >
                                Kostenlos registrieren
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className={`${inHeader ? 'rounded-2xl bg-white/10 p-3 backdrop-blur-md border-t border-white/20' : 'mb-6 rounded-[24px] border border-slate-100 bg-white p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-800'}`}>
                <div className={`flex items-center gap-3 text-sm font-bold ${inHeader ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>
                    <Loader2 size={18} className="animate-spin" />
                    Prüfungstickets werden geladen…
                </div>
            </div>
        );
    }

    if (!entitlement) {
        return (
            <div className={`${inHeader ? 'rounded-2xl bg-white/10 p-3 text-white/80 backdrop-blur-md border-t border-white/20' : 'mb-6 rounded-[24px] border border-amber-200 bg-amber-50 p-5 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200'}`}>
                <div className="flex items-center gap-3 text-sm font-bold">
                    <AlertCircle size={18} />
                    Prüfungstickets konnten nicht geladen werden.
                </div>
            </div>
        );
    }

    const available = entitlement.remaining;
    const consumed = entitlement.used;
    const total = entitlement.limit;
    const title = entitlement.isPremium ? 'Premium-Prüfungstickets' : null;
    const description = entitlement.isPremium
        ? `${available} / ${total} Vollsimulationen verfügbar`
        : `${available} / ${total} Mini-Prüfung verfügbar`;
    const exhausted = available <= 0;

    return (
        <div className={`${inHeader ? 'rounded-2xl p-3 backdrop-blur-md border-t border-white/20' : 'mb-6 rounded-[24px] border p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]'} ${exhausted
            ? inHeader ? 'bg-rose-400/12' : 'border-rose-100 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-900/20'
            : inHeader ? 'bg-white/10' : 'border-indigo-100 bg-white dark:border-indigo-900/30 dark:bg-slate-800'
            }`}>
            <div className="flex items-center gap-3">
                <div className={`flex flex-shrink-0 items-center justify-center rounded-xl ${entitlement.isPremium
                    ? inHeader ? 'h-9 w-9 bg-amber-300/20 text-amber-100' : 'h-11 w-11 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
                    : inHeader ? 'h-9 w-9 bg-white/16 text-white' : 'h-11 w-11 bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400'
                    }`}>
                    {entitlement.isPremium ? <Crown size={inHeader ? 18 : 20} strokeWidth={2.5} /> : <Ticket size={inHeader ? 18 : 20} strokeWidth={2.5} />}
                </div>
                <div className="flex-1 min-w-0">
                    {title && (
                        <h3 className={`font-bold ${inHeader ? 'text-sm text-white' : 'text-[15px] text-slate-900 dark:text-white'}`}>{title}</h3>
                    )}
                    <p className={`font-bold ${title ? 'mt-0.5' : ''} ${inHeader ? 'text-xs text-white/75' : 'text-[13px] text-[#4B5563] dark:text-[#9CA3AF]'}`}>{description}</p>
                    <div className={`mt-2 h-1.5 overflow-hidden rounded-full ${inHeader ? 'bg-white/14' : 'bg-slate-100 dark:bg-slate-700'}`}>
                        <div
                            className={`h-full rounded-full ${exhausted ? 'bg-rose-300' : inHeader ? 'bg-white' : 'bg-indigo-600'}`}
                            style={{ width: `${Math.min((consumed / total) * 100, 100)}%` }}
                        />
                    </div>
                    <p className={`mt-1.5 text-xs ${inHeader ? 'text-white/60' : 'text-slate-500 dark:text-slate-400'}`}>
                        {exhausted
                            ? entitlement.isPremium
                                ? 'Deine Tickets für diesen Abo-Zeitraum sind aufgebraucht.'
                                : 'Deine kostenlose Mini-Simulation ist aufgebraucht.'
                            : 'Ein Ticket zählt erst, wenn die Verbindung zum Prüfer steht.'}
                    </p>
                </div>
            </div>
        </div>
    );
}

function InfoSummaryCard() {
    const items = [
        { icon: <Mic size={18} />, title: 'Freies Sprechen', desc: 'In deinen eigenen Worten antworten' },
        { icon: <Sparkles size={18} />, title: 'Echte Rückfragen', desc: 'Der Prüfer hakt nach wie beim IHK' },
        { icon: <ShieldCheck size={18} />, title: 'Sofortige Auswertung', desc: 'Feedback direkt nach der Prüfung' },
    ];

    return (
        <div className="mb-5 rounded-[24px] border border-slate-100 bg-white px-5 py-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-800">
            <h2 className="font-bold text-[15px] text-slate-900 dark:text-white mb-4">Wie die echte IHK-Prüfung</h2>
            <div className="flex flex-col gap-3">
                {items.map((item) => (
                    <div key={item.title} className="flex items-center gap-3">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                            {item.icon}
                        </div>
                        <div>
                            <span className="text-[13px] font-bold text-slate-800 dark:text-white block leading-tight">{item.title}</span>
                            <span className="text-[12px] text-slate-500 dark:text-slate-400 leading-tight">{item.desc}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
