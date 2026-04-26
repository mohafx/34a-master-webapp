import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../App';
import { Lock, Sparkles, Languages, CheckCircle2, XCircle, BarChart3, Map as MapIcon, ShieldAlert, Search, Activity, TrendingDown, Cpu, Zap, Award, FileText, LayoutGrid, Microscope, Eye, BookOpen, ChevronRight } from 'lucide-react';
import { WrittenExamQuestion } from '../../types';
import { usePostHog } from '../../contexts/PostHogProvider';
import { PaywallDialog } from '../PaywallDialog';

interface ResultState {
    questions: WrittenExamQuestion[];
    selectedAnswers: Record<string, string[]>;
}

export default function TikTokTestResult() {
    const { language, toggleLanguage } = useApp();
    const location = useLocation();
    const navigate = useNavigate();
    const { trackEvent } = usePostHog();
    
    const isAr = language === 'DE_AR';
    const state = location.state as ResultState;
    
    const [animatedScore, setAnimatedScore] = useState(0);
    const [showPaywall, setShowPaywall] = useState(false);

    useEffect(() => {
        if (!state?.questions) {
            navigate('/tiktok');
            return;
        }
        
        let score = 0;
        state.questions.forEach(q => {
            const userAns = (state.selectedAnswers[q.id] || []).join(',');
            if (userAns === q.correctAnswer) score++;
        });

        trackEvent('tiktok_result_viewed', { score, total: state.questions.length });
        
        const timer = setTimeout(() => {
            setAnimatedScore(score);
        }, 100);
        return () => clearTimeout(timer);
    }, [state, navigate, trackEvent]);

    if (!state?.questions) return null;

    const { questions, selectedAnswers } = state;
    const totalQuestions = questions.length;
    
    let actualScore = 0;
    questions.forEach(q => {
        const userAns = (selectedAnswers[q.id] || []).join(',');
        if (userAns === q.correctAnswer) actualScore++;
    });

    const passed = actualScore >= 5;
    const errorsTotal = totalQuestions - actualScore;
    const percentage = Math.round((animatedScore / totalQuestions) * 100);
    
    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    const handleRegister = () => {
        trackEvent('tiktok_result_register_clicked');
        setShowPaywall(true);
    };

    const handleRetry = () => {
        trackEvent('tiktok_result_retry_clicked');
        navigate('/tiktok/loading');
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#F8FAFC] flex flex-col font-sans">
            {/* Header Area - Matches TikTokFunnel.tsx */}
            <div className="w-full max-w-lg mx-auto px-3.5 mt-5 shrink-0 relative z-20 text-left">
                <div className="rounded-[30px] shadow-xl overflow-hidden relative transition-colors duration-500 bg-[#3B65F5] shadow-blue-500/10">
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <div className="absolute -top-16 -right-16 w-64 h-64 bg-white/10 rounded-full blur-3xl opacity-40" />
                        <div className="absolute top-1/2 -left-10 w-32 h-32 bg-white/10 rounded-full blur-2xl opacity-20" />
                    </div>

                    <div className="px-5 py-[14px] relative z-10 flex flex-col justify-center">
                        <div className="animate-fadeSlideIn flex items-center justify-between">
                            <h1 className="text-[25px] font-black tracking-tighter leading-tight text-white mb-0 ml-1">34a Master</h1>
                            
                            {/* Language Toggle - Matches TikTokFunnel.tsx styling exactly */}
                            <div className="flex items-center bg-[#1E293B] rounded-full p-1 h-9 relative w-[130px] shadow-inner">
                                {/* Sliding background */}
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

            {/* Main Content */}
            <main className="flex-1 flex flex-col relative z-10 w-full px-3.5 pt-10 pb-20 max-w-lg mx-auto transition-all duration-700">
                
                <div className="animate-fadeUp space-y-7 flex-1">
                    
                    {/* Card 1: Score Visualization */}
                    <div className="relative group">
                        <div className={`absolute -inset-0.5 bg-gradient-to-r ${passed ? 'from-transparent to-transparent' : 'from-red-500 to-orange-400'} rounded-[28px] blur-xl ${passed ? 'opacity-0' : 'opacity-30'} transition duration-1000`}></div>
                        <div className={`relative bg-white rounded-[28px] p-8 ${passed ? 'shadow-[0_8px_40px_rgba(59,101,245,0.08)] border-blue-50/50' : 'shadow-[0_0_50px_-10px_rgba(239,68,68,0.2)] border-red-100'} border-2 flex flex-col items-center text-center`}>
                            {/* Circular Progress */}
                            <div className="relative w-40 h-40 mb-6">
                                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 140 140">
                                    <defs>
                                        <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                            <stop offset="0%" stopColor={passed ? '#3B65F5' : '#EF4444'} />
                                            <stop offset="100%" stopColor={passed ? '#60A5FA' : '#F87171'} />
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
                                    <span className={`text-[40px] font-black ${passed ? 'text-[#3B65F5]' : 'text-red-500'} leading-none tracking-tight`}>{percentage}%</span>
                                <div className="flex flex-col items-center">
                                        <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1.5 ml-1">Score</span>
                                        {isAr && <span dir="rtl" className="animate-reveal text-[11px] text-slate-400 font-bold opacity-70">النتيجة</span>}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex flex-wrap items-center justify-center gap-2">
                                    <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full ${passed ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'} text-[13px] font-black uppercase tracking-wider`}>
                                        {passed ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                                        <span>{passed ? 'Bestanden' : 'Nicht bestanden'}</span>
                                        {isAr && (
                                            <span dir="rtl" className="animate-reveal ml-1 text-[12px] opacity-80">
                                                / {passed ? 'ناجح' : 'راسب'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="px-5 -mt-1 relative z-10 text-center">
                        <p className="text-[14.5px] font-bold text-slate-600 leading-snug">
                            Basierend auf deinen {errorsTotal} Fehlern haben wir einen Plan erstellt, der dich punktgenau zur Prüfung führt.
                            {isAr && (
                                <span dir="rtl" className="block text-[13px] text-slate-400 mt-2 animate-reveal">
                                    بناءً على {errorsTotal} أخطاء، قمنا بإنشاء خطة تقودك بدقة إلى الامتحان.
                                </span>
                            )}
                        </p>
                    </div>

                    {/* Visual Connector - Vertical Flow Line */}
                    <div className="flex justify-center -my-3 relative z-10">
                        <div className="w-0.5 h-12 bg-gradient-to-b from-[#3B65F5] to-blue-400 opacity-20 relative">
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#3B65F5]" />
                        </div>
                    </div>

                    {/* Connected Section: Analyse + Rettungsplan */}
                    <div className="relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-400 to-[#3B65F5] rounded-[28px] blur opacity-10 group-hover:opacity-20 transition duration-1000"></div>
                        <div className="relative bg-white rounded-[28px] shadow-[0_8px_40px_rgba(59,101,245,0.08)] border border-blue-50/50 overflow-hidden">
                            




                            {/* Section 2: Rettungsplan */}
                            <div className="p-7 pt-4">
                                <div className="flex items-center gap-4 mb-5">
                                    <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20">
                                        <MapIcon className="w-6 h-6 text-white" />
                                    </div>
                                    <div className="text-left">
                                        <h3 className="text-[19px] font-black text-[#3B65F5] leading-tight">
                                            Dein persönlicher<br/>14-Tage IHK-Rettungsplan
                                        </h3>
                                        {isAr && (
                                            <p dir="rtl" className="text-[13px] font-bold text-blue-400 mt-0.5 animate-reveal">
                                                خطة إنقاذ IHK الشخصية لمدة 14 يومًا
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="mb-4 flex justify-center">
                                    <div className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-600">
                                        Inkl. Fehler-/Schwächeanalyse und arabische Erklärung
                                    </div>
                                </div>

                                <div className="relative">
                                    <div className="bg-[#0F172A] rounded-[32px] p-6 border border-slate-800 overflow-hidden relative min-h-[220px] shadow-2xl">
                                        {/* Header Info */}
                                        <div className="absolute inset-0 z-10 p-6 pt-8 blur-[3px] select-none pointer-events-none">
                                            <div className="flex items-center justify-between mb-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-11 h-11 rounded-2xl bg-slate-800/50 border border-slate-700 flex items-center justify-center">
                                                        <BookOpen className="w-5 h-5 text-blue-400" />
                                                    </div>
                                                    <div>
                                                        <div className="inline-flex px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[9px] font-black uppercase tracking-wider mb-0.5">
                                                            JETZT DRAN
                                                        </div>
                                                        <h3 className="text-white text-base font-black leading-tight">
                                                            IHK-Rettungsplan
                                                        </h3>
                                                    </div>
                                                </div>
                                                <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/20">
                                                    <ChevronRight className="w-5 h-5 text-white" />
                                                </div>
                                            </div>

                                            <div className="bg-slate-900/40 rounded-[24px] p-5 border border-slate-800/50 mb-4">
                                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-5">
                                                    LERNINHALTE
                                                </div>
                                                <div className="space-y-5">
                                                    {[
                                                        "Rechtsgrundlagen § 34a GewO",
                                                        "Umgang mit Menschen (IHK)",
                                                        "Bürgerliches Gesetzbuch (BGB)"
                                                    ].map((topic, i) => (
                                                        <div key={i} className="flex items-start gap-4 group cursor-default">
                                                            <span className="text-blue-500/60 font-black text-sm mt-0.5">{i + 1}</span>
                                                            <div className="text-slate-200 font-bold text-sm leading-snug group-hover:text-white transition-colors">
                                                                {topic}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="px-2 space-y-3 mb-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-5 h-5 rounded-full border-2 border-slate-700" />
                                                        <span className="text-slate-400 font-bold text-xs uppercase tracking-tight">8 Lektionen lesen</span>
                                                    </div>
                                                    <span className="text-slate-500 font-black text-xs">0/8</span>
                                                </div>
                                                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                    <div className="w-[10%] h-full bg-blue-600 rounded-full" />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Unlock Button Container */}
                                        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
                                            <button 
                                                onClick={handleRegister} 
                                                className="w-full bg-[#3B65F5] hover:bg-[#3256D6] text-white py-4 rounded-[20px] flex flex-col items-center justify-center gap-0.5 shadow-[0_10px_30px_rgba(59,101,245,0.4)] active:scale-[0.98] transition-all relative overflow-hidden group/btn"
                                            >
                                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover/btn:animate-shimmer" />
                                                <div className="flex items-center gap-2.5 text-[16px] font-black tracking-tight">
                                                    <Lock className="w-5 h-5 fill-white/20" />
                                                    <span>JETZT FREISCHALTEN (49€)</span>
                                                </div>
                                                {isAr && (
                                                    <span dir="rtl" className="text-[13px] font-bold opacity-90 animate-reveal">
                                                        افتح الآن
                                                    </span>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-4 flex justify-center">
                                    <button
                                        onClick={() => navigate('/dashboard')}
                                        className="inline-flex w-full max-w-[420px] items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3.5 text-center text-[13px] font-black leading-snug text-blue-700 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800"
                                    >
                                        Ohne Plan weiterlernen
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Trust Element - Matches TikTokFunnel.tsx */}
                    <div className="pt-8 pb-10 flex flex-col items-center gap-2 shrink-0">
                        <div className="flex -space-x-1.5">
                            <div className="w-[26.6px] h-[26.6px] rounded-full border-2 border-white bg-blue-100 flex items-center justify-center text-[8.5px] font-bold text-blue-600 shadow-sm">AM</div>
                            <div className="w-[26.6px] h-[26.6px] rounded-full border-2 border-white bg-emerald-100 flex items-center justify-center text-[8.5px] font-bold text-emerald-600 shadow-sm">SK</div>
                            <div className="w-[26.6px] h-[26.6px] rounded-full border-2 border-white bg-orange-100 flex items-center justify-center text-[8.5px] font-bold text-orange-600 shadow-sm">MY</div>
                        </div>
                        <div className="text-center space-y-0.5">
                            <p className="text-[12.3px] text-slate-500 font-bold">
                                Schon <span className="text-[#0F172A]">1000+ Nutzer</span> bereiten sich vor
                            </p>
                            {isAr && (
                                <p dir="rtl" className="text-[11.7px] text-slate-400 font-black animate-reveal">
                                    أكثر من 1000 مستخدم يستعدون بالفعل
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

                @keyframes scan { 
                    0% { transform: translateY(-100%); } 
                    100% { transform: translateY(250%); } 
                }
                .animate-scan { animation: scan 3s linear infinite; }
            `}</style>

            {/* Paywall Dialog */}
            {showPaywall && (
                <PaywallDialog 
                    onClose={() => setShowPaywall(false)} 
                    featureName="tiktok_onboarding_result" 
                />
            )}
        </div>
    );
}
