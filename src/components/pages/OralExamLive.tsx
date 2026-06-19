import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { Mic, MicOff, Loader2, PhoneOff, AlertTriangle, Volume2 } from 'lucide-react';
import { evaluateOralExam, abortOralExamSession, confirmOralExamSession } from '../../services/oralExam';
import type { OralExamTranscriptTurn } from '../../types';

// Module-level lock to prevent duplicate startSession calls during React StrictMode remounts
let globalActiveSessionId: string | null = null;

interface LiveState {
    sessionId: string;
    signedUrl: string;
    dynamicVariables: Record<string, string>;
    maxDurationSec: number;
    mode: string;
    focusTopic: string | null;
    mock?: boolean;
}

type Phase = 'permission' | 'connecting' | 'live' | 'evaluating' | 'error';
function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function cleanOralExamMessage(text: string): string {
    return text
        .replace(/\[[A-Za-zÄÖÜäöüß\s-]+\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const MOCK_TRANSCRIPT: OralExamTranscriptTurn[] = [
    {
        role: 'examiner',
        text: cleanOralExamMessage('[happy] Guten Tag. Sie sind im Objektschutz tätig und ein Besucher möchte ohne Ausweis eintreten. Wie verhalten Sie sich?'),
    },
    {
        role: 'candidate',
        text: 'Ich bleibe ruhig, verweigere den Zutritt und erkläre sachlich, dass ein gültiger Ausweis erforderlich ist.',
    },
    {
        role: 'examiner',
        text: 'Welche kommunikativen Mittel nutzen Sie, wenn der Besucher aggressiver wird?',
    },
];

function OralExamLiveInner({ state }: { state: LiveState }) {
    const navigate = useNavigate();
    const isMock = state.mock === true;
    const conversation = useConversation({
        onConnect: ({ conversationId }) => {
            conversationIdRef.current = conversationId;
            // Ab hier hat die Session real verbunden → Ticket zählt jetzt (connected_at).
            void (async () => {
                if (!isMock) await confirmOralExamSession(state.sessionId);
                setPhase('live');
            })();
        },
        onDisconnect: () => {
            // Vom Agenten/Server beendet → auswerten (sofern nicht schon beendet).
            void finish();
        },
        onMessage: ({ message, role }) => {
            const cleaned = cleanOralExamMessage(message ?? '');
            if (!cleaned) return;
            const normalizedRole = role === 'agent' ? 'examiner' : 'candidate';
            if (normalizedRole === 'candidate') {
                lastUserVoiceAtRef.current = Date.now();
            }
            setTranscript((prev) => [
                ...prev,
                { role: normalizedRole, text: cleaned },
            ]);
        },
        onError: (message) => {
            setErrorMsg(message || 'Verbindungsfehler.');
            setPhase('error');
        },
    });

    const [phase, setPhase] = useState<Phase>(isMock ? 'live' : 'permission');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [transcript, setTranscript] = useState<OralExamTranscriptTurn[]>(isMock ? MOCK_TRANSCRIPT : []);
    const [remaining, setRemaining] = useState(state.maxDurationSec);
    const [inputLevel, setInputLevel] = useState(0);
    const [agentSpeakingLive, setAgentSpeakingLive] = useState(false);
    const [evaluationProgress, setEvaluationProgress] = useState(0);
    const [microphoneBlocked, setMicrophoneBlocked] = useState(false);
    const [showEndConfirm, setShowEndConfirm] = useState(false);

    const conversationIdRef = useRef<string | undefined>(undefined);
    const transcriptRef = useRef<OralExamTranscriptTurn[]>([]);
    const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
    const transcriptBottomRef = useRef<HTMLDivElement | null>(null);
    const agentSpeakingSinceRef = useRef<number | null>(null);
    const lastUserVoiceAtRef = useRef(0);
    const startedRef = useRef(false);
    const finishingRef = useRef(false);
    const startTimeRef = useRef<number>(0);

    transcriptRef.current = transcript;

    const startLiveSession = useCallback(async () => {
        if (isMock) return;

        // Prevent StrictMode double-start
        if (globalActiveSessionId === state.sessionId) {
            return;
        }
        globalActiveSessionId = state.sessionId;

        setMicrophoneBlocked(false);
        setErrorMsg(null);

        if (!navigator.mediaDevices?.getUserMedia) {
            setMicrophoneBlocked(true);
            setErrorMsg('Dein Browser unterstützt keinen Mikrofon-Zugriff.');
            setPhase('error');
            startedRef.current = false;
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
        } catch (err: any) {
            const errorMsgLower = (err?.message || '').toLowerCase();
            const isMicError = 
                errorMsgLower.includes('permission') || 
                errorMsgLower.includes('allowed') || 
                errorMsgLower.includes('notallowederror') ||
                err?.name === 'NotAllowedError';

            if (isMicError) {
                setMicrophoneBlocked(true);
                setErrorMsg('Mikrofon-Zugriff wurde nicht bestätigt. Deshalb kann die mündliche Prüfung nicht gestartet werden. Bitte erlaube den Mikrofon-Zugriff im Browser und versuche es erneut.');
            } else {
                setErrorMsg(err instanceof Error ? err.message : 'Verbindung zum Prüfer fehlgeschlagen.');
            }
            setPhase('error');
            startedRef.current = false;
        }
    }, [conversation, isMock, state.dynamicVariables, state.signedUrl]);

    // Auswertung + Weiterleitung. Mehrfachaufruf wird hart unterbunden.
    const finish = useCallback(async () => {
        if (finishingRef.current) return;
        if (isMock) {
            navigate('/oral-exam/live?devMock=1', { replace: true });
            return;
        }
        finishingRef.current = true;
        setEvaluationProgress(8);
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
                transcriptRef.current.map((turn) => ({
                    ...turn,
                    text: cleanOralExamMessage(turn.text),
                })).filter((turn) => turn.text.length > 0),
                durationS,
                conversationIdRef.current
            );
            setEvaluationProgress(100);
            globalActiveSessionId = null;
            navigate(`/oral-exam/results/${state.sessionId}`, {
                replace: true,
                state: { result, mode: state.mode },
            });
        } catch (err) {
            const raw = err instanceof Error ? err.message : '';
            const friendly = raw.includes('Transkript')
                ? 'Es wurde kein Gespräch aufgezeichnet. Sprich bitte mit dem Prüfer und beende die Prüfung erst danach.'
                : raw || 'Auswertung fehlgeschlagen.';
            setErrorMsg(friendly);
            setPhase('error');
            setEvaluationProgress(0);
            globalActiveSessionId = null;
            finishingRef.current = false;
        }
    }, [conversation, isMock, navigate, remaining, state.maxDurationSec, state.mode, state.sessionId]);

    const abortAndLeave = useCallback(async () => {
        if (finishingRef.current) return;
        finishingRef.current = true;
        
        try { conversation.endSession(); } catch (_) { /* noop */ }
        
        if (!isMock) {
            await abortOralExamSession(state.sessionId);
        }
        
        globalActiveSessionId = null;
        navigate('/oral-exam', { replace: true });
    }, [conversation, isMock, navigate, state.sessionId]);

    // Start: Mikro-Permission holen, dann ElevenLabs-Session aufbauen (einmalig).
    useEffect(() => {
        if (isMock) return;
        if (startedRef.current) return;

        const timer = setTimeout(() => {
            startedRef.current = true;
            void startLiveSession();
        }, 50);

        return () => {
            clearTimeout(timer);
        };
    }, [isMock, startLiveSession]);

    // Countdown — nur während die Prüfung läuft.
    useEffect(() => {
        if (phase !== 'live' || isMock) return;
        if (remaining <= 0) {
            void finish();
            return;
        }
        const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
        return () => clearTimeout(t);
    }, [phase, remaining, finish, isMock]);

    useLayoutEffect(() => {
        const el = transcriptScrollRef.current;
        if (!el) return;
        const scrollToLatest = (behavior: ScrollBehavior) => {
            el.scrollTo({ top: el.scrollHeight, behavior });
            transcriptBottomRef.current?.scrollIntoView({ block: 'end', behavior });
        };
        scrollToLatest('auto');
        requestAnimationFrame(() => {
            scrollToLatest('smooth');
            window.setTimeout(() => scrollToLatest('auto'), 120);
        });
    }, [transcript]);

    useEffect(() => {
        if (phase === 'error' || phase === 'evaluating') return;
        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;
        };
    }, [phase]);

    // Fortschritt während der Auswertung. Die echten Schritte passieren serverseitig
    // ohne Streaming; deshalb steigt der Wert bis 95 % und springt erst bei Erfolg auf 100 %.
    useEffect(() => {
        if (phase !== 'evaluating') return;
        const startedAt = Date.now();
        const timer = window.setInterval(() => {
            const elapsed = Date.now() - startedAt;
            const next = Math.min(95, 8 + Math.round((elapsed / 45000) * 87));
            setEvaluationProgress((current) => Math.max(current, next));
        }, 600);
        return () => window.clearInterval(timer);
    }, [phase]);

    // ElevenLabs-Sprechstatus und Mikrofon-Pegel direkt pollen. So hängt die Anzeige
    // nicht an verspäteten Transkript-Events.
    useEffect(() => {
        if (isMock) {
            setInputLevel(0.18);
            setAgentSpeakingLive(false);
            return;
        }
        if (phase !== 'live') {
            setInputLevel(0);
            setAgentSpeakingLive(false);
            return;
        }
        let raf = 0;
        const tick = () => {
            try {
                // 0..1; bei stummem Mikro 0. getInputVolume kann kurz nach Connect werfen → guard.
                const now = Date.now();
                const v = conversation.getInputVolume?.() ?? 0;
                const outputVolume = conversation.getOutputVolume?.() ?? 0;
                const nextInputLevel = conversation.isMuted ? 0 : v;
                const userIsAudiblySpeaking = nextInputLevel > 0.025;
                if (userIsAudiblySpeaking) {
                    lastUserVoiceAtRef.current = now;
                }

                const agentAudioIsAudible = outputVolume > 0.012;
                const rawAgentSpeaking = Boolean(conversation.isSpeaking || conversation.mode === 'speaking');
                if (rawAgentSpeaking && agentSpeakingSinceRef.current === null) {
                    agentSpeakingSinceRef.current = now;
                }
                if (!rawAgentSpeaking) {
                    agentSpeakingSinceRef.current = null;
                }

                const agentSpeakingStartedAt = agentSpeakingSinceRef.current ?? now;
                const agentSpeakingTimedOut = now - agentSpeakingStartedAt > 12000 && !agentAudioIsAudible;
                const userJustSpoke = now - lastUserVoiceAtRef.current < 700;

                setInputLevel(nextInputLevel);
                setAgentSpeakingLive(agentAudioIsAudible || (rawAgentSpeaking && !agentSpeakingTimedOut && !userJustSpoke && !userIsAudiblySpeaking));
            } catch (_) {
                /* noch nicht bereit */
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [phase, conversation, isMock]);

    // Cleanup beim Verlassen ohne Abschluss → Session abbrechen + trennen.
    useEffect(() => {
        return () => {
            globalActiveSessionId = null;
            if (!isMock && !finishingRef.current) {
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
                {microphoneBlocked && (
                    <p className="mx-auto -mt-4 mb-6 max-w-md text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                        Falls keine Abfrage erscheint, wurde das Mikrofon eventuell dauerhaft blockiert.
                        Öffne dann die Browser- oder Geräteeinstellungen und erlaube den Mikrofon-Zugriff für diese Seite.
                    </p>
                )}
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    {microphoneBlocked ? (
                        <button
                            onClick={() => {
                                globalActiveSessionId = null;
                                startedRef.current = true;
                                void startLiveSession();
                            }}
                            className="px-6 py-3 rounded-2xl bg-violet-600 text-white font-bold active:scale-95 transition-all inline-flex items-center justify-center gap-2"
                        >
                            <Mic size={18} /> Mikrofon-Zugriff erneut erlauben
                        </button>
                    ) : (
                        <button
                            onClick={() => {
                                globalActiveSessionId = null;
                                startedRef.current = true;
                                void startLiveSession();
                            }}
                            className="px-6 py-3 rounded-2xl bg-violet-600 text-white font-bold active:scale-95 transition-all"
                        >
                            Erneut versuchen
                        </button>
                    )}
                    <button
                        onClick={() => navigate('/oral-exam', { replace: true })}
                        className="px-6 py-3 rounded-2xl bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold active:scale-95 transition-all"
                    >
                        Zur Vorbereitung
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
                <div className="w-full max-w-sm mx-auto mt-5 mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Fortschritt
                        </span>
                        <span className="text-sm font-black tabular-nums text-violet-600 dark:text-violet-300">
                            {evaluationProgress} %
                        </span>
                    </div>
                    <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div
                            className="h-full rounded-full bg-violet-600 transition-all duration-500 ease-out"
                            style={{ width: `${evaluationProgress}%` }}
                        />
                    </div>
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                    Dein Gespräch wird von der KI bewertet und die Aufnahme gespeichert. Bitte verlassen Sie diese Seite nicht.
                </p>
            </div>
        );
    }

    const connecting = phase === 'permission' || phase === 'connecting';
    // Nutzer spricht: nur wenn der Prüfer schweigt und genug Mikrofonpegel ankommt.
    const isMuted = !isMock && conversation.isMuted;
    const userSpeaking = !isMock && !connecting && !isMuted && !agentSpeakingLive && inputLevel > 0.025;
    const isExaminerSpeaking = !isMock && !userSpeaking && agentSpeakingLive;
    // Pegel-getriebene Skalierung des Nutzer-Rings (gedeckelt, damit es nicht springt).
    const userScale = 1 + Math.min(inputLevel * 2.2, 0.45);

    return (
        <div className="fixed inset-0 z-30 mx-auto flex h-[100dvh] w-full max-w-2xl flex-col overflow-hidden bg-[#F2F4F6] px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] dark:bg-slate-950 md:pb-8">
            {/* Status-Bühne */}
            <div className="flex-none pt-3 mb-3 md:pt-6 md:mb-6">
                <div className="bg-gradient-to-br from-violet-600 to-indigo-800 text-white rounded-[2rem] p-5 md:p-10 shadow-card relative overflow-hidden flex flex-col items-center text-center min-h-[210px] md:min-h-[340px] justify-center">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none" />

                    {/* Timer */}
                    <div className="absolute top-5 right-6 text-sm font-black tabular-nums bg-white/15 px-3 py-1.5 rounded-xl backdrop-blur-md">
                        {formatTime(remaining)}
                    </div>

                    {/* Avatar / Animation */}
                    <div className="relative z-10 mb-4 flex items-center justify-center w-24 h-24 md:mb-6 md:h-32 md:w-32">
                        {/* Nutzer-Sprech-Ring: pegelreaktiv (emerald) */}
                        {userSpeaking && (
                            <>
                                <span
                                    className="absolute rounded-full bg-emerald-400/20 transition-transform duration-75"
                                    style={{ width: '6rem', height: '6rem', transform: `scale(${userScale})` }}
                                />
                                <span className="absolute inset-0 rounded-full border-2 border-emerald-300/50 animate-ping" />
                            </>
                        )}
                        {/* Prüfer-Sprech-Ring (weiß) */}
                        {isExaminerSpeaking && (
                            <span className="absolute inset-0 rounded-full border-2 border-white/40 animate-ping" />
                        )}

                        <div
                            className={`w-20 h-20 md:h-28 md:w-28 rounded-full flex items-center justify-center transition-all duration-200 ${isExaminerSpeaking
                                ? 'bg-white/25 scale-110 shadow-2xl shadow-white/30'
                                : userSpeaking
                                    ? 'bg-emerald-400/25 shadow-2xl shadow-emerald-400/30'
                                    : 'bg-white/12'
                                }`}
                            style={userSpeaking ? { transform: `scale(${1 + Math.min(inputLevel * 0.8, 0.18)})` } : undefined}
                        >
                            {connecting ? (
                                <Loader2 size={38} className="animate-spin md:size-11" />
                            ) : isExaminerSpeaking ? (
                                <Volume2 size={38} strokeWidth={2} className="animate-pulse md:size-11" />
                            ) : (
                                <Mic size={38} strokeWidth={2} className={userSpeaking ? 'text-emerald-50 md:size-11' : 'md:size-11'} />
                            )}
                        </div>
                    </div>

                    <h1 className="font-black text-xl md:text-2xl relative z-10">Herr Müller</h1>
                    <p className="text-white/80 text-sm mt-1 relative z-10">
                        {connecting
                            ? 'Verbinde mit dem Prüfer…'
                            : isExaminerSpeaking
                                ? 'Der Prüfer spricht…'
                                : userSpeaking
                                    ? 'Du sprichst…'
                                    : isMuted
                                        ? 'Mikrofon stumm'
                                        : isMock
                                            ? 'UI-Mock: keine Session, kein Mikrofon.'
                                            : 'Du bist dran — sprich jetzt.'}
                    </p>
                </div>
            </div>

            {/* Live-Transkript */}
            <div
                ref={transcriptScrollRef}
                className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain rounded-[24px] border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800"
            >
                {transcript.length === 0 ? (
                    <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">
                        Das Gespräch erscheint hier live…
                    </p>
                ) : (
                    <div className="min-w-0 space-y-3">
                        {transcript.map((turn, i) => (
                            <div key={i} className={`min-w-0 ${turn.role === 'examiner' ? 'text-left' : 'text-right'}`}>
                                <span
                                    className={`inline-block max-w-[92%] break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${turn.role === 'examiner'
                                        ? 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100'
                                        : 'bg-violet-600 text-white'
                                        }`}
                                >
                                    {turn.text}
                                </span>
                            </div>
                        ))}
                        <div ref={transcriptBottomRef} className="h-1" />
                    </div>
                )}
            </div>

            {/* Steuerung */}
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/70 bg-[#F2F4F6]/95 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/95 md:static md:mt-6 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-0">
                <div className="mx-auto flex max-w-2xl items-center justify-center gap-3">
                <button
                    onClick={() => {
                        if (!isMock) conversation.setMuted(!conversation.isMuted);
                    }}
                    disabled={connecting}
                    className="w-14 h-14 flex-shrink-0 rounded-2xl bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shadow-sm active:scale-95 transition-all disabled:opacity-50"
                    title={isMock ? 'UI-Mock' : conversation.isMuted ? 'Mikrofon an' : 'Mikrofon stumm'}
                >
                    {!isMock && conversation.isMuted ? <MicOff size={22} /> : <Mic size={22} />}
                </button>
                <button
                    onClick={() => {
                        if (isMock) { void finish(); return; }
                        setShowEndConfirm(true);
                    }}
                    className="flex-1 max-w-xs bg-red-500 hover:bg-red-600 text-white rounded-2xl px-6 py-4 font-black flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 active:scale-[0.98] transition-all"
                >
                    <PhoneOff size={20} strokeWidth={2.5} /> {isMock ? 'Mock neu laden' : 'Prüfung beenden'}
                </button>
                </div>
            </div>

            {showEndConfirm && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 px-4 pb-4 pt-10 backdrop-blur-sm sm:items-center sm:pb-10">
                    <div className="relative w-full max-w-md rounded-[28px] bg-white p-5 shadow-2xl dark:bg-slate-900">
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300">
                            <AlertTriangle size={24} strokeWidth={2.5} />
                        </div>
                        <h2 className="text-xl font-black text-slate-900 dark:text-white">Prüfung wirklich beenden?</h2>
                        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                            Die Prüfung ist noch nicht zu Ende. Wenn du jetzt beendest, wird dein bisheriges
                            Gespräch ausgewertet und die Prüfung kann nicht fortgesetzt werden.
                        </p>
                        <div className="mt-6 flex flex-col gap-2">
                            <button
                                type="button"
                                onClick={() => { setShowEndConfirm(false); void finish(); }}
                                className="w-full rounded-2xl bg-red-500 px-5 py-3 font-black text-white transition-all active:scale-95 hover:bg-red-600"
                            >
                                Beenden und bewerten
                            </button>
                            <button
                                type="button"
                                onClick={() => { setShowEndConfirm(false); void abortAndLeave(); }}
                                className="w-full rounded-2xl border-2 border-slate-100 bg-white px-5 py-3 font-black text-slate-700 transition-all active:scale-95 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                                Beenden ohne Bewertung
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowEndConfirm(false)}
                                className="w-full rounded-2xl bg-transparent px-5 py-3 font-bold text-slate-500 transition-all active:scale-95 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                            >
                                Weiter prüfen
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function OralExamLive() {
    const location = useLocation();
    const navigate = useNavigate();
    const params = new URLSearchParams(location.search);
    const isMock = params.get('devMock') === '1';
    const state = isMock
        ? ({
            sessionId: 'dev-mock-oral-exam',
            signedUrl: 'mock',
            dynamicVariables: {
                mode: 'full_simulation',
                focus_topic: 'alle',
                candidate_name: 'Dev',
            },
            maxDurationSec: 720,
            mode: 'full_simulation',
            focusTopic: null,
            mock: true,
        } satisfies LiveState)
        : location.state as LiveState | null;

    useEffect(() => {
        if (!isMock && (!state?.sessionId || !state?.signedUrl)) {
            navigate('/oral-exam', { replace: true });
        }
    }, [isMock, state, navigate]);

    if (!state?.sessionId || !state?.signedUrl) {
        return null;
    }

    return (
        <ConversationProvider>
            <OralExamLiveInner state={state} />
        </ConversationProvider>
    );
}
