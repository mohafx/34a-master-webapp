import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, CheckCircle2, XCircle, Mic, ChevronRight, AlertCircle } from 'lucide-react';
import { listOralExamSessions } from '../../services/oralExam';
import type { OralExamSession } from '../../types';

function formatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleString('de-DE', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
        });
    } catch (_) {
        return iso;
    }
}

const MODE_LABEL: Record<string, string> = {
    free_test_3q: 'Gratis-Test',
    full_5min: 'Volle Simulation',
};

export default function OralExamHistory() {
    const navigate = useNavigate();
    const [sessions, setSessions] = useState<OralExamSession[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            setSessions(await listOralExamSessions());
            setLoading(false);
        })();
    }, []);

    return (
        <div className="max-w-3xl mx-auto px-4 pb-32">
            <div className="pt-3 mb-6">
                <div className="bg-gradient-to-br from-violet-600 to-indigo-700 text-white rounded-3xl md:rounded-[2rem] p-5 md:p-8 shadow-card relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none" />
                    <div className="flex items-center justify-between relative z-10">
                        <button
                            onClick={() => navigate('/oral-exam')}
                            className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-2xl flex items-center justify-center border border-white/20 active:scale-95 transition-all"
                        >
                            <ArrowLeft size={20} strokeWidth={2.5} />
                        </button>
                        <h1 className="font-black text-lg md:text-xl uppercase tracking-tight absolute left-1/2 -translate-x-1/2">Verlauf</h1>
                        <div className="w-10" />
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="py-20 text-center">
                    <Loader2 size={36} className="animate-spin text-violet-600 mx-auto" />
                </div>
            ) : sessions.length === 0 ? (
                <div className="py-16 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-5">
                        <Mic size={30} />
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 mb-6">Noch keine mündlichen Durchläufe.</p>
                    <button
                        onClick={() => navigate('/oral-exam')}
                        className="px-6 py-3 rounded-2xl bg-violet-600 text-white font-bold active:scale-95 transition-all"
                    >
                        Erste Prüfung starten
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {sessions.map((s) => {
                        const done = s.status === 'done' && s.overall_score_pct != null;
                        const aborted = s.status === 'aborted';
                        const failed = !done;
                        const passed = s.passed ?? (s.overall_score_pct ?? 0) >= 50;
                        return (
                            <button
                                key={s.id}
                                onClick={() => navigate(`/oral-exam/results/${s.id}`)}
                                className="w-full text-left bg-white dark:bg-slate-800 rounded-[20px] p-4 shadow-sm border border-slate-100 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all active:scale-[0.99] flex items-center gap-4"
                            >
                                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${done
                                    ? passed
                                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300'
                                        : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-300'
                                    : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-300'
                                    }`}>
                                    {done ? (passed ? <CheckCircle2 size={22} /> : <XCircle size={22} />) : <AlertCircle size={22} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="font-black text-slate-900 dark:text-white">
                                            {done ? `${s.overall_score_pct}%` : aborted ? 'Abgebrochen' : 'Auswertung fehlgeschlagen'}
                                        </span>
                                        <span className="text-xs font-bold text-slate-400">{MODE_LABEL[s.mode] ?? s.mode}</span>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                        {formatDate(s.created_at)}{s.focus_topic ? ` · ${s.focus_topic}` : ''}{failed ? aborted ? ' · Neue Prüfung' : ' · Retry' : ''}
                                    </p>
                                </div>
                                <ChevronRight size={20} className="text-slate-300 dark:text-slate-600 flex-shrink-0" />
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
