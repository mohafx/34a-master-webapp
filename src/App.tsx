import React, { useState, useEffect, useLayoutEffect, createContext, useContext, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AppLanguage, User, UserProgress, Question, UserSettings } from './types';
import { MOCK_QUESTIONS } from './services/mockData';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DataCacheProvider, useDataCache } from './contexts/DataCacheContext';
import { SubscriptionProvider, useSubscription } from './contexts/SubscriptionContext';
import { ToastProvider, toast } from './contexts/ToastContext';
import { PostHogProvider, usePostHog, usePageTracking } from './contexts/PostHogProvider';
import { PaywallDialog } from './components/PaywallDialog';
import { db, guestStorage } from './services/database';
import { supabase } from './lib/supabase';
import { getLessonQuestionProgress, isQuestionBasedLesson } from './services/lessonFlow';
import SplashScreen from './components/SplashScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import DesktopLayout from './components/layout/DesktopLayout';

// Icons
import { GraduationCap, User as UserIcon, HelpCircle, ArrowRight, Languages, Settings } from 'lucide-react';
import * as Icons from 'lucide-react';
import { QuizSettingsDialog } from './components/pages/QuizSettingsDialog';

// Frequently used pages - loaded immediately
import Dashboard from './components/pages/Dashboard';
import ModuleList from './components/pages/ModuleList';
import ModuleDetail from './components/pages/ModuleDetail';
import QuestionView from './components/pages/QuestionView';
import Profile from './components/pages/Profile';
import PracticeSelection from './components/pages/PracticeSelection';
import ModuleQuestionsList from './components/pages/ModuleQuestionsList';
import ExamIntro from './components/pages/ExamIntro';
import LeadCaptureScreen from './components/pages/LeadCaptureScreen';
import EmailConfirmation from './components/pages/EmailConfirmation';
import ResetPassword from './components/pages/ResetPassword';
import AuthCallback from './components/pages/AuthCallback';
import Impressum from './components/pages/Impressum';
import Datenschutz from './components/pages/Datenschutz';
import AGB from './components/pages/AGB';
import Widerrufsbelehrung from './components/pages/Widerrufsbelehrung';
import { AuthDialog } from './components/auth/AuthDialog';
import { DashboardSkeleton } from './components/skeletons/DashboardSkeleton';
import CookieConsent from './components/CookieConsent';
import { TransitionAccessNotice } from './components/TransitionAccessNotice';
import FirstTimeOnboarding from './components/onboarding/FirstTimeOnboarding';
import { LocalDevPanel } from './components/devpanel/LocalDevPanel';
import { DevPanelProvider, useDevPanel } from './devpanel/DevPanelContext';
import {
  getEffectiveLanguage,
  getEffectiveSettings,
  hasCompletedOnboarding,
  markOnboardingCompleted,
  setEffectiveExamDate,
  setEffectiveLanguage,
  setEffectiveSettings,
} from './utils/appStorage';

// Code-split large components - loaded on demand

const WrittenExam = lazy(() => import('./components/pages/WrittenExam'));
const MiniExam = lazy(() => import('./components/pages/MiniExam'));
const MiniExamIntro = lazy(() => import('./components/pages/MiniExamIntro'));
const ExamSelection = lazy(() => import('./components/pages/ExamSelection'));
const WrittenExamResults = lazy(() => import('./components/pages/WrittenExamResults'));
const LessonView = lazy(() => import('./components/pages/LessonView'));
const LessonQuiz = lazy(() => import('./components/pages/LessonQuiz'));
const FlashcardSelection = lazy(() => import('./components/pages/FlashcardSelection'));
const FlashcardList = lazy(() => import('./components/pages/FlashcardList'));
const FlashcardView = lazy(() => import('./components/pages/FlashcardView'));
// Additional lazy-loaded pages for better performance
const Statistics = lazy(() => import('./components/pages/Statistics'));
const Lernplan = lazy(() => import('./components/pages/Lernplan'));
const TikTokOnboarding = lazy(() => import('./components/onboarding/TikTokOnboarding'));

