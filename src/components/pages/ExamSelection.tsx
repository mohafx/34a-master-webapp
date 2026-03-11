import React from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, ArrowLeft, Languages, Timer, Zap } from 'lucide-react';
import { useApp } from '../../App';

export default function ExamSelection() {
    const navigate = useNavigate();
    const { language, toggleLanguage, showLanguageToggle } = useApp();

    const handleFullExamClick = () => {
        navigate('/exam/intro');
    };

    return (
        <div className="max-w-4xl mx-auto px-4 pb-32">
            {/* Unified Header Card with Integrated Navigation */}
            <div className="pt-3 mb-6 md:mb-8">
                <div className="bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-3xl md:rounded-[2rem] p-5 md:p-10 shadow-card relative overflow-hidden flex flex-col">
                    {/* Decorative background elements */}
                    <div className="absolute top-0 right-0 w-64 md:w-96 h-64 md:h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-48 md:w-72 h-48 md:h-72 bg-black/10 rounded-full translate-y-1/3 -translate-x-1/3 blur-3xl pointer-events-none" />

                    {/* Navigation Buttons Integrated */}
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

            {/* Exam Options - Grid on Desktop, Stack on Mobile */}
            <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6">
                {/* Mini Exam */}
                <button
                    onClick={() => navigate('/exam/mini-intro')}
                    className="w-full text-left bg-white dark:bg-slate-800 rounded-[24px] p-1 shadow-sm border-2 border-slate-100 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 transition-all active:scale-[0.98] relative overflow-hidden group"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />

                    <div className="p-5 relative z-10">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 mb-4">
                            <Zap size={24} strokeWidth={2.5} />
                        </div>

                        <h3 className="font-black text-lg text-slate-900 dark:text-white mb-1">Mini-Prüfung</h3>
                        {language === 'DE_AR' && <p className="text-sm text-blue-600 dark:text-blue-500 font-bold mb-1 text-right" dir="rtl">امتحان مصغر</p>}

                        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
                            Schnelle Übung für zwischendurch. Perfekt um Wissen zu testen.
                        </p>

                        <div className="flex items-center gap-4 text-xs font-bold text-slate-500 dark:text-slate-400">
                            <span className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-lg">
                                16 Fragen
                            </span>
                            <span className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-lg">
                                20 Min
                            </span>
                        </div>
                    </div>
                </button>

                {/* Full Exam Simulation */}
                <button
                    onClick={handleFullExamClick}
                    className="w-full text-left bg-white dark:bg-slate-800 rounded-[24px] p-1 shadow-md border-2 border-amber-100 dark:border-amber-900/30 hover:border-amber-500 dark:hover:border-amber-500 transition-all active:scale-[0.98] group relative overflow-hidden"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />

                    <div className="p-5 relative z-10">
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20">
                                <GraduationCap size={24} strokeWidth={2.5} />
                            </div>
                        </div>

                        <h3 className="font-black text-lg text-slate-900 dark:text-white mb-1">Echte Prüfungssimulation</h3>
                        {language === 'DE_AR' && <p className="text-sm text-amber-600 dark:text-amber-500 font-bold mb-1 text-right" dir="rtl">محاكاة الامتحان الحقيقي</p>}

                        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
                            Originalgetreue IHK-Prüfungsbedingungen für optimale Vorbereitung.
                        </p>

                        <div className="flex items-center gap-4 text-xs font-bold text-slate-500 dark:text-slate-400">
                            <span className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-lg">
                                82 Fragen
                            </span>
                            <span className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-lg">
                                120 Min
                            </span>
                        </div>
                    </div>
                </button>
            </div>
        </div>
    );
}
