import React, { useState, useMemo } from 'react';
import { Search, X, ChevronDown, ChevronUp, Pencil, Save, XCircle, Plus, Trash2, CheckCircle, Circle, GripVertical, Filter } from 'lucide-react';
import { Card } from '../../ui/Card';

interface QuizQuestion {
    id: string;
    text_de: string;
    text_ar: string | null;
    type: string;
    module_id: string | null;
    lesson_id: string | null;
    correct_answer: string | null;
    answer_a_de: string | null; answer_a_ar: string | null;
    answer_b_de: string | null; answer_b_ar: string | null;
    answer_c_de: string | null; answer_c_ar: string | null;
    answer_d_de: string | null; answer_d_ar: string | null;
    answer_e_de: string | null; answer_e_ar: string | null;
    answer_f_de: string | null; answer_f_ar: string | null;
    explanation_de: string;
    explanation_ar: string | null;
    order_index: number;
    is_free: boolean | null;
}

interface ModuleWithLessons {
    id: string;
    title_de: string;
    title_ar: string | null;
    order_index: number;
    lessons: { id: string; module_id: string; title_de: string; title_ar: string | null; order_index: number }[];
}

interface AdminQuizQuestionsProps {
    questions: QuizQuestion[];
    modules: ModuleWithLessons[];
    onSave: (questionId: string, updates: any) => Promise<void>;
    saving: string | null;
}

const ANSWER_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