const WrongAnswersList = lazy(() => import('./components/pages/WrongAnswersList'));
const BookmarkList = lazy(() => import('./components/pages/BookmarkList'));
// Admin
const AdminDashboard = lazy(() => import('./components/pages/admin/AdminDashboard'));
const AdminGuard = lazy(() => import('./components/pages/admin/AdminGuard'));
const AdminWrittenExamBrowser = lazy(() => import('./components/pages/admin/AdminWrittenExamBrowser'));
const AdminWrittenExamQuestionList = lazy(() => import('./components/pages/admin/AdminWrittenExamQuestionList'));
const AdminWrittenExamQuiz = lazy(() => import('./components/pages/admin/AdminWrittenExamQuiz'));

// --- Global State ---
interface AppContextType {
  user: User | null;
  settings: UserSettings;
  updateSettings: (newSettings: Partial<UserSettings>) => void;
  language: AppLanguage;
  progress: UserProgress;
  toggleLanguage: () => void;
  logout: () => void;
  answerQuestion: (questionId: string, isCorrect: boolean) => void;
  answerFlashcard: (flashcardId: string, known: boolean) => void;
  toggleBookmark: (questionId: string) => void;
  showLanguageToggle: boolean;
  setShowLanguageToggle: (show: boolean) => void;
  hideBottomNav: boolean;
  setHideBottomNav: (hide: boolean) => void;
  showAuthDialog: boolean;
  showPaywallDialog: boolean;
  showFirstTimeOnboarding: boolean;
  // Premium subscription
  isPremium: boolean;
  isSubscriptionLoading: boolean;
  openPaywall: (featureName?: string) => void;
  openAuthDialog: (mode?: 'login' | 'register', message?: { de: string; ar: string }) => void;
  toggleLessonCompletion: (lessonId: string) => Promise<void>;
  setLessonCompletion: (lessonId: string, completed: boolean) => Promise<void>;
  openOnboarding: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    // Defensive: Log to Sentry but don't crash the app
    if (typeof window !== 'undefined' && import.meta.env.VITE_SENTRY_DSN) {
      import('@sentry/react').then(({ captureException }) => {
        captureException(new Error("useApp must be used within AppProvider"), {
          tags: { component: 'useApp' },
          level: 'warning'
        });
      });
    }
    // Return a safe default instead of throwing
    console.warn("useApp must be used within AppProvider - returning default values");
    return {
      user: null,
      settings: { cardSize: 'normal' },
      updateSettings: () => { },
      language: AppLanguage.DE,
      progress: { answeredQuestions: {}, completedLessons: {}, bookmarks: [], flashcardProgress: {} },
      toggleLanguage: () => { },
      login: () => { },
      logout: () => { },
      answerQuestion: () => { },
      answerFlashcard: () => { },
      toggleBookmark: () => { },
      showLanguageToggle: true,
      setShowLanguageToggle: () => { },
      hideBottomNav: false,
      setHideBottomNav: () => { },
      showAuthDialog: false,
      showPaywallDialog: false,
      showFirstTimeOnboarding: false,
      isPremium: false,
      isSubscriptionLoading: false,
      openPaywall: () => { },
      openAuthDialog: () => { },
      toggleLessonCompletion: async () => { },
      setLessonCompletion: async () => { },
      openOnboarding: () => { }
    } as AppContextType;
  }
  return context;
};

