import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../App';
import { useAuth } from '../../contexts/AuthContext';
import { User, LogOut, Moon, Sun, Bell, Trash2, Info, Sparkles, Crown, Languages, Bookmark, BarChart3, ArrowLeft, Shield, Eye } from 'lucide-react';
import { AuthDialog } from '../auth/AuthDialog';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { db } from '../../services/database';
import { isAdminEmail } from '../../utils/userRoles';
import { getEffectiveExamDate, setEffectiveExamDate } from '../../devtools/runtime';
import { useDevTools } from '../../devtools/DevToolsContext';

export default function Profile() {
  const devTools = useDevTools();
  const { user, logout, progress, language, toggleLanguage, showLanguageToggle, setShowLanguageToggle, settings, updateSettings, openOnboarding, openPaywall } = useApp();
  const { isPremium, restorePurchases, subscription, manageSubscription } = useSubscription();
  const { user: authUser } = useAuth();
  const isAdmin = isAdminEmail(authUser?.email);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const navigate = useNavigate();

  // Use global settings for theme
  const isDark = settings.darkMode ?? false;

  // Lifted Exam Date State
  const [examDate, setExamDate] = useState<string | null>(() => {
    return getEffectiveExamDate();
  });
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    setExamDate(getEffectiveExamDate());
  }, [devTools.state.settings.examDate]);

  const handleSetExamDate = (date: string) => {
    setEffectiveExamDate(date);
    setExamDate(date);
    setShowDatePicker(false);
  };

  const daysUntilExam = examDate ? Math.ceil((new Date(examDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;

  // Lifted Settings Logic
  const handleClearProgress = async () => {
    if (confirm('Möchtest du wirklich deinen Fortschritt zurücksetzen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
      try {
        if (devTools.isActive) {
          devTools.clearProgress();
          setExamDate(null);
          setEffectiveExamDate(null);
          alert('Lokaler Dev-Fortschritt wurde zurückgesetzt!');
          return;
        }

        if (authUser) {
          await db.resetUserProgress(authUser.id);
        }

        // Clear all local progress keys (Guest & Sync cache)
        const keysToRemove = [
          'guest_progress',
          'guest_bookmarks',
          'guest_completed_lessons',
          'guest_flashcard_progress',
          'guest_wrong_counts',
          'guest_answered_order',
          'examDate',
          '34a_lernplan',
          'answered_order'
        ];

        // Also clear any expanded sections
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('user_expanded_sections_') || key.startsWith('guest_expanded_sections_')) {
            keysToRemove.push(key);
          }
        });

        keysToRemove.forEach(key => localStorage.removeItem(key));

        alert('Fortschritt wurde zurückgesetzt!');
        window.location.reload();
      } catch (error) {
        console.error('Error resetting progress:', error);
        alert('Ein Fehler ist aufgetreten. Bitte versuche es später erneut.');
      }
    }
  };

  return (
    <div className="pt-4 px-4 pb-32 lg:px-0 lg:pt-0 lg:pb-8 lg:max-w-2xl lg:mx-auto">
      {/* Header Section */}
      <div className="bg-white dark:bg-slate-850 p-6 rounded-[28px] shadow-sm border border-slate-100 dark:border-slate-800 text-center mb-6 relative">
        <button
          onClick={() => navigate('/')}
          title="Zurück zum Dashboard"
          className="absolute left-6 top-6 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        {showLanguageToggle && (
          <button
            onClick={toggleLanguage}
            title="Sprache wechseln"
            className={`absolute right-6 top-6 p-2 transition-colors ${language === 'DE_AR' ? 'text-blue-500 dark:text-blue-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
          >
            <Languages size={24} />
          </button>
        )}
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-white ${user?.isLoggedIn ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}>
          <User size={38} strokeWidth={1.5} className={user?.isLoggedIn ? 'text-white' : 'text-slate-400 dark:text-slate-500'} />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
          {user?.isLoggedIn ? user.name : 'Gastzugang'}
        </h1>
        {user?.isLoggedIn ? (
          <>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Angemeldet</p>
            {language === 'DE_AR' && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1" dir="rtl">مسجل الدخول</p>}
          </>
        ) : (
          <>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Nicht angemeldet</p>
            {language === 'DE_AR' && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1" dir="rtl">غير مسجل</p>}
          </>
        )}
      </div>

      {/* Status / Login Section */}
      <div className="bg-white dark:bg-slate-850 rounded-[24px] shadow-sm border border-slate-100 dark:border-slate-800 p-5 mb-6">
        {user?.isLoggedIn ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <Crown className={isPremium ? "text-amber-500" : "text-slate-400"} size={20} />
              <h3 className="font-bold text-base text-slate-900 dark:text-white">Account Status</h3>
              {language === 'DE_AR' && <p className="text-xs text-slate-400 dark:text-slate-500 mr-auto" dir="rtl">حالة الحساب</p>}
            </div>

            {isPremium ? (
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-2xl p-4 border border-amber-200 dark:border-amber-800/30">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="font-bold text-amber-900 dark:text-amber-400 block leading-tight">
                      {subscription?.plan === '6months' ? '6-Monate Paket' : 'Premium Abo'}
                    </span>
                    <span className="text-xs text-amber-700/80 dark:text-amber-500/80 flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full inline-block ${subscription?.status === 'canceled' ? 'bg-orange-500' : 'bg-green-500'}`}></span>
                      {subscription?.status === 'canceled' ? 'Gekündigt' : 'Aktiv'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-800/70 dark:text-amber-500/70">Gebucht am:</span>
                    <span className="font-medium text-amber-900 dark:text-amber-400">
                      {subscription?.created_at
                        ? new Date(subscription.created_at).toLocaleDateString('de-DE')
                        : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-800/70 dark:text-amber-500/70">
                      {subscription?.status === 'canceled'
                        ? 'Ihr Abo endet am:'
                        : subscription?.plan === '6months'
                          ? 'Läuft ab am:'
                          : 'Nächste Verlängerung:'}
                    </span>
                    <span className="font-medium text-amber-900 dark:text-amber-400">
                      {subscription?.current_period_end
                        ? new Date(subscription.current_period_end).toLocaleDateString('de-DE')
                        : '-'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    manageSubscription();
                  }}
                  className="w-full bg-white/50 dark:bg-black/20 hover:bg-white/80 dark:hover:bg-black/30 text-amber-900 dark:text-amber-400 text-sm font-medium py-2 rounded-xl transition-colors border border-amber-200/50 dark:border-amber-700/30"
                >
                  Abo verwalten
                </button>
              </div>
            ) : (
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-5 border border-slate-200/50 dark:border-slate-700/30">
                <div className="flex flex-col gap-4">
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white block mb-1 text-lg">Basis Version</span>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Eingeschränkter Zugriff auf Inhalte</p>
                    {language === 'DE_AR' && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 text-left" dir="rtl">وصول محدود للمحتوى</p>}
                  </div>

                  <button
                    onClick={() => openPaywall('Profile_Status')}
                    className="w-full bg-gradient-to-br from-amber-500 to-orange-600 text-white font-bold py-3 rounded-xl shadow-lg hover:shadow-orange-200/50 dark:hover:shadow-orange-950/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                  >
                    <Crown size={18} />
                    <span>Premium freischalten</span>
                    {language === 'DE_AR' && <span className="text-xs font-normal border-l border-white/20 pl-2" dir="rtl">تفعيل بريميوم</span>}
                  </button>
                </div>
              </div>
            )}
      </>
      ) : (
      /* Guest View Login CTA */
      <>
        <div className="flex items-center gap-2 mb-3">
          <User className="text-blue-500" size={20} />
          <h3 className="font-bold text-base text-slate-900 dark:text-white">Anmeldung</h3>
          {language === 'DE_AR' && <p className="text-xs text-slate-400 dark:text-slate-500 mr-auto" dir="rtl">تسجيل الدخول</p>}
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          Melde dich an, um deinen Fortschritt zu speichern und auf allen Geräten zu synchronisieren.
        </p>
        <button
          onClick={() => setShowAuthDialog(true)}
          className="w-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold py-3 rounded-2xl shadow-lg hover:shadow-xl hover:shadow-blue-200/50 transition-all flex items-center justify-center"
        >
          <span>Jetzt kostenlos anmelden</span>
          {language === 'DE_AR' && <span className="text-sm font-normal text-blue-100 ml-2" dir="rtl">سجل الآن مجاناً</span>}
        </button>
      </>
        )}
    </div>

      {/* Settings Grid (Common) */ }
  <div className="bg-white dark:bg-slate-850 rounded-[24px] shadow-sm border border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 mb-6">
    <div className="p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
          {isDark ? (
            <Moon size={20} className="text-slate-600 dark:text-slate-400" />
          ) : (
            <Sun size={20} className="text-slate-600" />
          )}
        </div>
        <div>
          <span className="text-sm font-bold text-slate-900 dark:text-white block mb-0.5">
            Erscheinungsbild
          </span>
          {language === 'DE_AR' && (
            <p className="text-xs text-slate-500 dark:text-slate-400" dir="rtl">
              المظهر
            </p>
          )}
        </div>
      </div>

      {/* Theme Selector Buttons */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        <button
          onClick={() => updateSettings({ darkMode: false, autoTheme: false })}
          className={`py-2.5 px-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${!isDark && !settings.autoTheme
            ? 'bg-blue-600 text-white shadow-md'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
        >
          <Sun size={16} />
          <span>Hell</span>
        </button>
        <button
          onClick={() => updateSettings({ darkMode: true, autoTheme: false })}
          className={`py-2.5 px-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${isDark && !settings.autoTheme
            ? 'bg-blue-600 text-white shadow-md'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
        >
          <Moon size={16} />
          <span>Dunkel</span>
        </button>
        <button
          onClick={() => updateSettings({ autoTheme: true })}
          className={`py-2.5 px-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${settings.autoTheme
            ? 'bg-blue-600 text-white shadow-md'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12" y2="18" />
          </svg>
          <span>Auto</span>
        </button>
      </div>
      {settings.autoTheme && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center">
          Folgt automatisch dem Gerät
        </p>
      )}
    </div>

    <div className="p-5 flex justify-between items-center">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
          <Languages size={20} className="text-slate-600 dark:text-slate-400" />
        </div>
        <div>
          <span className="text-sm font-bold text-slate-900 dark:text-white block mb-0.5">Arabische Toggle aktivieren</span>
          {language === 'DE_AR' && <p className="text-xs text-slate-500 dark:text-slate-400" dir="rtl">تفعيل زر اللغة العربية</p>}
        </div>
      </div>
      <button
        onClick={() => setShowLanguageToggle(!showLanguageToggle)}
        title={showLanguageToggle ? "Arabischen Toggle deaktivieren" : "Arabischen Toggle aktivieren"}
        className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 ${showLanguageToggle ? 'bg-blue-600 justify-end' : 'bg-slate-200 dark:bg-slate-700 justify-start'}`}
      >
        <div className="w-4 h-4 bg-white rounded-full shadow-sm"></div>
      </button>
    </div>

    <div className="p-5 flex justify-between items-center">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
          <Bookmark size={20} className="text-slate-600 dark:text-slate-400" />
        </div>
        <div>
          <span className="text-sm font-bold text-slate-900 dark:text-white block mb-0.5">Gespeicherte Fragen</span>
          {language === 'DE_AR' && <p className="text-xs text-slate-500 dark:text-slate-400" dir="rtl">الأسئلة المحفوظة</p>}
        </div>
      </div>
      <span className="font-bold text-blue-600 text-lg">{progress.bookmarks.length}</span>
    </div>

    <div className="p-5 flex justify-between items-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" onClick={() => navigate('/statistics')}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
          <BarChart3 size={20} className="text-slate-600 dark:text-slate-400" />
        </div>
        <div>
          <span className="text-sm font-bold text-slate-900 dark:text-white block mb-0.5">Statistiken</span>
          {language === 'DE_AR' && <p className="text-xs text-slate-500 dark:text-slate-400" dir="rtl">الإحصائيات</p>}
        </div>
      </div>
      <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-400 dark:text-slate-500">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </div>
  </div>

  {/* Exam Date Section (Common) */ }
  <div className="bg-white dark:bg-slate-850 rounded-[24px] shadow-sm border border-slate-100 dark:border-slate-800 p-5 mb-6">
    <div className="flex items-center gap-2 mb-3">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
      <h3 className="font-bold text-base text-slate-900 dark:text-white">Prüfungsdatum</h3>
      {language === 'DE_AR' && <p className="text-xs text-slate-400 dark:text-slate-500 mr-auto" dir="rtl">تاريخ الامتحان</p>}
    </div>

    {examDate && daysUntilExam !== null ? (
      <div>
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-4 mb-3">
          <p className="text-2xl font-black text-slate-900 dark:text-white mb-1">
            {daysUntilExam} {daysUntilExam === 1 ? 'Tag' : 'Tage'}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400">bis zur Prüfung</p>
        </div>
        <p className="text-sm text-slate-500 mb-3">
          {new Date(examDate).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
        <button
          onClick={() => setShowDatePicker(true)}
          className="w-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium py-2.5 rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 text-sm"
        >
          Datum ändern
        </button>
      </div>
    ) : (
      <button
        onClick={() => setShowDatePicker(true)}
        className="w-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-500 font-medium py-2.5 rounded-2xl transition-all hover:bg-amber-100 dark:hover:bg-amber-900/30 text-sm"
      >
        Prüfungsdatum eintragen
      </button>
    )}
  </div>

  {/* Date Picker Dialog */ }
  {
    showDatePicker && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-850 rounded-[24px] p-6 max-w-sm w-full shadow-xl">
          <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-4">Prüfungsdatum eintragen</h3>
            <input
              type="date"
              title="Prüfungsdatum wählen"
              aria-label="Prüfungsdatum"
              min={new Date().toISOString().split('T')[0]}
              defaultValue={examDate || ''}
              onChange={(e) => handleSetExamDate(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white bg-white dark:bg-slate-800"
            />
          <button
            onClick={() => setShowDatePicker(false)}
            className="mt-4 w-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium py-2.5 rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-600"
          >
            Abbrechen
          </button>
        </div>
      </div>
    )
  }

  {/* Settings Header */}
  <div className="mb-4 mt-8">
    <h2 className="text-xl font-black text-slate-900 dark:text-white">Einstellungen</h2>
    {language === 'DE_AR' && <p className="text-sm text-slate-500 dark:text-slate-400 font-bold" dir="rtl">الإعدادات</p>}
  </div>

  {/* Admin: Onboarding Preview Button */}
  {isAdmin && (
    <button
      onClick={openOnboarding}
      className="w-full bg-white dark:bg-slate-850 rounded-[24px] p-5 shadow-sm border border-indigo-100 dark:border-indigo-900/30 flex items-center gap-3 transition-transform active:scale-[0.99] hover:shadow-md text-left mb-4"
    >
      <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center">
        <Eye size={20} className="text-indigo-600 dark:text-indigo-400" />
      </div>
      <div className="flex-1">
        <span className="text-sm font-bold text-slate-900 dark:text-white block mb-0.5">Onboarding anzeigen</span>
        <p className="text-xs text-slate-500 dark:text-slate-400">Admin: Onboarding-Screens testen</p>
      </div>
      <span className="text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full">ADMIN</span>
    </button>
  )}

  {/* Data Management Section */ }
      <div className="mb-4">
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">Datenverwaltung</h2>
      </div>

      <button
        onClick={handleClearProgress}
        className="w-full bg-white dark:bg-slate-850 rounded-[24px] p-5 shadow-sm border border-slate-100 dark:border-slate-800 flex items-center gap-3 transition-transform active:scale-[0.99] hover:shadow-md text-left mb-6"
      >
        <div className="w-10 h-10 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center">
          <Trash2 size={20} className="text-red-600 dark:text-red-400" />
        </div>
        <div className="flex-1">
          <span className="text-sm font-bold text-slate-900 dark:text-white block mb-0.5">Fortschritt zurücksetzen</span>
          <p className="text-xs text-slate-500 dark:text-slate-400">Lösche alle gespeicherten Daten</p>
          {language === 'DE_AR' && (
            <p className="text-xs text-slate-400 dark:text-slate-500 text-right mt-1" dir="rtl">إعادة تعيين التقدم</p>
          )}
        </div>
      </button>

  {/* About Section */ }
      <div className="mb-4">
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">Über die App</h2>
      </div>

      <div className="bg-white dark:bg-slate-850 rounded-[24px] p-5 shadow-sm border border-slate-100 dark:border-slate-800 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
            <Info size={20} className="text-slate-600 dark:text-slate-400" />
          </div>
          <div className="flex-1">
            <span className="text-sm font-bold text-slate-900 dark:text-white block mb-0.5">34a Master</span>
            <p className="text-xs text-slate-500 dark:text-slate-400">Version 1.0.0</p>
            {language === 'DE_AR' && (
              <p className="text-xs text-slate-400 dark:text-slate-500 text-right mt-1" dir="rtl">معلومات التطبيق</p>
            )}
          </div>
        </div>
      </div>

  {/* Feedback & Support */ }
      <div className="mb-4 mt-8">
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">Feedback & Support</h2>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-[24px] p-5 shadow-sm border border-blue-100 dark:border-blue-800/30 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-800/30 rounded-full flex items-center justify-center flex-shrink-0">
            <Info size={20} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-base text-blue-900 dark:text-blue-300 mb-1">App in Beta-Version</h3>
            {language === 'DE_AR' && <p className="text-sm font-bold text-blue-800/80 dark:text-blue-400/80 mb-1 text-left" dir="rtl">تطبيق في نسخة تجريبية</p>}
            <p className="text-sm text-blue-800 dark:text-blue-400 leading-relaxed">
              Diese App ist noch ganz neu. Falls du Fehler findest oder Verbesserungswünsche hast, kontaktiere uns einfach. Wir setzen dein Feedback gerne um!
            </p>
            {language === 'DE_AR' && (
              <p className="text-xs text-blue-800/80 dark:text-blue-400/80 mt-1 text-left leading-relaxed" dir="rtl">
                هذا التطبيق لا يزال جديداً. إذا وجدت أخطاء أو لديك اقتراحات للتحسين، تواصل معنا ببساطة. نحن نرحب بملاحظاتك ونعمل على تنفيذها!
              </p>
            )}
          </div>
        </div>

        {/* Contact Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => {
              const message = encodeURIComponent('Hallo! Ich habe Feedback zur 34a Trainer App:\n\n');
              window.open(`https://wa.me/491782907020?text=${message}`, '_blank');
            }}
            className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-2xl transition-all flex items-center justify-center gap-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
            </svg>
            <span>WhatsApp</span>
          </button>
          <button
            onClick={() => {
              const subject = encodeURIComponent('Feedback zur 34a Trainer App');
              const body = encodeURIComponent('Hallo,\n\nich möchte Feedback zur App geben:\n\n');
              window.location.href = `mailto:support@34a-master.de?subject=${subject}&body=${body}`;
            }}
            className="bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-700 text-white font-bold py-3 rounded-2xl transition-all flex items-center justify-center gap-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            <span>E-Mail</span>
          </button>
        </div>
      </div>

  {/* Admin Button - Only visible to admin */ }
  {
    isAdmin && (
      <button
        onClick={() => navigate('/admin')}
        className="w-full bg-white dark:bg-slate-850 rounded-[24px] p-5 shadow-sm border border-slate-100 dark:border-slate-800 flex items-center gap-3 transition-transform active:scale-[0.99] hover:shadow-md text-left mb-6"
      >
        <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center">
          <Shield size={20} className="text-indigo-600 dark:text-indigo-400" />
        </div>
        <div className="flex-1">
          <span className="text-sm font-bold text-slate-900 dark:text-white block mb-0.5">Admin Bereich</span>
          <p className="text-xs text-slate-500 dark:text-slate-400">Fragen verwalten und bearbeiten</p>
        </div>
        <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-400 dark:text-slate-500">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </button>
    )
  }

  {
    user?.isLoggedIn && (
      <button
        onClick={() => { logout(); navigate('/'); }}
        className="w-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-bold py-4 rounded-[20px] flex flex-col items-center justify-center gap-1 transition-transform active:scale-[0.99] border border-red-100 dark:border-red-900/30 mb-6"
      >
        <div className="flex items-center gap-2">
          <LogOut size={18} />
          <span>Abmelden</span>
        </div>
        {language === 'DE_AR' && <span className="text-xs font-normal">تسجيل الخروج</span>}
      </button>
    )
  }

  {/* Legal Links Footer */ }
  <div className="flex justify-center gap-3 mt-4 mb-8 text-[10px] text-slate-400 dark:text-slate-500">
    <a href="#/impressum" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors">Impressum</a>
    <span>•</span>
    <a href="#/datenschutz" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors">Datenschutz</a>
    <span>•</span>
    <a href="#/agb" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors">AGB</a>
    <span>•</span>
    <a href="#/widerrufsbelehrung" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors">Widerruf</a>
  </div>

  {
    showAuthDialog && (
      <AuthDialog onClose={() => setShowAuthDialog(false)} initialMode="register" />
    )
  }
    </div >
  );
}
