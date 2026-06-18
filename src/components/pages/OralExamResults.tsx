import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
    ArrowLeft, Loader2, CheckCircle2, XCircle, Target, ThumbsUp,
    AlertCircle, BookOpen, Compass, ArrowRight, Mic,
} from 'lucide-react';
import { usePostHog } from '../../contexts/PostHogProvider';
import { getOralExamSession } from '../../services/oralExam';
import type { OralExamEvaluation } from '../../types';

interface ResultsNavState {
    result?: OralExamEvaluation;
    mode?: string;
}

function scoreColor(pct: number): string {
    if (pct >= 75) return 'text-emerald-600 dark:text-emerald-400';
    if (pct >= 50) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
}

function barColor(pct: number): string {
    if (pct >= 75) return 'bg-emerald-500';
    if (pct >= 50) return 'bg-amber-500';
    return 'bg-red-500';
}

export default function OralExamResults() {
    const navigate = useNavigate();
    const { sessionId } = useParams<{ sessionId: string }>();
    const location = useLocation();
    const navState = (location.state as ResultsNavState) || {};
    const { trackEvent } = usePostHog();

    const [evaluation, setEvaluation] = useState<OralExamEvaluation | null>(navState.result ?? null);
    const [loading, setLoading] = useState(!navState.result);
    const [error, setError] = useState<string | null>(null);
    const trackedRef = useRef(false);

    useEffect(() => {
        if (evaluation || !sessionId) return;
        (async () => {
            const session = await getOralExamSession(sessionId);
            if (!session) {
                setError('Auswertung nicht gefunden.');
            } else if (session.status !== 'done' || session.overall_score_pct == null) {
                setError('Diese Prüfung wurde noch nicht ausgewertet.');
            } else {
                setEvaluation({
                    overall_score_pct: session.overall_score_pct,
                    passed: session.passed ?? session.overall_score_pct >= 50,
                    topic_scores: session.topic_scores ?? [],
                    strengths: session.feedback?.strengths ?? [],
                    gaps: session.feedback?.gaps ?? [],
                    model_answers: session.feedback?.model_answers ?? [],
                    roter_faden: session.feedback?.roter_faden ?? [],
                    next_step: session.feedback?.next_step ?? '',
                });
            }
            setLoading(false);
        })();
    }, [evaluation, sessionId]);

    useEffect(() => {
        if (evaluation && !trackedRef.current) {
            trackedRef.current = true;
            trackEvent('oral_exam_completed', {
                score: evaluation.overall_score_pct,
                passed: evaluation.passed,
                mode: navState.mode,
            });
        }
    }, [evaluation, navState.mode, trackEvent]);

    if (loading) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-20 text-center">
                <Loader2 size={40} className="animate-spin text-violet-600 mx-auto mb-6" />
                <p className="text-slate-500 dark:text-slate-400">Auswertung wird geladen…</p>
            </div>
        );
    }

    if (error || !evaluation) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-20 text-center">
                <p className="text-slate-600 dark:text-slate-300 mb-8">{error ?? 'Keine Auswertung verfügbar.'}</p>
                <button
                    onClick={() => navigate('/oral-exam')}
                    className="px-6 py-3 rounded-2xl bg-violet-600 text-white font-bold active:scale-95 transition-all"
                >
                    Zurück
                </button>
            </div>
        );
    }

    const { overall_score_pct, passed, topic_scores, strengths, gaps, model_answers, roter_faden, next_step } = evaluation;

    return (
        <div className="max-w-3xl mx-auto px-4 pb-32">
            {/* Header / Score */}
            <div className="pt-3 mb-6">
                <div className={`rounded-3xl md:rounded-[2rem] p-6 md:p-10 text-white shadow-card relative overflow-hidden ${passed ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-rose-500 to-red-600'}`}>
                    <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none" />
                    <div className="flex items-center justify-between mb-6 relative z-10">
                        <button
                            onClick={() => navigate('/oral-exam')}
                            className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-2xl flex items-center justify-center border border-white/20 active:scale-95 transition-all"
                        >
                            <ArrowLeft size={20} strokeWidth={2.5} />
                        </button>
                        <span className="text-sm font-bold uppercase tracking-wide opacity-90">Auswertung</span>
                        <div className="w-10" />
                    </div>
                    <div className="relative z-10 text-center">
                        <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md px-4 py-1.5 rounded-full text-sm font-black mb-4">
                            {passed ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                            {passed ? 'Bestanden' : 'Nicht bestanden'}
                        </div>
                        <div className="text-6xl md:text-7xl font-black tabular-nums">{overall_score_pct}%</div>
                        <p className="text-white/80 text-sm mt-2">Bestehensgrenze: 50 %</p>
                    </div>
                </div>
            </div>

            {/* Themen-Scores */}
            {topic_scores.length > 0 && (
                <Section icon={<Target size={18} />} title="Nach Themengebiet">
                    <div className="space-y-4">
                        {topic_scores.map((t, i) => (
                            <div key={i}>
                                <div className="flex justify-between items-baseline mb-1">
                                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{t.topic}</span>
                                    <span className={`text-sm font-black ${scoreColor(t.score_pct)}`}>{t.score_pct}%</span>
                                </div>
                                <div className="h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${barColor(t.score_pct)}`} style={{ width: `${Math.max(0, Math.min(100, t.score_pct))}%` }} />
                                </div>
                                {t.comment && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t.comment}</p>}
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* Stärken & Lücken */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {strengths.length > 0 && (
                    <ListCard icon={<ThumbsUp size={18} />} title="Das lief gut" items={strengths} tone="emerald" />
                )}
                {gaps.length > 0 && (
                    <ListCard icon={<AlertCircle size={18} />} title="Daran arbeiten" items={gaps} tone="amber" />
                )}
            </div>

            {/* Musterantworten */}
            {model_answers.length > 0 && (
                <Section icon={<BookOpen size={18} />} title="Musterantworten">
                    <div className="space-y-4">
                        {model_answers.map((m, i) => (
                            <div key={i} className="border-l-4 border-violet-400 pl-4">
                                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">{m.scenario}</p>
                                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{m.musterantwort}</p>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* Roter Faden */}
            {roter_faden.length > 0 && (
                <Section icon={<Compass size={18} />} title="Dein roter Faden für die echte Prüfung">
                    <ul className="space-y-2">
                        {roter_faden.map((r, i) => (
                            <li key={i} className="flex gap-2 text-sm text-slate-700 dark:text-slate-200">
                                <span className="text-violet-500 font-black">•</span> {r}
                            </li>
                        ))}
                    </ul>
                </Section>
            )}

            {/* Next step */}
            {next_step && (
                <div className="rounded-[24px] p-5 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800 mb-6 flex gap-3">
                    <ArrowRight size={20} className="text-violet-600 dark:text-violet-300 flex-shrink-0 mt-0.5" />
                    <div>
                        <h3 className="font-black text-sm text-violet-900 dark:text-violet-200 mb-0.5">Nächster Schritt</h3>
                        <p className="text-sm text-violet-800 dark:text-violet-300">{next_step}</p>
                    </div>
                </div>
            )}

            {/* Aktionen */}
            <div className="flex flex-col sm:flex-row gap-3">
                <button
                    onClick={() => navigate('/oral-exam')}
                    className="flex-1 bg-gradient-to-br from-violet-600 to-indigo-700 text-white rounded-2xl px-6 py-4 font-black flex items-center justify-center gap-2 shadow-lg shadow-violet-500/20 active:scale-[0.98] transition-all"
                >
                    <Mic size={20} strokeWidth={2.5} /> Nochmal üben
                </button>
                <button
                    onClick={() => navigate('/oral-exam/history')}
                    className="flex-1 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl px-6 py-4 font-black active:scale-[0.98] transition-all"
                >
                    Verlauf ansehen
                </button>
            </div>
        </div>
    );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
    return (
        <div className="bg-white dark:bg-slate-800 rounded-[24px] p-5 md:p-6 shadow-sm border border-slate-100 dark:border-slate-700 mb-4">
            <div className="flex items-center gap-2 mb-4">
                <span className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-300 flex items-center justify-center">{icon}</span>
                <h2 className="font-black text-base text-slate-900 dark:text-white">{title}</h2>
            </div>
            {children}
        </div>
    );
}

function ListCard({ icon, title, items, tone }: { icon: React.ReactNode; title: string; items: string[]; tone: 'emerald' | 'amber' }) {
    const toneClasses = tone === 'emerald'
        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300'
        : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300';
    return (
        <div className="bg-white dark:bg-slate-800 rounded-[24px] p-5 shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-2 mb-3">
                <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${toneClasses}`}>{icon}</span>
                <h2 className="font-black text-base text-slate-900 dark:text-white">{title}</h2>
            </div>
            <ul className="space-y-2">
                {items.map((item, i) => (
                    <li key={i} className="text-sm text-slate-700 dark:text-slate-200 leading-snug">{item}</li>
                ))}
            </ul>
        </div>
    );
}
