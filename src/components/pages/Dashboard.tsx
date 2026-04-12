import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, LayoutGrid, Map, Pencil } from 'lucide-react';
import { useApp } from '../../App';
import { useAuth } from '../../contexts/AuthContext';
import { useDataCache } from '../../contexts/DataCacheContext';
import { usePostHog } from '../../contexts/PostHogProvider';
import { AuthDialog } from '../auth/AuthDialog';
import { DashboardStats } from '../dashboard/DashboardStats';
import { TransitionAccessNotice } from '../TransitionAccessNotice';
import { getCompletedLessonCountForModule } from '../../services/lessonFlow';
import { isAdminEmail } from '../../utils/userRoles';
import { getEffectiveExamDate, setEffectiveExamDate } from '../../utils/appStorage';
const EmbeddedLernplan = lazy(() => import('./Lernplan'));

type DashboardMode = 'freestyle' | 'lernplan';

const DASHBOARD_MODE_STORAGE_KEY = '34a_dashboard_mode';

function loadInitialDashboardMode(): DashboardMode {
  if (typeof window === 'undefined') return 'lernplan';
  const stored = localStorage.getItem(DASHBOARD_MODE_STORAGE_KEY);
  return stored === 'freestyle' ? 'freestyle' : 'lernplan';
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { toggleLanguage, showLanguageToggle, setHideBottomNav, progress, language } = useApp();
  const { user } = useAuth();
  const { questions: cachedQuestions, modules } = useDataCache();
  const { trackEvent } = usePostHog();
  const isAdmin = isAdminEmail(user?.email);

  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>(loadInitialDashboardMode);
  const [examDate, setExamDate] = useState<string | null>(() => getEffectiveExamDate());

  useEffect(() => {
    localStorage.setItem(DASHBOARD_MODE_STORAGE_KEY, dashboardMode);
  }, [dashboardMode]);

  useEffect(() => {
    setHideBottomNav(showAuthDialog || showDatePicker);
  }, [showAuthDialog, showDatePicker, setHideBottomNav]);

  const daysUntilExam = useMemo(() => {
    if (!examDate) return null;
    const exam = new Date(examDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    exam.setHours(0, 0, 0, 0);
    const diff = Math.ceil((exam.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }, [examDate]);

  const stats = useMemo(() => ({
    totalQuestions: cachedQuestions?.length || 82,
  }), [cachedQuestions]);

  const correctAnswers = useMemo(
    () => Object.values(progress.answeredQuestions).filter(Boolean).length,
    [progress.answeredQuestions],
  );

  const dashboardStatsInfo = useMemo(() => {
    let totalLessons = 0;
    let lessonsCompleted = 0;

    const moduleStats = (modules || []).map(module => {
      const moduleQuestions = cachedQuestions?.filter(question => question.moduleId === module.id) || [];
      const totalQ = moduleQuestions.length;
      const correctQ = moduleQuestions.filter(question => progress.answeredQuestions[question.id] === true).length;

      const moduleLessons = module.lessons || [];
      const moduleLessonsCompleted = getCompletedLessonCountForModule(module.id, modules, cachedQuestions, progress);

      totalLessons += moduleLessons.length;
      lessonsCompleted += moduleLessonsCompleted;

      return {
        id: module.id,
        title: module.titleDE,
        titleAR: module.titleAR,
        correctCount: correctQ,
        totalQuestions: totalQ,
        lessonsTotal: moduleLessons.length,
        lessonsCompleted: moduleLessonsCompleted,
        lessonsProgressPercentage: moduleLessons.length > 0
          ? Math.round((moduleLessonsCompleted / moduleLessons.length) * 100)
          : 0,
      };
    });

    return { totalLessons, lessonsCompleted, moduleStats };
  }, [modules, cachedQuestions, progress]);

  const practiceProgress = useMemo(
    () => (stats.totalQuestions > 0 ? Math.round((correctAnswers / stats.totalQuestions) * 100) : 0),
    [correctAnswers, stats.totalQuestions],
  );

  return (
    <div className="bg-[#F2F4F7] dark:bg-slate-950 text-slate-900 dark:text-white min-h-screen font-sans overflow-x-hidden">
      <div className="max-w-4xl mx-auto relative w-full pb-20 pt-4 text-left">
        <div className="px-4">
          <header className="bg-gradient-to-br from-[#3B65F5] to-[#2551E8] text-white rounded-[28px] overflow-hidden relative shadow-xl shadow-blue-500/10 mb-4 text-left px-6 pb-6 pt-5 sm:px-7 sm:pt-6 sm:pb-7">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute -top-16 -right-16 w-64 h-64 bg-white/10 rounded-full blur-3xl opacity-50" />
              <div className="absolute top-1/2 -left-10 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
            </div>
            <div className="flex justify-between items-center mb-6 relative z-10">
              <div className="flex flex-col">
                <h1 className="text-[22px] font-black tracking-tight leading-tight text-white mb-0">34a Master</h1>
                {user && (
                  <button
                    onClick={() => setShowDatePicker(true)}
                    className="mt-0.5 inline-flex items-center gap-2 w-fit py-1.5 px-3 -ml-3 rounded-2xl hover:bg-white/10 active:scale-[0.98] transition-all group"
                  >
                    <CalendarDays size={15} className="text-white/85 group-hover:text-white transition-colors" />
                    <span className="text-[14px] font-medium text-white/90 leading-tight group-hover:text-white transition-colors">
                      {daysUntilExam === null
                        ? 'Noch kein Prüfungsdatum'
                        : daysUntilExam === 0
                          ? 'Prüfung ist heute'
                          : `Noch ${daysUntilExam} ${daysUntilExam === 1 ? 'Tag' : 'Tage'} bis zur Prüfung`}
                    </span>
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                {showLanguageToggle && (
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleLanguage();
                    }}
                    aria-label="Language"
                    className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center backdrop-blur-sm transition-colors active:scale-95"
                  >
                    <span className="material-icons text-[20px]">translate</span>
                  </button>
                )}
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    navigate('/profile');
                  }}
                  aria-label="Settings"
                  className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center backdrop-blur-sm transition-colors active:scale-95"
                >
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
                streak={0}
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
                      {language === 'DE_AR' && (
                        <span className="block text-sm font-normal mt-0.5 text-white/90" dir="rtl" style={{ textAlign: 'left' }}>
                          تسجيل الدخول
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-white/80">
                      Fortschritt speichern & auf allen Geräten lernen.
                      {language === 'DE_AR' && (
                        <span className="block text-sm mt-0.5 opacity-80" dir="rtl" style={{ textAlign: 'left' }}>
                          احفظ تقدمك في التعلم.
                        </span>
                      )}
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

        <div className="px-4 mb-5">
          <TransitionAccessNotice variant="banner" />
          <DashboardModeToggle
            mode={dashboardMode}
            onChange={(nextMode) => {
              if (nextMode === 'lernplan' && dashboardMode !== 'lernplan') {
                trackEvent('lernplan_entry_clicked', {
                  entry_point: 'dashboard_embedded_toggle',
                  source: 'dashboard_embedded_toggle',
                });
              }
              setDashboardMode(nextMode);
            }}
          />
        </div>

        <div className="px-4">
          <div className="relative min-h-[500px]">
            {/* Freestyle View Container */}
            <div
              className={`transition-all duration-600 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                dashboardMode === 'freestyle'
                  ? 'opacity-100 translate-x-0 scale-100 relative z-10'
                  : 'opacity-0 -translate-x-8 scale-[0.98] absolute inset-x-0 top-0 pointer-events-none z-0'
              }`}
            >
              <FreestyleDashboardContent
                language={language}
                isAdmin={isAdmin}
                overallProgress={practiceProgress}
                navigate={navigate}
              />
            </div>

            {/* Lernplan View Container */}
            <div
              className={`transition-all duration-600 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                dashboardMode === 'lernplan'
                  ? 'opacity-100 translate-x-0 scale-100 relative z-10'
                  : 'opacity-0 translate-x-8 scale-[0.98] absolute inset-x-0 top-0 pointer-events-none z-0'
              }`}
            >
              <div className="pt-1">
                <Suspense fallback={<DashboardModeLoadingCard />}>
                  <EmbeddedLernplan embedded active={dashboardMode === 'lernplan'} />
                </Suspense>
              </div>
            </div>
          </div>
        </div>

        {!user && showAuthDialog && <AuthDialog onClose={() => setShowAuthDialog(false)} initialMode="register" />}
        {showDatePicker && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6 shadow-2xl relative border border-slate-100 dark:border-slate-800">
              <h3 className="text-xl font-bold mb-4 dark:text-white">Prüfungsdatum festlegen</h3>
              <input
                type="date"
                aria-label="Prüfungsdatum festlegen"
                title="Prüfungsdatum festlegen"
                min={new Date().toISOString().split('T')[0]}
                className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 mb-6 font-medium dark:text-white outline-none focus:border-blue-500 transition-colors"
                defaultValue={examDate || ''}
                id="dashboard-exam-date-picker"
              />
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowDatePicker(false)}
                  className="px-5 py-2.5 rounded-xl font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                >
                  Abbrechen
                </button>
                <button
                  onClick={() => {
                    const value = (document.getElementById('dashboard-exam-date-picker') as HTMLInputElement).value;
                    if (value) {
                      setEffectiveExamDate(value);
                      setExamDate(value);
                      window.dispatchEvent(new Event('storage'));
                    }
                    setShowDatePicker(false);
                  }}
                  className="px-5 py-2.5 rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white transition shadow-lg shadow-blue-500/20"
                >
                  Speichern
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DashboardModeToggle({
  mode,
  onChange,
}: {
  mode: DashboardMode;
  onChange: (mode: DashboardMode) => void;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-[24px] p-2 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.25)] border border-white/70 dark:border-slate-800">
      <div className="relative grid grid-cols-2 rounded-[20px] bg-slate-100/80 dark:bg-slate-800/80 p-1">
        <div
          className="absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-[16px] bg-gradient-to-r from-[#3B65F5] to-[#2551E8] shadow-lg shadow-blue-500/20 transition-transform duration-300 ease-out"
          style={{ transform: mode === 'lernplan' ? 'translateX(0%)' : 'translateX(100%)' }}
        />

        <ToggleButton
          active={mode === 'lernplan'}
          icon={Map}
          label="Lernplan"
          onClick={() => onChange('lernplan')}
        />
        <ToggleButton
          active={mode === 'freestyle'}
          icon={LayoutGrid}
          label="Freestyle"
          onClick={() => onChange('freestyle')}
        />
      </div>
    </div>
  );
}

function ToggleButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative z-10 flex items-center justify-center gap-2 py-3 px-4 rounded-[16px] font-bold text-sm transition-colors duration-300 ${
        active ? 'text-white' : 'text-slate-600 dark:text-slate-300'
      }`}
    >
      <Icon size={16} />
      <span>{label}</span>
    </button>
  );
}

function DashboardModeLoadingCard() {
  return (
    <div className="rounded-[24px] border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
      <div className="h-5 w-32 rounded-full bg-slate-100 dark:bg-slate-800 animate-pulse mb-4" />
      <div className="space-y-3">
        <div className="h-20 rounded-[20px] bg-slate-100 dark:bg-slate-800 animate-pulse" />
        <div className="h-28 rounded-[20px] bg-slate-100 dark:bg-slate-800 animate-pulse" />
        <div className="h-28 rounded-[20px] bg-slate-100 dark:bg-slate-800 animate-pulse" />
      </div>
    </div>
  );
}

function FreestyleDashboardContent({
  language,
  isAdmin,
  overallProgress,
  navigate,
}: {
  language: string;
  isAdmin: boolean;
  overallProgress: number;
  navigate: ReturnType<typeof useNavigate>;
}) {
  return (
    <>
      <div
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
      </div>

      <div className="mt-12 mb-8 text-center opacity-60">
        <p className="text-[10px] font-bold text-[#4B5563] dark:text-[#9CA3AF] uppercase tracking-widest mb-4">Beta Version 1.0.4</p>
        <div className="flex flex-wrap justify-center gap-4 text-sm font-bold text-[#4B5563] dark:text-[#9CA3AF]">
          <button onClick={() => window.open('https://wa.me/491782907020', '_blank')}>Kontakt {language === 'DE_AR' && <span className="font-normal block mt-0.5" dir="rtl">اتصل بنا</span>}</button>
          <a href="#/impressum">Impressum {language === 'DE_AR' && <span className="font-normal block mt-0.5" dir="rtl">بصمة</span>}</a>
          <a href="#/datenschutz">Datenschutz {language === 'DE_AR' && <span className="font-normal block mt-0.5" dir="rtl">حماية البيانات</span>}</a>
          <a href="#/agb">AGB</a>
        </div>
      </div>
    </>
  );
}
