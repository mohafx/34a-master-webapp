import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../App';
import { ArrowLeft, ChevronRight, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { WrittenExamQuestion } from '../../types';
import { usePostHog } from '../../contexts/PostHogProvider';

export default function TikTokTest() {
    const { language, toggleLanguage } = useApp();
    const location = useLocation();
    const navigate = useNavigate();
    const { trackEvent } = usePostHog();
    
    const isAr = language === 'DE_AR';
    const questions: WrittenExamQuestion[] = location.state?.questions || [];
    
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string[]>>({});
    const [timeLeft, setTimeLeft] = useState(15 * 60);

    // Timer logic
    useEffect(() => {
        if (timeLeft <= 0) {
            handleComplete();
            return;
        }
        const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
        return () => clearInterval(timer);
    }, [timeLeft]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // If no questions were passed (e.g. direct navigation), go back to funnel
    useEffect(() => {
        if (!questions || questions.length === 0) {
            navigate('/tiktok');
        } else {
            trackEvent('tiktok_test_started', { total_questions: questions.length });
        }
    }, [questions, navigate, trackEvent]);

    if (!questions || questions.length === 0) return null;

    const currentQuestion = questions[currentIndex];
    const isMultipleChoice = currentQuestion.correctAnswer.includes(',');
    const currentSelections = selectedAnswers[currentQuestion.id] || [];

    const handleSelectAnswer = (key: string) => {
        const newSelections = [...currentSelections];
        if (newSelections.includes(key)) {
            newSelections.splice(newSelections.indexOf(key), 1);
        } else {
            if (!isMultipleChoice) {
                newSelections.length = 0; 
            }
            newSelections.push(key);
        }
        
        setSelectedAnswers({
            ...selectedAnswers,
            [currentQuestion.id]: newSelections.sort()
        });
    };

    const handleComplete = () => {
        trackEvent('tiktok_test_completed', { reason: timeLeft <= 0 ? 'timeout' : 'manual' });
        navigate('/tiktok/analyzing', { 
            state: { 
                questions, 
                selectedAnswers 
            } 
        });
    };

    const handleNext = () => {
        if (currentIndex < questions.length - 1) {
            setCurrentIndex(currentIndex + 1);
        } else {
            handleComplete();
        }
    };



    const answerEntries = Object.entries(currentQuestion.answers).filter(([_, val]) => val !== undefined);

    return (
        <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans">
            {/* Header - Scaled down 15% */}
            <header className="bg-white border-b border-slate-200 px-2 py-3 flex items-center justify-between sticky top-0 z-50">
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => navigate(-1)}
                        className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-[13px] font-black text-slate-800 tracking-tight">Frage {currentIndex + 1} von {questions.length}</h1>
                            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-black transition-colors ${timeLeft < 60 ? 'bg-red-50 text-red-500 animate-pulse' : 'bg-slate-100 text-slate-500'}`}>
                                <Clock className="w-2.5 h-2.5" />
                                <span>{formatTime(timeLeft)}</span>
                            </div>
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider line-clamp-1">{currentQuestion.topic}</p>
                    </div>
                </div>
                
                {/* Premium Segmented Toggle */}
                <div className="flex bg-slate-100 p-0.5 rounded-full relative h-8 w-28 shadow-inner">
                    <div 
                        className={`absolute inset-y-0.5 w-[calc(50%-2px)] bg-white rounded-full shadow-sm transition-all duration-300 ${isAr ? 'translate-x-[calc(100%+2px)]' : 'translate-x-0'}`} 
                    />
                    <button 
                        onClick={() => isAr && toggleLanguage()}
                        className={`relative z-10 flex-1 flex items-center justify-center text-[11.5px] font-black transition-colors ${!isAr ? 'text-[#3B65F5]' : 'text-slate-400'}`}
                    >
                        DE
                    </button>
                    <button 
                        onClick={() => !isAr && toggleLanguage()}
                        className={`relative z-10 flex-1 flex items-center justify-center text-[11.5px] font-black pt-0.5 transition-colors ${isAr ? 'text-[#3B65F5]' : 'text-slate-400'}`}
                    >
                        عربي
                    </button>
                </div>
            </header>

            {/* Progress Bar */}
            <div className="h-1 w-full bg-slate-100">
                <div 
                    className="h-full bg-[#3B65F5] transition-all duration-300"
                    style={{ width: `${((currentIndex) / questions.length) * 100}%` }}
                />
            </div>

            {/* Main Content - Reduced padding & text sizes */}
            <main className="flex-1 overflow-y-auto p-5 flex flex-col max-w-lg w-full mx-auto pb-28">
                <div className="space-y-6 animate-fadeSlideIn">
                    {/* Question */}
                    <div className="space-y-3">
                        <h2 className={`font-black text-[#0F172A] leading-snug transition-all duration-300 ${isAr ? 'text-[13px]' : 'text-[14.5px]'}`}>
                            {currentQuestion.questionTextDE}
                        </h2>
                        {isAr && currentQuestion.questionTextAR && (
                            <p dir="rtl" className="text-[11px] font-bold text-slate-600 leading-snug animate-reveal text-left">
                                {currentQuestion.questionTextAR}
                            </p>
                        )}
                        {isMultipleChoice && (
                            <div className="flex flex-col gap-1.5 items-start">
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold">
                                    Wähle {currentQuestion.correctAnswer.split(',').length} Antworten
                                </div>
                                {isAr && (
                                    <div dir="rtl" className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[9px] font-bold">
                                        اختر {currentQuestion.correctAnswer.split(',').length === 2 ? 'إجابتين' : `${currentQuestion.correctAnswer.split(',').length} إجابات`}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Answers */}
                    <div className="space-y-2.5">
                        {answerEntries.map(([key, answer]) => {
                            if (!answer) return null;
                            const isSelected = currentSelections.includes(key);
                            
                            return (
                                <button
                                    key={key}
                                    onClick={() => handleSelectAnswer(key)}
                                    className={`w-full text-left p-3.5 rounded-[18px] border-2 transition-all duration-200 relative overflow-hidden group ${
                                        isSelected 
                                            ? 'border-[#3B65F5] bg-blue-50/50 shadow-sm scale-[1.01]' 
                                            : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}
                                >
                                    <div className="flex gap-3">
                                        <div className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                                            isSelected 
                                                ? 'bg-[#3B65F5] border-[#3B65F5] text-white' 
                                                : 'border-slate-300 bg-white'
                                        }`}>
                                            {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                                        </div>
                                        <div className="flex-1 space-y-1.5 pt-0.5">
                                            <p className={`leading-relaxed font-medium transition-all duration-300 ${isSelected ? 'text-[#0F172A]' : 'text-slate-700'} ${isAr ? 'text-[10px]' : 'text-[11px]'}`}>
                                                {answer.de}
                                            </p>
                                            {isAr && answer.ar && (
                                                <p dir="rtl" className={`text-[9.5px] leading-relaxed font-bold animate-reveal text-left ${isSelected ? 'text-[#3B65F5]' : 'text-slate-500'}`}>
                                                    {answer.ar}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </main>

            {/* Bottom Bar - Reduced height */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-slate-100 z-50">
                <div className="max-w-lg mx-auto">
                    <button
                        onClick={handleNext}
                        disabled={currentSelections.length === 0}
                        className={`w-full font-black min-h-[52px] px-6 rounded-[20px] text-[16px] transition-all flex items-center justify-center gap-2 shadow-md ${
                            currentSelections.length > 0
                                ? 'bg-[#3B65F5] hover:bg-[#3256D6] text-white active:scale-[0.98]'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                        }`}
                    >
                        <span>{currentIndex < questions.length - 1 ? 'Nächste Frage' : 'Test abschließen'}</span>
                        <ChevronRight className="w-5 h-5" strokeWidth={3} />
                    </button>
                </div>
            </div>

            <style>{`
                @keyframes fadeSlideIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fadeSlideIn { animation: fadeSlideIn 0.4s ease-out forwards; }
                @keyframes reveal {
                    from { opacity: 0; filter: blur(4px); }
                    to { opacity: 1; filter: blur(0); }
                }
                .animate-reveal { animation: reveal 0.6s ease-out forwards; }
            `}</style>
        </div>
    );
}