// --- Main App Component (wrapped with Auth) ---
function AppContent() {
  const { user: authUser, loading: authLoading, signOut } = useAuth();
  const { loading: dataLoading, loadingStatus, error: loadingError, refreshData, questions } = useDataCache();
  const { trackEvent, identifyUser, resetUser, setUserProperties } = usePostHog();
  const { isOverrideActive, shortcutRequest, consumeShortcut } = useDevPanel();
  usePageTracking(); // Track page views on hash navigation (SPA)
  const [language, setLanguage] = useState<AppLanguage>(() => getEffectiveLanguage());
  const [settings, setSettings] = useState<UserSettings>(() => {
    // Initialize from localStorage to avoid flash of default content
    let parsed: UserSettings = getEffectiveSettings();

    // Sync legacy toggle setting
    const legacyToggle = localStorage.getItem('34a_show_lang_toggle');
    if (legacyToggle && parsed.showLanguageToggle === undefined) {
      parsed.showLanguageToggle = legacyToggle === 'true';
    }

    // Initialize Auto Theme as default for new users
    // If autoTheme is not set yet, enable it by default
    if (parsed.autoTheme === undefined) {
      // Check if user has legacy theme settings
      const legacyTheme = localStorage.getItem('theme');
      if (legacyTheme) {
        // Legacy user: keep their manual setting
        parsed.autoTheme = false;
        parsed.darkMode = legacyTheme === 'dark';
      } else if (parsed.darkMode !== undefined) {
        // User has explicitly set darkMode before, keep manual mode
        parsed.autoTheme = false;
      } else {
        // New user: enable auto theme by default
        parsed.autoTheme = true;
        parsed.darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
    }

    // If autoTheme is enabled, sync with system preference
    if (parsed.autoTheme && parsed.darkMode === undefined) {
      parsed.darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    return {
      cardSize: 'normal',
      showLanguageToggle: true,
      autoTheme: true, // Default to auto
      ...parsed
    };
  });

  useEffect(() => {
    // Apply current dark mode setting
    const applyTheme = (isDark: boolean) => {
      if (isDark) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
    };

    applyTheme(settings.darkMode ?? false);

    // Listen for system preference changes if autoTheme is enabled
    if (settings.autoTheme) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

      const handleChange = (e: MediaQueryListEvent) => {
        // Update settings when system theme changes
        setSettings(prev => {
          const newSettings = { ...prev, darkMode: e.matches };
          setEffectiveSettings(newSettings);
          return newSettings;
        });
      };

      // Apply system preference immediately when autoTheme is enabled
      if (mediaQuery.matches !== settings.darkMode) {
        setSettings(prev => {
          const newSettings = { ...prev, darkMode: mediaQuery.matches };
          setEffectiveSettings(newSettings);
          return newSettings;
        });
      }

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [settings.darkMode, settings.autoTheme]);

  const [progress, setProgress] = useState<UserProgress>({
    answeredQuestions: {},
    completedLessons: {},
    bookmarks: [],
    flashcardProgress: {},
  });
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [authDialogMode, setAuthDialogMode] = useState<'login' | 'register'>('register');
  const [authDialogMessage, setAuthDialogMessage] = useState<{ de: string; ar: string } | null>(null);
  const [pendingAction, setPendingAction] = useState<'open_paywall' | null>(null);
  const [hideBottomNav, setHideBottomNav] = useState(false);

  // Subscription state
  const { isPremium, loading: subscriptionLoading } = useSubscription();
  const [showPaywallDialog, setShowPaywallDialog] = useState(false);

  // Onboarding after registration: shown when a user registers for the first time
  const [showFirstTimeOnboarding, setShowFirstTimeOnboarding] = useState(false);
  const [paywallFeatureName, setPaywallFeatureName] = useState<string | undefined>();

  // Detect first registration: when authUser becomes available and no per-user onboarding flag exists
  const prevAuthUserRef = React.useRef<typeof authUser>(undefined);
  useEffect(() => {
    if (authLoading) return;
    if (isOverrideActive) return;
    const prevUser = prevAuthUserRef.current;
    const isNewLogin = !prevUser && authUser; // transitioned from null → logged-in
    if (isNewLogin && authUser) {
      const alreadyOnboarded = hasCompletedOnboarding(authUser.id);
      if (!alreadyOnboarded) {
        // Small delay so the app finishes loading before showing onboarding
        setTimeout(() => setShowFirstTimeOnboarding(true), 300);
      }
    }
    prevAuthUserRef.current = authUser;
  }, [authUser, authLoading, isOverrideActive]);

  const openPaywall = (featureName?: string) => {
    if (isPremium) return; // Already premium — never show paywall
    if (!authUser) {
      setPaywallFeatureName(featureName);
      setPendingAction('open_paywall');
      setAuthDialogMode('register');
      setAuthDialogMessage({
        de: 'Bitte erst anmelden oder registrieren, um Premium-Inhalte freizuschalten.',
        ar: 'يرجى تسجيل الدخول أو إنشاء حساب أولاً لفتح المحتوى المميز.'
      });
      setShowAuthDialog(true);
      return;
    }
    setPaywallFeatureName(featureName);
    setShowPaywallDialog(true);
  };

  const openOnboarding = () => {
    setShowFirstTimeOnboarding(true);
  };

  useEffect(() => {
    if (!shortcutRequest) return;

    switch (shortcutRequest.id) {
      case 'onboarding':
        setShowAuthDialog(false);
        setShowPaywallDialog(false);
        setShowFirstTimeOnboarding(true);
        break;
      case 'tiktok':
        window.location.hash = '#/tiktok';
        break;
      case 'auth':
        setAuthDialogMode('register');
        setAuthDialogMessage(null);
        setShowAuthDialog(true);
        break;
      case 'paywall':
        setPaywallFeatureName('Dev-Shortcut');
        setShowPaywallDialog(true);
        break;
      case 'lernplan':
        localStorage.setItem('34a_dashboard_mode', 'lernplan');
        window.location.hash = '#/';
        break;
    }

    consumeShortcut();
  }, [shortcutRequest, consumeShortcut]);

  useEffect(() => {
    if (!isOverrideActive) return;

    setShowAuthDialog(false);
    setShowPaywallDialog(false);
    setAuthDialogMessage(null);
    setPendingAction(null);
  }, [isOverrideActive, authUser]);

  // Convert Supabase auth user to app User type
  const user: User | null = authUser ? {
    name: authUser.user_metadata?.display_name || authUser.email?.split('@')[0] || 'User',
    isLoggedIn: true,
    settings: settings
  } : null;

  // Load settings from DB when user logs in
  useEffect(() => {
    if (authUser) {
      // Use a timeout to prevent blocking if DB is slow
      const loadSettings = async () => {
        try {
          const profile = await Promise.race([
            db.getUserProfile(authUser.id),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Profile load timeout')), 5000)
            )
          ]) as any;

          if (profile?.settings) {
            // Merge DB settings with local settings (DB takes precedence if conflict, but preserving keys)
            setSettings(prev => {
              const newSettings = { ...prev, ...profile.settings };

              // Also sync back to local storage to keep it fresh
              setEffectiveSettings(newSettings);

              return newSettings;
            });
          } else {
            // If user has no settings in DB yet, save current local settings to DB (fire-and-forget)
            db.updateUserSettings(authUser.id, settings).catch(err =>
              console.error('Error saving settings:', err)
            );
          }
        } catch (error) {
          console.warn('Failed to load user profile, using local settings:', error);
          // Continue with local settings - no blocking
        }
      };

      loadSettings();
    } else {
      // Clear pending action if user logs out or is not logged in
      setPendingAction(null);
    }
  }, [authUser]);

  // Handle pending actions after login
  useEffect(() => {
    if (authUser && pendingAction === 'open_paywall') {
      // Small delay to ensure UI is ready
      setTimeout(() => {
        setShowPaywallDialog(true);
        setPendingAction(null);
      }, 500);
    }
  }, [authUser, pendingAction]);

  const updateSettings = async (newSettings: Partial<UserSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);

    // ALWAYS save to localStorage (serves as cache/offline fallback)
    setEffectiveSettings(updated);

    // If logged in, ALSO save to DB
    if (authUser) {
      try {
        await db.updateUserSettings(authUser.id, updated);
      } catch (error) {
        console.error('Error updating user settings:', error);
      }
    }
  };

  // Load language from localStorage
  useEffect(() => {
    setLanguage(getEffectiveLanguage());
  }, []);

  // Save language to localStorage
  useEffect(() => {
    setEffectiveLanguage(language);
  }, [language]);

  // Load toggle setting (Legacy support removed/merged)
  // useEffect(() => {
  //   const storedToggle = localStorage.getItem('34a_show_lang_toggle');
  //   if (storedToggle) setShowLanguageToggle(storedToggle === 'true');
  // }, []);

  // Save toggle setting (Legacy support removed/merged)
  // useEffect(() => {
  //   localStorage.setItem('34a_show_lang_toggle', String(showLanguageToggle));
  // }, [showLanguageToggle]);

  // Load progress based on auth state
  useEffect(() => {
    if (authLoading) return;

    if (authUser) {
      // Owner-Emails → als interner Nutzer markieren (aus Analytics herausfiltern)
      const OWNER_EMAILS = [
        'm.almajzoub1@gmail.com',
        '34a.master@gmail.com',
        'mofx99@gmail.com',
        'xxjjj08@gmail.com',
        'm7md0majzoup@gmail.com',
        'tiktokfitness75@gmail.com',
      ];
      const isOwner = OWNER_EMAILS.includes(authUser.email ?? '');

      // Identify user in PostHog
      identifyUser(authUser.id, {
        email: authUser.email,
        created_at: authUser.created_at,
        is_premium: isPremium,
        ...(isOwner && { is_internal: true, is_owner: true }),
      });
      trackEvent('user_logged_in', { method: 'session_restore' });

      // Load from Supabase for logged-in users
      loadUserProgress();
    } else {
      // Load from localStorage for guests
      loadGuestProgress();
    }
  }, [authUser, authLoading]);

  const loadUserProgress = async () => {
    if (!authUser) return;

    try {
      const [userProgress, userBookmarks, userCompletedLessons, userFlashcardProgress] = await Promise.all([
        db.getUserProgress(authUser.id),
        db.getUserBookmarks(authUser.id),
        db.getCompletedLessons(authUser.id),
        db.getUserFlashcardProgress(authUser.id)
      ]);

      const completedLessonsMap = (userCompletedLessons || []).reduce((acc: Record<string, boolean>, id: string) => {
        acc[id] = true;
        return acc;
      }, {});

      setProgress({
        answeredQuestions: userProgress,
        bookmarks: userBookmarks,
        completedLessons: completedLessonsMap,
        flashcardProgress: userFlashcardProgress
      });
    } catch (error) {
      console.error('Error loading user progress:', error);
    }
  };

  const loadGuestProgress = () => {
    const guestProgress = guestStorage.getProgress();
    const guestBookmarks = guestStorage.getBookmarks();
    const guestCompletedLessons = guestStorage.getCompletedLessons();
    const guestFlashcardProgress = JSON.parse(localStorage.getItem('guest_flashcard_progress') || '{}');

    setProgress({
      answeredQuestions: guestProgress,
      bookmarks: guestBookmarks,
      completedLessons: guestCompletedLessons,
      flashcardProgress: guestFlashcardProgress
    });
  };

  const toggleLanguage = () => {
    const newLang = language === AppLanguage.DE ? AppLanguage.DE_AR : AppLanguage.DE;
    trackEvent('language_toggled', {
      from_language: language,
      to_language: newLang
    });
    setLanguage(newLang);
  };


  const logout = async () => {
    try {
      trackEvent('user_logged_out');
      resetUser();
      await signOut();
      loadGuestProgress(); // Load guest data after logout
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const answerQuestion = async (questionId: string, isCorrect: boolean) => {
    const nextAnsweredQuestions = {
      ...progress.answeredQuestions,
      [questionId]: isCorrect,
    };

    // Optimistic update: Update UI immediately
    setProgress(prev => ({
      ...prev,
      answeredQuestions: nextAnsweredQuestions
    }));

    // Track analytics event
    trackEvent('question_answered', {
      question_id: questionId,
      is_correct: isCorrect
    });

    // Track order of answered questions (for both logged-in and guest users)
    const answeredOrder = JSON.parse(localStorage.getItem('answered_order') || '[]');
    if (!answeredOrder.includes(questionId)) {
      answeredOrder.push(questionId);
      localStorage.setItem('answered_order', JSON.stringify(answeredOrder));
    }

    if (authUser) {
      // Save to Supabase for logged-in users
      try {
        await db.saveProgress(authUser.id, questionId, isCorrect);
      } catch (error) {
        console.error('Error saving progress:', error);
        // In a real app, we might want to revert the optimistic update here on error
      }
    } else {
      // Save to localStorage for guests
      guestStorage.saveProgress(questionId, isCorrect);
    }

    const currentQuestion = questions.find(question => question.id === questionId);
    if (currentQuestion?.lessonId && isQuestionBasedLesson(currentQuestion.lessonId, questions)) {
      const lessonProgress = getLessonQuestionProgress(currentQuestion.lessonId, questions, {
        ...progress,
        answeredQuestions: nextAnsweredQuestions,
      });

      if (lessonProgress.allAnswered) {
        try {
          await setLessonCompletion(currentQuestion.lessonId, true);
        } catch (error) {
          console.error('Error syncing lesson completion:', error);
        }
      }
    }
  };

  const answerFlashcard = async (flashcardId: string, known: boolean) => {
    console.log('[answerFlashcard] Called with:', { flashcardId, known, authUser: !!authUser });

    // Optimistic update
    setProgress(prev => ({
      ...prev,
      flashcardProgress: {
        ...prev.flashcardProgress,
        [flashcardId]: known
      }
    }));

    if (authUser) {
      try {
        console.log('[answerFlashcard] Saving to database...');
        const { data, error } = await supabase
          .from('user_flashcard_progress')
          .upsert({
            user_id: authUser.id,
            flashcard_id: flashcardId,
            known: known,
            last_seen_at: new Date().toISOString()
          }, { onConflict: 'user_id,flashcard_id' });

        if (error) {
          console.error('[answerFlashcard] Database error:', error);
          throw error;
        }
        console.log('[answerFlashcard] Successfully saved to database', data);
      } catch (error) {
        console.error('Error saving flashcard progress:', error);
      }
    } else {
      console.log('[answerFlashcard] Saving to localStorage (guest mode)');
      const guestFlashProgress = JSON.parse(localStorage.getItem('guest_flashcard_progress') || '{}');
      guestFlashProgress[flashcardId] = known;
      localStorage.setItem('guest_flashcard_progress', JSON.stringify(guestFlashProgress));
      console.log('[answerFlashcard] Saved to localStorage:', guestFlashProgress);
    }

    // Track analytics event
    trackEvent('flashcard_rated', {
      flashcard_id: flashcardId,
      known: known
    });
  };

  const toggleBookmark = async (questionId: string) => {
    const isCurrentlyBookmarked = progress.bookmarks.includes(questionId);

    // Track analytics event
    trackEvent('bookmark_toggled', {
      question_id: questionId,
      action: isCurrentlyBookmarked ? 'remove' : 'add'
    });

    if (authUser) {
      // Toggle in Supabase for logged-in users
      try {
        await db.toggleBookmark(authUser.id, questionId);
        const updatedBookmarks = await db.getUserBookmarks(authUser.id);
        setProgress(prev => ({
          ...prev,
          bookmarks: updatedBookmarks
        }));
      } catch (error) {
        console.error('Error toggling bookmark:', error);
      }
    } else {
      // Toggle in localStorage for guests
      guestStorage.toggleBookmark(questionId);
      setProgress(prev => {
        const isBookmarked = prev.bookmarks.includes(questionId);
        return {
          ...prev,
          bookmarks: isBookmarked
            ? prev.bookmarks.filter(id => id !== questionId)
            : [...prev.bookmarks, questionId]
        };
      });
    }
  };

  const setLessonCompletion = async (lessonId: string, completed: boolean) => {
    const isCurrentlyCompleted = progress.completedLessons[lessonId] === true;
    if (isCurrentlyCompleted === completed) return;

    setProgress(prev => ({
      ...prev,
      completedLessons: {
        ...prev.completedLessons,
        [lessonId]: completed,
      }
    }));

    trackEvent('lesson_completion_toggled', {
      lesson_id: lessonId,
      completed,
    });

    try {
      if (authUser) {
        await db.setLessonCompletion(authUser.id, lessonId, completed);
      } else {
        guestStorage.setLessonCompletion(lessonId, completed);
      }
    } catch (error) {
      console.error('Error setting lesson completion:', error);
      setProgress(prev => ({
        ...prev,
        completedLessons: {
          ...prev.completedLessons,
          [lessonId]: isCurrentlyCompleted,
        }
      }));
      throw error;
    }
  };

  const toggleLessonCompletion = async (lessonId: string) => {
    await setLessonCompletion(lessonId, !(progress.completedLessons[lessonId] === true));
  };

  // Show splash screen while auth or data is loading
  const [showSlowLoadingMessage, setShowSlowLoadingMessage] = useState(false);
  const { error: dataError } = useDataCache();

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (authLoading || dataLoading) {
      // If loading takes more than 5 seconds (reduced from 8), show slow loading message
      timer = setTimeout(() => {
        setShowSlowLoadingMessage(true);
      }, 5000);
    } else {
      setShowSlowLoadingMessage(false);
    }
    return () => clearTimeout(timer);
  }, [authLoading, dataLoading]);

  // Determine detailed status message
  const getLoadingStatus = () => {
    if (dataError) return `Fehler: ${dataError}`;
    if (showSlowLoadingMessage) {
      if (authLoading) return 'Warte auf Benutzer-Authentifizierung...';
      if (dataLoading) return 'Warte auf Datenbank-Verbindung...';
      return 'Verbindung wird hergestellt...';
    }
    return authLoading ? 'Benutzer wird angemeldet...' : 'Daten werden geladen...';
  };

  if (authLoading || dataLoading || dataError) {
    // Determine dynamic status message
    let statusMessage = 'Lade Anwendung...';
    if (dataError) statusMessage = 'Fehler aufgetreten';
    else if (authLoading) statusMessage = 'Authentifiziere...';
    else if (dataLoading) statusMessage = loadingStatus;

    if (dataError) {
      return (
        <SplashScreen
          showSlowLoadingMessage={!!dataError}
          onRetry={() => {
            // Force full reload if there was a data error (clear cache to be safe)
            window.location.reload();
          }}
          detailMessage={getLoadingStatus()}
          statusMessage={statusMessage}
        />
      );
    }

    // For normal loading, show Skeleton instead of Splash Screen
    return <DashboardSkeleton />;
  }

  // Show first-time onboarding BEFORE anything else
  if (showFirstTimeOnboarding) {
    return (
      <FirstTimeOnboarding
        userName={user?.name || 'Gast'}
        onComplete={async (data) => {
          // Handle Exam Date
          if (data.examDate) {
            setEffectiveExamDate(data.examDate);
            // We only save to local storage for now without an explicit user row update in Supabase
          }

          // Handle Language
          if (data.language) {
            setLanguage(data.language === 'DE_AR' ? AppLanguage.DE_AR : AppLanguage.DE);
            setEffectiveLanguage(data.language === 'DE_AR' ? AppLanguage.DE_AR : AppLanguage.DE);
          }

          // Handle Newsletter
          if (data.newsletter && authUser?.email) {
            try {
              await db.addToWaitlist(authUser.email);
            } catch (err) {
              console.error('Error adding to newsletter:', err);
            }
          }

          // Mark onboarding completed
          if (authUser) {
            markOnboardingCompleted(authUser.id);
          }

          // Track onboarding completion
          trackEvent('onboarding_completed', {
            has_exam_date: !!data.examDate,
            language: data.language,
            newsletter_opted_in: data.newsletter,
            days_until_exam: data.examDate
              ? Math.ceil((new Date(data.examDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
              : null,
          });

          setShowFirstTimeOnboarding(false);
        }}
      />
    );
  }

  return (
    <ErrorBoundary>
    <AppContext.Provider value={{
        user, settings, updateSettings, language, progress, toggleLanguage, logout, answerQuestion, answerFlashcard, toggleBookmark, toggleLessonCompletion, setLessonCompletion, showLanguageToggle: settings.showLanguageToggle ?? true, setShowLanguageToggle: (show: boolean) => updateSettings({ showLanguageToggle: show }), hideBottomNav, setHideBottomNav, showAuthDialog, showPaywallDialog, showFirstTimeOnboarding, isPremium, isSubscriptionLoading: subscriptionLoading, openPaywall, openOnboarding,
        openAuthDialog: (mode = 'register', message) => {
          setAuthDialogMode(mode);
          setAuthDialogMessage(message || null);
          setShowAuthDialog(true);
        }
      }}>
        <HashRouter>
          <ScrollToTop />
          <div className="min-h-screen bg-[#F2F4F6] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300">
            {/* Mobile Header - hidden on desktop when sidebar is shown */}


            {/* Desktop Layout with Sidebar */}
            <DesktopLayout>
              <div className="no-scrollbar pb-28 lg:pb-8 lg:pt-6">
                <Suspense fallback={<SplashScreen />}>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/learn" element={<><ModuleList /></>} />
                    <Route path="/learn/:moduleId" element={<ModuleDetail />} />
                    <Route path="/learn/:moduleId/lesson/:lessonId" element={<LessonView />} />
                    <Route path="/learn/:moduleId/lesson/:lessonId/quiz" element={<LessonQuiz />} />
                    <Route path="/practice" element={<PracticeSelection />} />
                    <Route path="/practice/:moduleId" element={<ModuleQuestionsList />} />
                    <Route path="/quiz" element={<QuestionView />} />
                    <Route path="/bookmarks" element={<BookmarkList />} />
                    <Route path="/wrong-answers" element={<WrongAnswersList />} />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/exam" element={<ExamSelection />} />
                    <Route path="/exam/intro" element={<ExamIntro />} />
                    <Route path="/exam/mini-intro" element={<MiniExamIntro />} />
                    <Route path="/mini-exam" element={<MiniExam />} />
                    <Route path="/written-exam" element={<WrittenExam />} />
                    <Route path="/written-exam/results/:sessionId" element={<WrittenExamResults />} />
                    <Route path="/statistics" element={<Statistics />} />
                    <Route path="/lernplan" element={<Navigate to="/" replace />} />

                    <Route path="/flashcards" element={<FlashcardSelection />} />
                    <Route path="/flashcards/:moduleId" element={<FlashcardList />} />
                    <Route path="/flashcards/:moduleId/play" element={<FlashcardView />} />

                    <Route path="/email-confirmation" element={<EmailConfirmation />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/auth/callback" element={<AuthCallback />} />
                    <Route path="/impressum" element={<Impressum />} />
                    <Route path="/datenschutz" element={<Datenschutz />} />
                    <Route path="/agb" element={<AGB />} />
                    <Route path="/widerrufsbelehrung" element={<Widerrufsbelehrung />} />
                    <Route path="/admin" element={<AdminGuard><AdminDashboard /></AdminGuard>} />
                    <Route path="/admin/written-exam" element={<AdminGuard><AdminWrittenExamBrowser /></AdminGuard>} />
                    <Route path="/admin/written-exam/:topic" element={<AdminGuard><AdminWrittenExamQuestionList /></AdminGuard>} />
                    <Route path="/admin/written-exam/:topic/question" element={<AdminGuard><AdminWrittenExamQuiz /></AdminGuard>} />
                    <Route path="/tiktok" element={<TikTokOnboarding />} />
                    <Route path="*" element={<Dashboard />} />
                  </Routes>
                </Suspense>
              </div>
            </DesktopLayout>

            {/* Mobile Bottom Navigation removed - language toggle is now in page headers */}

            {/* Global Auth Dialog */}
            {showAuthDialog && (
              <AuthDialog
                onClose={() => {
                  setShowAuthDialog(false);
                  setAuthDialogMessage(null);
                }}
                initialMode={authDialogMode}
                message={authDialogMessage}
              />
            )}

            {/* Global Paywall Dialog */}
            {showPaywallDialog && (
              <PaywallDialog
                onClose={() => {
                  setShowPaywallDialog(false);
                }}
                featureName={paywallFeatureName}
              />
            )}

            {/* Cookie Consent Banner */}
            <TransitionAccessNotice variant="controller" />
            <CookieConsent />
            <LocalDevPanel />
          </div>
        </HashRouter>
      </AppContext.Provider>
    </ErrorBoundary>
  );
}

// --- Shared Components ---

// Scroll to top on route change
function ScrollToTop() {
  const location = useLocation();

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useLayoutEffect(() => {
    const resetScroll = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;

      const allElements = document.querySelectorAll('*');
      allElements.forEach((el) => {
        if (el.scrollTop > 0 || el.scrollLeft > 0) {
          el.scrollTop = 0;
          el.scrollLeft = 0;
        }
      });
    };

    resetScroll();
    requestAnimationFrame(() => {
      resetScroll();
      setTimeout(resetScroll, 0);
    });
  }, [location.pathname]);

  return null;
}

// --- Shared Components ---

// ... (imports)


// BottomNavigation removed - language toggle is now built into page headers
// Wrap AppContent with AuthProvider, SubscriptionProvider (must be before DataCacheProvider), and DataCacheProvider
export default function App() {
  return (
    <ErrorBoundary>
      <PostHogProvider>
        <DevPanelProvider>
          <AuthProvider>
            <ToastProvider>
              <SubscriptionProvider>
                <DataCacheProvider>
                  <AppContent />
                </DataCacheProvider>
              </SubscriptionProvider>
            </ToastProvider>
          </AuthProvider>
        </DevPanelProvider>
      </PostHogProvider>
    </ErrorBoundary>
  );
}
