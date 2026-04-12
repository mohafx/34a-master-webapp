import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Check, CheckCircle, Circle, XCircle, Pencil, Save, GraduationCap, RefreshCw, Languages, Search, Sparkles, AlertTriangle, Scale, Clock, Settings } from 'lucide-react';
import { Card } from '../../ui/Card';
import { db } from '../../../services/database';
import { useApp } from '../../../App';
import { useAuth } from '../../../contexts/AuthContext';
import { runQualityAnalysis, QualityAnalysisResult, OptimizedQuestion, runArabicTranslation, ArabicTranslationResult } from '../../../services/gemini';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { isAdminEmail } from '../../../utils/userRoles';

const ANSWER_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

interface WrittenQuestion {
    id: string;
    topic: string;
    question_text_de: string;
    question_text_ar: string | null;
    answer_a_de: string; answer_a_ar: string | null;
    answer_b_de: string; answer_b_ar: string | null;
    answer_c_de: string; answer_c_ar: string | null;
    answer_d_de: string; answer_d_ar: string | null;
    answer_e_de: string | null; answer_e_ar: string | null;
    answer_f_de: string | null; answer_f_ar: string | null;
    correct_answer: string;
    explanation_de: string | null;
    explanation_ar: string | null;
    quality_check: any | null;
    reviewed: boolean;
    updated_at: string | null;
}