export default function AdminQuizQuestions({ questions, modules, onSave, saving }: AdminQuizQuestionsProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [filterModuleId, setFilterModuleId] = useState<string>('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editData, setEditData] = useState<any>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [showFilters, setShowFilters] = useState(false);
    const [showExplanations, setShowExplanations] = useState(false);

    // Filter questions
    const filtered = useMemo(() => {
        let result = questions;
        if (filterModuleId) {
            result = result.filter(q => q.module_id === filterModuleId);
        }
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(q =>
                q.text_de?.toLowerCase().includes(query) ||
                q.text_ar?.toLowerCase().includes(query) ||
                q.answer_a_de?.toLowerCase().includes(query) ||
                q.answer_b_de?.toLowerCase().includes(query) ||
                q.answer_c_de?.toLowerCase().includes(query) ||
                q.answer_d_de?.toLowerCase().includes(query)
            );
        }
        return result;
    }, [questions, searchQuery, filterModuleId]);

    const startEdit = (q: QuizQuestion) => {
        setEditingId(q.id);
        setExpandedId(q.id);
        setEditData({ ...q });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditData(null);
    };

    const handleSave = async () => {
        if (!editData || !editingId) return;
        const updates: any = {
            text_de: editData.text_de,
            text_ar: editData.text_ar || null,
            type: editData.type,
            module_id: editData.module_id,
            lesson_id: editData.lesson_id,
            correct_answer: editData.correct_answer,
            explanation_de: editData.explanation_de,
            explanation_ar: editData.explanation_ar || null,
        };
        // Answers
        for (const letter of ANSWER_LETTERS) {
            const key = letter.toLowerCase();
            updates[`answer_${key}_de`] = editData[`answer_${key}_de`] || null;
            updates[`answer_${key}_ar`] = editData[`answer_${key}_ar`] || null;
        }
        await onSave(editingId, updates);
        setEditingId(null);
        setEditData(null);
    };

    const getModuleName = (moduleId: string | null) => {
        if (!moduleId) return '–';
        const m = modules.find(m => m.id === moduleId);
        return m?.title_de || '–';
    };

    const getLessonName = (lessonId: string | null) => {
        if (!lessonId) return '–';
        for (const m of modules) {
            const l = m.lessons.find(l => l.id === lessonId);
            if (l) return l.title_de;
        }
        return '–';
    };

    const getCorrectAnswerLabels = (q: QuizQuestion) => {
        if (!q.correct_answer) return '';
        return q.correct_answer.split(',').map(a => a.trim()).join(', ');
    };

    const getAnswerCount = (q: QuizQuestion) => {
        let count = 0;
        for (const letter of ANSWER_LETTERS) {
            if (q[`answer_${letter.toLowerCase()}_de` as keyof QuizQuestion]) count++;
        }
        return count;
    };

    // For edit mode: add/remove answers
    const addAnswer = () => {
        if (!editData) return;
        for (const letter of ANSWER_LETTERS) {
            const key = `answer_${letter.toLowerCase()}_de`;
            if (!editData[key]) {
                setEditData({ ...editData, [key]: '', [`answer_${letter.toLowerCase()}_ar`]: '' });
                return;
            }
        }
    };

    const removeAnswer = (letter: string) => {
        if (!editData) return;
        const key = letter.toLowerCase();
        const newData = { ...editData };
        newData[`answer_${key}_de`] = null;
        newData[`answer_${key}_ar`] = null;
        // Remove from correct_answer if present
        if (newData.correct_answer) {
            const answers = newData.correct_answer.split(',').map((a: string) => a.trim()).filter((a: string) => a !== letter);
            newData.correct_answer = answers.join(',');
        }
        setEditData(newData);
    };

    const toggleCorrectAnswer = (letter: string) => {
        if (!editData) return;
        const current = editData.correct_answer ? editData.correct_answer.split(',').map((a: string) => a.trim()) : [];
        if (editData.type === 'SINGLE_CHOICE') {
            setEditData({ ...editData, correct_answer: letter });
        } else {
            if (current.includes(letter)) {
                setEditData({ ...editData, correct_answer: current.filter((a: string) => a !== letter).join(',') });
            } else {
                setEditData({ ...editData, correct_answer: [...current, letter].sort().join(',') });
            }
        }
    };

    const getLessonsForModule = (moduleId: string | null) => {
        if (!moduleId) return [];
        const m = modules.find(m => m.id === moduleId);
        return m?.lessons || [];
    };

    return (
        <div>
            {/* Search & Filter Bar */}
            <div className="mb-4 space-y-3">
                <div className="relative">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Fragen durchsuchen..."
                        className="w-full pl-10 pr-10 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                            <X size={18} className="text-slate-400" />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${showFilters || filterModuleId
                            ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                    >
                        <Filter size={14} />
                        Filter
                        {filterModuleId && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                    </button>
                    <span className="text-xs text-slate-400 font-medium">
                        {filtered.length} von {questions.length} Fragen
                    </span>
                </div>

                {showFilters && (
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
                        <label className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 block">Modul</label>
                        <select
                            value={filterModuleId}
                            onChange={e => setFilterModuleId(e.target.value)}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                        >
                            <option value="">Alle Module</option>
                            {modules.map(m => (
                                <option key={m.id} value={m.id}>{m.title_de}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Questions List */}
            <div className="space-y-3">
                {filtered.map((q, index) => {
                    const isEditing = editingId === q.id;
                    const isExpanded = expandedId === q.id;
                    const data = isEditing ? editData : q;
                    const correctAnswers = data?.correct_answer ? data.correct_answer.split(',').map((a: string) => a.trim()) : [];

                    return (
                        <Card key={q.id} className={`shadow-card border-none overflow-hidden transition-all ${isEditing ? 'ring-2 ring-blue-500' : ''}`} padding="none">
                            {/* Question Header */}
                            <div
                                className={`p-4 ${!isEditing ? 'cursor-pointer active:bg-slate-50 dark:active:bg-slate-800/50' : ''}`}
                                onClick={() => !isEditing && setExpandedId(isExpanded ? null : q.id)}
                            >
                                <div className="flex items-start gap-3">
                                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 mt-1 flex-shrink-0 min-w-[28px]">
                                        #{index + 1}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-900 dark:text-white leading-snug">
                                            {data?.text_de || q.text_de}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${q.type === 'MULTIPLE_CHOICE'
                                                ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
                                                : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                                }`}>
                                                {q.type === 'MULTIPLE_CHOICE' ? 'Multi' : 'Single'}
                                            </span>
                                            <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                                                {getModuleName(q.module_id)}
                                            </span>
                                            <span className="text-[10px] text-slate-300 dark:text-slate-600">•</span>
                                            <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                                                Antwort: {getCorrectAnswerLabels(q)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        {!isEditing && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); startEdit(q); }}
                                                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                                            >
                                                <Pencil size={15} />
                                            </button>
                                        )}
                                        <div className="text-slate-300 dark:text-slate-600">
                                            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Expanded Content */}
                            {isExpanded && (
                                <div className="border-t border-slate-100 dark:border-slate-800">
                                    {isEditing ? (
                                        /* EDIT MODE */
                                        <div className="p-4 space-y-4">
                                            {/* Question Text DE */}
                                            <div>
                                                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">Fragetext (Deutsch)</label>
                                                <textarea
                                                    value={editData.text_de}
                                                    onChange={e => setEditData({ ...editData, text_de: e.target.value })}
                                                    rows={3}
                                                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-none"
                                                />
                                            </div>

                                            {/* Question Text AR */}
                                            <div>
                                                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">Fragetext (Arabisch)</label>
                                                <textarea
                                                    value={editData.text_ar || ''}
                                                    onChange={e => setEditData({ ...editData, text_ar: e.target.value })}
                                                    rows={2}
                                                    dir="rtl"
                                                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-none"
                                                />
                                            </div>

                                            {/* Type */}
                                            <div>
                                                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">Fragetyp</label>
                                                <select
                                                    value={editData.type}
                                                    onChange={e => setEditData({ ...editData, type: e.target.value })}
                                                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                                                >
                                                    <option value="SINGLE_CHOICE">Single Choice</option>
                                                    <option value="MULTIPLE_CHOICE">Multiple Choice</option>
                                                </select>
                                            </div>

                                            {/* Module + Lesson */}
                                            <div className="grid grid-cols-1 gap-3">
                                                <div>
                                                    <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">Modul</label>
                                                    <select
                                                        value={editData.module_id || ''}
                                                        onChange={e => setEditData({ ...editData, module_id: e.target.value || null, lesson_id: null })}
                                                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                                                    >
                                                        <option value="">Kein Modul</option>
                                                        {modules.map(m => (
                                                            <option key={m.id} value={m.id}>{m.title_de}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">Lektion</label>
                                                    <select
                                                        value={editData.lesson_id || ''}
                                                        onChange={e => setEditData({ ...editData, lesson_id: e.target.value || null })}
                                                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                                                        disabled={!editData.module_id}
                                                    >
                                                        <option value="">Keine Lektion</option>
                                                        {getLessonsForModule(editData.module_id).map((l: any) => (
                                                            <option key={l.id} value={l.id}>{l.title_de}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            {/* Answers */}
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Antworten</label>
                                                    {getAnswerCount(editData) < 6 && (
                                                        <button
                                                            onClick={addAnswer}
                                                            className="flex items-center gap-1 text-[11px] font-bold text-blue-500 hover:text-blue-600"
                                                        >
                                                            <Plus size={13} /> Hinzufügen
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="space-y-2">
                                                    {ANSWER_LETTERS.map(letter => {
                                                        const key = letter.toLowerCase();
                                                        const textDE = editData[`answer_${key}_de`];
                                                        if (textDE === null || textDE === undefined) return null;

                                                        const isCorrect = correctAnswers.includes(letter);

                                                        return (
                                                            <div key={letter} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <button
                                                                        onClick={() => toggleCorrectAnswer(letter)}
                                                                        className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${isCorrect
                                                                            ? 'bg-emerald-500 text-white'
                                                                            : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                                                                            }`}
                                                                    >
                                                                        {isCorrect ? <CheckCircle size={14} /> : <Circle size={14} />}
                                                                    </button>
                                                                    <span className="text-xs font-black text-slate-500 dark:text-slate-400">{letter}</span>
                                                                    <div className="flex-1" />
                                                                    <button
                                                                        onClick={() => removeAnswer(letter)}
                                                                        className="w-6 h-6 flex items-center justify-center text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                                                    >
                                                                        <Trash2 size={13} />
                                                                    </button>
                                                                </div>
                                                                <input
                                                                    value={textDE || ''}
                                                                    onChange={e => setEditData({ ...editData, [`answer_${key}_de`]: e.target.value })}
                                                                    placeholder="Antwort (Deutsch)"
                                                                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 mb-1.5"
                                                                />
                                                                <input
                                                                    value={editData[`answer_${key}_ar`] || ''}
                                                                    onChange={e => setEditData({ ...editData, [`answer_${key}_ar`]: e.target.value })}
                                                                    placeholder="Antwort (Arabisch)"
                                                                    dir="rtl"
                                                                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
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
                                                    onClick={() => setShowExplanations(!showExplanations)}
                                                    className="flex items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                                                >
                                                    {showExplanations ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                    Erklärung bearbeiten
                                                </button>
                                                {showExplanations && (
                                                    <div className="space-y-3 pl-1">
                                                        <div>
                                                            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">Erklärung (Deutsch)</label>
                                                            <textarea
                                                                value={editData.explanation_de || ''}
                                                                onChange={e => setEditData({ ...editData, explanation_de: e.target.value })}
                                                                rows={3}
                                                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-none"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 block">Erklärung (Arabisch)</label>
                                                            <textarea
                                                                value={editData.explanation_ar || ''}
                                                                onChange={e => setEditData({ ...editData, explanation_ar: e.target.value })}
                                                                rows={3}
                                                                dir="rtl"
                                                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-none"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Save / Cancel */}
                                            <div className="flex gap-2 pt-2">
                                                <button
                                                    onClick={handleSave}
                                                    disabled={saving === editingId}
                                                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50"
                                                >
                                                    {saving === editingId ? (
                                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    ) : (
                                                        <Save size={16} />
                                                    )}
                                                    Speichern
                                                </button>
                                                <button
                                                    onClick={cancelEdit}
                                                    className="flex items-center justify-center gap-2 px-5 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                                                >
                                                    <XCircle size={16} />
                                                    Abbrechen
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        /* VIEW MODE */
                                        <div className="p-4 space-y-3">
                                            {/* Arabic text */}
                                            {q.text_ar && (
                                                <div>
                                                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">Arabisch</span>
                                                    <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5" dir="rtl">{q.text_ar}</p>
                                                </div>
                                            )}

                                            {/* Module / Lesson info */}
                                            <div className="flex flex-wrap gap-3 text-[11px]">
                                                <div>
                                                    <span className="font-bold text-slate-400 dark:text-slate-500">Modul: </span>
                                                    <span className="font-medium text-slate-600 dark:text-slate-300">{getModuleName(q.module_id)}</span>
                                                </div>
                                                <div>
                                                    <span className="font-bold text-slate-400 dark:text-slate-500">Lektion: </span>
                                                    <span className="font-medium text-slate-600 dark:text-slate-300">{getLessonName(q.lesson_id)}</span>
                                                </div>
                                            </div>

                                            {/* Answers */}
                                            <div className="space-y-1.5">
                                                {ANSWER_LETTERS.map(letter => {
                                                    const key = letter.toLowerCase();
                                                    const textDE = q[`answer_${key}_de` as keyof QuizQuestion] as string | null;
                                                    if (!textDE) return null;

                                                    const isCorrect = correctAnswers.includes(letter);
                                                    return (
                                                        <div
                                                            key={letter}
                                                            className={`flex items-start gap-2 p-2.5 rounded-xl text-sm ${isCorrect
                                                                ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'
                                                                : 'bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800'
                                                                }`}
                                                        >
                                                            <span className={`text-[10px] font-black mt-0.5 flex-shrink-0 ${isCorrect ? 'text-emerald-500' : 'text-slate-400'
                                                                }`}>{letter}</span>
                                                            <div className="flex-1 min-w-0">
                                                                <p className={`text-xs leading-snug ${isCorrect ? 'text-emerald-700 dark:text-emerald-300 font-medium' : 'text-slate-700 dark:text-slate-300'}`}>
                                                                    {textDE}
                                                                </p>
                                                            </div>
                                                            {isCorrect && <CheckCircle size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />}
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* Explanation */}
                                            {q.explanation_de && (
                                                <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl p-3 border border-amber-200 dark:border-amber-800/30">
                                                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">Erklärung</span>
                                                    <p className="text-xs text-amber-800 dark:text-amber-200 mt-0.5 leading-relaxed">{q.explanation_de}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </Card>
                    );
                })}
            </div>

            {filtered.length === 0 && (
                <div className="text-center py-12">
                    <Search size={40} className="mx-auto mb-3 text-slate-200 dark:text-slate-700" />
                    <p className="text-sm text-slate-400 font-medium">Keine Fragen gefunden</p>
                </div>
            )}
        </div>
    );
}
