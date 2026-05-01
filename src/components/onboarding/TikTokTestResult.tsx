import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../App';
import { AlertTriangle, Lock, Map as MapIcon, Target } from 'lucide-react';
import { WrittenExamQuestion } from '../../types';
import { usePostHog } from '../../contexts/PostHogProvider';
import { PaywallDialog } from '../PaywallDialog';
import { areAnswerSetsEqual } from '../../utils/writtenExamAnswers';
import { useDataCache } from '../../contexts/DataCacheContext';
import { generateTikTokLernplan, TikTokLernplanNode } from '../../services/lernplanGenerator';
import { getTikTokAnalyticsContext, trackTikTokServerEvent } from '../../utils/tiktokAnalytics';

interface ResultState {
    questions: WrittenExamQuestion[];
    selectedAnswers: Record<string, string[]>;
}

const FALLBACK_WEAK_TOPICS = ['Gewerberecht', 'BGB', 'Umgang mit Menschen'];

const getRiskStatus = (percentage: number) => {
    if (percentage <= 44) {
        return {
            de: 'Hohes Risiko für die echte IHK-Prüfung',
            ar: 'خطر مرتفع في امتحان IHK الحقيقي',
            color: 'text-red-500',
            badge: 'bg-red-50 text-red-600 border-red-100',
            gradient: 'from-red-500 to-orange-400',
            level: 'high',
        };
    }
    if (percentage <= 66) {
        return {
            de: 'Mittleres Risiko – du hast noch klare Lücken',
            ar: 'خطر متوسط - لديك فجوات واضحة',
            color: 'text-orange-500',
            badge: 'bg-orange-50 text-orange-600 border-orange-100',
            gradient: 'from-orange-500 to-amber-400',
            level: 'medium',
        };
    }
    if (percentage <= 88) {
        return {
            de: 'Gute Basis – aber noch nicht sicher',
            ar: 'أساس جيد - لكنك لست آمناً بعد',
            color: 'text-blue-600',
            badge: 'bg-blue-50 text-blue-600 border-blue-100',
            gradient: 'from-[#3B65F5] to-blue-400',
            level: 'good_basis',
        };
    }
    return {
        de: 'Stark – jetzt Prüfung absichern',
        ar: 'قوي - ثبّت مستواك قبل الامتحان',
        color: 'text-emerald-600',
        badge: 'bg-emerald-50 text-emerald-600 border-emerald-100',
        gradient: 'from-emerald-500 to-teal-400',
        level: 'strong',
    };
};