export default function AdminWrittenExamQuiz() {
    const navigate = useNavigate();
    const { language, toggleLanguage } = useApp();
    const { topic } = useParams<{ topic: string }>();
    const decodedTopic = topic ? decodeURIComponent(topic) : null;
    const isAllQuestions = topic === 'all';
    const { user: authUser } = useAuth();
    const isAdmin = isAdminEmail(authUser?.email);

    const [loading, setLoading] = useState(true);
    const [questions, setQuestions] = useState<WrittenQuestion[]>([]);
    const [searchParams] = useSearchParams();
    const [currentIndex, setCurrentIndex] = useState(() => {
        const idx = searchParams.get('index');
        return idx ? parseInt(idx, 10) : 0;
    });
    const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
    const [isChecked, setIsChecked] = useState(false);
    const [showExplanation, setShowExplanation] = useState(false);

    // Admin edit state
    const [adminEditing, setAdminEditing] = useState(false);
    const [adminEditData, setAdminEditData] = useState<any>(null);
    const [adminSaving, setAdminSaving] = useState(false);
    const [adminShowExplanations, setAdminShowExplanations] = useState(false);
    const [adminToast, setAdminToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // AI Quality Analysis state
    const [qualityChecking, setQualityChecking] = useState(false);
    const [isAnalysisExpanded, setIsAnalysisExpanded] = useState(true);
    const [qualityResult, setQualityResult] = useState<QualityAnalysisResult | null>(null);

    // AI Arabic Translation state
    const [arabicChecking, setArabicChecking] = useState(false);
    const [isArabicExpanded, setIsArabicExpanded] = useState(true);
    const [arabicResult, setArabicResult] = useState<ArabicTranslationResult | null>(null);

    // Admin Options Toggle
    const [showAdminActions, setShowAdminActions] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const allQuestions = await db.getAllWrittenExamQuestions();
            if (isAllQuestions) {
                setQuestions(allQuestions);
            } else if (decodedTopic) {
                setQuestions(allQuestions.filter((q: any) => q.topic === decodedTopic));
            }
        } catch (err) {
            console.error('Failed to load questions:', err);
        } finally {
            setLoading(false);
        }
    }, [decodedTopic, isAllQuestions]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const currentQuestion = questions[currentIndex] || null;

    // Load saved quality check result when questions load or index changes
    useEffect(() => {
        if (currentQuestion) {
            setQualityResult(currentQuestion.quality_check || null);
        }
    }, [currentQuestion?.id]);

    const correctAnswers = useMemo(() => {
        if (!currentQuestion) return [];
        return currentQuestion.correct_answer.split(',').map(a => a.trim());
    }, [currentQuestion]);

    const isMultipleChoice = correctAnswers.length > 1;

    const availableAnswers = useMemo(() => {
        if (!currentQuestion) return [];
        return ANSWER_LETTERS.filter(letter => {
            const key = `answer_${letter.toLowerCase()}_de` as keyof WrittenQuestion;
            return !!currentQuestion[key];
        });
    }, [currentQuestion]);

    const toggleAnswer = (letter: string) => {
        if (isChecked) return;
        if (isMultipleChoice) {
            setSelectedAnswers(prev =>
                prev.includes(letter)
                    ? prev.filter(a => a !== letter)
                    : [...prev, letter]
            );
        } else {
            setSelectedAnswers([letter]);
        }
    };

    const checkAnswer = () => {
        setIsChecked(true);
    };

    const isAnswerCorrect = useMemo(() => {
        if (!isChecked) return false;
        const selected = [...selectedAnswers].sort();
        const correct = [...correctAnswers].sort();
        return selected.length === correct.length && selected.every((a, i) => a === correct[i]);
    }, [isChecked, selectedAnswers, correctAnswers]);

    const goToQuestion = (index: number) => {
        if (index >= 0 && index < questions.length) {
            setCurrentIndex(index);
            setSelectedAnswers([]);
            setIsChecked(false);
            setShowExplanation(false);
            setAdminEditing(false);
            setAdminEditData(null);
            setAdminShowExplanations(false);
            setQualityResult(null);
            setArabicResult(null);
        }
    };

    const startAdminEdit = () => {
        if (!currentQuestion) return;
        const q = currentQuestion;
        setAdminEditData({
            ...q,
            // deduce initial question type, preferring single choice if only 1 correct answer, else multiple choice
            _questionType: q.correct_answer.split(',').length > 1 ? 'multiple' : 'single'
        });
        setAdminEditing(true);
        setAdminShowExplanations(false);
    };

    const swapAnswers = (idx1: number, idx2: number) => {
        if (!adminEditData) return;

        const letter1 = ANSWER_LETTERS[idx1];
        const letter2 = ANSWER_LETTERS[idx2];
        const key1 = letter1.toLowerCase();
        const key2 = letter2.toLowerCase();

        const textDE1 = adminEditData[`answer_${key1}_de`];
        const textAR1 = adminEditData[`answer_${key1}_ar`];
        const textDE2 = adminEditData[`answer_${key2}_de`];
        const textAR2 = adminEditData[`answer_${key2}_ar`];

        // Correct Answer Swap
        const correctAnswers = adminEditData.correct_answer ? adminEditData.correct_answer.split(',').map((a: string) => a.trim()).filter(Boolean) : [];
        const is1Correct = correctAnswers.includes(letter1);
        const is2Correct = correctAnswers.includes(letter2);

        let newCorrectAnswers = [...correctAnswers];
        if (is1Correct && !is2Correct) {
            newCorrectAnswers = newCorrectAnswers.filter(a => a !== letter1);
            newCorrectAnswers.push(letter2);
        } else if (!is1Correct && is2Correct) {
            newCorrectAnswers = newCorrectAnswers.filter(a => a !== letter2);
            newCorrectAnswers.push(letter1);
        }

        setAdminEditData({
            ...adminEditData,
            [`answer_${key1}_de`]: textDE2,
            [`answer_${key1}_ar`]: textAR2,
            [`answer_${key2}_de`]: textDE1,
            [`answer_${key2}_ar`]: textAR1,
            correct_answer: newCorrectAnswers.sort().join(',')
        });
    };

    const handleAdminSave = async () => {
        if (!adminEditData || !currentQuestion) return;

        const correctAnswers = adminEditData.correct_answer ? adminEditData.correct_answer.split(',').map((a: string) => a.trim()).filter(Boolean) : [];
        if (adminEditData._questionType === 'single' && correctAnswers.length !== 1) {
            setAdminToast({ message: 'Single Choice muss genau 1 richtige Antwort haben', type: 'error' });
            setTimeout(() => setAdminToast(null), 3000);
            return;
        }
        if (adminEditData._questionType === 'multiple' && correctAnswers.length !== 2) {
            setAdminToast({ message: 'Multiple Choice muss genau 2 richtige Antworten haben', type: 'error' });
            setTimeout(() => setAdminToast(null), 3000);
            return;
        }

        setAdminSaving(true);
        try {
            const updates: any = {
                question_text_de: adminEditData.question_text_de,
                question_text_ar: adminEditData.question_text_ar || null,
                correct_answer: adminEditData.correct_answer,
                topic: adminEditData.topic,
            };
            for (const letter of ANSWER_LETTERS) {
                const key = letter.toLowerCase();
                updates[`answer_${key}_de`] = adminEditData[`answer_${key}_de`] || null;
                updates[`answer_${key}_ar`] = adminEditData[`answer_${key}_ar`] || null;
            }
            updates.explanation_de = adminEditData.explanation_de || null;
            updates.explanation_ar = adminEditData.explanation_ar || null;

            await db.updateWrittenExamQuestion(currentQuestion.id, updates);
            // Update local state
            setQuestions(prev => prev.map(q => q.id === currentQuestion.id ? { ...q, ...updates } : q));
            setAdminToast({ message: 'Gespeichert ✓', type: 'success' });
            setTimeout(() => setAdminToast(null), 2000);
            setAdminEditing(false);
            setAdminEditData(null);
        } catch (err: any) {
            console.error('Admin save failed:', err);
            setAdminToast({ message: `Fehler: ${err.message || 'Speichern fehlgeschlagen'}`, type: 'error' });
            setTimeout(() => setAdminToast(null), 3000);
        } finally {
            setAdminSaving(false);
        }
    };

    const handleQualityAnalysis = async () => {
        if (!currentQuestion) return;
        setQualityChecking(true);
        setIsAnalysisExpanded(true);
        setQualityResult(null);
        try {
            const q = currentQuestion;
            const correctAnswersList = q.correct_answer.split(',').map(a => a.trim());
            const answersData = ANSWER_LETTERS
                .filter(letter => {
                    const key = `answer_${letter.toLowerCase()}_de` as keyof WrittenQuestion;
                    return !!q[key];
                })
                .map(letter => ({
                    letter,
                    text: q[`answer_${letter.toLowerCase()}_de` as keyof WrittenQuestion] as string,
                    isCorrect: correctAnswersList.includes(letter)
                }));

            const result = await runQualityAnalysis({
                questionText: q.question_text_de,
                answers: answersData,
                topic: q.topic,
                questionType: correctAnswersList.length > 1 ? 'Multiple Choice' : 'Single Choice'
            });
            setQualityResult(result);
        } catch (err) {
            console.error('Quality analysis failed:', err);
            setQualityResult({
                analysis: '## ❌ Fehler\n\nVerbindungsfehler bei der KI-Qualitätsprüfung.',
                optimized_question: null
            });
        } finally {
            setQualityChecking(false);
        }
    };

    const applyOptimizedQuestion = () => {
        if (!qualityResult?.optimized_question || !currentQuestion) return;
        const opt = qualityResult.optimized_question;

        const optCorrectAnswers = opt.correct_answer.split(',').map(a => a.trim()).filter(Boolean);

        if (optCorrectAnswers.length > 2) {
            setAdminToast({ message: 'Achtung: KI hat mehr als 2 Antworten generiert. Das ist in IHK nicht erlaubt.', type: 'error' });
            setTimeout(() => setAdminToast(null), 4000);
            return;
        }

        const q = currentQuestion;
        const editData: any = { ...q };
        editData.question_text_de = opt.question_text_de;
        editData.correct_answer = opt.correct_answer;
        editData._questionType = optCorrectAnswers.length > 1 ? 'multiple' : 'single';

        for (const letter of ANSWER_LETTERS) {
            const key = letter.toLowerCase();
            editData[`answer_${key}_de`] = null;
        }
        if (opt.answers) {
            for (const [letter, data] of Object.entries(opt.answers)) {
                const key = letter.toLowerCase();
                if (data.text_de) editData[`answer_${key}_de`] = data.text_de;
            }
        }

        setAdminEditData(editData);
        setAdminEditing(true);
        setAdminToast({ message: 'KI-Vorschlag übernommen ✓', type: 'success' });
        setTimeout(() => setAdminToast(null), 2500);

        setTimeout(() => {
            document.getElementById('admin-edit-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 200);
    };

    // ======== ARABIC TRANSLATION ========
    const handleArabicAnalysis = async () => {
        if (!currentQuestion) return;
        setArabicChecking(true);
        setIsArabicExpanded(true);
        setArabicResult(null);
        try {
            const q = currentQuestion;
            const correctAnswersList = q.correct_answer.split(',').map(a => a.trim());
            const answersData = ANSWER_LETTERS
                .filter(letter => {
                    const key = `answer_${letter.toLowerCase()}_de` as keyof WrittenQuestion;
                    return !!q[key];
                })
                .map(letter => ({
                    letter,
                    text: q[`answer_${letter.toLowerCase()}_de` as keyof WrittenQuestion] as string,
                    isCorrect: correctAnswersList.includes(letter),
                    existingAr: q[`answer_${letter.toLowerCase()}_ar` as keyof WrittenQuestion] as string | null
                }));

            const result = await runArabicTranslation({
                questionText: q.question_text_de,
                answers: answersData,
                topic: q.topic,
                questionType: correctAnswersList.length > 1 ? 'Multiple Choice' : 'Single Choice',
                existingArabic: { questionTextAr: q.question_text_ar }
            });
            setArabicResult(result);
        } catch (err) {
            console.error('Arabic analysis failed:', err);
            setArabicResult({
                analysis: '## ❌ Fehler\n\nVerbindungsfehler bei der KI-Übersetzung.',
                translated_question: null
            });
        } finally {
            setArabicChecking(false);
        }
    };

    const applyArabicTranslation = () => {
        if (!arabicResult?.translated_question || !currentQuestion) return;
        const trans = arabicResult.translated_question;
        const q = currentQuestion;

        const editData: any = { ...q };
        editData.question_text_ar = trans.question_text_ar;
        editData._questionType = q.correct_answer.split(',').length > 1 ? 'multiple' : 'single';

        if (trans.answers) {
            for (const [letter, data] of Object.entries(trans.answers)) {
                const key = letter.toLowerCase();
                if (data.text_ar) editData[`answer_${key}_ar`] = data.text_ar;
            }
        }

        setAdminEditData(editData);
        setAdminEditing(true);
        setAdminShowExplanations(false);
        setAdminToast({ message: 'AR-Übersetzung übernommen ✓', type: 'success' });
        setTimeout(() => setAdminToast(null), 2500);

        setTimeout(() => {
            document.getElementById('admin-edit-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 200);
    };

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto pt-4 px-4 pb-32 lg:pt-0 lg:pb-8">
                <Card className="shadow-card border-none animate-pulse" padding="md">
                    <div className="space-y-4">
                        <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
                        <div className="h-20 bg-slate-100 dark:bg-slate-800 rounded-xl" />
                        <div className="space-y-2">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800 rounded-xl" />
                            ))}
                        </div>
                    </div>
                </Card>
            </div>
        );
    }

    if (!currentQuestion) {
        return (
            <div className="max-w-4xl mx-auto pt-4 px-4 pb-32 lg:pt-0 lg:pb-8 text-center">
                <Card className="shadow-card border-none" padding="lg">
                    <p className="text-slate-500 dark:text-slate-400 font-medium">Keine Fragen gefunden</p>
                    <button onClick={() => navigate(`/admin/written-exam/${encodeURIComponent(topic || '')}`)} className="mt-4 text-sm font-bold text-blue-500 hover:text-blue-600">
                        Zurück zur Übersicht
                    </button>
                </Card>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto pt-4 px-4 pb-32 lg:pt-0 lg:pb-8">
            {/* Header */}
            <Card className="mb-6 shadow-card border-none" padding="md">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate(`/admin/written-exam/${encodeURIComponent(topic || '')}`)}
                            className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-500 dark:text-slate-400"
                        >
                            <ArrowLeft size={24} />
                        </button>
                        <div>
                            <div className="flex items-center gap-2">
                                <GraduationCap size={16} className="text-amber-500" />
                                <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-tight truncate max-w-[200px]">
                                    {isAllQuestions ? 'Alle Fragen' : decodedTopic}
                                </h2>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                                Frage {currentIndex + 1} von {questions.length}
                            </p>
                        </div>
                    </div>

                    {/* Progress indicator */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={toggleLanguage}
                            className={`p-2 rounded-xl transition-all ${language === 'DE_AR'
                                ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                        >
                            <Languages size={20} />
                        </button>
                        <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-full">
                            <button
                                onClick={() => goToQuestion(currentIndex - 1)}
                                disabled={currentIndex === 0}
                                className="p-1.5 pl-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 disabled:opacity-30 transition-colors"
                            >
                                <ChevronLeft size={16} strokeWidth={3} />
                            </button>
                            <span className="text-xs font-black text-slate-900 dark:text-white px-1">
                                {currentIndex + 1}/{questions.length}
                            </span>
                            <button
                                onClick={() => goToQuestion(currentIndex + 1)}
                                disabled={currentIndex === questions.length - 1}
                                className="p-1.5 pr-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 disabled:opacity-30 transition-colors"
                            >
                                <ChevronRight size={16} strokeWidth={3} />
                            </button>
                        </div>
                        {/* Reviewed Toggle */}
                        <button
                            onClick={async (e) => {
                                e.stopPropagation();
                                if (!currentQuestion) return;
                                const newVal = !currentQuestion.reviewed;
                                setQuestions(prev => prev.map(q =>
                                    q.id === currentQuestion.id ? { ...q, reviewed: newVal } : q
                                ));
                                try {
                                    await db.updateWrittenExamQuestion(currentQuestion.id, { reviewed: newVal });
                                } catch (e) {
                                    console.warn('Failed to save reviewed status:', e);
                                    setQuestions(prev => prev.map(q =>
                                        q.id === currentQuestion.id ? { ...q, reviewed: !newVal } : q
                                    ));
                                }
                            }}
                            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${currentQuestion.reviewed
                                ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500'
                                }`}
                            title={currentQuestion.reviewed ? 'Überprüft ✓' : 'Als überprüft markieren'}
                        >
                            {currentQuestion.reviewed
                                ? <CheckCircle size={18} />
                                : <Circle size={18} />
                            }
                        </button>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="mt-3 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-amber-500 transition-all duration-300 rounded-full"
                        style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
                    />
                </div>
            </Card>

            {/* Question Card */}
            <Card className="shadow-card border-none mb-4" padding="none">
                <div className="p-5 pb-4">
                    {/* Topic badge */}
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            {currentQuestion.topic}
                        </span>
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${isMultipleChoice
                            ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
                            : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                            }`}>
                            {isMultipleChoice ? 'Multiple Choice' : 'Single Choice'}
                        </span>
                    </div>

                    {/* Question text */}
                    <p className="text-sm font-semibold text-slate-900 dark:text-white leading-relaxed mb-1">
                        {currentQuestion.question_text_de}
                    </p>
                    {language === 'DE_AR' && currentQuestion.question_text_ar && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed text-right" dir="rtl">
                            {currentQuestion.question_text_ar}
                        </p>
                    )}
                </div>

                {/* Answer Options */}
                <div className="px-5 pb-5 space-y-2">
                    {availableAnswers.map(letter => {
                        const key = letter.toLowerCase();
                        const textDE = currentQuestion[`answer_${key}_de` as keyof WrittenQuestion] as string;
                        const textAR = currentQuestion[`answer_${key}_ar` as keyof WrittenQuestion] as string | null;
                        const isSelected = selectedAnswers.includes(letter);
                        const isCorrectAnswer = correctAnswers.includes(letter);

                        let style = 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600';
                        if (isChecked) {
                            if (isCorrectAnswer) {
                                style = 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700';
                            } else if (isSelected && !isCorrectAnswer) {
                                style = 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700';
                            }
                        } else if (isSelected) {
                            style = 'bg-blue-50 dark:bg-blue-900/20 border-blue-400 dark:border-blue-600 ring-2 ring-blue-400/20';
                        }

                        return (
                            <button
                                key={letter}
                                onClick={() => toggleAnswer(letter)}
                                disabled={isChecked}
                                className={`w-full text-left p-3.5 rounded-xl border-2 transition-all flex items-start gap-3 ${style} ${isChecked ? 'cursor-default' : 'active:scale-[0.99]'}`}
                            >
                                <span className={`text-[11px] font-black mt-0.5 flex-shrink-0 ${isChecked && isCorrectAnswer ? 'text-emerald-600 dark:text-emerald-400' :
                                    isChecked && isSelected ? 'text-red-500' :
                                        isSelected ? 'text-blue-600 dark:text-blue-400' :
                                            'text-slate-400 dark:text-slate-500'
                                    }`}>
                                    {letter}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm leading-snug ${isChecked && isCorrectAnswer ? 'text-emerald-700 dark:text-emerald-300 font-medium' :
                                        isChecked && isSelected ? 'text-red-700 dark:text-red-300' :
                                            'text-slate-700 dark:text-slate-300'
                                        }`}>
                                        {textDE}
                                    </p>
                                    {language === 'DE_AR' && textAR && (
                                        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 text-right" dir="rtl">{textAR}</p>
                                    )}
                                </div>
                                {isChecked && isCorrectAnswer && (
                                    <CheckCircle size={18} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                                )}
                                {isChecked && isSelected && !isCorrectAnswer && (
                                    <XCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </Card>

            {/* Check / Result / Explanation */}
            {!isChecked ? (
                <button
                    onClick={checkAnswer}
                    disabled={selectedAnswers.length === 0}
                    className="w-full mt-4 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-blue-200/30 dark:shadow-none mb-4"
                >
                    Prüfen
                </button>
            ) : (
                <div className="mt-4 mb-4 space-y-3">
                    {/* Result badge */}
                    <div className={`px-4 py-3 rounded-2xl font-bold text-sm text-center ${isAnswerCorrect
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                        {isAnswerCorrect ? '✅ Richtig!' : `❌ Falsch — Richtige Antwort: ${correctAnswers.join(', ')}`}
                    </div>

                    {/* Explanation */}
                    {currentQuestion.explanation_de && (
                        <div>
                            <button
                                onClick={() => setShowExplanation(!showExplanation)}
                                className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                            >
                                {showExplanation ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                Erklärung {showExplanation ? 'ausblenden' : 'anzeigen'}
                            </button>
                            {showExplanation && (
                                <div className="mt-2 bg-amber-50 dark:bg-amber-900/10 rounded-xl p-4 border border-amber-200 dark:border-amber-800/30">
                                    <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">{currentQuestion.explanation_de}</p>
                                    {language === 'DE_AR' && currentQuestion.explanation_ar && (
                                        <p className="text-xs text-amber-700/70 dark:text-amber-300/70 leading-relaxed mt-2 text-right" dir="rtl">
                                            {currentQuestion.explanation_ar}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Optimized Question Preview Card */}
            {qualityResult?.optimized_question && (
                <div className="relative mt-6 mb-4">
                    <div className="absolute -top-3 left-4 px-3 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] font-black rounded-full shadow-md z-10 flex items-center gap-1">
                        <Sparkles size={10} />
                        KI-Optimierter Vorschlag
                    </div>
                    <div className="border-2 border-blue-400 dark:border-blue-600 rounded-2xl overflow-hidden shadow-sm">
                        <div className="p-5 pb-4 bg-blue-50/30 dark:bg-blue-950/20">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                    {currentQuestion.topic}
                                </span>
                                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${qualityResult.optimized_question.correct_answer.includes(',')
                                    ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
                                    : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                    }`}>
                                    {qualityResult.optimized_question.correct_answer.includes(',') ? 'Multiple Choice' : 'Single Choice'}
                                </span>
                            </div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white leading-relaxed mb-1">
                                {qualityResult.optimized_question.question_text_de}
                            </p>
                        </div>
                        <div className="px-5 pb-5 space-y-2 bg-blue-50/30 dark:bg-blue-950/20">
                            {Object.entries(qualityResult.optimized_question.answers).map(([letter, ans]) => {
                                if (!ans.text_de) return null;
                                const isCorrectAnswer = qualityResult.optimized_question!.correct_answer.split(',').includes(letter);
                                return (
                                    <div key={letter} className={`w-full text-left p-3.5 rounded-xl border-2 transition-all flex items-start gap-3 ${isCorrectAnswer ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700' : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'}`}>
                                        <span className={`text-[11px] font-black mt-0.5 flex-shrink-0 ${isCorrectAnswer ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                            {letter}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm leading-snug ${isCorrectAnswer ? 'text-emerald-700 dark:text-emerald-300 font-medium' : 'text-slate-700 dark:text-slate-300'}`}>
                                                {ans.text_de}
                                            </p>
                                        </div>
                                        {isCorrectAnswer && (
                                            <CheckCircle size={18} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="px-5 pb-5 bg-blue-50/30 dark:bg-blue-950/20">
                            <button
                                onClick={applyOptimizedQuestion}
                                className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-md"
                            >
                                <Sparkles size={16} />
                                Vorschlag übernehmen
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Admin Actions Toggle */}
            <div className="mb-4">
                <button
                    onClick={() => setShowAdminActions(!showAdminActions)}
                    className={`w-full flex items-center justify-between px-5 py-3.5 rounded-2xl font-bold text-sm transition-all border-2 ${showAdminActions
                        ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        : 'bg-white dark:bg-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 shadow-sm'}`}
                >
                    <div className="flex items-center gap-2">
                        <Settings size={18} className={showAdminActions ? "text-slate-500" : "text-slate-400"} />
                        Admin-Optionen {showAdminActions ? 'ausblenden' : 'anzeigen'}
                    </div>
                    {showAdminActions ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
            </div>

            {showAdminActions && (
                <>
                    {/* AI Quality Check Card */}
                    <div className="mb-4">
                        {/* Letzte Änderung - above KI card */}
                        {currentQuestion.updated_at && (
                            <div className="mb-3 flex items-center gap-2 px-1">
                                <Clock size={13} className="text-slate-400 dark:text-slate-500" />
                                <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                                    Letzte Änderung: {new Date(currentQuestion.updated_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        )}
                        <Card className="border-2 border-purple-200 dark:border-purple-800/50 shadow-sm" padding="none">
                            <div className="p-4 flex items-center justify-between flex-wrap gap-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <button
                                        onClick={handleQualityAnalysis}
                                        disabled={qualityChecking}
                                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold text-xs transition-all disabled:opacity-50 shadow-md"
                                    >
                                        {qualityChecking ? (
                                            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <Sparkles size={14} />
                                        )}
                                        {qualityChecking ? 'Analyse läuft...' : 'KI-Qualitätsprüfung'}
                                    </button>
                                    <button
                                        onClick={handleArabicAnalysis}
                                        disabled={arabicChecking}
                                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-bold text-xs transition-all disabled:opacity-50 shadow-md"
                                    >
                                        {arabicChecking ? (
                                            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <Languages size={14} />
                                        )}
                                        {arabicChecking ? 'Übersetzung läuft...' : 'KI arabische Analyse'}
                                    </button>
                                </div>
                                <div className="flex items-center gap-1">
                                    {qualityResult && (
                                        <button
                                            onClick={() => setIsAnalysisExpanded(!isAnalysisExpanded)}
                                            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-500"
                                            title="Qualitätsanalyse"
                                        >
                                            {isAnalysisExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Quality Analysis Result - Markdown */}
                            {qualityResult && isAnalysisExpanded && (
                                <div className="px-4 pb-4 space-y-4">
                                    <div className="prose prose-sm dark:prose-invert max-w-none overflow-x-auto rounded-xl bg-slate-50 dark:bg-slate-800/50 p-4 border border-slate-200 dark:border-slate-700">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{qualityResult.analysis}</ReactMarkdown>
                                    </div>
                                </div>
                            )}

                            {/* Arabic Translation Result - Markdown */}
                            {arabicResult && isArabicExpanded && (
                                <div className="px-4 pb-4 space-y-4">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Languages size={14} className="text-emerald-600 dark:text-emerald-400" />
                                        <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">Arabische Analyse</span>
                                        <button
                                            onClick={() => setIsArabicExpanded(false)}
                                            className="ml-auto p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-400"
                                        >
                                            <ChevronUp size={16} />
                                        </button>
                                    </div>
                                    <div className="prose prose-sm dark:prose-invert max-w-none overflow-x-auto rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 p-4 border border-emerald-200 dark:border-emerald-800/40">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{arabicResult.analysis}</ReactMarkdown>
                                    </div>
                                </div>
                            )}
                            {arabicResult && !isArabicExpanded && (
                                <div className="px-4 pb-3">
                                    <button
                                        onClick={() => setIsArabicExpanded(true)}
                                        className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700"
                                    >
                                        <ChevronDown size={14} />
                                        Arabische Analyse anzeigen
                                    </button>
                                </div>
                            )}
                        </Card>

                        {/* Written Regen Pilot Card */}
                        <Card className="mt-4 border-2 border-amber-200 dark:border-amber-800/50 shadow-sm" padding="none">
                            <div className="p-4 border-b border-amber-100 dark:border-amber-800/30 bg-amber-50/50 dark:bg-amber-900/20">
                                <div className="flex items-center gap-2">
                                    <Scale size={14} className="text-amber-600 dark:text-amber-400" />
                                    <span className="text-xs font-bold text-amber-700 dark:text-amber-300">Pilot: Lokaler Batch (1 Frage, Gemini 3 Flash)</span>
                                </div>
                            </div>

                            <div className="p-4 space-y-3">
                                <p className="text-xs text-slate-700 dark:text-slate-300">
                                    Diese Pipeline läuft jetzt nur lokal im Terminal, nicht als Supabase Edge Function.
                                </p>
                                <div className="space-y-1">
                                    <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">1) Pilot starten:</p>
                                    <code className="block rounded-lg bg-slate-100 dark:bg-slate-900 px-3 py-2 text-[11px] text-slate-800 dark:text-slate-200 break-all">
                                        {`npm run pilot:written-regen -- --question-id=${currentQuestion.id}`}
                                    </code>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">2) Optional direkt freigeben + übernehmen:</p>
                                    <code className="block rounded-lg bg-slate-100 dark:bg-slate-900 px-3 py-2 text-[11px] text-slate-800 dark:text-slate-200 break-all">
                                        {`npm run pilot:written-regen -- --question-id=${currentQuestion.id} --auto-approve --auto-apply`}
                                    </code>
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    Review-Export: <span className="font-mono">local_archive/batch_reviews/</span>
                                </p>
                            </div>
                        </Card>

                        {/* Arabic Translation Preview Card */}
                        {arabicResult?.translated_question && (
                            <div className="relative mt-4">
                                <div className="absolute -top-3 left-4 px-3 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-[10px] font-black rounded-full shadow-md z-10 flex items-center gap-1">
                                    <Languages size={10} />
                                    KI-Übersetzungsvorschlag
                                </div>
                                <div className="border-2 border-emerald-400 dark:border-emerald-600 rounded-2xl overflow-hidden shadow-sm">
                                    <div className="p-5 pb-4 bg-emerald-50/30 dark:bg-emerald-950/20">
                                        <p className="text-sm font-semibold text-slate-900 dark:text-white leading-relaxed mb-1">
                                            {currentQuestion.question_text_de}
                                        </p>
                                        <p className="text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed text-right mt-1" dir="rtl">
                                            {arabicResult.translated_question.question_text_ar}
                                        </p>
                                    </div>
                                    <div className="px-5 pb-5 space-y-2 bg-emerald-50/30 dark:bg-emerald-950/20">
                                        {Object.entries(arabicResult.translated_question.answers).map(([letter, ans]) => {
                                            if (!ans.text_ar) return null;
                                            const deKey = `answer_${letter.toLowerCase()}_de` as keyof WrittenQuestion;
                                            const textDE = currentQuestion[deKey] as string;
                                            return (
                                                <div key={letter} className="w-full text-left p-3.5 rounded-xl border-2 bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
                                                    <div className="flex items-start gap-3">
                                                        <span className="text-[11px] font-black mt-0.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400">{letter}</span>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm leading-snug text-slate-700 dark:text-slate-300">{textDE}</p>
                                                            <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1 text-right" dir="rtl">{ans.text_ar}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="px-5 pb-5 bg-emerald-50/30 dark:bg-emerald-950/20">
                                        <button
                                            onClick={applyArabicTranslation}
                                            className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-bold text-sm transition-all shadow-md"
                                        >
                                            <Languages size={16} />
                                            Übersetzung übernehmen
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Arabic Translation Preview Card - Error Fallback */}
                        {arabicResult && !arabicResult.translated_question && (
                            <div className="relative mt-4">
                                <div className="absolute -top-3 left-4 px-3 py-1 bg-gradient-to-r from-red-600 to-rose-600 text-white text-[10px] font-black rounded-full shadow-md z-10 flex items-center gap-1">
                                    <AlertTriangle size={10} />
                                    KI-Übersetzungsfehler
                                </div>
                                <div className="border-2 border-red-400 dark:border-red-600 rounded-2xl overflow-hidden shadow-sm p-5 bg-red-50/30 dark:bg-red-950/20">
                                    <p className="text-sm font-semibold text-red-900 dark:text-red-300 leading-relaxed">
                                        Die KI konnte keinen strukturierten Übersetzungsvorschlag generieren. Das Ausgabeformat der KI war ungültig oder unvollständig.
                                    </p>
                                    <p className="text-xs text-red-700 dark:text-red-400 mt-2">
                                        Bitte versuche es erneut oder passe den Code der Edge Function an, um robustere JSON-Extrahierung zu ermöglichen.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Admin Inline Edit Card */}
                        <div id="admin-edit-panel" className="mb-4 pt-4">
                            <Card className="border-2 border-indigo-200 dark:border-indigo-800/50 shadow-sm" padding="none">
                                {/* Admin Card Header */}
                                <div
                                    className="p-4 bg-indigo-50/50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800/30 cursor-pointer flex items-center justify-between"
                                    onClick={() => {
                                        if (!adminEditing) {
                                            startAdminEdit();
                                        } else {
                                            setAdminEditing(false);
                                            setAdminEditData(null);
                                        }
                                    }}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 bg-indigo-100 dark:bg-indigo-800/40 rounded-lg flex items-center justify-center">
                                            <Pencil size={14} className="text-indigo-600 dark:text-indigo-400" />
                                        </div>
                                        <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">Admin: Frage bearbeiten</span>
                                    </div>
                                    <div className="text-indigo-400 dark:text-indigo-500">
                                        {adminEditing ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                    </div>
                                </div>

                                {/* Admin Edit Form */}
                                {adminEditing && adminEditData && (
                                    <div className="p-4 space-y-4">
                                        {/* Question Type Selection */}
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2 block">Fragetyp (IHK-Regeln)</label>
                                            <div className="flex gap-4">
                                                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                                                    <input
                                                        type="radio"
                                                        name="questionType"
                                                        value="single"
                                                        checked={adminEditData._questionType === 'single'}
                                                        onChange={() => setAdminEditData({ ...adminEditData, _questionType: 'single', correct_answer: '' })}
                                                        className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                                                    />
                                                    <span>Single Choice (genau 1)</span>
                                                </label>
                                                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                                                    <input
                                                        type="radio"
                                                        name="questionType"
                                                        value="multiple"
                                                        checked={adminEditData._questionType === 'multiple'}
                                                        onChange={() => setAdminEditData({ ...adminEditData, _questionType: 'multiple', correct_answer: '' })}
                                                        className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                                                    />
                                                    <span>Multiple Choice (genau 2)</span>
                                                </label>
                                            </div>
                                        </div>
                                        {/* Question Text DE */}
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">Fragetext (Deutsch)</label>
                                            <textarea
                                                value={adminEditData.question_text_de}
                                                onChange={e => setAdminEditData({ ...adminEditData, question_text_de: e.target.value })}
                                                rows={3}
                                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none"
                                            />
                                        </div>

                                        {/* Question Text AR */}
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">Fragetext (Arabisch)</label>
                                            <textarea
                                                value={adminEditData.question_text_ar || ''}
                                                onChange={e => setAdminEditData({ ...adminEditData, question_text_ar: e.target.value })}
                                                rows={2}
                                                dir="rtl"
                                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none"
                                            />
                                        </div>

                                        {/* Answers */}
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2 block">Antworten</label>
                                            <div className="space-y-2">
                                                {ANSWER_LETTERS.map((letter, index) => {
                                                    const key = letter.toLowerCase();
                                                    const textDE = adminEditData[`answer_${key}_de`];
                                                    if (textDE === null || textDE === undefined) return null;

                                                    const editCorrectAnswers = adminEditData.correct_answer ? adminEditData.correct_answer.split(',').map((a: string) => a.trim()) : [];
                                                    const isCorrect = editCorrectAnswers.includes(letter);

                                                    const canMoveUp = index > 0 && adminEditData[`answer_${ANSWER_LETTERS[index - 1].toLowerCase()}_de`] !== null;
                                                    const canMoveDown = index < ANSWER_LETTERS.length - 1 && adminEditData[`answer_${ANSWER_LETTERS[index + 1].toLowerCase()}_de`] !== null;

                                                    return (
                                                        <div key={letter} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
                                                            <div className="flex items-center justify-between mb-2">
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        onClick={() => {
                                                                            const current = adminEditData.correct_answer ? adminEditData.correct_answer.split(',').map((a: string) => a.trim()).filter(Boolean) : [];
                                                                            if (adminEditData._questionType === 'single') {
                                                                                // Single choice: just set to this letter
                                                                                setAdminEditData({ ...adminEditData, correct_answer: letter });
                                                                            } else {
                                                                                // Multiple choice
                                                                                if (current.includes(letter)) {
                                                                                    setAdminEditData({ ...adminEditData, correct_answer: current.filter((a: string) => a !== letter).join(',') });
                                                                                } else {
                                                                                    if (current.length < 2) {
                                                                                        setAdminEditData({ ...adminEditData, correct_answer: [...current, letter].sort().join(',') });
                                                                                    } else {
                                                                                        // Replace the oldest one or just prevent? Prevent is safer.
                                                                                        setAdminToast({ message: 'Maximal 2 Antworten bei Multiple Choice erlaubt.', type: 'error' });
                                                                                        setTimeout(() => setAdminToast(null), 2000);
                                                                                    }
                                                                                }
                                                                            }
                                                                        }}
                                                                        className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${isCorrect ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                                                                            }`}
                                                                    >
                                                                        {isCorrect ? <CheckCircle size={14} /> : <Circle size={14} />}
                                                                    </button>
                                                                    <span className="text-xs font-black text-slate-500 dark:text-slate-400">{letter}</span>
                                                                </div>
                                                                <div className="flex bg-slate-200 dark:bg-slate-700 rounded-lg overflow-hidden">
                                                                    <button
                                                                        onClick={() => swapAnswers(index, index - 1)}
                                                                        disabled={!canMoveUp}
                                                                        className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-300 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                                                    >
                                                                        <ChevronUp size={16} />
                                                                    </button>
                                                                    <div className="w-px bg-slate-300 dark:bg-slate-600"></div>
                                                                    <button
                                                                        onClick={() => swapAnswers(index, index + 1)}
                                                                        disabled={!canMoveDown}
                                                                        className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-300 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                                                    >
                                                                        <ChevronDown size={16} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            <input
                                                                value={textDE || ''}
                                                                onChange={e => setAdminEditData({ ...adminEditData, [`answer_${key}_de`]: e.target.value })}
                                                                placeholder="Antwort (Deutsch)"
                                                                className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 mb-1.5"
                                                            />
                                                            <input
                                                                value={adminEditData[`answer_${key}_ar`] || ''}
                                                                onChange={e => setAdminEditData({ ...adminEditData, [`answer_${key}_ar`]: e.target.value })}
                                                                placeholder="Antwort (Arabisch)"
                                                                dir="rtl"
                                                                className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Explanations - Collapsible */}
                                        <div>
                                            <button
                                                type="button"
                                                onClick={() => setAdminShowExplanations(!adminShowExplanations)}
                                                className="flex items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                                            >
                                                {adminShowExplanations ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                Erklärung bearbeiten
                                            </button>
                                            {adminShowExplanations && (
                                                <div className="space-y-3 pl-1">
                                                    <div>
                                                        <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">Erklärung (Deutsch)</label>
                                                        <textarea
                                                            value={adminEditData.explanation_de || ''}
                                                            onChange={e => setAdminEditData({ ...adminEditData, explanation_de: e.target.value })}
                                                            rows={3}
                                                            className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">Erklärung (Arabisch)</label>
                                                        <textarea
                                                            value={adminEditData.explanation_ar || ''}
                                                            onChange={e => setAdminEditData({ ...adminEditData, explanation_ar: e.target.value })}
                                                            rows={3}
                                                            dir="rtl"
                                                            className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Save / Cancel */}
                                        <div className="flex gap-2 pt-2">
                                            <button
                                                onClick={handleAdminSave}
                                                disabled={adminSaving}
                                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50"
                                            >
                                                {adminSaving ? (
                                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                ) : (
                                                    <Save size={16} />
                                                )}
                                                Speichern
                                            </button>
                                            <button
                                                onClick={() => { setAdminEditing(false); setAdminEditData(null); }}
                                                className="flex items-center justify-center gap-2 px-5 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                                            >
                                                <XCircle size={16} />
                                                Abbrechen
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </Card>
                        </div>
                    </div>
                </>
            )
            }

            {/* Navigation */}
            <div className="flex gap-3 mb-8">
                <button
                    onClick={() => goToQuestion(currentIndex - 1)}
                    disabled={currentIndex === 0}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-white dark:bg-slate-850 border-2 border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-sm text-slate-600 dark:text-slate-400 transition-all disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                    <ChevronLeft size={18} />
                    Zurück
                </button>
                <button
                    onClick={() => goToQuestion(currentIndex + 1)}
                    disabled={currentIndex === questions.length - 1}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-bold text-sm transition-all disabled:opacity-30 shadow-md shadow-amber-200/30 dark:shadow-none"
                >
                    Weiter
                    <ChevronRight size={18} />
                </button>
            </div>
        </div >
    );
}
