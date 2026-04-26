import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../App';
import { useAuth } from '../../contexts/AuthContext';
import { useDataCache } from '../../contexts/DataCacheContext';
import { AuthDialog } from '../auth/AuthDialog';
import { DashboardStats } from '../dashboard/DashboardStats';

export default function Dashboard() {
    const navigate = useNavigate();
    const { toggleLanguage, showLanguageToggle, setHideBottomNav, progress, language } = useApp();
    const { user } = useAuth();
    const { questions: cachedQuestions, modules } = useDataCache();
    const isAdmin = user?.email === 'm.almajzoub1@gmail.com';

    const [userName, setUserName] = useState('Nutzer');
    const [showAuthDialog, setShowAuthDialog] = useState(false);

    useEffect(() => {
        if (user) {
            const name = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Nutzer';
            setUserName(name);
        } else {
            setUserName('Nutzer');
        }
    }, [user]);

    useEffect(() => {
        if (showAuthDialog) {
            setHideBottomNav(true);
        } else {
            setHideBottomNav(false);
        }
    }, [showAuthDialog, setHideBottomNav]);

    const stats = useMemo(() => ({
        totalQuestions: cachedQuestions?.length || 82,
    }), [cachedQuestions]);

    const correctAnswers = useMemo(() =>
        Object.values(progress.answeredQuestions).filter(Boolean).length,
        [progress.answeredQuestions]
    );

    const dashboardStatsInfo = useMemo(() => {
        let totalLessons = 0;
        let lessonsCompleted = 0;

        const moduleStats = (modules || []).map(m => {
            const modQuestions = cachedQuestions?.filter(q => q.topicId === m.id) || [];
            const totalQ = modQuestions.length;
            const correctQ = modQuestions.filter(q => progress.answeredQuestions[q.id]).length;

            const modLessons = m.lessons || [];
            const mTotalLessons = modLessons.length;
            const mLessonsCompleted = modLessons.filter(l => progress.completedLessons[l.id]).length;

            totalLessons += mTotalLessons;
            lessonsCompleted += mLessonsCompleted;

            return {
                id: m.id,
                title: m.title,
                titleAR: m.titleAR,
                correctCount: correctQ,
                totalQuestions: totalQ,
                lessonsTotal: mTotalLessons,
                lessonsCompleted: mLessonsCompleted,
                lessonsProgressPercentage: mTotalLessons > 0 ? Math.round((mLessonsCompleted / mTotalLessons) * 100) : 0
            };
        });

        return { totalLessons, lessonsCompleted, moduleStats };
    }, [modules, cachedQuestions, progress]);

    const practiceProgress = useMemo(() =>
        stats.totalQuestions > 0 ? Math.round((correctAnswers / stats.totalQuestions) * 100) : 0,
        [correctAnswers, stats.totalQuestions]
    );

    const overallProgress = practiceProgress;

    return (
        <div className="bg-[#F2F4F7] dark:bg-slate-950 text-slate-900 dark:text-white min-h-screen font-sans overflow-x-hidden">
            <div className="max-w-4xl mx-auto relative w-full pb-20 pt-4 text-left">
                <div className="px-4">
                    <header className="bg-gradient-to-br from-[#3B65F5] to-[#2551E8] text-white rounded-[28px] overflow-hidden relative shadow-xl shadow-blue-500/10 mb-6 text-left px-6 pb-6 pt-5 sm:px-7 sm:pt-6 sm:pb-7">
                        {/* Decorative background elements */}
                        <div className="absolute inset-0 overflow-hidden pointer-events-none">
                            <div className="absolute -top-16 -right-16 w-64 h-64 bg-white/10 rounded-full blur-3xl opacity-50" />
                            <div className="absolute top-1/2 -left-10 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
                        </div>
                        <div className="flex justify-between items-center mb-6 relative z-10">
                            <div className="flex flex-col">
                                <h1 className="text-[22px] font-black tracking-tight leading-tight text-white mb-1">34a Master</h1>
                                {user && (
                                    <div className="mt-1">
                                        <span className="text-white/80 text-[15px] font-medium leading-snug tracking-wide block">Hallo, {userName}! 👋</span>
                                        {language === 'DE_AR' && (
                                            <span className="text-white/70 text-[13px] opacity-70 block mt-0.5" dir="rtl" style={{ textAlign: 'left' }}>مرحباً، {userName}! 👋</span>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-3">
                                {showLanguageToggle && (
                                    <button onClick={(e) => { e.stopPropagation(); toggleLanguage(); }} aria-label="Language" className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center backdrop-blur-sm transition-colors active:scale-95">
                                        <span className="material-icons text-[20px]">translate</span>
                                    </button>
                                )}
                                <button onClick={(e) => { e.stopPropagation(); navigate('/profile'); }} aria-label="Settings" className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center backdrop-blur-sm transition-colors active:scale-95">
                                    <span className="material-icons text-[20px]">settings</span>
                                </button>
                            </div>
                        </div>

                        {user ? (
                            <DashboardStats
                                variant="header"
                                totalQuestions={stats.totalQuestions}
                                correctAnswers={correctAnswers}
                                lessonsCompleted={dashboardStatsInfo.lessonsCompleted}
                                totalLessons={dashboardStatsInfo.totalLessons}
                                moduleStats={dashboardStatsInfo.moduleStats}
                                streak={0} // or add streak logic if available
                            />
                        ) : (
                            <button
                                onClick={() => setShowAuthDialog(true)}
                                className="w-full border-t border-white/20 pt-6 flex items-center justify-between group relative z-10 transition-opacity active:opacity-80 text-left"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                                        <span className="material-icons text-white text-[24px]">person_outline</span>
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-bold text-base leading-tight mb-1 text-white">
                                            Jetzt anmelden
                                            {language === 'DE_AR' && <span className="block text-sm font-normal mt-0.5 text-white/90" dir="rtl" style={{ textAlign: 'left' }}>تسجيل الدخول</span>}
                                        </h3>
                                        <p className="text-sm text-white/80">
                                            Fortschritt speichern & auf allen Geräten lernen.
                                            {language === 'DE_AR' && <span className="block text-sm mt-0.5 opacity-80" dir="rtl" style={{ textAlign: 'left' }}>احفظ تقدمك في التعلم.</span>}
                                        </p>
                                    </div>
                                </div>
                                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors">
                                    <span className="material-icons text-white text-[20px]">chevron_right</span>
                                </div>
                            </button>
                        )}
                    </header>
                </div>

                <div
                    className="px-4"
                    style={{ transform: 'scale(0.95)', transformOrigin: 'top center', width: '105.263%', marginLeft: '-2.6315%' }}
                >

                    <main className="space-y-4">
                        <div className="bg-[#FFFFFF] dark:bg-slate-850 rounded-[24px] px-5 py-4 sm:px-7 sm:py-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] text-left border border-transparent dark:border-slate-800">
                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={() => navigate('/flashcards')} className="flex flex-col items-start p-4 bg-white dark:bg-slate-850 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm transition-all active:scale-95 hover:shadow-md text-left w-full">
                                    <div className="w-12 h-12 rounded-full bg-[#CCFBF1] dark:bg-[#115E59] flex items-center justify-center mb-4">
                                        <span className="material-icons text-[#0D9488] dark:text-[#5EEAD4]">layers</span>
                                    </div>
                                    <h4 className="font-bold text-base leading-tight mb-1">
                                        Mündlich
                                        {language === 'DE_AR' && <span className="block text-sm font-normal mt-1 text-[#4B5563] dark:text-[#9CA3AF]" dir="rtl" style={{ textAlign: 'left' }}>الامتحان الشفهي</span>}
                                    </h4>
                                    <p className="text-sm text-[#4B5563] dark:text-[#9CA3AF] mt-1">
                                        260+ Fokus-Lernkarten
                                        {language === 'DE_AR' && <span className="block text-[10px] mt-0.5 opacity-80" dir="rtl" style={{ textAlign: 'left' }}>بطاقات التعلم</span>}
                                    </p>
                                </button>
                                <button onClick={() => navigate('/practice')} className="flex flex-col items-start p-4 bg-white dark:bg-slate-850 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm transition-all active:scale-95 hover:shadow-md text-left w-full">
                                    <div className="w-12 h-12 rounded-full bg-[#E0F2FE] dark:bg-[#0C4A6E] flex items-center justify-center mb-4">
                                        <span className="material-icons text-[#2563EB] dark:text-[#93C5FD]">edit</span>
                                    </div>
                                    <h4 className="font-bold text-base leading-tight mb-1">
                                        Schriftlich
                                        {language === 'DE_AR' && <span className="block text-sm font-normal mt-1 text-[#4B5563] dark:text-[#9CA3AF]" dir="rtl" style={{ textAlign: 'left' }}>الامتحان الكتابي</span>}
                                    </h4>
                                    <p className="text-sm text-[#4B5563] dark:text-[#9CA3AF] mt-1">
                                        720+ Prüfungsfragen
                                        {language === 'DE_AR' && <span className="block text-[10px] mt-0.5 opacity-80" dir="rtl" style={{ textAlign: 'left' }}>كتالوج الأسئلة</span>}
                                    </p>
                                </button>
                            </div>
                        </div>

                        <button onClick={() => navigate('/learn')} className="w-full bg-[#FFFFFF] dark:bg-slate-850 rounded-[24px] px-5 py-4 sm:px-7 sm:py-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] flex items-center gap-4 transition-transform active:scale-95 border border-transparent dark:border-slate-800 hover:border-gray-100 dark:hover:border-slate-700 text-left">
                            <div className="w-12 h-12 rounded-xl bg-[#E0F2FE] dark:bg-[#0C4A6E] flex items-center justify-center shrink-0">
                                <span className="material-icons text-[#3B68FF] dark:text-[#93C5FD]">menu_book</span>
                            </div>
                            <div className="flex-1">
                                <h3 className="font-bold text-base leading-tight mb-1">
                                    Lernmodule
                                    {language === 'DE_AR' && <span className="block text-sm font-normal mt-0.5 text-[#4B5563] dark:text-[#9CA3AF]" dir="rtl" style={{ textAlign: 'left' }}>وحدات التعلم</span>}
                                </h3>
                                <p className="text-sm text-[#4B5563] dark:text-[#9CA3AF]">
                                    9 Lerngebiete im Überblick
                                    {language === 'DE_AR' && <span className="block text-sm mt-0.5 opacity-80" dir="rtl" style={{ textAlign: 'left' }}>9 مواضيع للتحضير للامتحان</span>}
                                </p>
                            </div>
                        </button>

                        <button onClick={() => navigate('/lernplan')} className="w-full bg-[#FFFFFF] dark:bg-slate-850 rounded-[24px] px-5 py-4 sm:px-7 sm:py-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] flex items-center gap-4 transition-transform active:scale-95 border border-transparent dark:border-slate-800 hover:border-gray-100 dark:hover:border-slate-700 text-left">
                            <div className="w-12 h-12 rounded-xl bg-[#EDE9FE] dark:bg-[#312E81] flex items-center justify-center shrink-0">
                                <span className="material-icons text-[#7C3AED] dark:text-[#A78BFA]">map</span>
                            </div>
                            <div className="flex-1">
                                <h3 className="font-bold text-base leading-tight mb-1">
                                    Lernplan
                                    {language === 'DE_AR' && <span className="block text-sm font-normal mt-0.5 text-[#4B5563] dark:text-[#9CA3AF]" dir="rtl" style={{ textAlign: 'left' }}>خطة الدراسة</span>}
                                </h3>
                                <p className="text-sm text-[#4B5563] dark:text-[#9CA3AF]">
                                    Dein Weg zur Prüfung
                                    {language === 'DE_AR' && <span className="block text-sm mt-0.5 opacity-80" dir="rtl" style={{ textAlign: 'left' }}>طريقك للامتحان</span>}
                                </p>
                            </div>
                        </button>

                        <button onClick={() => navigate('/exam')} className="w-full bg-[#FFFFFF] dark:bg-slate-850 rounded-[24px] px-5 py-4 sm:px-7 sm:py-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] transition-transform active:scale-[0.98] relative overflow-hidden group text-left border border-transparent dark:border-slate-800">
                            <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-[#EA580C] opacity-10 rounded-full blur-2xl group-hover:opacity-20 transition-opacity"></div>
                            <div className="flex items-center gap-4 relative z-10">
                                <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shrink-0">
                                    <span className="material-icons text-[#EA580C] dark:text-orange-400">school</span>
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-base leading-tight mb-1">
                                        Prüfungssimulation
                                        {language === 'DE_AR' && <span className="block text-sm font-normal mt-0.5 text-[#4B5563] dark:text-[#9CA3AF]" dir="rtl" style={{ textAlign: 'left' }}>محاكاة الامتحان</span>}
                                    </h3>
                                    <p className="text-sm text-[#4B5563] dark:text-[#9CA3AF]">
                                        Echte Prüfungssituation simulieren
                                        {language === 'DE_AR' && <span className="block text-xs mt-0.5 opacity-80" dir="rtl" style={{ textAlign: 'left' }}>محاكاة ظروف الامتحان الحقيقية</span>}
                                    </p>
                                </div>
                            </div>
                            <div className="mt-5 h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden relative z-10">
                                <div className="h-full bg-[#EA580C] rounded-full transition-all duration-500 ease-out" style={{ width: `${overallProgress}%` }}></div>
                            </div>
                        </button>
                    </main>

                    {/* Admin Section */}
                    {isAdmin && (
                        <button
                            onClick={() => navigate('/admin/written-exam')}
                            className="w-full mt-6 mb-6 p-4 bg-[#FFFFFF] dark:bg-slate-850 border border-transparent dark:border-slate-800 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] rounded-[24px] flex items-center justify-between transition-transform active:scale-95 text-left"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
                                    <span className="material-icons text-slate-600 dark:text-slate-300 text-[20px]">settings</span>
                                </div>
                                <div>
                                    <span className="text-sm font-bold text-slate-900 dark:text-white block">Admin: Fragen bearbeiten</span>
                                    {language === 'DE_AR' && <span className="text-sm text-[#4B5563] dark:text-[#9CA3AF] block mt-0.5" dir="rtl" style={{ textAlign: 'left' }}>إدارة: تعديل الأسئلة</span>}
                                </div>
                            </div>
                            <span className="material-icons text-[#4B5563] dark:text-[#9CA3AF] text-[20px]">chevron_right</span>
                        </button>
                    )}

                    {/* Footer Notice */}
                    <div className="mt-12 mb-8 text-center opacity-60">
                        <p className="text-[10px] font-bold text-[#4B5563] dark:text-[#9CA3AF] uppercase tracking-widest mb-4">Beta Version 1.0.4</p>
                        <div className="flex flex-wrap justify-center gap-4 text-sm font-bold text-[#4B5563] dark:text-[#9CA3AF]">
                            <button onClick={() => window.open('https://wa.me/491782907020', '_blank')}>Kontakt {language === 'DE_AR' && <span className="font-normal block mt-0.5" dir="rtl">اتصل بنا</span>}</button>
                            <a href="#/impressum">Impressum {language === 'DE_AR' && <span className="font-normal block mt-0.5" dir="rtl">بصمة</span>}</a>
                            <a href="#/datenschutz">Datenschutz {language === 'DE_AR' && <span className="font-normal block mt-0.5" dir="rtl">حماية البيانات</span>}</a>
                            <a href="#/agb">AGB</a>
                        </div>
                    </div>
                </div>

                {/* Auth Dialog */}
                {!user && showAuthDialog && <AuthDialog onClose={() => setShowAuthDialog(false)} initialMode="register" />}
            </div>
        </div>
    );
}
