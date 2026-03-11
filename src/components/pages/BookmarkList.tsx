import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../App';
import { useDataCache } from '../../contexts/DataCacheContext';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Bookmark, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import { Question, QuestionType } from '../../types';
import { Card } from '../ui/Card';
import * as Icons from 'lucide-react';

export default function BookmarkList() {
  const { progress, user, language } = useApp();
  const { getModuleById } = useDataCache();
  const navigate = useNavigate();
  const [bookmarkedQuestions, setBookmarkedQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user?.isLoggedIn) {
      navigate('/profile');
      return;
    }

    async function fetchBookmarks() {
      if (progress.bookmarks.length === 0) {
        setBookmarkedQuestions([]);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('questions')
          .select('*')
          .in('id', progress.bookmarks);

        if (error) throw error;

        // Helper function to map flat answer columns to answers array
        const mapQuestionAnswers = (q: any) => {
          const answerLetters = ['a', 'b', 'c', 'd', 'e', 'f'];
          const correctAnswers = (q.correct_answer || '').split(',').map((s: string) => s.trim().toUpperCase());

          return answerLetters
            .map((letter, index) => {
              const textDE = q[`answer_${letter}_de`];
              if (!textDE) return null;

              return {
                id: `${q.id}-${letter.toUpperCase()}`,
                textDE: textDE,
                textAR: q[`answer_${letter}_ar`] || null,
                isCorrect: correctAnswers.includes(letter.toUpperCase())
              };
            })
            .filter(Boolean);
        };

        const mappedQuestions: Question[] = (data || []).map((q: any) => ({
          id: q.id,
          moduleId: q.module_id,
          textDE: q.text_de,
          textAR: q.text_ar,
          type: q.type as QuestionType,
          explanationDE: q.explanation_de,
          explanationAR: q.explanation_ar,
          answers: mapQuestionAnswers(q)
        }));

        setBookmarkedQuestions(mappedQuestions);

        // Auto-expand all modules by default
        const moduleIds = [...new Set(mappedQuestions.map(q => q.moduleId))];
        const expanded: Record<string, boolean> = {};
        moduleIds.forEach(id => expanded[id] = true);
        setExpandedModules(expanded);
      } catch (error) {
        console.error('Error fetching bookmarks:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchBookmarks();
  }, [progress.bookmarks, user, navigate]);

  // Group questions by module
  const questionsByModule = useMemo(() => {
    const grouped: Record<string, Question[]> = {};

    bookmarkedQuestions.forEach(q => {
      if (!grouped[q.moduleId]) {
        grouped[q.moduleId] = [];
      }
      grouped[q.moduleId].push(q);
    });

    // Sort modules by their order (get from DataCache)
    const sortedEntries = Object.entries(grouped).sort(([idA], [idB]) => {
      const moduleA = getModuleById(idA);
      const moduleB = getModuleById(idB);
      // If modules have order_index, sort by that, otherwise keep original order
      return 0; // For now, keep original order
    });

    return Object.fromEntries(sortedEntries);
  }, [bookmarkedQuestions, getModuleById]);

  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev => ({
      ...prev,
      [moduleId]: !prev[moduleId]
    }));
  };

  if (!user?.isLoggedIn) return null;

  return (
    <div className="pt-4 px-4 pb-32">
      <Card className="mb-8 shadow-card border-none" padding="lg">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate('/practice')}
            className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95 shadow-sm"
          >
            <ArrowLeft size={28} strokeWidth={2.5} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0 justify-center">
            <div className="w-8 h-8 bg-amber-100 dark:bg-amber-900/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <Bookmark size={20} className="text-amber-600 dark:text-amber-400" strokeWidth={2.5} />
            </div>
            <span className="text-lg font-black text-slate-900 dark:text-white truncate max-w-[200px] sm:max-w-md">Gemerkte Fragen</span>
          </div>
          <div className="w-12" /> {/* Spacer for centering */}
        </div>

        <div className="mb-6">
          {language === 'DE_AR' && <p className="text-lg text-slate-500 dark:text-slate-400 text-right font-bold" dir="rtl">الأسئلة المحفوظة</p>}
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {bookmarkedQuestions.length} {bookmarkedQuestions.length === 1 ? 'Frage' : 'Fragen'} gespeichert
          </p>
        </div>
      </Card>

      {loading ? (
        <div className="text-center py-16 text-slate-500 dark:text-slate-400">Lade Lesezeichen...</div>
      ) : bookmarkedQuestions.length === 0 ? (
        <Card className="text-center py-16" padding="lg">
          <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/20 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-600 dark:text-amber-400">
            <Bookmark size={32} strokeWidth={2} />
          </div>
          <p className="text-slate-900 dark:text-white font-bold text-base mb-1">Keine gemerkten Fragen</p>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Du hast noch keine Fragen markiert.</p>
          {language === 'DE_AR' && (
            <>
              <p className="text-slate-400 dark:text-slate-500 text-xs mt-2" dir="rtl">لا توجد أسئلة محفوظة</p>
              <p className="text-slate-400 dark:text-slate-500 text-xs" dir="rtl">لم تقم بحفظ أي أسئلة بعد.</p>
            </>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {Object.entries(questionsByModule).map(([moduleId, questions]) => {
            const module = getModuleById(moduleId);
            const isExpanded = expandedModules[moduleId] !== false;
            // @ts-ignore
            const IconComponent = module?.icon ? Icons[module.icon] || HelpCircle : HelpCircle;

            return (
              <Card key={moduleId} className="overflow-hidden" padding="none">
                {/* Module Header */}
                <button
                  onClick={() => toggleModule(moduleId)}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center flex-shrink-0">
                      <IconComponent size={20} className="text-slate-700 dark:text-slate-300" strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <h3 className="font-black text-sm text-slate-900 dark:text-white truncate">
                        {module?.titleDE || 'Unbekanntes Modul'}
                      </h3>
                      {language === 'DE_AR' && module?.titleAR && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 text-right mt-0.5 truncate" dir="rtl">
                          {module.titleAR}
                        </p>
                      )}
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {questions.length} {questions.length === 1 ? 'Frage' : 'Fragen'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="px-2 py-1 bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-lg text-xs font-black">
                      {questions.length}
                    </div>
                    {isExpanded ? (
                      <ChevronUp size={18} className="text-slate-400" />
                    ) : (
                      <ChevronDown size={18} className="text-slate-400" />
                    )}
                  </div>
                </button>

                {/* Questions List */}
                {isExpanded && (
                  <div className="border-t border-slate-100 dark:border-slate-800">
                    <div className="p-3 space-y-2">
                      {questions.map((q) => (
                        <button
                          key={q.id}
                          onClick={() => navigate(`/quiz?single=${q.id}&from=bookmarks&module=${moduleId}`)}
                          className="w-full bg-white dark:bg-slate-850 p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700 hover:shadow-sm transition-all text-left group"
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex-shrink-0">
                              <Bookmark size={14} className="text-amber-500 dark:text-amber-400" fill="currentColor" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900 dark:text-white leading-snug line-clamp-2 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                                {q.textDE}
                              </p>
                              {language === 'DE_AR' && q.textAR && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 text-right line-clamp-1" dir="rtl">
                                  {q.textAR}
                                </p>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}