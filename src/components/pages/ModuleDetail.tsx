import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../../App';
import { useDataCache } from '../../contexts/DataCacheContext';
import { usePostHog } from '../../contexts/PostHogProvider';

import { ArrowLeft, BookOpen, ChevronRight, PieChart, Search, X, CheckCircle2, Languages, Lock, Crown } from 'lucide-react';
import { Card } from '../ui/Card';
import * as Icons from 'lucide-react';
import { abbreviateModuleTitle } from '../../utils/moduleUtils';
import { getCompletedLessonCountForModule, isLessonCompleted } from '../../services/lessonFlow';

// Skeleton component for loading states
const LessonSkeleton = () => (
  <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-between animate-pulse">
    <div className="flex items-center gap-4">
      <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700" />
      <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded" />
    </div>
    <div className="w-5 h-5 bg-slate-200 dark:bg-slate-700 rounded" />
  </div>
);

export default function ModuleDetail() {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const { language, toggleLanguage, showLanguageToggle, isPremium, openPaywall, progress: appProgress } = useApp();
  const { getModuleById, modules, questions, loading: cacheLoading } = useDataCache();
  const { trackEvent } = usePostHog();

  // Use cached lessons directly - they contain all metadata needed for the list (id, titles, order)
  // Content is only fetched when opening a specific lesson
  const module = moduleId ? getModuleById(moduleId) : undefined;
  const lessons = module?.lessons || [];
  const isLoading = cacheLoading || !module;

  // Track module viewed
  useEffect(() => {
    if (module && moduleId) {
      trackEvent('module_viewed', {
        module_id: moduleId,
        module_name: module.titleDE
      });
    }
  }, [module, moduleId]);

  // Smart Sticky Button Logic
  const [showFloatingButton, setShowFloatingButton] = useState(false);
  const lastScrollY = React.useRef(0);
  const ticking = React.useRef(false);

  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!ticking.current) {
        window.requestAnimationFrame(() => {
          const currentScrollY = target.scrollTop || window.scrollY;

          if (currentScrollY < lastScrollY.current && currentScrollY > 100) {
            setShowFloatingButton(true);
          } else if (currentScrollY > lastScrollY.current || currentScrollY <= 100) {
            setShowFloatingButton(false);
          }

          lastScrollY.current = currentScrollY;
          ticking.current = false;
        });
        ticking.current = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { capture: true });
    return () => window.removeEventListener('scroll', handleScroll, { capture: true });
  }, []);

  // Calculate Next Module
  const currentModuleIndex = modules.findIndex(m => m.id === moduleId);
  const nextModule = currentModuleIndex !== -1 && currentModuleIndex < modules.length - 1
    ? modules[currentModuleIndex + 1]
    : undefined;

  // No early return for !module to allow header to show immediately
  const m: any = module || {};

  // Calculate progress based on actual completion data
  const answeredCount = moduleId
    ? getCompletedLessonCountForModule(moduleId, modules, questions, appProgress)
    : 0;
  const completionProgress = lessons.length > 0 ? (answeredCount / lessons.length) * 100 : 0;

  return (
    <div className="max-w-4xl mx-auto pt-4 px-4 pb-32 lg:pt-0 lg:pb-8">
      {/* Floating Smart Back Button */}
      <div
        className={`fixed top-4 left-4 z-50 transition-all duration-300 transform ${showFloatingButton ? 'translate-y-0 opacity-100' : '-translate-y-16 opacity-0 pointer-events-none'}`}
      >
        <button
          onClick={() => navigate('/learn')}
          className="w-14 h-14 rounded-full bg-white dark:bg-slate-800 shadow-lg border border-slate-100 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <ArrowLeft size={28} strokeWidth={2.5} />
        </button>
      </div>
      {/* Unified Header & Controls Card */}
      <Card className="mb-8 shadow-card border-none" padding="md">
        <div className="flex flex-col">
          <div className="flex items-center justify-between pt-2 pb-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/learn')}
                className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-500 dark:text-slate-400"
              >
                <ArrowLeft size={24} />
              </button>

              <div className="flex-1 min-w-0">
                {!module ? (
                  <div className="h-6 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-1"></div>
                ) : (
                  <>
                    <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-tight">
                      {abbreviateModuleTitle(m.title_de || m.titleDE)}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                      {language === 'DE_AR' ? (m.title_ar || m.titleAR) : 'Modul Übersicht'}
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {showLanguageToggle && (
                <button
                  onClick={toggleLanguage}
                  className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${language === 'DE_AR'
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                >
                  <Languages size={20} />
                </button>
              )}

            </div>
          </div>

        </div>

        <div className="mb-2 max-w-[90%]">
              <div className="flex justify-between items-center mb-1.5">
                {!module ? (
                  <div className="h-3 w-10 bg-slate-100 dark:bg-slate-800 rounded animate-pulse ml-auto"></div>
                ) : (
                  <span className="font-bold text-blue-600 dark:text-blue-400 text-xs ml-auto">{Math.round(completionProgress)}%</span>
                )}
              </div>
              <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-1.5">
                <div
                  className={`h-full bg-blue-500 transition-all duration-500 ${!module ? 'animate-pulse bg-slate-200 dark:bg-slate-600' : ''}`}
                  style={{ width: `${!module ? 0 : completionProgress}%` }}
                />
              </div>
              {!module ? (
                <div className="h-2 w-32 bg-slate-100 dark:bg-slate-800 rounded animate-pulse"></div>
              ) : (
                <>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    {answeredCount} von {lessons.length} Lektionen abgeschlossen
                  </p>
                  {language === 'DE_AR' && <p className="text-[9px] text-slate-400 text-left mt-0.5" dir="rtl">تم إكمال {answeredCount} من أصل {lessons.length} درس</p>}
                </>
              )}
        </div>
      </Card>

      {/* Lesson List */}
      <Card className="mb-8 overflow-hidden shadow-card border-none" padding="none">

        {/* Loading Skeletons */}
        {isLoading && (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            <div className="p-4 bg-white dark:bg-slate-800 animate-pulse flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700" />
                <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
              <div className="w-5 h-5 bg-slate-200 dark:bg-slate-700 rounded" />
            </div>
            <div className="p-4 bg-white dark:bg-slate-800 animate-pulse flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700" />
                <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
              <div className="w-5 h-5 bg-slate-200 dark:bg-slate-700 rounded" />
            </div>
            <div className="p-4 bg-white dark:bg-slate-800 animate-pulse flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700" />
                <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
              <div className="w-5 h-5 bg-slate-200 dark:bg-slate-700 rounded" />
            </div>
          </div>
        )}

        {/* Loaded Lessons */}
        {!isLoading && (
          <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-700/50">
            {lessons.map((lesson, index) => {
              const isComplete = isLessonCompleted(lesson.id, questions, appProgress);
              const isFirstLesson = index === 0;
              // All lessons in "Einführung und Grundlagen" module are free
              const isIntroModule = m.title_de === 'Einführung und Grundlagen' || m.titleDE === 'Einführung und Grundlagen';
              const isLocked = !isFirstLesson && !isPremium && !isIntroModule;

              return (
                <button
                  key={lesson.id}
                  onClick={() => {
                    if (isLocked) {
                      openPaywall('Premium Lektionen');
                      return;
                    }
                    navigate(`/learn/${moduleId}/lesson/${lesson.id}`);
                  }}
                  className={`w-full p-5 flex items-center justify-between group transition-all text-left relative ${isLocked
                    ? 'bg-blue-50/50 dark:bg-blue-900/10 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                    : isComplete
                      ? 'bg-emerald-50/30 dark:bg-emerald-900/10 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20'
                      : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 transition-colors ${isLocked
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-500'
                      : isComplete
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-500 group-hover:bg-blue-500/10 group-hover:text-blue-500/70 dark:group-hover:bg-blue-400/10 dark:group-hover:text-blue-400/70'
                      }`}>
                      {isLocked ? <Lock size={18} /> : isComplete ? <CheckCircle2 size={20} /> : (lesson.orderIndex || index + 1)}
                    </div>
                    <div className="text-left flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className={`font-bold text-sm leading-snug group-hover:text-primary transition-colors ${isLocked
                          ? 'text-blue-700 dark:text-blue-400'
                          : isComplete
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-slate-900 dark:text-white'
                          }`}>
                          {lesson.titleDE}
                        </h3>
                      </div>
                      {language === 'DE_AR' && lesson.titleAR && <p className="text-xs text-slate-400 text-left mt-0.5 truncate" dir="rtl">{lesson.titleAR}</p>}
                    </div>
                  </div>
                  {isLocked ? (
                    <Crown size={18} className="text-blue-500 flex-shrink-0" />
                  ) : isComplete ? (
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hidden sm:block flex-shrink-0">Abgeschlossen</span>
                  ) : (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 group-hover:text-primary group-hover:bg-blue-50 dark:group-hover:bg-slate-700 transition-all flex-shrink-0">
                      <ChevronRight size={20} strokeWidth={2.5} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && lessons.length === 0 && (
          <div className="p-8 text-center text-slate-500 bg-white dark:bg-slate-800">
            Dieses Modul hat noch keine Lektionen.
          </div>
        )}
      </Card>

      {/* Next Module Button */}
      {nextModule && !isLoading && (
        <button
          onClick={() => navigate(`/learn/${nextModule.id}`)}
          className="w-full mb-6 bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-between group hover:border-blue-500 dark:hover:border-blue-500 transition-all min-h-[60px] h-auto"
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-slate-700 flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0">
              <Icons.ArrowRight size={22} strokeWidth={2.5} />
            </div>
            <div className="text-left">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 block">
                Weiter zum nächsten Modul
              </span>
              {language === 'DE_AR' && <span className="text-[9px] text-slate-400 block text-left mb-0.5" dir="rtl">الانتقال إلى الوحدة التالية</span>}
              <h3 className="font-black text-slate-900 dark:text-white text-base group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {abbreviateModuleTitle(nextModule.titleDE)}
              </h3>
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-700 flex items-center justify-center text-slate-400 group-hover:bg-blue-500/10 group-hover:text-blue-500/70 dark:group-hover:bg-blue-400/10 dark:group-hover:text-blue-400/70 transition-all flex-shrink-0">
            <ChevronRight size={18} strokeWidth={2.5} />
          </div>
        </button>
      )}


    </div>
  );
}