export default function TikTokTestResult() {
    const { language, toggleLanguage } = useApp();
    const location = useLocation();
    const navigate = useNavigate();
    const { trackEvent } = usePostHog();
    const { modules, questions: appQuestions } = useDataCache();
    
    const isAr = language === 'DE_AR';
    const state = location.state as ResultState;
    
    const [animatedScore, setAnimatedScore] = useState(0);
    const [showPaywall, setShowPaywall] = useState(false);
    const resultTrackedRef = useRef(false);
    const planPreviewTrackedRef = useRef(false);

    useEffect(() => {
        if (!state?.questions) {
            navigate('/tiktok');
            return;
        }
        
        let score = 0;
        state.questions.forEach(q => {
            if (areAnswerSetsEqual(q.correctAnswer, state.selectedAnswers[q.id])) score++;
        });

        const timer = setTimeout(() => {
            setAnimatedScore(score);
        }, 100);
        return () => clearTimeout(timer);
    }, [state, navigate, trackEvent]);

    const questions = state?.questions || [];
    const selectedAnswers = state?.selectedAnswers || {};
    const totalQuestions = questions.length;
    const incorrectQuestions = questions.filter(q => !areAnswerSetsEqual(q.correctAnswer, selectedAnswers[q.id]));
    const actualScore = totalQuestions - incorrectQuestions.length;
    const errorsTotal = incorrectQuestions.length;
    const animatedPercentage = totalQuestions > 0 ? Math.round((animatedScore / totalQuestions) * 100) : 0;
    const actualPercentage = totalQuestions > 0 ? Math.round((actualScore / totalQuestions) * 100) : 0;
    const riskStatus = getRiskStatus(actualPercentage);
    
    const topicCounts = incorrectQuestions.reduce<Record<string, number>>((acc, question) => {
        acc[question.topic] = (acc[question.topic] || 0) + 1;
        return acc;
    }, {});
    const weakTopics = Object.entries(topicCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([topic]) => topic);
    const displayedWeakTopics = weakTopics.length > 0 ? weakTopics : FALLBACK_WEAK_TOPICS;
    const weakTopicKey = displayedWeakTopics.join('|');
    const tiktokPlan = React.useMemo(() => {
        if (!state?.questions || modules.length === 0) return null;
        return generateTikTokLernplan(modules, appQuestions, displayedWeakTopics, { save: false });
    }, [state?.questions, modules, appQuestions, weakTopicKey]);
    const learningPlanDays = (tiktokPlan?.nodes || []).map((node, index) => {
        const tiktokNode = node as TikTokLernplanNode;
        const questionTarget = node.tasks.find(task => task.type === 'questions')?.target
            || node.tasks.find(task => task.type === 'exam')?.target
            || 0;
        return {
            day: index + 1,
            dateLabel: node.weekLabel || node.dateRange || '',
            moduleContext: node.moduleTitle,
            lessonTitles: tiktokNode.previewLessons || [node.moduleTitle],
            questionTarget,
        };
    });
    const tiktokPlanPayload = tiktokPlan ? {
        source: 'tiktok_funnel',
        planJson: tiktokPlan,
        weakTopics: displayedWeakTopics,
        testScore: actualScore,
        testTotal: totalQuestions,
        analytics: {
            score: actualScore,
            percentage: actualPercentage,
            wrongCount: errorsTotal,
            totalQuestions,
            riskLevel: riskStatus.level,
            weakTopicCount: displayedWeakTopics.length,
        },
    } : undefined;

    useEffect(() => {
        if (!state?.questions || resultTrackedRef.current) return;
        resultTrackedRef.current = true;
        const context = getTikTokAnalyticsContext('result', language, {
            score: actualScore,
            percentage: actualPercentage,
            wrong_count: errorsTotal,
            total_questions: totalQuestions,
            risk_level: riskStatus.level,
            weak_topic_count: displayedWeakTopics.length,
            weak_topics: displayedWeakTopics,
        });
        trackEvent('tiktok_result_viewed', context);
        trackTikTokServerEvent('tiktok_result_viewed', context);
        trackEvent('tiktok_weak_topics_shown', context);
        trackTikTokServerEvent('tiktok_weak_topics_shown', context);
    }, [state?.questions, language, trackEvent, actualScore, actualPercentage, errorsTotal, totalQuestions, riskStatus.level, weakTopicKey]);

    useEffect(() => {
        if (!tiktokPlan || planPreviewTrackedRef.current) return;
        planPreviewTrackedRef.current = true;
        const context = getTikTokAnalyticsContext('result', language, {
            score: actualScore,
            percentage: actualPercentage,
            wrong_count: errorsTotal,
            total_questions: totalQuestions,
            risk_level: riskStatus.level,
            weak_topic_count: displayedWeakTopics.length,
            weak_topics: displayedWeakTopics,
            plan_days_count: learningPlanDays.length,
        });
        trackEvent('tiktok_plan_preview_viewed', context);
        trackTikTokServerEvent('tiktok_plan_preview_viewed', context);
    }, [tiktokPlan, language, trackEvent, actualScore, actualPercentage, errorsTotal, totalQuestions, riskStatus.level, weakTopicKey, learningPlanDays.length]);
    
    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (animatedPercentage / 100) * circumference;

    if (!state?.questions) return null;

    const handleRegister = () => {
        const context = getTikTokAnalyticsContext('result', language, {
            score: actualScore,
            percentage: actualPercentage,
            wrong_count: errorsTotal,
            total_questions: totalQuestions,
            risk_level: riskStatus.level,
            weak_topic_count: displayedWeakTopics.length,
            weak_topics: displayedWeakTopics,
            plan_days_count: learningPlanDays.length,
        });
        trackEvent('tiktok_plan_unlock_clicked', context);
        trackTikTokServerEvent('tiktok_plan_unlock_clicked', context);
        trackEvent('tiktok_result_register_clicked', context);
        trackTikTokServerEvent('tiktok_result_register_clicked', context);
        setShowPaywall(true);
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#F8FAFC] flex flex-col font-sans">
            <div className="w-full max-w-lg mx-auto px-3.5 mt-5 shrink-0 relative z-20 text-left">
                <div className="rounded-[30px] shadow-xl overflow-hidden relative transition-colors duration-500 bg-[#3B65F5] shadow-blue-500/10">
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <div className="absolute -top-16 -right-16 w-64 h-64 bg-white/10 rounded-full blur-3xl opacity-40" />
                        <div className="absolute top-1/2 -left-10 w-32 h-32 bg-white/10 rounded-full blur-2xl opacity-20" />
                    </div>

                    <div className="px-5 py-[14px] relative z-10 flex flex-col justify-center">
                        <div className="animate-fadeSlideIn flex items-center justify-between">
                            <h1 className="text-[25px] font-black tracking-tighter leading-tight text-white mb-0 ml-1">34a Master</h1>
                            
                            <div className="flex items-center bg-[#1E293B] rounded-full p-1 h-9 relative w-[130px] shadow-inner">
                                <div 
                                    className="absolute h-7 bg-white rounded-full transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] shadow-sm"
                                    style={{ 
                                        width: '62px',
                                        left: isAr ? '64px' : '4px',
                                        top: '4px'
                                    }}
                                />
                                
                                <button 
                                    onClick={() => isAr && toggleLanguage()}
                                    className={`relative z-10 flex-1 text-[13px] font-black transition-colors duration-300 ${!isAr ? 'text-slate-900' : 'text-slate-400'}`}
                                >
                                    DE
                                </button>
                                <button 
                                    onClick={() => !isAr && toggleLanguage()}
                                    className={`relative z-10 flex-1 text-[13px] font-black transition-colors duration-300 ${isAr ? 'text-slate-900' : 'text-slate-400'}`}
                                >
                                    AR
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <main className="flex-1 flex flex-col relative z-10 w-full px-3.5 pt-10 pb-20 max-w-lg mx-auto transition-all duration-700">
                <div className="animate-fadeUp space-y-7 flex-1">
                    <div className="relative group">
                        <div className={`absolute -inset-0.5 bg-gradient-to-r ${riskStatus.gradient} rounded-[28px] blur-xl opacity-20 transition duration-1000`}></div>
                        <div className="relative bg-white rounded-[28px] p-8 shadow-[0_8px_40px_rgba(15,23,42,0.08)] border-2 border-white flex flex-col items-center text-center">
                            <div className="relative w-40 h-40 mb-6">
                                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 140 140">
                                    <defs>
                                        <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                            <stop offset="0%" stopColor={actualPercentage <= 66 ? '#EF4444' : '#3B65F5'} />
                                            <stop offset="100%" stopColor={actualPercentage <= 66 ? '#FB923C' : '#60A5FA'} />
                                        </linearGradient>
                                    </defs>
                                    <circle cx="70" cy="70" r={radius} className="text-slate-100" strokeWidth="12" stroke="currentColor" fill="transparent" />
                                    <circle 
                                        cx="70" cy="70" r={radius} 
                                        stroke="url(#scoreGradient)"
                                        strokeWidth="12" 
                                        strokeDasharray={circumference} 
                                        strokeDashoffset={strokeDashoffset} 
                                        strokeLinecap="round" 
                                        fill="transparent"
                                        className="transition-all duration-1000 ease-out"
                                    />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className={`text-[42px] font-black ${riskStatus.color} leading-none tracking-tight`}>{animatedPercentage}%</span>
                                    <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1.5 ml-1">Score</span>
                                </div>
                            </div>

                            <div className={`inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-[12px] font-black leading-snug ${riskStatus.badge}`}>
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                <span>{riskStatus.de}</span>
                            </div>
                            {isAr && (
                                <p dir="rtl" className="mt-2 text-[12px] font-bold text-slate-500 animate-reveal">
                                    {riskStatus.ar}
                                </p>
                            )}

                            <p className="mt-5 text-[14px] font-bold text-slate-600 leading-snug">
                                Du hast {errorsTotal} von {totalQuestions} Fragen falsch beantwortet.
                                {isAr && (
                                    <span dir="rtl" className="block text-[12px] text-slate-400 mt-2 animate-reveal">
                                        أجبت بشكل خاطئ على {errorsTotal} من {totalQuestions} أسئلة.
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>

                    <div className="relative bg-white rounded-[28px] p-6 shadow-[0_8px_40px_rgba(59,101,245,0.08)] border border-blue-50/70">
                        <div className="flex items-start gap-4">
                            <div className="w-11 h-11 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center shrink-0">
                                <Target className="w-5 h-5" />
                            </div>
                            <div className="text-left space-y-4">
                                <div>
                                    <h3 className="text-[17px] font-black text-[#0F172A] leading-tight">Deine größten Schwächen:</h3>
                                    {isAr && (
                                        <p dir="rtl" className="mt-1 text-[12px] font-bold text-slate-400 animate-reveal">أكبر نقاط ضعفك:</p>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {displayedWeakTopics.map(topic => (
                                        <span key={topic} className="rounded-full bg-red-50 px-3 py-1.5 text-[12px] font-black text-red-600 border border-red-100">
                                            {topic}
                                        </span>
                                    ))}
                                </div>
                                <p className="text-[13.5px] font-bold text-slate-600 leading-snug">
                                    Genau diese Themen kosten in der Prüfung oft Punkte, wenn man die deutschen Begriffe nicht sicher versteht.
                                    {isAr && (
                                        <span dir="rtl" className="block text-[12px] text-slate-400 mt-2 animate-reveal">
                                            هذه المواضيع بالضبط قد تخسرك نقاطاً إذا لم تفهم المصطلحات الألمانية جيداً.
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="px-5 text-center">
                        <p className="text-[14.5px] font-black text-[#3B65F5] leading-snug">
                            Wir haben dir einen Lernplan vorbereitet, der genau bei diesen Schwächen startet.
                            {isAr && (
                                <span dir="rtl" className="block text-[13px] text-blue-400 mt-2 animate-reveal">
                                    جهزنا لك خطة تعلم تبدأ من نقاط ضعفك مباشرة.
                                </span>
                            )}
                        </p>
                    </div>

                    <div className="flex justify-center -my-3 relative z-10">
                        <div className="w-0.5 h-12 bg-gradient-to-b from-[#3B65F5] to-blue-400 opacity-20 relative">
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#3B65F5]" />
                        </div>
                    </div>

                    <div className="relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-400 to-[#3B65F5] rounded-[28px] blur opacity-10 group-hover:opacity-20 transition duration-1000"></div>
                        <div className="relative bg-white rounded-[28px] shadow-[0_8px_40px_rgba(59,101,245,0.08)] border border-blue-50/50 overflow-visible">
                            <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-blue-100 bg-blue-50 px-3.5 py-1.5 text-[11px] font-bold text-blue-600 shadow-sm">
                                Basierend auf deinen Fehlern · mit arabischer Erklärung
                            </div>
                            <div className="p-7 pt-12">
                                <div className="flex items-center gap-4 mb-5">
                                    <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20">
                                        <MapIcon className="w-6 h-6 text-white" />
                                    </div>
                                    <div className="text-left">
                                        <h3 className="text-[19px] font-black text-[#3B65F5] leading-tight">
                                            Dein 14-Tage-Plan<br/>für die §34a-Prüfung
                                        </h3>
                                        {isAr && (
                                            <p dir="rtl" className="text-[13px] font-bold text-blue-400 mt-0.5 animate-reveal">
                                                خطتك لمدة 14 يوماً لامتحان §34a
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="relative bg-[#0F172A] rounded-[28px] p-4 border border-slate-800 shadow-2xl space-y-3.5 overflow-hidden">
                                    <div className="max-h-[320px] overflow-hidden pr-1 blur-[2.4px] opacity-80 select-none pointer-events-none">
                                        <div className="relative space-y-2 before:absolute before:left-[33px] before:top-5 before:bottom-5 before:w-[2px] before:rounded-full before:bg-gradient-to-b before:from-blue-400/80 before:via-blue-500/35 before:to-blue-400/70">
                                            {learningPlanDays.map((item) => (
                                                <div key={item.day} className="relative grid grid-cols-[68px_1fr] gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2">
                                                    <div className="relative z-10 flex flex-col items-center">
                                                        <div className="rounded-lg bg-blue-500/25 px-2 py-1 text-center text-[10px] font-black text-blue-200 ring-1 ring-blue-400/20">
                                                            {item.dateLabel}
                                                        </div>
                                                        <div className="mt-1 h-3 w-3 rounded-full border-2 border-[#0F172A] bg-blue-400 shadow-[0_0_0_4px_rgba(59,130,246,0.2),0_0_16px_rgba(96,165,250,0.45)]" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="mb-1 flex items-start justify-between gap-2">
                                                            <p className="text-[11.5px] font-black leading-snug text-slate-100">{item.moduleContext}</p>
                                                            <div className="whitespace-nowrap rounded-full bg-slate-950/70 px-2.5 py-1 text-[10px] font-black text-slate-300">
                                                                {item.questionTarget} Fragen
                                                            </div>
                                                        </div>
                                                        <div className="space-y-1">
                                                            {item.lessonTitles.map((lessonTitle, lessonIndex) => (
                                                                <p key={`${item.day}-${lessonTitle}-${lessonIndex}`} className="text-[10.5px] font-bold leading-snug text-slate-400">
                                                                    {lessonIndex + 1}. {lessonTitle}
                                                                </p>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="pointer-events-none absolute inset-x-4 top-4 bottom-4 overflow-hidden rounded-[22px]">
                                        <div className="absolute inset-0 bg-gradient-to-br from-white/4 via-transparent to-blue-400/8" />
                                        <div className="absolute -inset-y-8 -left-1/2 w-1/2 rotate-12 bg-gradient-to-r from-transparent via-white/22 to-transparent animate-lockShine" />
                                    </div>
                                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,101,245,0.28),rgba(15,23,42,0.1)_42%,rgba(15,23,42,0.72)_100%)]" />

                                    <button 
                                        onClick={handleRegister} 
                                        className="absolute left-1/2 top-1/2 z-10 w-[calc(100%-48px)] -translate-x-1/2 -translate-y-1/2 bg-[#3B65F5] hover:bg-[#3256D6] text-white py-3.5 rounded-[18px] flex flex-col items-center justify-center gap-0.5 shadow-[0_18px_50px_rgba(59,101,245,0.55)] active:scale-[0.98] transition-all overflow-hidden group/btn"
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover/btn:animate-shimmer" />
                                        <div className="flex items-center gap-2 text-[13px] font-black tracking-tight">
                                            <Lock className="w-4 h-4 fill-white/20" />
                                            <span>Lernplan freischalten</span>
                                        </div>
                                        {isAr && (
                                            <span dir="rtl" className="text-[12px] font-bold opacity-90 animate-reveal">
                                                افتح خطة التعلم
                                            </span>
                                        )}
                                    </button>
                                </div>

                                <p className="pt-4 text-center text-[12px] font-black text-slate-500">
                                    Einmalig 49€ · 6 Monate Zugriff · kein Abo
                                </p>

                                <div className="pt-3 flex justify-center">
                                    <button
                                        onClick={() => {
                                            const context = getTikTokAnalyticsContext('result', language, {
                                                score: actualScore,
                                                percentage: actualPercentage,
                                                wrong_count: errorsTotal,
                                                total_questions: totalQuestions,
                                                risk_level: riskStatus.level,
                                                weak_topic_count: displayedWeakTopics.length,
                                                weak_topics: displayedWeakTopics,
                                            });
                                            trackEvent('tiktok_basis_continue_clicked', context);
                                            trackTikTokServerEvent('tiktok_basis_continue_clicked', context);
                                            navigate('/dashboard');
                                        }}
                                        className="inline-flex items-center justify-center px-3 py-2 text-center text-[12px] font-bold leading-snug text-slate-400 underline underline-offset-4 decoration-slate-300 transition-colors hover:text-slate-600 hover:decoration-slate-500"
                                    >
                                        Ich lerne mit der Basis-Version erstmal ohne Plan weiter
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="pt-8 pb-10 flex flex-col items-center gap-2 shrink-0">
                        <div className="flex -space-x-1.5">
                            <div className="w-[26.6px] h-[26.6px] rounded-full border-2 border-white bg-blue-100 flex items-center justify-center text-[8.5px] font-bold text-blue-600 shadow-sm">AM</div>
                            <div className="w-[26.6px] h-[26.6px] rounded-full border-2 border-white bg-emerald-100 flex items-center justify-center text-[8.5px] font-bold text-emerald-600 shadow-sm">SK</div>
                            <div className="w-[26.6px] h-[26.6px] rounded-full border-2 border-white bg-orange-100 flex items-center justify-center text-[8.5px] font-bold text-orange-600 shadow-sm">MY</div>
                        </div>
                        <div className="text-center space-y-0.5">
                            <p className="text-[12.3px] text-slate-500 font-bold">
                                Für arabischsprachige Prüflinge in Deutschland gemacht.
                            </p>
                            {isAr && (
                                <p dir="rtl" className="text-[11.7px] text-slate-400 font-black animate-reveal">
                                    مصنوع للمتقدمين العرب في ألمانيا.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            <style>{`
                @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fadeUp { animation: fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                
                @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fadeSlideIn { animation: fadeSlideIn 0.5s ease-out forwards; }
                
                @keyframes reveal {
                    from { opacity: 0; transform: translateY(-12px); filter: blur(5px); }
                    to { opacity: 1; transform: translateY(0); filter: blur(0); }
                }
                .animate-reveal { animation: reveal 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }

                @keyframes shimmer { 100% { transform: translateX(100%); } }
                .animate-shimmer { animation: shimmer 1.5s infinite; }

                @keyframes lockShine {
                    0% { transform: translateX(0) rotate(12deg); opacity: 0; }
                    18% { opacity: 1; }
                    52% { opacity: 0.85; }
                    100% { transform: translateX(330%) rotate(12deg); opacity: 0; }
                }
                .animate-lockShine { animation: lockShine 3.2s ease-in-out infinite; }
            `}</style>

            {showPaywall && (
                <PaywallDialog 
                    onClose={() => setShowPaywall(false)} 
                    featureName="tiktok_onboarding_result" 
                    tiktokPlanPayload={tiktokPlanPayload}
                />
            )}
        </div>
    );
}
