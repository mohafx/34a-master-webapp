import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../App';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { XCircle, RotateCcw, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import * as Icons from 'lucide-react';
import { Question } from '../../types';

interface WrongQuestion extends Question {
  wrongCount: number;
  moduleTitleDE: string;
  moduleTitleAR: string;
}

interface GroupedQuestions {
  moduleId: string;
  moduleTitleDE: string;
  moduleTitleAR: string;
  moduleIcon: string;
  questions: WrongQuestion[];
}

export default function WrongAnswersList() {
  const navigate = useNavigate();
  const { language, progress } = useApp();
  const { user } = useAuth();
  const [groupedQuestions, setGroupedQuestions] = useState<GroupedQuestions[]>([]);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(() => {
    // Load from localStorage OR URL params
    const searchParams = new URLSearchParams(window.location.hash.split('?')[1]);
    const expandId = searchParams.get('expandModule');

    if (expandId) {
      return new Set([expandId]);
    }

    const saved = localStorage.getItem('wrongAnswers_expandedModules');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Update local storage when expanded modules change, but don't overwrite with URL param only if user interacts? 
  // Actually the current toggleModule saves to local storage. 
  // We should probably just use the URL param to seed the initial state, which we did above.

  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev => {
      const newSet = new Set(prev);
      if (newSet.has(moduleId)) {
        newSet.delete(moduleId);
      } else {
        newSet.add(moduleId);
      }
      // Save to localStorage
      localStorage.setItem('wrongAnswers_expandedModules', JSON.stringify([...newSet]));
      return newSet;
    });
  };

  useEffect(() => {
    async function fetchWrongQuestions() {
      try {
        // Get all wrong question IDs from progress
        const wrongQuestionIds = Object.entries(progress.answeredQuestions)
          .filter(([_, isCorrect]) => isCorrect === false)
          .map(([id]) => id);

        if (wrongQuestionIds.length === 0) {
          setGroupedQuestions([]);
          setTotalCount(0);
          setLoading(false);
          return;
        }

        // Fetch question details
        const { data: questionsData, error } = await supabase
          .from('questions')
          .select('*, modules(id, title_de, title_ar, icon, order_index)')
          .in('id', wrongQuestionIds)
          .order('order_index');

        if (error) throw error;

        // For logged-in users, fetch wrong count from database
        let wrongCounts: Record<string, number> = {};

        if (user) {
          const { data: progressData } = await supabase
            .from('user_progress')
            .select('question_id, wrong_count')
            .eq('user_id', user.id)
            .in('question_id', wrongQuestionIds);

          if (progressData) {
            progressData.forEach((p: any) => {
              wrongCounts[p.question_id] = p.wrong_count || 1;
            });
          }
        } else {
          // For guests, use localStorage
          const guestWrongCounts = JSON.parse(localStorage.getItem('guest_wrong_counts') || '{}');
          wrongCounts = guestWrongCounts;
        }

        // Build module icon map
        const moduleIcons: Record<string, string> = {};
        questionsData?.forEach((q: any) => {
          if (q.modules?.icon) {
            moduleIcons[q.module_id] = q.modules.icon;
          }
        });

        const mappedQuestions: WrongQuestion[] = (questionsData || []).map((q: any) => ({
          id: q.id,
          moduleId: q.module_id,
          textDE: q.text_de,
          textAR: q.text_ar,
          type: q.type,
          explanationDE: q.explanation_de,
          explanationAR: q.explanation_ar,
          answers: [],
          moduleTitleDE: q.modules?.title_de || '',
          moduleTitleAR: q.modules?.title_ar || '',
          wrongCount: wrongCounts[q.id] || 1
        }));

        // Group by module
        const grouped: Record<string, GroupedQuestions> = {};
        mappedQuestions.forEach(q => {
          if (!grouped[q.moduleId]) {
            grouped[q.moduleId] = {
              moduleId: q.moduleId,
              moduleTitleDE: q.moduleTitleDE,
              moduleTitleAR: q.moduleTitleAR,
              moduleIcon: moduleIcons[q.moduleId] || 'HelpCircle',
              questions: []
            };
          }
          grouped[q.moduleId].questions.push(q);
        });

        // Sort questions within each group by wrong count
        Object.values(grouped).forEach(group => {
          group.questions.sort((a, b) => b.wrongCount - a.wrongCount);
        });

        const groupedArray = Object.values(grouped);
        setGroupedQuestions(groupedArray);
        setTotalCount(mappedQuestions.length);
      } catch (error) {
        console.error('Error fetching wrong questions:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchWrongQuestions();
  }, [progress, user]);

  // Scroll to expanded module
  const moduleRefs = React.useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!loading && groupedQuestions.length > 0) {
      // Check for expandModule param
      const searchParams = new URLSearchParams(window.location.hash.split('?')[1]);
      const expandId = searchParams.get('expandModule');

      if (expandId && moduleRefs.current[expandId]) {
        // Slight delay to ensure render is complete and expansion animation started
        setTimeout(() => {
          moduleRefs.current[expandId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    }
  }, [loading, groupedQuestions]);

  if (loading) {
    return <div className="pt-8 text-center text-slate-500 dark:text-slate-400">Lade Fragen...</div>;
  }

  return (
    <div className="pt-4 px-4 pb-32">
      <div className="mb-6">
        <p className="text-slate-600 dark:text-slate-400 mt-2 text-sm">
          {totalCount} {totalCount === 1 ? 'Frage' : 'Fragen'} zum Wiederholen
        </p>
      </div>

      {totalCount === 0 ? (
        <div className="bg-white dark:bg-slate-850 rounded-[24px] p-8 text-center border border-slate-100 dark:border-slate-800">
          <div className="w-16 h-16 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle size={32} className="text-green-500" />
          </div>
          <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-2">Keine falschen Antworten!</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Du hast alle Fragen richtig beantwortet oder noch keine Fragen beantwortet.
          </p>
          {language === 'DE_AR' && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2" dir="rtl">
              لم تجب على أي سؤال بشكل خاطئ حتى الآن
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {groupedQuestions.map((group) => {
            const isExpanded = expandedModules.has(group.moduleId);
            // @ts-ignore
            const IconComponent = Icons[group.moduleIcon] || HelpCircle;

            return (
              <div
                key={group.moduleId}
                className="bg-white dark:bg-slate-850 rounded-[20px] border border-slate-100 dark:border-slate-800 overflow-hidden"
                ref={el => { moduleRefs.current[group.moduleId] = el; }}
              >
                {/* Module Header - Collapsible */}
                <button
                  onClick={() => toggleModule(group.moduleId)}
                  className="w-full p-4 flex items-center justify-between bg-red-50/50 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center">
                      <IconComponent size={20} className="text-slate-600 dark:text-slate-400" strokeWidth={1.5} />
                    </div>
                    <div className="text-left flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">{group.moduleTitleDE}</h3>
                        <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded-full">
                          {group.questions.length}
                        </span>
                      </div>
                      {language === 'DE_AR' && (
                        <p className="text-[10px] text-slate-500 dark:text-slate-400" dir="rtl">{group.moduleTitleAR}</p>
                      )}
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp size={20} className="text-slate-400" />
                  ) : (
                    <ChevronDown size={20} className="text-slate-400" />
                  )}
                </button>

                {/* Questions List - Expandable */}
                {isExpanded && (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {group.questions.map((q) => (
                      <button
                        key={q.id}
                        onClick={() => {
                          // Get all wrong question IDs from this module
                          const wrongIds = group.questions.map(wq => wq.id).join(',');
                          navigate(`/quiz?mode=module-wrong&wrongIds=${wrongIds}&module=${q.moduleId}`);
                        }}
                        className="w-full p-4 text-left flex items-start gap-3 transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 active:scale-[0.99]"
                      >
                        <div className="mt-0.5 flex-shrink-0">
                          <div className="w-7 h-7 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                            <span className="text-[10px] font-bold text-red-600 dark:text-red-400">{q.wrongCount}x</span>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white leading-snug line-clamp-2">{q.textDE}</p>
                          {language === 'DE_AR' && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 text-right leading-snug line-clamp-2" dir="rtl">{q.textAR}</p>
                          )}
                        </div>
                        <RotateCcw size={16} className="text-red-400 dark:text-red-500 flex-shrink-0 mt-1" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

