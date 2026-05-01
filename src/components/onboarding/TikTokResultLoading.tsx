import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../App';
import { Loader2 } from 'lucide-react';
import { usePostHog } from '../../contexts/PostHogProvider';
import { getTikTokAnalyticsContext, trackTikTokServerEvent } from '../../utils/tiktokAnalytics';

const LOADING_TEXTS = [
    { 
        de: 'Wir prüfen deine Antworten...', 
        ar: 'نراجع إجاباتك...',
        duration: 900 
    },
    { 
        de: 'Wir erkennen, welche Themen dir Punkte kosten können...', 
        ar: 'نحدد المواضيع التي قد تخسرك نقاط...',
        duration: 900 
    },
    { 
        de: 'Dein Lernplan wird vorbereitet...', 
        ar: 'نجهز لك خطة تعلم واضحة...',
        duration: 900 
    }
];

export default function TikTokResultLoading() {
    const navigate = useNavigate();
    const location = useLocation();
    const { language } = useApp();
    const { trackEvent } = usePostHog();
    const isAr = language === 'DE_AR';
    
    const [textIndex, setTextIndex] = useState(0);
    const [progress, setProgress] = useState(0);

    // Get test data from state to pass it forward
    const testData = React.useMemo(() => location.state || {}, [location.state]);

    useEffect(() => {
        const totalDuration = LOADING_TEXTS.reduce((acc, curr) => acc + curr.duration, 0);
        const startTime = Date.now();
        let lastTrackedStep = -1;

        const startedContext = getTikTokAnalyticsContext('analysis_loading', language, {
            steps_count: LOADING_TEXTS.length,
            expected_duration_ms: totalDuration,
            answered_questions: Object.keys(testData.selectedAnswers || {}).length,
            total_questions: Array.isArray(testData.questions) ? testData.questions.length : 0,
        });
        trackEvent('tiktok_analysis_started', startedContext);
        trackTikTokServerEvent('tiktok_analysis_started', startedContext);

        const interval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const newProgress = Math.min((elapsed / totalDuration) * 100, 100);
            setProgress(newProgress);

            // Determine current text index based on elapsed time
            let currentElapsed = 0;
            let foundIndex = 0;
            for (let i = 0; i < LOADING_TEXTS.length; i++) {
                currentElapsed += LOADING_TEXTS[i].duration;
                if (elapsed < currentElapsed) {
                    foundIndex = i;
                    break;
                }
                foundIndex = LOADING_TEXTS.length - 1;
            }
            
            setTextIndex(foundIndex);
            if (foundIndex !== lastTrackedStep) {
                lastTrackedStep = foundIndex;
                const stepContext = getTikTokAnalyticsContext('analysis_loading', language, {
                    step_index: foundIndex + 1,
                    steps_count: LOADING_TEXTS.length,
                    elapsed_ms: elapsed,
                    step_label: LOADING_TEXTS[foundIndex].de,
                });
                trackEvent('tiktok_analysis_step_viewed', stepContext);
                trackTikTokServerEvent('tiktok_analysis_step_viewed', stepContext);
            }

            if (elapsed >= totalDuration) {
                clearInterval(interval);
                const completedContext = getTikTokAnalyticsContext('analysis_loading', language, {
                    duration_ms: Date.now() - startTime,
                    steps_count: LOADING_TEXTS.length,
                    answered_questions: Object.keys(testData.selectedAnswers || {}).length,
                    total_questions: Array.isArray(testData.questions) ? testData.questions.length : 0,
                });
                trackEvent('tiktok_analysis_completed', completedContext);
                trackTikTokServerEvent('tiktok_analysis_completed', completedContext);
                navigate('/tiktok/result', { state: testData, replace: true });
            }
        }, 50);

        return () => clearInterval(interval);
    }, [navigate, testData, language, trackEvent]);

    return (
        <div className="fixed inset-0 z-50 bg-[#F8FAFC] flex flex-col items-center justify-center p-6 font-sans overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[100px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/5 rounded-full blur-[100px]" />
            </div>

            <div className="relative w-full max-w-sm flex flex-col items-center text-center space-y-12 animate-fadeUp">
                
                {/* Text Area with Animation */}
                <div className="space-y-4 min-h-[140px] flex flex-col items-center justify-center pt-10">
                    <div key={textIndex} className="animate-reveal text-center px-4">
                        <h2 className="text-[20px] sm:text-[24px] font-black text-slate-900 leading-tight tracking-tight">
                            {LOADING_TEXTS[textIndex].de}
                        </h2>
                        {isAr && (
                            <p dir="rtl" className="text-[18px] sm:text-[20px] font-bold text-slate-500 mt-3 leading-tight">
                                {LOADING_TEXTS[textIndex].ar}
                            </p>
                        )}
                    </div>
                </div>

                {/* Progress Bar Area */}
                <div className="w-full space-y-4 px-2">
                    <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/50 shadow-inner">
                        <div 
                            className="h-full bg-gradient-to-r from-[#3B65F5] to-blue-400 rounded-full transition-all duration-300 ease-out relative"
                            style={{ width: `${progress}%` }}
                        >
                            <div className="absolute top-0 right-0 h-full w-12 bg-white/30 skew-x-[-20deg] animate-shimmer" />
                        </div>
                    </div>
                    <div className="flex justify-between items-center px-1">
                        <div className="flex items-center gap-1.5">
                            <Loader2 className="w-3.5 h-3.5 text-[#3B65F5] animate-spin" />
                            <span className="text-[11px] font-black text-[#3B65F5] uppercase tracking-widest">
                                {isAr ? 'جاري التحليل' : 'Analyse läuft'}
                            </span>
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
                    0% { opacity: 0; transform: scale(0.98) translateY(10px); filter: blur(10px); }
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
