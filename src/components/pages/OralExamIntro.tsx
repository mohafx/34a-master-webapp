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
                setError('Du hast deine 10 Prüfungstickets für diesen Abo-Zeitraum bereits genutzt.');
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
                setError('Du hast deine 10 Prüfungstickets für diesen Abo-Zeitraum bereits genutzt.');
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
        const params = new URLSearchParams(location.search);
        if (params.get('devStart') !== '1' || devAutoStartRef.current) return;
        devAutoStartRef.current = true;
        void handleStart();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.search]);

    return (
        <div className="max-w-4xl mx-auto px-4 pb-64 md:pb-32">
            {/* Header */}
            <div className="pt-3 mb-5">
                <div className="bg-gradient-to-br from-violet-600 to-indigo-700 text-white rounded-[28px] md:rounded-[2rem] p-4 md:p-6 shadow-card relative overflow-hidden flex flex-col">
                    <div className="absolute top-0 right-0 w-48 md:w-72 h-48 md:h-72 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-40 md:w-56 h-40 md:h-56 bg-black/10 rounded-full translate-y-1/3 -translate-x-1/3 blur-3xl pointer-events-none" />

                    <div className="flex items-center gap-3 relative z-10 w-full">
                        <button
                            onClick={() => navigate('/exam')}
                            className="w-10 h-10 flex-shrink-0 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20 text-white transition-all active:scale-95 shadow-sm"
                        >
                            <ArrowLeft size={22} strokeWidth={2.5} />
                        </button>
                        <h1 className="flex-1 text-center font-black text-base md:text-xl text-white tracking-tight uppercase">
                            Mündliche Prüfung
                        </h1>
                        <div className="w-10 flex-shrink-0" />
                    </div>

                    <div className="relative z-10 mt-4">
                        <TicketPanel
                            loading={entitlementLoading}
                            entitlement={entitlement}
                            loggedIn={Boolean(user)}
                            variant="header"
                            onRegister={() => openAuthDialog('register', {
                                de: 'Registriere dich kostenlos und starte deine 1 Mini-Simulation der mündlichen Prüfung.',
                                ar: 'سجّل مجاناً وابدأ محاكاة مصغّرة واحدة للامتحان الشفوي.'
                            })}
                        />
                    </div>
                </div>
            </div>

            <InfoSummaryCard />
            <button
                type="button"
                onClick={() => handleWhatsAppSupport('Feedback oder Problem zur mündlichen Prüfung')}
                className="mx-auto -mt-2 mb-5 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-black text-slate-500 transition-all hover:bg-white hover:text-violet-700 active:scale-95 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-violet-300"
            >
                <MessageCircle size={15} strokeWidth={2.5} />
                Problem oder Feedback? Per WhatsApp melden
            </button>

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
                        className="w-full bg-gradient-to-br from-violet-600 to-indigo-700 text-white rounded-[24px] p-4 md:p-5 shadow-lg shadow-violet-500/20 font-black text-base md:text-lg flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
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
                    <p className="text-center text-[11px] md:text-xs text-slate-400 dark:text-slate-500 mt-2 md:mt-3">
                        {entitlement?.isPremium
                            ? 'Ein Prüfungsticket zählt erst, wenn die Verbindung zum Prüfer steht.'
                            : 'Nach dem Start fragt dein Browser nach dem Mikrofon-Zugriff. Bitte bestätige die Anfrage.'}
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
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
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
                                    className="w-full rounded-2xl bg-violet-600 px-5 py-4 text-left font-black text-white transition-all active:scale-95 disabled:opacity-60"
                                >
                                    <span className="block">Volle Prüfungssimulation</span>
                                    <span className="mt-0.5 block text-xs font-semibold text-violet-100">
                                        Mehrere Fälle, tiefe Rückfragen · bis ~15 Min
                                    </span>
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => void handleStart('free_test_3q')}
                                    disabled={loading}
                                    className="w-full rounded-2xl bg-violet-600 px-5 py-4 text-left font-black text-white transition-all active:scale-95 disabled:opacity-60"
                                >
                                    <span className="block">Mini-Simulation</span>
                                    <span className="mt-0.5 block text-xs font-semibold text-violet-100">
                                        3 kurze Fälle · ~3 Min
                                    </span>
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setShowPrepDialog(false)}
                                disabled={loading}
                                className="w-full rounded-2xl border-2 border-slate-200 bg-white px-5 py-4 text-left font-black text-slate-800 transition-all active:scale-95 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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
            <div className={`${inHeader ? 'rounded-2xl bg-white/10 p-3 text-white backdrop-blur-md' : 'mb-6 rounded-[24px] border-2 border-violet-100 bg-white p-5 shadow-sm dark:border-violet-900/30 dark:bg-slate-800'}`}>
                <div className="flex items-center gap-3">
                    <div className={`flex flex-shrink-0 items-center justify-center rounded-xl ${inHeader ? 'h-9 w-9 bg-white/16 text-white' : 'h-12 w-12 bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200'}`}>
                        <Ticket size={24} strokeWidth={2.5} />
                    </div>
                    <div className="flex-1">
                        <h3 className={`font-black ${inHeader ? 'text-sm text-white' : 'text-slate-900 dark:text-white'}`}>1 Mini-Prüfung kostenlos</h3>
                        <p className={`mt-0.5 text-sm leading-relaxed ${inHeader ? 'text-xs text-white/70' : 'text-slate-600 dark:text-slate-300'}`}>
                            Erstelle ein kostenloses Konto, damit dein Versuch gespeichert wird.
                        </p>
                        <button
                            type="button"
                            onClick={onRegister}
                            className={`mt-2 rounded-xl px-3 py-1.5 text-xs font-black transition-all active:scale-95 ${inHeader ? 'bg-white text-violet-700' : 'bg-violet-600 text-white'}`}
                        >
                            Kostenlos registrieren
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className={`${inHeader ? 'rounded-2xl bg-white/10 p-3 backdrop-blur-md' : 'mb-6 rounded-[24px] border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800'}`}>
                <div className={`flex items-center gap-3 text-sm font-bold ${inHeader ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>
                    <Loader2 size={18} className="animate-spin" />
                    Prüfungstickets werden geladen…
                </div>
            </div>
        );
    }

    if (!entitlement) {
        return (
            <div className={`${inHeader ? 'rounded-2xl bg-amber-300/12 p-3 text-amber-50 backdrop-blur-md' : 'mb-6 rounded-[24px] border border-amber-200 bg-amber-50 p-5 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200'}`}>
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
        <div className={`${inHeader ? 'rounded-2xl p-3 backdrop-blur-md' : 'mb-6 rounded-[24px] border-2 p-5 shadow-sm'} ${exhausted
            ? inHeader ? 'bg-rose-400/12' : 'border-rose-100 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-900/20'
            : inHeader ? 'bg-white/10' : 'border-violet-100 bg-white dark:border-violet-900/30 dark:bg-slate-800'
            }`}>
            <div className="flex items-center gap-3">
                <div className={`flex flex-shrink-0 items-center justify-center rounded-xl ${entitlement.isPremium
                    ? inHeader ? 'h-9 w-9 bg-amber-300/20 text-amber-100' : 'h-12 w-12 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
                    : inHeader ? 'h-9 w-9 bg-white/16 text-white' : 'h-12 w-12 bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200'
                    }`}>
                    {entitlement.isPremium ? <Crown size={inHeader ? 18 : 24} strokeWidth={2.5} /> : <Ticket size={inHeader ? 18 : 24} strokeWidth={2.5} />}
                </div>
                <div className="flex-1 min-w-0">
                    {title && (
                        <h3 className={`font-black ${inHeader ? 'text-sm text-white' : 'text-slate-900 dark:text-white'}`}>{title}</h3>
                    )}
                    <p className={`font-bold ${title ? 'mt-0.5' : ''} ${inHeader ? 'text-xs text-white/75' : 'text-sm text-slate-600 dark:text-slate-300'}`}>{description}</p>
                    <div className={`mt-2 h-1.5 overflow-hidden rounded-full ${inHeader ? 'bg-white/14' : 'bg-slate-100 dark:bg-slate-700'}`}>
                        <div
                            className={`h-full rounded-full ${exhausted ? 'bg-rose-300' : inHeader ? 'bg-white' : 'bg-violet-600'}`}
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
        { icon: <Mic size={18} />, title: 'Freies Sprechen', text: 'Echte Antworten statt Multiple Choice.' },
        { icon: <Sparkles size={18} />, title: 'Rückfragen', text: 'Nachfragen wie in der IHK-Prüfung.' },
        { icon: <ShieldCheck size={18} />, title: 'Auswertung', text: 'Score, Stärken, Lücken und Musterantworten.' },
    ];

    return (
        <div className="mb-5 rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <h2 className="text-base font-black text-slate-900 dark:text-white">Trainiere die mündliche Prüfung realistisch</h2>
            <p className="mt-1 mb-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                Sprich mit dem KI-Prüfer, beantworte Fallbeispiele und erhalte danach deine Auswertung.
            </p>
            <h3 className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Was dich erwartet
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
                {items.map((item) => (
                    <div key={item.title} className="flex gap-3 sm:block">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300 sm:mb-2">
                            {item.icon}
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-900 dark:text-white">{item.title}</h3>
                            <p className="mt-0.5 text-xs leading-snug text-slate-500 dark:text-slate-400">{item.text}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
