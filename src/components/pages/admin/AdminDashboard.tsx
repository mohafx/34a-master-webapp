import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, ClipboardList, RefreshCw, Shield } from 'lucide-react';
import { Card } from '../../ui/Card';
import { db } from '../../../services/database';
import AdminQuizQuestions from './AdminQuizQuestions';
import AdminWrittenQuestions from './AdminWrittenQuestions';

type Tab = 'quiz' | 'written';

export default function AdminDashboard() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<Tab>('quiz');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Data
    const [quizQuestions, setQuizQuestions] = useState<any[]>([]);
    const [writtenQuestions, setWrittenQuestions] = useState<any[]>([]);
    const [modules, setModules] = useState<any[]>([]);
    const [topics, setTopics] = useState<string[]>([]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [qQuestions, wQuestions, mods, tps] = await Promise.all([
                db.getAllQuestions(),
                db.getAllWrittenExamQuestions(),
                db.getAllModulesWithLessons(),
                db.getWrittenExamTopics(),
            ]);

            // Quiz questions come mapped; we need the raw format
            // getAllQuestions already returns mapped objects, but we need raw DB columns for admin
            // Let's re-fetch raw
            const { data: rawQuestions } = await (await import('../../../lib/supabase')).supabase
                .from('questions')
                .select('*')
                .order('order_index');

            setQuizQuestions(rawQuestions || []);
            setWrittenQuestions(wQuestions);
            setModules(mods);
            setTopics(tps);
        } catch (err) {
            console.error('Failed to load admin data:', err);
            showToast('Fehler beim Laden der Daten', 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleSaveQuiz = async (questionId: string, updates: any) => {
        setSaving(questionId);
        try {
            await db.updateQuestion(questionId, updates);
            // Update local state
            setQuizQuestions(prev => prev.map(q => q.id === questionId ? { ...q, ...updates } : q));
            showToast('Frage gespeichert ✓', 'success');
        } catch (err: any) {
            console.error('Failed to save question:', err);
            showToast(`Fehler: ${err.message || 'Speichern fehlgeschlagen'}`, 'error');
        } finally {
            setSaving(null);
        }
    };

    const handleSaveWritten = async (questionId: string, updates: any) => {
        setSaving(questionId);
        try {
            await db.updateWrittenExamQuestion(questionId, updates);
            setWrittenQuestions(prev => prev.map(q => q.id === questionId ? { ...q, ...updates } : q));
            showToast('Prüfungsfrage gespeichert ✓', 'success');
        } catch (err: any) {
            console.error('Failed to save written question:', err);
            showToast(`Fehler: ${err.message || 'Speichern fehlgeschlagen'}`, 'error');
        } finally {
            setSaving(null);
        }
    };

    return (
        <div className="max-w-4xl mx-auto pt-4 px-4 pb-32 lg:pt-0 lg:pb-8">
            {/* Header */}
            <Card className="mb-6 shadow-card border-none" padding="md">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate('/')}
                            className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-500 dark:text-slate-400"
                        >
                            <ArrowLeft size={24} />
                        </button>
                        <div>
                            <div className="flex items-center gap-2">
                                <Shield size={16} className="text-blue-500" />
                                <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-tight">
                                    Admin
                                </h2>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                                Fragen-Verwaltung
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
            </Card>

            {/* Tab Switcher */}
            <div className="flex gap-2 mb-6">
                <button
                    onClick={() => setActiveTab('quiz')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm transition-all ${activeTab === 'quiz'
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-blue-900/30'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                >
                    <ClipboardList size={18} />
                    <span>Quiz</span>
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${activeTab === 'quiz' ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700'
                        }`}>
                        {quizQuestions.length}
                    </span>
                </button>
                <button
                    onClick={() => setActiveTab('written')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm transition-all ${activeTab === 'written'
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-blue-900/30'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                >
                    <FileText size={18} />
                    <span>Prüfung</span>
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${activeTab === 'written' ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700'
                        }`}>
                        {writtenQuestions.length}
                    </span>
                </button>
            </div>

            {/* Content */}
            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map(i => (
                        <Card key={i} className="shadow-card border-none animate-pulse" padding="md">
                            <div className="flex items-start gap-3">
                                <div className="w-7 h-4 bg-slate-200 dark:bg-slate-700 rounded" />
                                <div className="flex-1">
                                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4 mb-2" />
                                    <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-1/2" />
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            ) : (
                <>
                    {activeTab === 'quiz' && (
                        <AdminQuizQuestions
                            questions={quizQuestions}
                            modules={modules}
                            onSave={handleSaveQuiz}
                            saving={saving}
                        />
                    )}
                    {activeTab === 'written' && (
                        <AdminWrittenQuestions
                            questions={writtenQuestions}
                            topics={topics}
                            onSave={handleSaveWritten}
                            saving={saving}
                        />
                    )}
                </>
            )}

            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-lg font-bold text-sm transition-all animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-[90vw] ${toast.type === 'success'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-red-500 text-white'
                    }`}>
                    {toast.message}
                </div>
            )}
        </div>
    );
}
