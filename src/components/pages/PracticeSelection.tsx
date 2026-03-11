import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { XCircle, Bookmark, Play, HelpCircle, Search, X, CheckCircle, Circle, ChevronDown, ArrowLeft, Pencil, BarChart3, ArrowRight, Languages, Crown, Lock } from 'lucide-react';
import { useApp } from '../../App';
import { useDataCache } from '../../contexts/DataCacheContext';
import { useAuth } from '../../contexts/AuthContext';
import { Card } from '../ui/Card';
import * as Icons from 'lucide-react';
import { abbreviateModuleTitle } from '../../utils/moduleUtils';
import { ExamConfigDialog } from './ExamConfigDialog';

export default function PracticeSelection() {
  const navigate = useNavigate();
  const { language, progress, toggleLanguage, showLanguageToggle, isPremium, openPaywall } = useApp();
  const { modules: cachedModules, questions, loading: cacheLoading } = useDataCache();
  const { user: authUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'search' | 'stats' | null>(null);
  const [showExamConfig, setShowExamConfig] = useState(false);

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

  // Calculate stats from cached data
  const modules = useMemo(() => {
    const stats: Record<string, { total: number, correct: number, answered: number }> = {};

    questions.forEach((q) => {
      if (!stats[q.moduleId]) {
        stats[q.moduleId] = { total: 0, correct: 0, answered: 0 };
      }
      stats[q.moduleId].total++;

      if (progress.answeredQuestions.hasOwnProperty(q.id)) {
        stats[q.moduleId].answered++;
        if (progress.answeredQuestions[q.id]) {
          stats[q.moduleId].correct++;
        }
      }
    });

    return cachedModules
      .filter((m) => m.titleDE !== 'Einführung und Grundlagen')
      .map((m) => ({
        ...m,
        totalQuestions: stats[m.id]?.total || 0,
        correctCount: stats[m.id]?.correct || 0,
        answeredCount: stats[m.id]?.answered || 0
      }));
  }, [cachedModules, questions, progress]);

  // Search results - filter questions by search query
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];

    const query = searchQuery.toLowerCase().trim();

    return questions.filter((q) => {
      // Search in question text
      if (q.textDE?.toLowerCase().includes(query)) return true;
      if (q.textAR?.toLowerCase().includes(query)) return true;

      // Search in answers
      if (q.answers?.some((a) =>
        a.textDE?.toLowerCase().includes(query) ||
        a.textAR?.toLowerCase().includes(query)
      )) return true;

      // Search in explanation
      if (q.explanationDE?.toLowerCase().includes(query)) return true;
      if (q.explanationAR?.toLowerCase().includes(query)) return true;

      return false;
    }).slice(0, 20); // Limit to 20 results for performance
  }, [questions, searchQuery]);

  // Calculate bookmarks and wrong answers count
  const bookmarksCount = progress.bookmarks.length;
  const wrongAnswersCount = useMemo(() => {
    // Only count questions that exist in the current dataset
    const validQuestionIds = new Set(questions.map(q => q.id));
    return Object.entries(progress.answeredQuestions)
      .filter(([id, isCorrect]) => validQuestionIds.has(id) && !isCorrect)
      .length;
  }, [progress.answeredQuestions, questions]);

  // Calculate total stats
  const totalStats = useMemo(() => {
    const total = modules.reduce((acc, m) => acc + m.totalQuestions, 0);
    const correct = modules.reduce((acc, m) => acc + m.correctCount, 0);
    const answered = modules.reduce((acc, m) => acc + (m.answeredCount || 0), 0);
    return { total, correct, answered, incorrect: answered - correct };
  }, [modules]);

  // Module Card Skeleton
  const ModuleCardSkeleton = () => (
    <div className="w-full p-4 sm:p-5 flex items-center justify-between animate-pulse">
      <div className="flex items-center gap-3.5 flex-1">
        <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl flex-shrink-0"></div>
        <div className="flex-1 min-w-0 pr-4">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4 mb-2"></div>
          <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-1/2 mb-3"></div>
          <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full w-full"></div>
        </div>
      </div>
      <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800"></div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto pt-4 px-4 pb-32 lg:pt-0 lg:pb-8">
      <Card className="mb-8 shadow-card border-none" padding="md">
        {/* Unified Header Style */}
        <div className="flex flex-col">
          {/* Top Row: Back, Title, Language */}
          <div className="flex items-center justify-between pt-2 pb-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/')}
                className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-500 dark:text-slate-400"
              >
                <ArrowLeft size={24} />
              </button>
              <div>
                <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-tight">
                  Schriftliche Prüfung
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                  Fragenkatalog
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {showLanguageToggle && (
                <button
                  onClick={toggleLanguage}
                  className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${language === 'DE_AR'
                    ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                >
                  <Languages size={20} />
                </button>
              )}

            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2.5 pt-2">
            <button
              onClick={() => setActiveTab(activeTab === 'search' ? null : 'search')}
              className={`flex-1 relative overflow-hidden py-3 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 group ${activeTab === 'search'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                }`}
            >
              <Search size={18} strokeWidth={2.5} />
              <span className="font-bold text-sm">Suchen</span>
            </button>

            <button
              onClick={() => navigate('/bookmarks')}
              className={`flex-1 relative overflow-hidden py-3 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 group bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30`}
            >
              <div className="relative flex items-center justify-center">
                <Bookmark size={18} strokeWidth={2.5} />
                {bookmarksCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse border-2 border-amber-50 dark:border-slate-800" />
                )}
              </div>
              <span className="font-bold text-sm">Gemerkt</span>
            </button>
          </div>
        </div>
      </Card>

      {/* Expandable Content Area */}
      <div className={`transition-all duration-500 ease-in-out overflow-hidden ${activeTab ? 'mb-8 opacity-100' : 'h-0 opacity-0 mb-0'}`}>
        <Card className="shadow-card border-none animate-in fade-in slide-in-from-top-4 duration-300" padding="lg">

          {/* Search Content */}
          {activeTab === 'search' && (
            <div>
              <div className="relative mb-6">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <Search size={20} className="text-slate-400" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Fragen durchsuchen..."
                  autoFocus
                  className="w-full pl-12 pr-12 py-4 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-100 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-medium"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-4 flex items-center"
                  >
                    <X size={20} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
                  </button>
                )}
              </div>

              {searchQuery.trim() ? (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      {searchResults.length} {searchResults.length === 1 ? 'Ergebnis' : 'Ergebnisse'} gefunden
                    </h3>
                  </div>

                  {searchResults.length > 0 ? (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                      {searchResults.map((q) => {
                        const isAnswered = progress.answeredQuestions.hasOwnProperty(q.id);
                        const isCorrect = progress.answeredQuestions[q.id] === true;

                        return (
                          <button
                            key={q.id}
                            onClick={() => navigate(`/quiz?single=${q.id}&module=${q.moduleId}`)}
                            className="w-full bg-white dark:bg-slate-850 p-4 rounded-xl border border-slate-100 dark:border-slate-800 text-left flex items-start gap-3 hover:shadow-md transition-all active:scale-[0.99]"
                          >
                            <div className="mt-0.5 flex-shrink-0">
                              {isAnswered ? (
                                isCorrect ? (
                                  <CheckCircle size={18} className="text-green-500" />
                                ) : (
                                  <XCircle size={18} className="text-red-500" />
                                )
                              ) : (
                                <Circle size={18} className="text-slate-300 dark:text-slate-600" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900 dark:text-white leading-snug line-clamp-2">
                                {q.textDE}
                              </p>
                              {language === 'DE_AR' && q.textAR && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 text-left line-clamp-1" dir="rtl">
                                  {q.textAR}
                                </p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="bg-slate-50 dark:bg-slate-850 rounded-xl p-6 text-center border border-slate-100 dark:border-slate-800">
                      <p className="text-slate-500 dark:text-slate-400 text-sm">
                        Keine Fragen gefunden für "{searchQuery}"
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400">
                  <Search size={48} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium">Tippe oben, um Fragen zu suchen</p>
                </div>
              )}
            </div>
          )}

          {/* Stats Content */}
          {activeTab === 'stats' && (
            <div>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Icons.PieChart size={24} strokeWidth={2} />
                </div>
                <div>
                  <h3 className="font-black text-xl text-slate-900 dark:text-white leading-tight">Statistik</h3>
                  <p className="text-sm text-slate-500 font-medium">Dein gesamter Lernfortschritt</p>
                </div>
              </div>

              {(() => {
                const totalQuestions = modules.reduce((acc, m) => acc + m.totalQuestions, 0);
                const totalCorrect = modules.reduce((acc, m) => acc + m.correctCount, 0);
                // @ts-ignore
                const totalAnswered = modules.reduce((acc, m) => acc + (m.answeredCount || 0), 0);
                const totalIncorrect = totalAnswered - totalCorrect;

                const correctPercentage = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0;
                const incorrectPercentage = totalQuestions > 0 ? (totalIncorrect / totalQuestions) * 100 : 0;

                return (
                  <div>
                    <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400 mb-3 font-bold">
                      <span>{totalCorrect} von {totalQuestions} richtig</span>
                      <span>{Math.round(correctPercentage)}%</span>
                    </div>
                    <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden flex mb-4">
                      <div
                        className="h-full bg-success transition-all duration-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]"
                        style={{ width: `${correctPercentage}%` }}
                      />
                      <div
                        className="h-full bg-error transition-all duration-500"
                        style={{ width: `${incorrectPercentage}%` }}
                      />
                    </div>
                    <div className="flex justify-end gap-4 text-xs font-bold text-slate-400 dark:text-slate-500 mb-4">
                      <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-success"></div>Richtig</span>
                      <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-error"></div>Falsch</span>
                      <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-200 dark:bg-slate-600"></div>Offen</span>
                    </div>

                    {/* All Statistics Button */}
                    <button
                      onClick={() => navigate('/statistics')}
                      className="w-full bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl p-3 transition-all flex items-center justify-center gap-2 group"
                    >
                      <BarChart3 className="text-slate-600 dark:text-slate-300 group-hover:text-slate-700 dark:group-hover:text-slate-200" size={18} />
                      <span className="text-slate-700 dark:text-slate-200 font-bold text-sm">
                        Alle Statistiken anzeigen
                      </span>
                      {language === 'DE_AR' && (
                        <span className="text-slate-500 dark:text-slate-400 font-bold text-xs text-right" dir="rtl">
                          عرض جميع الإحصائيات
                        </span>
                      )}
                      <ArrowRight className="text-slate-500 dark:text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 group-hover:translate-x-1 transition-all" size={16} />
                    </button>
                  </div>
                );
              })()}
            </div>
          )}
        </Card>
      </div >

      {/* Topic List - Grid on Desktop, Regular list on Mobile */}
      <div className="hidden lg:grid lg:grid-cols-2 lg:gap-4">
        {cacheLoading ? (
          [1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i} className="shadow-card border-none" padding="none">
              <ModuleCardSkeleton />
            </Card>
          ))
        ) : (
          modules.map(module => {
            // @ts-ignore
            const IconComponent = Icons[module.icon] || HelpCircle;

            // @ts-ignore
            const answeredCount = module.answeredCount || 0;
            const correctCount = module.correctCount;
            const incorrectCount = answeredCount - correctCount;

            const correctPercentage = module.totalQuestions > 0
              ? (correctCount / module.totalQuestions) * 100
              : 0;

            const incorrectPercentage = module.totalQuestions > 0
              ? (incorrectCount / module.totalQuestions) * 100
              : 0;

            return (
              <Card key={module.id} className="shadow-card border-none hover:shadow-lg transition-shadow" padding="none">
                <button
                  onClick={() => {
                    navigate(`/practice/${module.id}`);
                  }}
                  className="w-full text-left p-4 sm:p-5 flex items-center justify-between group hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors rounded-2xl"
                >
                  <div className="flex items-center gap-3.5 flex-1">
                    <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/10 group-hover:text-blue-500/60 dark:group-hover:bg-blue-400/10 dark:group-hover:text-blue-400/60 transition-all">
                      <IconComponent size={24} strokeWidth={1.5} />
                    </div>
                    <div className="text-left flex-1 min-w-0 pr-4">
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm leading-tight">{abbreviateModuleTitle(module.titleDE)}</h4>
                      {language === 'DE_AR' && <p className="text-xs text-slate-500 dark:text-slate-400 text-left mt-0.5" dir="rtl">{module.titleAR}</p>}

                      <div className="mt-2 text-left">
                        <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 mb-1 font-medium">
                          <span>{module.correctCount} / {module.totalQuestions} richtig</span>
                          <span>{Math.round(correctPercentage)}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden w-full flex">
                          <div
                            className="h-full bg-green-500 transition-all duration-500"
                            style={{ width: `${correctPercentage}%` }}
                          />
                          <div
                            className="h-full bg-red-400 transition-all duration-500"
                            style={{ width: `${incorrectPercentage}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 group-hover:text-blue-500/70 group-hover:bg-blue-500/10 dark:group-hover:text-blue-400/70 dark:group-hover:bg-blue-400/10 transition-all flex-shrink-0">
                    <Icons.ChevronRight size={20} strokeWidth={2.5} />
                  </div>
                </button>
              </Card>
            )
          })
        )}
      </div>

      {/* Mobile Topic List - Original single card layout */}
      <Card className="lg:hidden divide-y divide-slate-100 dark:divide-slate-700/50 overflow-hidden shadow-card border-none" padding="none">
        {cacheLoading ? (
          [1, 2, 3, 4, 5, 6].map(i => <ModuleCardSkeleton key={i} />)
        ) : (
          modules.map(module => {
            // @ts-ignore
            const IconComponent = Icons[module.icon] || HelpCircle;

            // @ts-ignore
            const answeredCount = module.answeredCount || 0;
            const correctCount = module.correctCount;
            const incorrectCount = answeredCount - correctCount;

            const correctPercentage = module.totalQuestions > 0
              ? (correctCount / module.totalQuestions) * 100
              : 0;

            const incorrectPercentage = module.totalQuestions > 0
              ? (incorrectCount / module.totalQuestions) * 100
              : 0;

            return (
              <button
                key={module.id}
                onClick={() => {
                  navigate(`/practice/${module.id}`);
                }}
                className="w-full text-left p-4 sm:p-5 flex items-center justify-between group hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <div className="flex items-center gap-3.5 flex-1">
                  <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/10 group-hover:text-blue-500/60 dark:group-hover:bg-blue-400/10 dark:group-hover:text-blue-400/60 transition-all">
                    <IconComponent size={24} strokeWidth={1.5} />
                  </div>
                  <div className="text-left flex-1 min-w-0 pr-4">
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm leading-tight">{abbreviateModuleTitle(module.titleDE)}</h4>
                    {language === 'DE_AR' && <p className="text-xs text-slate-500 dark:text-slate-400 text-left mt-0.5" dir="rtl">{module.titleAR}</p>}

                    <div className="mt-2 text-left">
                      <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 mb-1 font-medium">
                        <span>{module.correctCount} / {module.totalQuestions} richtig</span>
                        <span>{Math.round(correctPercentage)}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden w-full flex">
                        <div
                          className="h-full bg-green-500 transition-all duration-500"
                          style={{ width: `${correctPercentage}%` }}
                        />
                        <div
                          className="h-full bg-red-400 transition-all duration-500"
                          style={{ width: `${incorrectPercentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 group-hover:text-blue-500/70 group-hover:bg-blue-500/10 dark:group-hover:text-blue-400/70 dark:group-hover:bg-blue-400/10 transition-all flex-shrink-0">
                  <Icons.ChevronRight size={20} strokeWidth={2.5} />
                </div>
              </button>
            )
          })
        )}
      </Card>
    </div >
  );
}