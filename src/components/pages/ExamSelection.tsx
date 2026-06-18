import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, ArrowLeft, Languages, Zap, FileText, Mic, X, ChevronRight } from 'lucide-react';
import { useApp } from '../../App';
import { useAuth } from '../../contexts/AuthContext';
import { isAdminEmail } from '../../utils/userRoles';

export default function ExamSelection() {
    const navigate = useNavigate();
    const { language, toggleLanguage, showLanguageToggle } = useApp();
    const { user } = useAuth();
    const showOralExam = isAdminEmail(user?.email);

    const [showWrittenModal, setShowWrittenModal] = useState(false);

    return (
        <div className="max-w-4xl mx-auto px-4 pb-32">
            {/* Header */}
            <div className="pt-3 mb-6 md:mb-8">
                <div className="bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-3xl md:rounded-[2rem] p-5 md:p-10 shadow-card relative overflow-hidden flex flex-col">
                    <div className="absolute top-0 right-0 w-64 md:w-96 h-64 md:h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-48 md:w-72 h-48 md:h-72 bg-black/10 rounded-full translate-y-1/3 -translate-x-1/3 blur-3xl pointer-events-none" />

                    <div className="flex justify-between items-center relative z-10 w-full mb-2 md:mb-0">
                        <button
                            onClick={() => navigate('/')}
                            className="w-10 h-10 md:w-12 md:h-12 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20 text-white transition-all active:scale-95 shadow-sm"
                        >
                            <ArrowLeft size={20} className="md:hidden" strokeWidth={2.5} />
                            <ArrowLeft size={24} className="hidden md:block" strokeWidth={2.5} />
                        </button>

                        <div className="text-center absolute left-1/2 -translate-x-1/2 w-full pointer-events-none md:static md:translate-x-0">
                            <h1 className="font-black text-lg md:text-2xl text-white tracking-tight uppercase">Prüfung wählen</h1>
                            {language === 'DE_AR' && <p className="text-white/80 font-medium text-[13px] md:text-sm mt-0.5" dir="rtl">اختر الامتحان</p>}
                        </div>

                        {showLanguageToggle ? (
                            <button
                                onClick={toggleLanguage}
                                className={`w-10 h-10 md:w-12 md:h-12 rounded-2xl flex items-center justify-center shadow-sm border-2 transition-all duration-300 flex-shrink-0 ${language === 'DE_AR'
                                    ? 'bg-emerald-500 border-emerald-600 text-white shadow-emerald-500/30'
                                    : 'bg-white/20 hover:bg-white/30 backdrop-blur-md border-white/20 text-white'
                                    }`}
                            >
                                <Languages size={20} className="md:hidden" strokeWidth={2.5} />
                                <Languages size={24} className="hidden md:block" strokeWidth={2.5} />
                            </button>
                        ) : (
                            <div className="w-10 md:w-12" />
                        )}
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                {/* Schriftliche Prüfungssimulation — öffnet Modal */}
                <button
                    onClick={() => setShowWrittenModal(true)}
                    className="w-full text-left bg-white dark:bg-slate-800 rounded-[24px] p-1 shadow-md border-2 border-amber-100 dark:border-amber-900/30 hover:border-amber-500 dark:hover:border-amber-500 transition-all active:scale-[0.98] group relative overflow-hidden"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="p-5 relative z-10">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20">
                                <GraduationCap size={24} strokeWidth={2.5} />
                            </div>
                            <ChevronRight size={20} className="text-slate-400 dark:text-slate-500" />
                        </div>
                        <h3 className="font-black text-lg text-slate-900 dark:text-white mb-1">Schriftliche Prüfungssimulation</h3>
                        {language === 'DE_AR' && <p className="text-sm text-amber-600 dark:text-amber-500 font-bold mb-1 text-right" dir="rtl">محاكاة الامتحان الكتابي</p>}
                        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
                            Mini-Prüfung (16 Fragen) oder vollständige IHK-Simulation (82 Fragen) — wähle nach dem Klick.
                        </p>
                        <div className="flex items-center gap-4 text-xs font-bold text-slate-500 dark:text-slate-400">
                            <span className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-lg">
                                Mini · Voll
                            </span>
                            <span className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-lg">
                                20 – 120 Min
                            </span>
                        </div>
                    </div>
                </button>

                {/* Mündliche Prüfung (KI) — Soft-Launch: nur für Admin sichtbar */}
                {showOralExam && (
                    <button
                        onClick={() => navigate('/oral-exam')}
                        className="w-full text-left bg-white dark:bg-slate-800 rounded-[24px] p-1 shadow-md border-2 border-violet-100 dark:border-violet-900/30 hover:border-violet-500 dark:hover:border-violet-500 transition-all active:scale-[0.98] group relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="p-5 relative z-10">
                            <div className="flex items-center justify-between mb-4">
                                <div className="w-12 h-12 bg-gradient-to-br from-violet-600 to-indigo-700 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/20">
                                    <Mic size={24} strokeWidth={2.5} />
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-wide bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300 px-2.5 py-1 rounded-full">
                                    Beta · Intern
                                </span>
                            </div>
                            <h3 className="font-black text-lg text-slate-900 dark:text-white mb-1">Mündliche Prüfung</h3>
                            {language === 'DE_AR' && <p className="text-sm text-violet-600 dark:text-violet-500 font-bold mb-1 text-right" dir="rtl">الامتحان الشفوي</p>}
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
                                KI-Prüfersimulation mit Sprache: Fallbeispiele, Rückfragen und Auswertung.
                            </p>
                            <div className="flex items-center gap-4 text-xs font-bold text-slate-500 dark:text-slate-400">
                                <span className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-lg">
                                    Sprachgesteuert
                                </span>
                                <span className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-lg">
                                    ~5 Min
                                </span>
                            </div>
                        </div>
                    </button>
                )}

                {/* Abgeschlossene Prüfungen */}
                <button
                    onClick={() => navigate('/exam/history')}
                    className="w-full text-left bg-white dark:bg-slate-800 rounded-[24px] p-5 shadow-sm border border-slate-100 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all active:scale-[0.99] flex items-center gap-4"
                >
                    <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center">
                        <FileText size={24} className="text-slate-600 dark:text-slate-300" strokeWidth={2.5} />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-black text-base text-slate-900 dark:text-white mb-0.5">Abgeschlossene Prüfungen</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Schriftliche und mündliche Prüfungen ansehen.</p>
                    </div>
                    <ChevronRight size={20} className="text-slate-300 dark:text-slate-600 flex-shrink-0" />
                </button>
            </div>

            {/* Modal: Schriftliche Prüfung wählen */}
            {showWrittenModal && (
                <div
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
                    onClick={() => setShowWrittenModal(false)}
                >
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
                    <div
                        className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-[28px] shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                            <h2 className="font-black text-lg text-slate-900 dark:text-white">Modus wählen</h2>
                            <button
                                onClick={() => setShowWrittenModal(false)}
                                className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95"
                            >
                                <X size={18} strokeWidth={2.5} />
                            </button>
                        </div>

                        {/* Options */}
                        <div className="p-4 space-y-3">
                            {/* Mini-Prüfung */}
                            <button
                                onClick={() => { setShowWrittenModal(false); navigate('/exam/mini-intro'); }}
                                className="w-full text-left bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-2 border-transparent hover:border-blue-400 dark:hover:border-blue-600 rounded-2xl p-4 transition-all active:scale-[0.98] group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 flex-shrink-0">
                                        <Zap size={22} strokeWidth={2.5} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-black text-base text-slate-900 dark:text-white">Mini-Prüfung</h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Schnelle Übung für zwischendurch.</p>
                                        <div className="flex gap-2 mt-2">
                                            <span className="text-[11px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md">16 Fragen</span>
                                            <span className="text-[11px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md">20 Min</span>
                                        </div>
                                    </div>
                                    <ChevronRight size={18} className="text-slate-300 dark:text-slate-600 flex-shrink-0" />
                                </div>
                            </button>

                            {/* Echte Prüfungssimulation */}
                            <button
                                onClick={() => { setShowWrittenModal(false); navigate('/exam/intro'); }}
                                className="w-full text-left bg-slate-50 dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-900/20 border-2 border-transparent hover:border-amber-400 dark:hover:border-amber-600 rounded-2xl p-4 transition-all active:scale-[0.98] group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20 flex-shrink-0">
                                        <GraduationCap size={22} strokeWidth={2.5} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-black text-base text-slate-900 dark:text-white">Echte Prüfungssimulation</h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Originalgetreue IHK-Bedingungen.</p>
                                        <div className="flex gap-2 mt-2">
                                            <span className="text-[11px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md">82 Fragen</span>
                                            <span className="text-[11px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md">120 Min</span>
                                        </div>
                                    </div>
                                    <ChevronRight size={18} className="text-slate-300 dark:text-slate-600 flex-shrink-0" />
                                </div>
                            </button>
                        </div>

                        <div className="px-4 pb-4">
                            <button
                                onClick={() => setShowWrittenModal(false)}
                                className="w-full py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-sm active:scale-95 transition-all"
                            >
                                Abbrechen
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
