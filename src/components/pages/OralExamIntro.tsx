import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mic, Loader2, Sparkles, ShieldCheck, Zap, Crown } from 'lucide-react';
import { useApp } from '../../App';
import { usePostHog } from '../../contexts/PostHogProvider';
import {
    startOralExamSession,
    OralExamFeatureUnavailableError,
    OralExamPaywallError,
} from '../../services/oralExam';

type TestMode = 'free_test_3q' | 'full_simulation';

export default function OralExamIntro() {
    const navigate = useNavigate();
    const location = useLocation();
    const { openPaywall } = useApp();
    const { trackEvent } = usePostHog();

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedMode, setSelectedMode] = useState<TestMode>('full_simulation');
    const devAutoStartRef = useRef(false);

    const handleStart = async () => {
        setLoading(true);
        setError(null);
        try {
            const session = await startOralExamSession(null, selectedMode);
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
                openPaywall('Mündliche Prüfung');
            } else if (err instanceof OralExamFeatureUnavailableError) {
                setError('Die mündliche Prüfung ist aktuell nur im internen Test verfügbar.');
            } else {
                setError(err instanceof Error ? err.message : 'Unbekannter Fehler.');
            }
            setLoading(false);
        }
    };

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (params.get('devStart') !== '1' || devAutoStartRef.current) return;
        devAutoStartRef.current = true;
        void handleStart();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.search]);

    return (
        <div className="max-w-4xl mx-auto px-4 pb-32">
            {/* Header */}
            <div className="pt-3 mb-6 md:mb-8">
                <div className="bg-gradient-to-br from-violet-600 to-indigo-700 text-white rounded-3xl md:rounded-[2rem] p-5 md:p-10 shadow-card relative overflow-hidden flex flex-col">
                    <div className="absolute top-0 right-0 w-64 md:w-96 h-64 md:h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-48 md:w-72 h-48 md:h-72 bg-black/10 rounded-full translate-y-1/3 -translate-x-1/3 blur-3xl pointer-events-none" />

                    <div className="flex items-center gap-3 relative z-10 w-full mb-4">
                        <button
                            onClick={() => navigate('/exam')}
                            className="w-10 h-10 md:w-12 md:h-12 flex-shrink-0 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20 text-white transition-all active:scale-95 shadow-sm"
                        >
                            <ArrowLeft size={22} strokeWidth={2.5} />
                        </button>
                        <h1 className="flex-1 text-center font-black text-lg md:text-2xl text-white tracking-tight uppercase">
                            Mündliche Prüfung
                        </h1>
                        <div className="w-10 md:w-12 flex-shrink-0" />
                    </div>

                    <div className="relative z-10">
                        <p className="text-white/90 text-sm md:text-base leading-relaxed max-w-xl">
                            Übe die mündliche §34a-Prüfung mit einer KI-Prüfer-Stimme. Du sprichst,
                            die KI stellt praxisnahe Fallbeispiele und fragt nach — danach bekommst du
                            eine ehrliche Auswertung.
                        </p>
                    </div>
                </div>
            </div>

            {/* Hinweise */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                <InfoChip icon={<Mic size={18} />} title="Sprich frei" text="Beantworte per Mikrofon, wie in der echten Prüfung." />
                <InfoChip icon={<Sparkles size={18} />} title="Dynamische Rückfragen" text="Die KI bohrt nach — genau wie ein Prüfer." />
                <InfoChip icon={<ShieldCheck size={18} />} title="Ohne Konsequenzen" text="So oft du willst. Bestehensgrenze: 50 %." />
            </div>

            {/* Modus-Auswahl (Admin-Test: beide Abläufe prüfbar) */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-2 px-1">
                    <h3 className="font-black text-sm text-slate-900 dark:text-white uppercase tracking-tight">Test-Modus</h3>
                    <span className="text-[10px] font-black uppercase tracking-wide bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300 px-2.5 py-1 rounded-full">
                        Intern
                    </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <ModeCard
                        active={selectedMode === 'free_test_3q'}
                        onClick={() => setSelectedMode('free_test_3q')}
                        icon={<Zap size={20} strokeWidth={2.5} />}
                        title="Free"
                        subtitle="Mini · 3 Aufgaben"
                        meta="max. 3 Min"
                    />
                    <ModeCard
                        active={selectedMode === 'full_simulation'}
                        onClick={() => setSelectedMode('full_simulation')}
                        icon={<Crown size={20} strokeWidth={2.5} />}
                        title="Premium"
                        subtitle="Voll · mehrere Themen"
                        meta="8-12 Min"
                    />
                </div>
            </div>

            {error && (
                <div className="mb-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 text-sm font-medium">
                    {error}
                </div>
            )}

            {/* Start */}
            <button
                onClick={handleStart}
                disabled={loading}
                className="w-full bg-gradient-to-br from-violet-600 to-indigo-700 text-white rounded-[24px] p-5 shadow-lg shadow-violet-500/20 font-black text-lg flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            >
                {loading ? (
                    <>
                        <Loader2 size={22} className="animate-spin" /> Prüfung wird vorbereitet…
                    </>
                ) : (
                    <>
                        <Mic size={22} strokeWidth={2.5} /> Mündliche Prüfung starten
                    </>
                )}
            </button>
            <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-3">
                Mikrofon-Zugriff wird benötigt. Du kannst jederzeit beenden.
            </p>

        </div>
    );
}

function ModeCard({
    active,
    onClick,
    icon,
    title,
    subtitle,
    meta,
}: {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    meta: string;
}) {
    return (
        <button
            onClick={onClick}
            className={`text-left rounded-2xl p-4 border-2 transition-all active:scale-[0.98] ${active
                ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 shadow-md shadow-violet-500/10'
                : 'border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
        >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${active
                ? 'bg-violet-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300'
                }`}>
                {icon}
            </div>
            <h4 className="font-black text-base text-slate-900 dark:text-white">{title}</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
            <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 mt-1">{meta}</p>
        </button>
    );
}

function InfoChip({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-300 flex items-center justify-center mb-2">
                {icon}
            </div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">{title}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{text}</p>
        </div>
    );
}
