import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, GraduationCap, CheckCircle, Circle } from 'lucide-react';
import { Card } from '../../ui/Card';
import { db } from '../../../services/database';

interface WrittenQuestion {
    id: string;
    topic: string;
    question_text_de: string;
    reviewed: boolean;
}

export default function AdminWrittenExamQuestionList() {
    const navigate = useNavigate();
    const { topic } = useParams<{ topic: string }>();
    const decodedTopic = topic ? decodeURIComponent(topic) : null;
    const isAllQuestions = topic === 'all';

    const [loading, setLoading] = useState(true);
    const [questions, setQuestions] = useState<WrittenQuestion[]>([]);

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

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto pt-4 px-4 pb-32 lg:pt-0 lg:pb-8">
                <Card className="shadow-card border-none animate-pulse" padding="md">
                    <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mb-4" />
                    <div className="space-y-3">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded-xl" />
                        ))}
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto pt-4 px-4 pb-32 lg:pt-0 lg:pb-8">
            <Card className="mb-6 shadow-card border-none" padding="md">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate('/admin/written-exam')}
                            className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-500 dark:text-slate-400"
                        >
                            <ArrowLeft size={24} />
                        </button>
                        <div>
                            <div className="flex items-center gap-2">
                                <GraduationCap size={16} className="text-amber-500" />
                                <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-tight truncate">
                                    {isAllQuestions ? 'Alle Fragen' : decodedTopic}
                                </h2>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                                {questions.length} Fragen
                            </p>
                        </div>
                    </div>
                </div>
            </Card>

            <div className="space-y-3">
                {questions.map((q, index) => (
                    <Card key={q.id} className="shadow-sm border border-slate-200 dark:border-slate-800 hover:shadow-md transition-shadow" padding="none">
                        <button
                            onClick={() => navigate(`/admin/written-exam/${encodeURIComponent(topic || '')}/question?index=${index}`)}
                            className="w-full text-left p-4 flex items-center gap-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${q.reviewed ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'}`}>
                                {q.reviewed ? <CheckCircle size={20} /> : <Circle size={20} />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-blue-500 mb-1">Frage {index + 1}</p>
                                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                    {q.question_text_de}
                                </p>
                            </div>
                        </button>
                    </Card>
                ))}
            </div>
        </div>
    );
}
