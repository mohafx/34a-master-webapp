import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, ArrowLeft, Languages, Zap, FileText, Mic, X, ChevronRight, Crown } from 'lucide-react';
import { useApp } from '../../App';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { getOralExamEntitlement, listOralExamSessions } from '../../services/oralExam';
import type { OralExamEntitlement } from '../../types';

export default function ExamSelection() {
    const navigate = useNavigate();
    const { language, toggleLanguage, showLanguageToggle, isPremium, openAuthDialog } = useApp();
    const { user } = useAuth();
    const { subscription, transitionGrant } = useSubscription();

    const [showWrittenModal, setShowWrittenModal] = useState(false);
    const [oralEntitlement, setOralEntitlement] = useState<OralExamEntitlement | null>(null);

    useEffect(() => {
        let mounted = true;

        async function loadOralEntitlement() {
            if (!user) {
                setOralEntitlement(null);
                return;
            }

            try {
                const entitlement = await getOralExamEntitlement();
                if (mounted) setOralEntitlement(entitlement);
            } catch (_) {
                const sessions = await listOralExamSessions(50);
                const mode = isPremium ? 'full_simulation' : 'free_test_3q';
                const windowStartsAt = isPremium
                    ? subscription?.current_period_start ?? transitionGrant?.starts_at ?? null
                    : null;
                const windowEndsAt = isPremium
                    ? subscription?.current_period_end ?? transitionGrant?.ends_at ?? null
                    : null;
                const used = sessions.filter((session) => {
                    if (session.mode !== mode) return false;
                    if (!session.connected_at) return false;
                    if (windowStartsAt && new Date(session.connected_at) < new Date(windowStartsAt)) return false;
                    if (windowEndsAt && new Date(session.connected_at) > new Date(windowEndsAt)) return false;
                    return true;
                }).length;
                const limit = isPremium ? 10 : 1;
                if (mounted) {
                    setOralEntitlement({
                        isPremium,
                        mode,
                        used,
                        limit,
                        remaining: Math.max(limit - used, 0),
                        windowStartsAt,
                        windowEndsAt,
                    });
                }
            }
        }

        void loadOralEntitlement();

        return () => {
            mounted = false;
        };
    }, [user?.id, isPremium, subscription?.current_period_start, subscription?.current_period_end, transitionGrant?.starts_at, transitionGrant?.ends_at]);

    const handleOralExamClick = () => {
        if (!user) {
            openAuthDialog('register', {
                de: 'Registriere dich kostenlos und starte deine 1 Mini-Simulation der mündlichen Prüfung.',
                ar: 'سجّل مجاناً وابدأ محاكاة مصغّرة واحدة للامتحان الشفوي.'
            });
            return;
        }
        navigate('/oral-exam');
    };

    const oralBadgeText = !user
        ? '1x kostenlos testen'
        : oralEntitlement
            ? oralEntitlement.isPremium
                ? `${oralEntitlement.remaining} / ${oralEntitlement.limit} Tickets`
                : `${oralEntitlement.remaining} / ${oralEntitlement.limit} Mini frei`
            : isPremium
                ? 'Tickets werden geladen'
                : '1x kostenlos testen';

    return (
        <div className="max-w-4xl mx-auto px-4 pb-32">
            {/* Header */}
            <div className="pt-3 mb-6 md:mb-8">
                <div className="bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-[28px] px-5 pb-0 pt-4 sm:px-7 sm:pt-5 shadow-xl shadow-orange-500/10 relative overflow-hidden flex flex-col">
                    <div className="absolute -top-16 -right-16 w-64 h-64 bg-white/10 rounded-full blur-3xl opacity-50 pointer-events-none" />
                    <div className="absolute top-1/2 -left-10 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />

                    <div className="flex justify-between items-center relative z-10 w-full mb-4">
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

                    {/* Verlauf — am unteren Rand des Headers angehängt */}
                    <button
                        onClick={() => navigate('/exam/history')}
                        className="relative z-10 w-full border-t border-white/20 py-3.5 flex items-center justify-between group transition-opacity active:opacity-70"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                                <FileText size={16} strokeWidth={2.5} className="text-white" />
                            </div>
                            <div className="text-left">
                                <span className="text-sm font-bold text-white leading-tight block">Mein Verlauf</span>
                                <span className="text-xs text-white/70">Deine Ergebnisse & Auswertungen auf einen Blick.</span>
                            </div>
                        </div>
                        <ChevronRight size={18} className="text-white/60 group-hover:text-white transition-colors" />
                    </button>
                </div>
            </div>

            <div className="space-y-3">
                {/* Schriftliche Prüfungssimulation — öffnet Modal */}
                <button
                    onClick={() => setShowWrittenModal(true)}
                    className="w-full text-left bg-white dark:bg-slate-850 rounded-[24px] px-5 py-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] border border-transparent dark:border-slate-800 hover:border-gray-100 dark:hover:border-slate-700 transition-all active:scale-[0.98]"
                >
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-11 h-11 rounded-xl bg-[#E0F2FE] dark:bg-[#0C4A6E] flex items-center justify-center shrink-0">
                            <GraduationCap size={22} strokeWidth={2.5} className="text-[#2563EB] dark:text-[#93C5FD]" />
                        </div>
                        <ChevronRight size={18} className="text-slate-300 dark:text-slate-600" />
                    </div>
                    <h3 className="font-bold text-[15px] text-slate-900 dark:text-white mb-1">Schriftliche Prüfungssimulation</h3>
                    {language === 'DE_AR' && <p className="text-sm text-blue-600 dark:text-blue-400 font-bold mb-1 text-right" dir="rtl">محاكاة الامتحان الكتابي</p>}
                    <p className="text-[13px] text-[#4B5563] dark:text-[#9CA3AF] leading-relaxed">
                        Teste dein Wissen — als schnelle Mini oder vollständig wie die echte IHK.
                    </p>
                </button>

                {/* Mündliche Prüfung (KI) */}
                <button
                    onClick={handleOralExamClick}
                    className="w-full text-left bg-white dark:bg-slate-850 rounded-[24px] px-5 py-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] border border-transparent dark:border-slate-800 hover:border-gray-100 dark:hover:border-slate-700 transition-all active:scale-[0.98]"
                >
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                            <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                                <Mic size={22} strokeWidth={2.5} className="text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                                Beta
                            </span>
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full ${isPremium
                            ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                            : 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                            }`}>
                            {oralBadgeText}
                        </span>
                    </div>
                    <h3 className="font-bold text-[15px] text-slate-900 dark:text-white mb-1">Mündliche Prüfung</h3>
                    {language === 'DE_AR' && <p className="text-sm text-indigo-600 dark:text-indigo-400 font-bold mb-1 text-right" dir="rtl">الامتحان الشفوي</p>}
                    <p className="text-[13px] text-[#4B5563] dark:text-[#9CA3AF] leading-relaxed">
                        Sprich mit dem KI-Prüfer und erhalte danach eine detaillierte Auswertung.
                    </p>
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
