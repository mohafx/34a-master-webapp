import React, { useState, useEffect } from 'react';
import { X, Clock, HelpCircle, Play, Minus, Plus, Shield } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

interface ExamConfigDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onStart: (questionCount: number, timeInSeconds: number) => void;
    moduleTitle: string;
    moduleIcon?: React.ReactNode;
    totalQuestions: number;
    language: 'DE' | 'DE_AR';
}

const SECONDS_PER_QUESTION = 90; // 1.5 minutes per question

export function ExamConfigDialog({
    isOpen,
    onClose,
    onStart,
    moduleTitle,
    moduleIcon,
    totalQuestions,
    language
}: ExamConfigDialogProps) {
    const minQuestions = Math.min(5, totalQuestions);
    const maxQuestions = totalQuestions;

    const [questionCount, setQuestionCount] = useState(() =>
        Math.min(10, maxQuestions)
    );
    const [showLimitNote, setShowLimitNote] = useState(false);

    // Reset when dialog opens
    useEffect(() => {
        if (isOpen) {
            setQuestionCount(Math.min(10, maxQuestions));
        }
    }, [isOpen, maxQuestions]);

    const timeInSeconds = questionCount * SECONDS_PER_QUESTION;
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = timeInSeconds % 60;

    const handleDecrease = () => {
        setQuestionCount(prev => Math.max(minQuestions, prev - 1));
    };

    const handleIncrease = () => {
        if (questionCount >= maxQuestions) {
            setShowLimitNote(true);
            setTimeout(() => setShowLimitNote(false), 5000);
            return;
        }
        setQuestionCount(prev => Math.min(maxQuestions, prev + 1));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Dialog */}
            <Card className="relative w-full max-w-sm bg-white dark:bg-slate-900 shadow-2xl border-none animate-in fade-in zoom-in-95 duration-200" padding="none">
                {/* Header */}
                <div className="relative bg-[#3B82F6] p-5 text-white text-center rounded-t-xl">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                    >
                        <X size={18} />
                    </button>

                    <div className="flex flex-col items-center gap-2 mb-1">
                        <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                            <Shield size={24} fill="currentColor" className="text-white opacity-90" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black">Mini-Prüfung</h2>
                            {language === 'DE_AR' && (
                                <p className="text-white/80 text-sm font-medium" dir="rtl">اختبار مصغر</p>
                            )}
                        </div>
                    </div>
                    <p className="text-white/90 text-sm font-medium line-clamp-1">{moduleTitle}</p>
                </div>

                {/* Content */}
                <div className="p-5 space-y-5">
                    {/* Question Count Selector */}
                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-3 text-center uppercase tracking-wide">
                            Anzahl der Fragen
                            {language === 'DE_AR' && (
                                <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5" dir="rtl">
                                    عدد الأسئلة
                                </span>
                            )}
                        </label>

                        {/* Counter with +/- buttons */}
                        <div className="flex items-center justify-center gap-3 mb-5">
                            <button
                                onClick={handleDecrease}
                                disabled={questionCount <= minQuestions}
                                className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all active:scale-95 text-slate-600 dark:text-slate-300"
                            >
                                <Minus size={20} />
                            </button>

                            <div className="w-24 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex flex-col items-center justify-center">
                                <span className="text-3xl font-black text-blue-600 dark:text-blue-400 leading-none mb-0.5">{questionCount}</span>
                                <span className="text-[9px] font-bold text-blue-400 dark:text-blue-300 uppercase tracking-wider">FRAGEN</span>
                            </div>

                            <button
                                onClick={handleIncrease}
                                className={`w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-all active:scale-95 text-slate-600 dark:text-slate-300 ${questionCount >= maxQuestions ? 'opacity-60' : ''}`}
                            >
                                <Plus size={20} />
                            </button>
                        </div>

                        {/* Limit Notification */}
                        {showLimitNote && (
                            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 rounded-xl animate-in fade-in slide-in-from-top-2 duration-300">
                                <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 text-center leading-tight">
                                    {language === 'DE_AR' ? (
                                        <>
                                            Du kannst nur bereits beantwortete Fragen testen. Beantworte mehr Fragen im Übungsmodus!
                                            <span className="block mt-1 font-medium" dir="rtl">يمكنك فقط اختبار الأسئلة التي أجبت عليها بالفعل. أجب على المزيد من الأسئلة في وضع التدريب!</span>
                                        </>
                                    ) : (
                                        "Du kannst nur bereits beantwortete Fragen testen. Beantworte mehr Fragen im Übungsmodus!"
                                    )}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Timer Preview */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center">
                                <Clock size={20} className="text-amber-600 dark:text-amber-400" />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                    Verfügbare Zeit
                                    {language === 'DE_AR' && (
                                        <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-medium" dir="rtl">
                                            الوقت المتاح
                                        </span>
                                    )}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-xl font-black text-slate-900 dark:text-white">
                                    {minutes}:{seconds.toString().padStart(2, '0')}
                                </p>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                    {Math.round(SECONDS_PER_QUESTION / 60 * 10) / 10} Min/Frage
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Info Box */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 rounded-xl p-3 flex gap-3">
                        <HelpCircle size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
                        <div className="text-xs text-blue-700 dark:text-blue-300">
                            <p className="font-semibold mb-1">So funktioniert's:</p>
                            <ul className="space-y-0.5 text-blue-600 dark:text-blue-400">
                                <li>• Beantworte alle Fragen ohne Feedback</li>
                                <li>• Am Ende siehst du dein Ergebnis</li>
                                <li>• ≥50% = Bestanden ✓</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-5 pt-0">
                    <Button
                        fullWidth
                        size="lg"
                        variant="primary"
                        onClick={() => onStart(questionCount, timeInSeconds)}
                        leftIcon={<Play size={18} fill="currentColor" />}
                        className="h-12 text-sm font-black tracking-wide shadow-lg shadow-blue-500/20 bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
                    >
                        PRÜFUNG STARTEN
                    </Button>
                </div>
            </Card>
        </div>
    );
}

export default ExamConfigDialog;
