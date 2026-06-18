import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { Mic, MicOff, Loader2, PhoneOff, AlertTriangle } from 'lucide-react';
import { evaluateOralExam, abortOralExamSession } from '../../services/oralExam';
import type { OralExamTranscriptTurn } from '../../types';

interface LiveState {
    sessionId: string;
    signedUrl: string;
    dynamicVariables: Record<string, string>;
    maxDurationSec: number;
    mode: string;
    focusTopic: string | null;
}

type Phase = 'permission' | 'connecting' | 'live' | 'evaluating' | 'error';

function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function OralExamLiveInner({ state }: { state: LiveState }) {
    const navigate = useNavigate();
    const conversation = useConversation({
        onConnect: ({ conversationId }) => {
            conversationIdRef.current = conversationId;
            setPhase('live');
        },
        onDisconnect: () => {
            // Vom Agenten/Server beendet → auswerten (sofern nicht schon beendet).
            void finish();
        },
        onMessage: ({ message, role }) => {
            if (!message?.trim()) return;
            setTranscript((prev) => [
                ...prev,
                { role: role === 'agent' ? 'examiner' : 'candidate', text: message },
            ]);
        },
        onError: (message) => {
            setErrorMsg(message || 'Verbindungsfehler.');
            setPhase('error');
        },
    });

    const [phase, setPhase] = useState<Phase>('permission');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [transcript, setTranscript] = useState<OralExamTranscriptTurn[]>([]);
    const [remaining, setRemaining] = useState(state.maxDurationSec);

    const conversationIdRef = useRef<string | undefined>(undefined);
    const transcriptRef = useRef<OralExamTranscriptTurn[]>([]);
    const startedRef = useRef(false);
    const finishingRef = useRef(false);
    const startTimeRef = useRef<number>(0);

    transcriptRef.current = transcript;

    // Auswertung + Weiterleitung. Mehrfachaufruf wird hart unterbunden.
    const finish = useCallback(async () => {
        if (finishingRef.current) return;
        finishingRef.current = true;
        setPhase('evaluating');

        try {
            conversation.endSession();
        } catch (_) {
            /* schon getrennt */
        }

        const durationS = startTimeRef.current
            ? Math.round((Date.now() - startTimeRef.current) / 1000)
            : state.maxDurationSec - remaining;

        try {
            const result = await evaluateOralExam(
                state.sessionId,
                transcriptRef.current,
                durationS,
                conversationIdRef.current
            );
            navigate(`/oral-exam/results/${state.sessionId}`, {
                replace: true,
                state: { result, mode: state.mode },
            });
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : 'Auswertung fehlgeschlagen.');
            setPhase('error');
            finishingRef.current = false;
        }
    }, [conversation, navigate, remaining, state.maxDurationSec, state.mode, state.sessionId]);

    // Start: Mikro-Permission holen, dann ElevenLabs-Session aufbauen (einmalig).
    useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;

        (async () => {
            try {
                await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (_) {
                setErrorMsg('Mikrofon-Zugriff wurde abgelehnt. Bitte erlaube den Zugriff und versuche es erneut.');
                setPhase('error');
                return;
            }

            setPhase('connecting');
            startTimeRef.current = Date.now();
            try {
                await conversation.startSession({
                    signedUrl: state.signedUrl,
                    connectionType: 'websocket',
                    dynamicVariables: state.dynamicVariables,
                });
            } catch (err) {
                setErrorMsg(err instanceof Error ? err.message : 'Verbindung zum Prüfer fehlgeschlagen.');
                setPhase('error');
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Countdown — nur während die Prüfung läuft.
    useEffect(() => {
        if (phase !== 'live') return;
        if (remaining <= 0) {
            void finish();
            return;
        }
        const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
        return () => clearTimeout(t);
    }, [phase, remaining, finish]);

    // Cleanup beim Verlassen ohne Abschluss → Session abbrechen + trennen.
    useEffect(() => {
        return () => {
            if (!finishingRef.current) {
                try { conversation.endSession(); } catch (_) { /* noop */ }
                void abortOralExamSession(state.sessionId);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (phase === 'error') {
        return (
            <div className="max-w-2xl mx-auto px-4 py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-300 flex items-center justify-center mx-auto mb-5">
                    <AlertTriangle size={32} />
                </div>
                <h1 className="font-black text-xl text-slate-900 dark:text-white mb-2">Etwas ist schiefgelaufen</h1>
                <p className="text-slate-600 dark:text-slate-300 mb-8 text-sm">{errorMsg}</p>
                <div className="flex gap-3 justify-center">
                    <button
                        onClick={() => navigate('/oral-exam', { replace: true })}
                        className="px-6 py-3 rounded-2xl bg-violet-600 text-white font-bold active:scale-95 transition-all"
                    >
                        Erneut versuchen
                    </button>
                </div>
            </div>
        );
    }

    if (phase === 'evaluating') {
        return (
            <div className="max-w-2xl mx-auto px-4 py-20 text-center">
                <Loader2 size={40} className="animate-spin text-violet-600 mx-auto mb-6" />
                <h1 className="font-black text-xl text-slate-900 dark:text-white mb-2">Auswertung läuft…</h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Dein Gespräch wird von der KI bewertet. Einen Moment.</p>
            </div>
        );
    }

    const isExaminerSpeaking = conversation.isSpeaking;
    const connecting = phase === 'permission' || phase === 'connecting';

    return (
        <div className="max-w-2xl mx-auto px-4 pb-32">
            {/* Status-Bühne */}
            <div className="pt-6 mb-6">
                <div className="bg-gradient-to-br from-violet-600 to-indigo-800 text-white rounded-[2rem] p-8 md:p-10 shadow-card relative overflow-hidden flex flex-col items-center text-center min-h-[340px] justify-center">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none" />

                    {/* Timer */}
                    <div className="absolute top-5 right-6 text-sm font-black tabular-nums bg-white/15 px-3 py-1.5 rounded-xl backdrop-blur-md">
                        {formatTime(remaining)}
                    </div>

                    {/* Avatar / Puls */}
                    <div className="relative z-10 mb-6">
                        <div
                            className={`w-28 h-28 rounded-full flex items-center justify-center transition-all duration-300 ${isExaminerSpeaking
                                ? 'bg-white/25 scale-110 shadow-2xl shadow-white/30'
                                : 'bg-white/12'
                                }`}
                        >
                            {connecting ? (
                                <Loader2 size={44} className="animate-spin" />
                            ) : (
                                <Mic size={44} strokeWidth={2} className={isExaminerSpeaking ? 'animate-pulse' : ''} />
                            )}
                        </div>
                        {isExaminerSpeaking && (
                            <span className="absolute inset-0 rounded-full border-2 border-white/40 animate-ping" />
                        )}
                    </div>

                    <h1 className="font-black text-xl md:text-2xl relative z-10">Dr. Klaus Wagner</h1>
                    <p className="text-white/80 text-sm mt-1 relative z-10">
                        {connecting
                            ? 'Verbinde mit dem Prüfer…'
                            : isExaminerSpeaking
                                ? 'Der Prüfer spricht…'
                                : 'Du bist dran — sprich jetzt.'}
                    </p>
                </div>
            </div>

            {/* Live-Transkript */}
            <div className="bg-white dark:bg-slate-800 rounded-[24px] p-5 shadow-sm border border-slate-100 dark:border-slate-700 mb-6 max-h-72 overflow-y-auto no-scrollbar">
                {transcript.length === 0 ? (
                    <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">
                        Das Gespräch erscheint hier live…
                    </p>
                ) : (
                    <div className="space-y-3">
                        {transcript.map((turn, i) => (
                            <div key={i} className={turn.role === 'examiner' ? 'text-left' : 'text-right'}>
                                <span
                                    className={`inline-block px-3.5 py-2 rounded-2xl text-sm max-w-[85%] ${turn.role === 'examiner'
                                        ? 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100'
                                        : 'bg-violet-600 text-white'
                                        }`}
                                >
                                    {turn.text}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Steuerung */}
            <div className="flex items-center justify-center gap-3">
                <button
                    onClick={() => conversation.setMuted(!conversation.isMuted)}
                    disabled={connecting}
                    className="w-14 h-14 rounded-2xl bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shadow-sm active:scale-95 transition-all disabled:opacity-50"
                    title={conversation.isMuted ? 'Mikrofon an' : 'Mikrofon stumm'}
                >
                    {conversation.isMuted ? <MicOff size={22} /> : <Mic size={22} />}
                </button>
                <button
                    onClick={() => void finish()}
                    className="flex-1 max-w-xs bg-red-500 hover:bg-red-600 text-white rounded-2xl px-6 py-4 font-black flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 active:scale-[0.98] transition-all"
                >
                    <PhoneOff size={20} strokeWidth={2.5} /> Prüfung beenden
                </button>
            </div>
        </div>
    );
}

export default function OralExamLive() {
    const location = useLocation();
    const navigate = useNavigate();
    const state = location.state as LiveState | null;

    useEffect(() => {
        if (!state?.sessionId || !state?.signedUrl) {
            navigate('/oral-exam', { replace: true });
        }
    }, [state, navigate]);

    if (!state?.sessionId || !state?.signedUrl) {
        return null;
    }

    return (
        <ConversationProvider>
            <OralExamLiveInner state={state} />
        </ConversationProvider>
    );
}
