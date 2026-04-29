import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../App';
import { Loader2 } from 'lucide-react';
import { usePostHog } from '../../contexts/PostHogProvider';
import { getTikTokAnalyticsContext } from '../../utils/tiktokAnalytics';

const LOADING_TEXTS = [
    { de: 'Prüfungsfragen werden geladen...', ar: 'يتم تحميل أسئلة الامتحان...' },
    { de: 'Gleich siehst du, wo du stehst.', ar: 'بعد قليل سترى مستواك الحقيقي.' },
    { de: 'Typische IHK-Fallen werden vorbereitet...', ar: 'يتم تجهيز أسئلة من فخاخ IHK الشائعة...' }
];

export default function TikTokTestLoading() {
    const navigate = useNavigate();
    const { language } = useApp();
    const { trackEvent } = usePostHog();
    const isAr = language === 'DE_AR';
    
    const [textIndex, setTextIndex] = useState(0);
    const [progress, setProgress] = useState(0);
    const questionsRef = useRef<any[]>([]);

    // Fetch questions in the background
    useEffect(() => {
        const loadingStartedAt = Date.now();
        trackEvent('tiktok_questions_loading_started', getTikTokAnalyticsContext('questions_loading', language, {
            topics_requested_count: 9,
        }));

        const fetchQuestions = async () => {
            try {
                const { db } = await import('../../services/database');
                const topics = [
                    'Öffentliche Sicherheit und Ordnung',
                    'Gewerberecht',
                    'Datenschutz',
                    'BGB',
                    'Strafrecht',
                    'Waffenrecht',
                    'DGUV',
                    'Umgang mit Menschen',
                    'Sicherheitstechnik'
                ];
                
                const promises = topics.map(topic => db.getWrittenExamQuestionsByTopic(topic, 1));
                const results = await Promise.all(promises);
                const questions = results.map(res => res[0]).filter(Boolean);
                questionsRef.current = questions;
                trackEvent('tiktok_questions_loading_completed', getTikTokAnalyticsContext('questions_loading', language, {
                    duration_ms: Date.now() - loadingStartedAt,
                    questions_loaded_count: questions.length,
                    topics_requested_count: topics.length,
                }));
            } catch (error) {
                console.error("Failed to fetch questions:", error);
                trackEvent('tiktok_questions_loading_failed', getTikTokAnalyticsContext('questions_loading', language, {
                    duration_ms: Date.now() - loadingStartedAt,
                    topics_requested_count: 9,
                    error_message: error instanceof Error ? error.message : 'unknown_error',
                }));
            }
        };
        fetchQuestions();
    }, [language, trackEvent]);

    // Timer for navigation (Total 3 seconds)
    useEffect(() => {
        const startTime = Date.now();
        const duration = 3000;

        const interval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const newProgress = Math.min((elapsed / duration) * 100, 100);
            setProgress(newProgress);

            if (elapsed >= duration) {
                clearInterval(interval);
                navigate('/tiktok/test', { state: { questions: questionsRef.current } });
            }
        }, 50);

        // Text cycling interval
        const textInterval = setInterval(() => {
            setTextIndex(prev => (prev + 1) % LOADING_TEXTS.length);
        }, 1000);

        return () => {
            clearInterval(interval);
            clearInterval(textInterval);
        };
    }, [navigate]);

    return (
        <div className="fixed inset-0 z-50 bg-[#F8FAFC] flex flex-col items-center justify-center p-6 font-sans overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[100px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/5 rounded-full blur-[100px]" />
            </div>

            <div className="relative w-full max-w-sm flex flex-col items-center text-center space-y-12 animate-fadeUp">
                
                {/* Text Area with Animation */}
                <div className="space-y-4 min-h-[120px] flex flex-col items-center justify-center pt-10">
                    <div key={textIndex} className="animate-reveal text-center">
                        <h2 className="text-[22px] sm:text-[26px] font-black text-slate-900 leading-tight tracking-tight">
                            {LOADING_TEXTS[textIndex].de}
                        </h2>
                        {isAr && (
                            <p dir="rtl" className="text-[18px] sm:text-[20px] font-bold text-slate-500 mt-2 leading-none">
                                {LOADING_TEXTS[textIndex].ar}
                            </p>
                        )}
                    </div>
                </div>

                {/* Progress Bar Area */}
                <div className="w-full space-y-4">
                    <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/50">
                        <div 
                            className="h-full bg-gradient-to-r from-[#3B65F5] to-blue-400 rounded-full transition-all duration-300 ease-out relative"
                            style={{ width: `${progress}%` }}
                        >
                            <div className="absolute top-0 right-0 h-full w-8 bg-white/30 skew-x-[-20deg] animate-shimmer" />
                        </div>
                    </div>
                    <div className="flex justify-between items-center px-1">
                        <div className="flex items-center gap-1.5">
                            <Loader2 className="w-3.5 h-3.5 text-[#3B65F5] animate-spin" />
                            <span className="text-[11px] font-black text-[#3B65F5] uppercase tracking-widest">Wird optimiert</span>
                        </div>
                        <span className="text-[13px] font-black text-slate-400">{Math.round(progress)}%</span>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes fadeUp {
                    from { opacity: 0; transform: translateY(30px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fadeUp { animation: fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                
                @keyframes reveal {
                    0% { opacity: 0; transform: scale(0.95) translateY(10px); filter: blur(10px); }
                    100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); }
                }
                .animate-reveal { animation: reveal 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }

                @keyframes shimmer {
                    from { transform: translateX(-100%) skewX(-20deg); }
                    to { transform: translateX(400%) skewX(-20deg); }
                }
                .animate-shimmer { animation: shimmer 2s infinite linear; }
            `}</style>
        </div>
    );
}
