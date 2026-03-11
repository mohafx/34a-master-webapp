import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, GraduationCap, ChevronRight, FileText, Search, X, RefreshCw } from 'lucide-react';
import { Card } from '../../ui/Card';
import { db } from '../../../services/database';

export default function AdminWrittenExamBrowser() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [topics, setTopics] = useState<string[]>([]);
    const [topicCounts, setTopicCounts] = useState<Record<string, number>>({});

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [allQuestions, tps] = await Promise.all([
                db.getAllWrittenExamQuestions(),
                db.getWrittenExamTopics(),
            ]);
            setTopics(tps);
            // Count questions per topic
            const counts: Record<string, number> = {};
            allQuestions.forEach((q: any) => {
                counts[q.topic] = (counts[q.topic] || 0) + 1;
            });
            setTopicCounts(counts);
        } catch (err) {
            console.error('Failed to load written exam data:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const totalQuestions = useMemo(() => {
        return Object.values(topicCounts).reduce((a, b) => a + b, 0);
    }, [topicCounts]);

    // Topic icons/colors
    const topicColors = [
        'from-amber-500 to-orange-600',
        'from-blue-500 to-indigo-600',
        'from-emerald-500 to-teal-600',
        'from-purple-500 to-pink-600',
        'from-rose-500 to-red-600',
        'from-cyan-500 to-blue-600',
        'from-lime-500 to-green-600',
        'from-fuchsia-500 to-purple-600',
        'from-yellow-500 to-amber-600',
        'from-indigo-500 to-violet-600',
    ];

    return (
        <div className="max-w-4xl mx-auto pt-4 px-4 pb-32 lg:pt-0 lg:pb-8">
            {/* Header */}
            <Card className="mb-8 shadow-card border-none" padding="md">
                <div className="flex flex-col">
                    <div className="flex items-center justify-between pt-2 pb-4">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => navigate('/')}
                                className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-500 dark:text-slate-400"
                            >
                                <ArrowLeft size={24} />
                            </button>
                            <div>
                                <div className="flex items-center gap-2">
                                    <GraduationCap size={16} className="text-amber-500" />
                                    <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-tight">
                                        Prüfungsfragen
                                    </h2>
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                                    {totalQuestions} Fragen • {topics.length} Themen
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={loadData}
                            disabled={loading}
                            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-500 dark:text-slate-400 disabled:opacity-50"
                        >
                            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>
            </Card>

            {/* "Alle Fragen" Button */}
            <div className="mb-6">
                <Card
                    variant="hoverable"
                    onClick={() => navigate('/admin/written-exam/all')}
                    className="border-2 border-amber-200 dark:border-amber-800/50 shadow-sm hover:shadow-md"
                    padding="md"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-md shadow-amber-200/30">
                                <FileText className="text-white" size={22} />
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-900 dark:text-white text-sm">Alle Fragen</h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{totalQuestions} Prüfungsfragen durchblättern</p>
                            </div>
                        </div>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 dark:text-slate-600">
                            <ChevronRight size={20} strokeWidth={2.5} />
                        </div>
                    </div>
                </Card>
            </div>

            {/* Topic List - Desktop Grid */}
            <div className="hidden lg:grid lg:grid-cols-2 lg:gap-4">
                {loading ? (
                    [1, 2, 3, 4, 5, 6].map(i => (
                        <Card key={i} className="shadow-card border-none animate-pulse" padding="md">
                            <div className="flex items-center gap-3.5">
                                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl" />
                                <div className="flex-1">
                                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4 mb-2" />
                                    <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-1/2" />
                                </div>
                            </div>
                        </Card>
                    ))
                ) : (
                    topics.map((topic, index) => (
                        <Card key={topic} className="shadow-card border-none hover:shadow-lg transition-shadow" padding="none">
                            <button
                                onClick={() => navigate(`/admin/written-exam/${encodeURIComponent(topic)}`)}
                                className="w-full text-left p-4 sm:p-5 flex items-center justify-between group hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors rounded-2xl"
                            >
                                <div className="flex items-center gap-3.5 flex-1">
                                    <div className={`w-12 h-12 bg-gradient-to-br ${topicColors[index % topicColors.length]} rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md`}>
                                        <span className="text-white font-black text-sm">{index + 1}</span>
                                    </div>
                                    <div className="text-left flex-1 min-w-0 pr-4">
                                        <h4 className="font-bold text-slate-900 dark:text-white text-sm leading-tight">{topic}</h4>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
                                            {topicCounts[topic] || 0} Fragen
                                        </p>
                                    </div>
                                </div>
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 group-hover:text-blue-500/70 group-hover:bg-blue-500/10 dark:group-hover:text-blue-400/70 dark:group-hover:bg-blue-400/10 transition-all flex-shrink-0">
                                    <ChevronRight size={20} strokeWidth={2.5} />
                                </div>
                            </button>
                        </Card>
                    ))
                )}
            </div>

            {/* Mobile Topic List */}
            <Card className="lg:hidden divide-y divide-slate-100 dark:divide-slate-700/50 overflow-hidden shadow-card border-none" padding="none">
                {loading ? (
                    [1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="p-4 animate-pulse flex items-center gap-3.5">
                            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl" />
                            <div className="flex-1">
                                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4 mb-2" />
                                <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-1/2" />
                            </div>
                        </div>
                    ))
                ) : (
                    topics.map((topic, index) => (
                        <button
                            key={topic}
                            onClick={() => navigate(`/admin/written-exam/${encodeURIComponent(topic)}`)}
                            className="w-full text-left p-4 sm:p-5 flex items-center justify-between group hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            <div className="flex items-center gap-3.5 flex-1">
                                <div className={`w-12 h-12 bg-gradient-to-br ${topicColors[index % topicColors.length]} rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md`}>
                                    <span className="text-white font-black text-sm">{index + 1}</span>
                                </div>
                                <div className="text-left flex-1 min-w-0 pr-4">
                                    <h4 className="font-bold text-slate-900 dark:text-white text-sm leading-tight">{topic}</h4>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
                                        {topicCounts[topic] || 0} Fragen
                                    </p>
                                </div>
                            </div>
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 group-hover:text-blue-500/70 group-hover:bg-blue-500/10 dark:group-hover:text-blue-400/70 dark:group-hover:bg-blue-400/10 transition-all flex-shrink-0">
                                <ChevronRight size={20} strokeWidth={2.5} />
                            </div>
                        </button>
                    ))
                )}
            </Card>
        </div>
    );
}
