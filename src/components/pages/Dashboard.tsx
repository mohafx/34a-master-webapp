import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { CalendarDays, LayoutGrid, Map, GraduationCap, Mic, FileText, X, Zap, ChevronRight, Crown } from 'lucide-react';
import { useApp } from '../../App';
import { useAuth } from '../../contexts/AuthContext';
import { useDataCache } from '../../contexts/DataCacheContext';
import { usePostHog } from '../../contexts/PostHogProvider';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { AuthDialog } from '../auth/AuthDialog';
import { DashboardStats } from '../dashboard/DashboardStats';
import { TransitionAccessNotice } from '../TransitionAccessNotice';
import { db } from '../../services/database';
import { getCompletedLessonCountForModule } from '../../services/lessonFlow';
import { getOralExamEntitlement, listOralExamSessions } from '../../services/oralExam';
import { isAdminEmail } from '../../utils/userRoles';
import { getEffectiveExamDate, setEffectiveExamDate } from '../../utils/appStorage';
import type { OralExamEntitlement } from '../../types';
const EmbeddedLernplan = lazy(() => import('./Lernplan'));

type DashboardMode = 'freestyle' | 'lernplan';

const DASHBOARD_MODE_STORAGE_KEY = '34a_dashboard_mode';

function loadInitialDashboardMode(): DashboardMode {
  if (typeof window === 'undefined') return 'freestyle';
  const stored = localStorage.getItem(DASHBOARD_MODE_STORAGE_KEY);
  return stored === 'lernplan' ? 'lernplan' : 'freestyle';
}

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
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
    const params = new URLSearchParams(location.search);
    const authAction = params.get('auth');
    if (authAction === 'login' || authAction === 'register') {
      if (!user) {
        setShowAuthDialog(true);
      }
      // Remove the param from URL to avoid reopening on refresh
      navigate(location.pathname, { replace: true });
    }
  }, [location, user, navigate]);

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
                  onClick={async () => {
                    const value = (document.getElementById('dashboard-exam-date-picker') as HTMLInputElement).value;
                    if (value) {
                      setEffectiveExamDate(value);
                      setExamDate(value);
                      window.dispatchEvent(new Event('storage'));
                      if (user) {
                        try {
                          await db.updateExamDate(user.id, value);
                        } catch (error) {
                          console.error('Error saving exam date:', error);
                        }
                      }
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
          style={{ transform: mode === 'freestyle' ? 'translateX(0%)' : 'translateX(100%)' }}
        />

        <ToggleButton
          active={mode === 'freestyle'}
          icon={LayoutGrid}
          label="Freestyle"
          onClick={() => onChange('freestyle')}
        />
        <ToggleButton
          active={mode === 'lernplan'}
          icon={Map}
          label="Lernplan"
          onClick={() => onChange('lernplan')}
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
  const { isPremium, openAuthDialog } = useApp();
  const { user } = useAuth();
  const { subscription, transitionGrant } = useSubscription();

  const [showExamModal, setShowExamModal] = useState(false);
  const [showWrittenModal, setShowWrittenModal] = useState(false);
  const [oralEntitlement, setOralEntitlement] = useState<OralExamEntitlement | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadOralEntitlement() {
      if (!user) { setOralEntitlement(null); return; }
      try {
        const entitlement = await getOralExamEntitlement();
        if (mounted) setOralEntitlement(entitlement);
      } catch (_) {
        const sessions = await listOralExamSessions(50);
        const mode = isPremium ? 'full_simulation' : 'free_test_3q';
        const windowStartsAt = isPremium ? subscription?.current_period_start ?? transitionGrant?.starts_at ?? null : null;
        const windowEndsAt = isPremium ? subscription?.current_period_end ?? transitionGrant?.ends_at ?? null : null;
        const used = sessions.filter((s) => {
          if (s.mode !== mode) return false;
          if (!s.connected_at) return false;
          if (windowStartsAt && new Date(s.connected_at) < new Date(windowStartsAt)) return false;
          if (windowEndsAt && new Date(s.connected_at) > new Date(windowEndsAt)) return false;
          return true;
        }).length;
        const limit = isPremium ? 10 : 1;
        if (mounted) setOralEntitlement({ isPremium, mode, used, limit, remaining: Math.max(limit - used, 0), windowStartsAt, windowEndsAt });
      }
    }
    void loadOralEntitlement();
    return () => { mounted = false; };
  }, [user?.id, isPremium, subscription?.current_period_start, subscription?.current_period_end, transitionGrant?.starts_at, transitionGrant?.ends_at]);

  const oralBadgeText = !user
    ? '1x kostenlos testen'
    : oralEntitlement
      ? oralEntitlement.isPremium
        ? `${oralEntitlement.remaining} / ${oralEntitlement.limit} Tickets`
        : `${oralEntitlement.remaining} / ${oralEntitlement.limit} Mini frei`
      : isPremium ? 'Tickets werden geladen' : '1x kostenlos testen';

  const handleOralExamClick = () => {
    setShowExamModal(false);
    if (!user) {
      openAuthDialog('register', {
        de: 'Registriere dich kostenlos und starte deine 1 Mini-Simulation der mündlichen Prüfung.',
        ar: 'سجّل مجاناً وابدأ محاكاة مصغّرة واحدة للامتحان الشفوي.',
      });
      return;
    }
    navigate('/oral-exam');
  };

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

          <button onClick={() => setShowExamModal(true)} className="w-full bg-[#FFFFFF] dark:bg-slate-850 rounded-[24px] px-5 py-4 sm:px-7 sm:py-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] transition-transform active:scale-[0.98] relative overflow-hidden group text-left border border-transparent dark:border-slate-800">
            <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-indigo-500 opacity-10 rounded-full blur-2xl group-hover:opacity-20 transition-opacity"></div>
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                <span className="material-icons text-indigo-600 dark:text-indigo-400">school</span>
              </div>
              <div className="flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-base leading-tight">
                    Prüfungssimulation
                    {language === 'DE_AR' && <span className="block text-sm font-normal mt-0.5 text-[#4B5563] dark:text-[#9CA3AF]" dir="rtl" style={{ textAlign: 'left' }}>محاكاة الامتحان</span>}
                  </h3>
                  <span className="rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                    Neu
                  </span>
                </div>
                <p className="text-sm text-[#4B5563] dark:text-[#9CA3AF]">
                  Schriftlich und <span className="font-bold text-indigo-600 dark:text-indigo-400">mündlich</span> wie in der echten Prüfung
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

      {/* Prüfungsauswahl-Modal — via portal um transform-Stacking-Context zu umgehen */}
      {showExamModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowExamModal(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-[28px] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-black text-lg text-slate-900 dark:text-white">Prüfungssimulation</h2>
              <button
                onClick={() => setShowExamModal(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95"
              >
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {/* Mein Verlauf */}
              <button
                onClick={() => { setShowExamModal(false); navigate('/exam/history'); }}
                className="w-full text-left bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border-2 border-transparent rounded-2xl p-4 transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <FileText size={22} strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-black text-base text-slate-900 dark:text-white">Mein Verlauf</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Deine Ergebnisse & Auswertungen.</p>
                  </div>
                  <ChevronRight size={18} className="text-slate-300 dark:text-slate-600 flex-shrink-0" />
                </div>
              </button>

              {/* Schriftliche Prüfungssimulation */}
              <button
                onClick={() => setShowWrittenModal(true)}
                className="w-full text-left bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-2 border-transparent hover:border-blue-400 dark:hover:border-blue-600 rounded-2xl p-4 transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-700 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 flex-shrink-0">
                    <GraduationCap size={22} strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-black text-base text-slate-900 dark:text-white">Schriftliche Prüfung</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Mini oder vollständige IHK-Simulation.</p>
                  </div>
                  <ChevronRight size={18} className="text-slate-300 dark:text-slate-600 flex-shrink-0" />
                </div>
              </button>

              {/* Mündliche Prüfung */}
              <button
                onClick={handleOralExamClick}
                className="w-full text-left bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border-2 border-transparent hover:border-indigo-400 dark:hover:border-indigo-600 rounded-2xl p-4 transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-700 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 flex-shrink-0">
                    <Mic size={22} strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-black text-base text-slate-900 dark:text-white">Mündliche Prüfung</h3>
                      <span className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">Beta</span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Mit KI-Prüfer sprechen, Feedback erhalten.</p>
                  </div>
                  <ChevronRight size={18} className="text-slate-300 dark:text-slate-600 flex-shrink-0" />
                </div>
              </button>
            </div>

            <div className="px-4 pb-4">
              <button
                onClick={() => setShowExamModal(false)}
                className="w-full py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-sm active:scale-95 transition-all"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Schriftliche Modus-Auswahl Sub-Modal */}
      {showWrittenModal && createPortal(
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4" onClick={() => setShowWrittenModal(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-[28px] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-black text-lg text-slate-900 dark:text-white">Modus wählen</h2>
              <button
                onClick={() => setShowWrittenModal(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95"
              >
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <button
                onClick={() => { setShowWrittenModal(false); setShowExamModal(false); navigate('/exam/mini-intro'); }}
                className="w-full text-left bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-2 border-transparent hover:border-blue-400 dark:hover:border-blue-600 rounded-2xl p-4 transition-all active:scale-[0.98]"
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
              <button
                onClick={() => { setShowWrittenModal(false); setShowExamModal(false); navigate('/exam/intro'); }}
                className="w-full text-left bg-slate-50 dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-900/20 border-2 border-transparent hover:border-amber-400 dark:hover:border-amber-600 rounded-2xl p-4 transition-all active:scale-[0.98]"
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
                Zurück
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
