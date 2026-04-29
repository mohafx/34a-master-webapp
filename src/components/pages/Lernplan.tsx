import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../App';
import { useAuth } from '../../contexts/AuthContext';
import { useDataCache } from '../../contexts/DataCacheContext';
import { usePostHog } from '../../contexts/PostHogProvider';
import { db } from '../../services/database';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  GraduationCap,
  HelpCircle,
  Languages,
  Lock,
  Pencil,
} from 'lucide-react';
import * as Icons from 'lucide-react';
import {
  buildLernplanSections,
  computeNodeStatusesWithModules,
  generateLernplan,
  Lernplan as StoredLernplan,
  LernplanSection,
  LernplanWithStatus,
  loadValidLernplan,
  NodeWithStatus,
} from '../../services/lernplanGenerator';

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return '0 Min.';
  return `~${minutes} Min.`;
}

export default function Lernplan({ embedded = false, active = true }: { embedded?: boolean; active?: boolean }) {
  const navigate = useNavigate();
  const { language, progress, showLanguageToggle, toggleLanguage, setHideBottomNav, user, openAuthDialog } = useApp();
  const { user: authUser } = useAuth();
  const { modules, questions } = useDataCache();
  const { trackEvent } = usePostHog();
  const showArabic = language === 'DE_AR';

  const currentNodeRef = useRef<HTMLDivElement>(null);
  const hasTrackedViewRef = useRef(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [examDate, setExamDate] = useState<string | null>(localStorage.getItem('examDate'));
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [plan, setPlan] = useState<StoredLernplan | null>(null);
  const [guestFlowStep, setGuestFlowStep] = useState<'initial' | 'selection' | 'date' | 'weeks' | 'generating' | 'summary'>('initial');
  const [guestPlan, setGuestPlan] = useState<StoredLernplan | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadPlan = async () => {
      if (!user || !authUser) {
        setPlan(null);
        return;
      }

      try {
        const activeDbPlan = await db.getActiveUserLernplan(authUser.id);
        if (!cancelled) {
          setPlan(activeDbPlan || loadValidLernplan());
        }
      } catch (error) {
        console.error('[Lernplan] Active DB Lernplan could not be loaded:', error);
        if (!cancelled) {
          setPlan(loadValidLernplan());
        }
      }
    };

    loadPlan();

    return () => {
      cancelled = true;
    };
  }, [user, authUser, examDate]);

  const lernplanData: LernplanWithStatus = useMemo(() => {
    if (!plan) {
      return {
        plan: {
          version: 1,
          generatedAt: '',
          examDate: null,
          isDated: false,
          intensity: 'undated',
          nodes: [],
        },
        nodes: [],
        currentNodeIndex: 0,
        completedCount: 0,
        totalCount: 0,
      };
    }

    return computeNodeStatusesWithModules(plan, modules, questions, progress);
  }, [plan, modules, questions, progress]);

  const sections = useMemo(() => {
    if (!plan) return [];
    return buildLernplanSections(plan, lernplanData.nodes);
  }, [plan, lernplanData.nodes]);

  useEffect(() => {
    setHideBottomNav(showDatePicker);
  }, [showDatePicker, setHideBottomNav]);

  useEffect(() => {
    setExpandedSections(previous => {
      const next: Record<string, boolean> = {};
      sections.forEach(section => {
        // Find if this specific section is newly added
        const isNew = !Object.prototype.hasOwnProperty.call(previous, section.id);
        
        if (isNew) {
          // If it's a completed section, keep it closed by default
          const isSectionCompleted = section.nodes.every(n => n.status === 'completed');
          next[section.id] = !isSectionCompleted;
        } else {
          next[section.id] = previous[section.id];
        }
      });
      return next;
    });
  }, [sections]);

  const { completedSections, activeSections } = useMemo(() => {
    const completed: LernplanSection[] = [];
    const active: LernplanSection[] = [];

    sections.forEach(s => {
      const isDone = s.nodes.every(n => n.status === 'completed');
      if (isDone) {
        completed.push(s);
      } else {
        active.push(s);
      }
    });

    return { completedSections: completed, activeSections: active };
  }, [sections]);

  useEffect(() => {
    if (!active) return;

    if (currentNodeRef.current) {
      setTimeout(() => {
        currentNodeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [active, lernplanData.currentNodeIndex]);

  const createPlan = (source: string) => {
    const newPlan = generateLernplan(modules, questions);
    setPlan(newPlan);
    setShowRegenConfirm(false);
    trackEvent('lernplan_created', getTrackingContext({
      source,
      total_nodes: newPlan.nodes.length,
      completed_count: 0,
    }));
  };

  const handleRegenerate = () => {
    if (!examDate) {
      trackEvent('lernplan_exam_date_opened', getTrackingContext({
        source: 'regenerate_plan',
      }));
      setShowDatePicker(true);
      return;
    }

    createPlan('regenerate_plan');
    trackEvent('lernplan_regenerated', getTrackingContext({
      source: 'regenerate_plan',
    }));
  };

  const daysUntilExam = useMemo(() => {
    if (!examDate) return null;
    const exam = new Date(examDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    exam.setHours(0, 0, 0, 0);
    const diff = Math.ceil((exam.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }, [examDate]);

  const getTrackingContext = (overrides: Record<string, unknown> = {}) => ({
    embedded,
    has_exam_date: !!examDate,
    days_until_exam: daysUntilExam,
    total_nodes: lernplanData.totalCount,
    completed_count: lernplanData.completedCount,
    ...overrides,
  });

  useEffect(() => {
    if (hasTrackedViewRef.current) return;
    if (!active) return;

    trackEvent('lernplan_viewed', getTrackingContext({
      source: embedded ? 'dashboard_embedded' : 'lernplan_page',
    }));

    hasTrackedViewRef.current = true;
  }, [active, embedded, trackEvent, daysUntilExam, examDate, lernplanData.totalCount, lernplanData.completedCount]);

  const navigateToNode = (node: NodeWithStatus, preferResume: boolean = false) => {
    if (node.status === 'upcoming') return;

    const targetPath = node.moduleId === 'exam' ? '/exam' : node.resumeTarget.path;
    trackEvent('lernplan_node_opened', getTrackingContext({
      node_id: node.id,
      node_status: node.status,
      module_id: node.moduleId,
      target_path: targetPath,
      source: preferResume ? 'continue_learning' : 'node_card',
    }));

    if (node.moduleId === 'exam') {
      navigate('/exam');
      return;
    }

    navigate(node.resumeTarget.path, { state: { fromLernplan: true } });
  };

  const handleCreatePlan = () => {
    trackEvent('lernplan_create_clicked', getTrackingContext({
      source: !user ? 'guest' : !examDate ? 'missing_date' : 'missing_plan',
    }));

    if (!user) {
      openAuthDialog('register', {
        de: 'Melde dich an, um deinen Lernplan zu erstellen und zu speichern.',
        ar: 'سجّل الدخول لإنشاء خطة الدراسة وحفظها.',
      });
      return;
    }

    if (!examDate) {
      trackEvent('lernplan_exam_date_opened', getTrackingContext({
        source: 'create_plan',
      }));
      setShowDatePicker(true);
      return;
    }

    createPlan('create_plan');
  };

  const handleCreateWithDate = (selectedDate: string) => {
    localStorage.setItem('examDate', selectedDate);
    setExamDate(selectedDate);
    
    // Automatically trigger plan generation after date is set
    // We can't use the state immediate because setExamDate is async
    // But calculatePlan logic uses examDate from localStorage/state.
    // We'll wait for the next render or force it.
    // In Lernplan, we have a useEffect or similar? Actually handleCreatePlan handles it.
    
    trackEvent('lernplan_exam_date_saved', getTrackingContext({
      source: 'inline_picker',
      selected_date: selectedDate
    }));

    // Trigger plan creation manually with the new date
    createPlan('create_plan');
  };

  const emptyStateVariant = !user ? 'guest' : !examDate ? 'missing-date' : 'missing-plan';
  const showEmptyState = !user || !plan;

  return (
    <div className={`${embedded ? 'pb-4' : 'min-h-screen pb-12 bg-[#F2F4F8] dark:bg-[#0F172A]'}`}>
      {!embedded && (
        <div className="fixed top-0 left-0 right-0 z-[100] px-4 pt-4 pb-6 bg-[#3B65F5]/95 backdrop-blur-2xl border-b border-white/10 shadow-lg shadow-blue-500/10 rounded-b-[32px]">
          <div className="max-w-xl mx-auto flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => navigate(-1)}
                  aria-label="Zurück"
                  className="w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full transition-all active:scale-95"
                >
                  <ArrowLeft size={22} className="text-white" />
                </button>
                <div>
                  <h1 className="text-[22px] font-black text-white tracking-tight leading-none">
                    Lernplan
                  </h1>
                  {showArabic && <p className="text-[14px] text-white/70 font-bold mt-1" dir="rtl">خطة الدراسة</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="bg-white/15 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/20">
                   <div className="flex gap-1">
                      <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_white]" />
                      <div className="w-2 h-2 rounded-full bg-white/40" />
                      <div className="w-2 h-2 rounded-full bg-white/40" />
                   </div>
                </div>
                {showLanguageToggle && (
                  <button 
                    onClick={toggleLanguage} 
                    aria-label="Sprache wechseln"
                    className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors text-white"
                  >
                    <Languages size={20} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between bg-black/10 backdrop-blur-md rounded-2xl px-4 py-3 border border-white/5">
              <div className="flex items-center gap-2">
                <CalendarDays size={16} className="text-white/60" />
                <span className="text-[14px] font-bold text-white/90">
                  {daysUntilExam === null
                    ? 'Prüfungsdatum offen'
                    : daysUntilExam === 0
                      ? 'Heute ist Prüfungstermin!'
                      : `${daysUntilExam} Tage verbleibend`}
                </span>
              </div>
              <button
                onClick={() => {
                  trackEvent('lernplan_exam_date_opened', getTrackingContext({
                    source: 'header',
                  }));
                  setShowDatePicker(true);
                }}
                className="bg-white/10 hover:bg-white/20 text-white/90 px-3 py-1 rounded-lg text-xs font-bold transition-all border border-white/10"
              >
                Ändern
              </button>
            </div>
          </div>
        </div>
      )}

      {!embedded && <div className="h-[180px]" />}

      {!showEmptyState && !examDate && (
        <div className={`${embedded ? 'mb-6' : 'mx-4 mb-6'} bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-2xl p-4 flex items-start gap-3`}>
          <AlertCircle size={18} className="text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
              Lege dein Prüfungsdatum im Profil fest, um einen zeitbasierten Plan zu erhalten.
            </p>
            {showArabic && (
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 opacity-80" dir="rtl">
                حدد موعد الامتحان في ملفك الشخصي للحصول على خطة زمنية.
              </p>
            )}
            <button
              onClick={() => navigate('/profile')}
              className="mt-2 text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
            >
              Zum Profil <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}

      {showEmptyState ? (
        <div className={embedded ? 'px-1' : 'px-4'}>
          {guestFlowStep === 'generating' ? (
            <LernplanGeneratingAnimation 
              onComplete={() => setGuestFlowStep('summary')} 
            />
          ) : guestFlowStep === 'summary' && guestPlan ? (
            <LernplanSummaryView 
              plan={guestPlan} 
              onUnlock={() => {
                trackEvent('lernplan_guest_unlock_clicked');
                openAuthDialog('register', {
                  de: 'Melde dich an, um deinen persönlichen Lernplan jetzt vollständig freizuschalten.',
                  ar: 'سجّل الدخول لفتح خطة الدراسة الشخصية بالكامل الآن.',
                });
              }}
            />
          ) : (
            <LernplanEmptyState
              variant={emptyStateVariant}
              showArabic={showArabic}
              guestFlowStep={guestFlowStep}
              onStartGuestFlow={() => setGuestFlowStep('selection')}
              onStepChange={(step) => setGuestFlowStep(step as any)}
              onCreate={handleCreatePlan}
              onSaveDate={(date) => {
                if (!user) {
                  setExamDate(date);
                  localStorage.setItem('examDate', date);
                  const newGuestPlan = generateLernplan(modules, questions);
                  setGuestPlan(newGuestPlan);
                  setGuestFlowStep('generating');
                } else {
                  handleCreateWithDate(date);
                }
              }}
              onSaveWeeks={(weeks) => {
                const targetDate = new Date();
                targetDate.setDate(targetDate.getDate() + weeks * 7);
                const dateStr = targetDate.toISOString().split('T')[0];
                
                if (!user) {
                  setExamDate(dateStr);
                  localStorage.setItem('examDate', dateStr);
                  const newGuestPlan = generateLernplan(modules, questions);
                  setGuestPlan(newGuestPlan);
                  setGuestFlowStep('generating');
                } else {
                  handleCreateWithDate(dateStr);
                }
              }}
            />
          )}
        </div>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="space-y-3">
            {completedSections.map((section) => (
              <SectionCard
                key={section.id}
                section={section}
                isExpanded={expandedSections[section.id]}
                isCompleted={true}
                canToggle={true}
                embedded={embedded}
                onToggle={() => setExpandedSections(prev => ({ ...prev, [section.id]: !prev[section.id] }))}
                renderNodes={() => (
                  <div className="space-y-4 px-4 pb-6">
                    {section.nodes.map((node, nodeIdx) => {
                      const nextNode = section.nodes[nodeIdx + 1];
                      return (
                        <React.Fragment key={node.id}>
                          <div className="flex flex-col items-center">
                            <NodeCard
                              node={node}
                              showArabic={showArabic}
                              embedded={embedded}
                              onClick={() => {
                                if (expandedNodes[node.id]) {
                                  setExpandedNodes(prev => ({ ...prev, [node.id]: false }));
                                } else {
                                  setExpandedNodes(prev => ({ ...prev, [node.id]: true }));
                                }
                              }}
                              isExpanded={expandedNodes[node.id]}
                              compact={!expandedNodes[node.id]}
                              onNavigate={() => navigateToNode(node)}
                            />
                            {nextNode && <ConnectorLine node={node} nextNode={nextNode} />}
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}
              />
            ))}

            {completedSections.length > 0 && activeSections.length > 0 && (
              <div className="h-2" />
            )}

            {activeSections.map((section) => (
              <SectionCard
                key={section.id}
                section={section}
                isExpanded={expandedSections[section.id]}
                canToggle={true}
                embedded={embedded}
                onToggle={() => setExpandedSections(prev => ({ ...prev, [section.id]: !prev[section.id] }))}
                renderNodes={() => (
                  <div className="space-y-4 px-4 pb-6">
                    {section.nodes.map((node, nodeIdx) => {
                      const nextNode = section.nodes[nodeIdx + 1];
                      const isCurrent = node.status === 'current';
                      return (
                        <div key={node.id} className="relative" ref={isCurrent ? currentNodeRef : null}>
                          <div className="flex flex-col">
                            <NodeCard
                              node={node}
                              showArabic={showArabic}
                              embedded={embedded}
                              onClick={() => {
                                if (node.status === 'completed') {
                                  setExpandedNodes(prev => ({ ...prev, [node.id]: !prev[node.id] }));
                                } else {
                                  navigateToNode(node, true);
                                }
                              }}
                              isExpanded={expandedNodes[node.id]}
                              compact={node.status === 'completed' && !expandedNodes[node.id]}
                              onNavigate={() => navigateToNode(node, true)}
                            />
                            {nextNode && (
                              <div className="ml-[24px]">
                                <ConnectorLine node={node} nextNode={nextNode} />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              />
            ))}
          </div>

          <div className={embedded ? 'mt-4 mb-2' : 'px-4 mt-4 mb-8'}>
            {!showRegenConfirm ? (
              <button
                onClick={() => setShowRegenConfirm(true)}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-colors"
              >
                <Icons.RefreshCw size={14} />
                Plan neu erstellen
                {showArabic && <span className="opacity-70 text-xs" dir="rtl"> · إعادة إنشاء الخطة</span>}
              </button>
            ) : (
              <div className="bg-white dark:bg-slate-850 rounded-2xl p-4 shadow-card border border-slate-100 dark:border-slate-800">
                <p className="text-sm text-slate-700 dark:text-slate-300 mb-3">
                  Plan wirklich neu erstellen? Der aktuelle Plan wird überschrieben.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowRegenConfirm(false)}
                    className="flex-1 py-2 text-sm text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={() => {
                      trackEvent('lernplan_regenerate_clicked', getTrackingContext({
                        source: 'regenerate_confirmation',
                      }));
                      handleRegenerate();
                    }}
                    className="flex-1 py-2 text-sm text-white bg-primary rounded-xl hover:bg-primary-hover transition-colors font-medium"
                  >
                    Ja, neu erstellen
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Date Picker Modal - Using Portal to prevent clipping in embedded mode */}
      {showDatePicker && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6 shadow-2xl relative border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold mb-4 dark:text-white">Prüfungsdatum festlegen</h3>
            <input
              type="date"
              aria-label="Prüfungsdatum festlegen"
              title="Prüfungsdatum festlegen"
              min={new Date().toISOString().split('T')[0]}
              className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 mb-6 font-medium dark:text-white outline-none focus:border-blue-500 transition-colors"
              defaultValue={examDate || ''}
              id="exam-date-picker"
            />
            <div className="flex gap-3 justify-end relative z-10">
              <button
                onClick={() => setShowDatePicker(false)}
                className="px-5 py-2.5 rounded-xl font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                Abbrechen
              </button>
              <button
                onClick={() => {
                  const value = (document.getElementById('exam-date-picker') as HTMLInputElement).value;
                  if (value) {
                    localStorage.setItem('examDate', value);
                    setExamDate(value);
                    window.dispatchEvent(new Event('storage'));
                    const exam = new Date(value);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    exam.setHours(0, 0, 0, 0);
                    const nextDaysUntilExam = Math.max(
                      0,
                      Math.ceil((exam.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
                    );
                    trackEvent('lernplan_exam_date_saved', {
                      embedded,
                      has_exam_date: true,
                      days_until_exam: nextDaysUntilExam,
                      total_nodes: lernplanData.totalCount,
                      completed_count: lernplanData.completedCount,
                      source: 'date_picker',
                    });
                    if (user) {
                      const hadExistingPlan = !!plan;
                      const newPlan = generateLernplan(modules, questions);
                      setPlan(newPlan);
                      setShowRegenConfirm(false);
                      trackEvent(hadExistingPlan ? 'lernplan_regenerated' : 'lernplan_created', {
                        embedded,
                        has_exam_date: true,
                        days_until_exam: nextDaysUntilExam,
                        total_nodes: newPlan.nodes.length,
                        completed_count: 0,
                        source: 'date_picker',
                      });
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
        </div>,
        document.body
      )}

      {/* FAB: Fixed Bottom Action Button */}
      {!embedded && lernplanData.nodes.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-6 z-[90] pointer-events-none">
          <div className="max-w-xl mx-auto flex justify-center">
            <button
              onClick={() => {
                const current = lernplanData.nodes[lernplanData.currentNodeIndex];
                if (current) {
                  trackEvent('lernplan_continue_clicked', getTrackingContext({
                    node_id: current.id,
                    node_status: current.status,
                    module_id: current.moduleId,
                    target_path: current.moduleId === 'exam' ? '/exam' : current.resumeTarget.path,
                    source: 'sticky_continue_button',
                  }));
                  navigateToNode(current, true);
                }
              }}
              className="pointer-events-auto w-full max-w-[320px] bg-[#3B65F5] text-white py-5 rounded-[24px] font-black text-[18px] tracking-tight flex items-center justify-center gap-3 shadow-[0_20px_40px_rgba(59,101,245,0.3)] animate-cta-pulse active:scale-95 transition-all"
            >
              Jetzt Lernen
              <ChevronRight size={22} />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

function LernplanEmptyState({
  variant,
  showArabic,
  guestFlowStep,
  onStartGuestFlow,
  onStepChange,
  onCreate,
  onSaveDate,
  onSaveWeeks,
}: {
  variant: 'guest' | 'missing-date' | 'missing-plan';
  showArabic: boolean;
  guestFlowStep?: string;
  onStartGuestFlow?: () => void;
  onStepChange?: (step: string) => void;
  onCreate: () => void;
  onSaveDate?: (date: string) => void;
  onSaveWeeks?: (weeks: number) => void;
}) {
  // internal states
  const [tempDate, setTempDate] = useState('');
  const [tempWeeks, setTempWeeks] = useState(4);

  const title = variant === 'guest'
    ? (guestFlowStep === 'selection' ? 'Hast du einen festen Prüfungstermin?' : guestFlowStep === 'weeks' ? 'Vorbereitungszeit' : guestFlowStep === 'date' ? 'Wann genau ist dein Prüfungsdatum?' : 'Dein persönlicher Lernplan zur 34a Prüfung')
    : (guestFlowStep === 'date' || guestFlowStep === 'selection')
      ? 'Wann genau ist dein Prüfungsdatum?'
      : variant === 'missing-date'
        ? 'Prüfungsdatum wählen'
        : 'Du hast noch keinen Lernplan erstellt';

  const description = variant === 'guest'
    ? (guestFlowStep === 'selection' ? '' : guestFlowStep === 'weeks' ? 'In wie vielen Wochen planst du deine Prüfung?' : '')
    : (guestFlowStep === 'date' || guestFlowStep === 'selection')
      ? 'Wähle den Tag deiner Prüfung aus, damit wir deinen Plan berechnen können.'
      : variant === 'missing-date'
        ? 'Gib deinen Prüfungstermin an, damit wir deinen Lernplan perfekt auf dich zuschneiden können.'
        : 'Erstelle jetzt deinen persönlichen Lernplan, damit du eine klare Struktur bis zur Prüfung hast.';

  const handleAction = () => {
    if (variant === 'guest') {
      onStartGuestFlow?.();
      return;
    }
    if (variant === 'missing-date' && guestFlowStep !== 'date') {
      onStepChange?.('date');
      return;
    }
    onCreate();
  };

  const handleSave = () => {
    if (tempDate && onSaveDate) {
      onSaveDate(tempDate);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-100 dark:border-slate-800 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.25)] p-6 sm:p-7 transition-all duration-300">
      <h2 className="text-[22px] font-black tracking-tight text-slate-900 dark:text-white leading-tight">
        {title}
      </h2>
      {showArabic && guestFlowStep !== 'date' && guestFlowStep !== 'weeks' && guestFlowStep !== 'selection' && (
        <p className="mt-2 text-sm text-slate-400 dark:text-slate-500 font-medium" dir="rtl">
          {variant === 'guest'
            ? 'سجّل الدخول لاستخدام خطة الدراسة'
            : variant === 'missing-date'
              ? 'متى موعد امتحانك؟'
              : 'لم تقم بإنشاء خطة الدراسة بعد'}
        </p>
      )}
      {description && (
        <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          {description}
        </p>
      )}

      {guestFlowStep === 'selection' ? (
        <div className="mt-8 grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <button
            onClick={() => onStepChange?.('date')}
            className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-slate-100 dark:border-slate-800 hover:border-[#3B65F5] hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all group"
          >
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
              <Icons.CalendarCheck size={28} />
            </div>
            <div className="text-center px-1">
              <div className="font-black text-slate-900 dark:text-white text-[15px] leading-tight mb-1.5">Ja</div>
              <div className="text-[10px] text-slate-500 font-medium leading-[1.3] max-w-[120px] mx-auto">Termin vorhanden</div>
            </div>
          </button>

          <button
            onClick={() => onStepChange?.('weeks')}
            className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-slate-100 dark:border-slate-800 hover:border-[#3B65F5] hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all group"
          >
            <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-[#3B65F5] group-hover:scale-110 transition-transform">
              <Icons.CalendarRange size={28} />
            </div>
            <div className="text-center px-1">
              <div className="font-black text-slate-900 dark:text-white text-[15px] leading-tight mb-1.5">Nein</div>
              <div className="text-[10px] text-slate-500 font-medium leading-[1.3] max-w-[120px] mx-auto">Noch kein Termin</div>
            </div>
          </button>
          <div className="flex-1" />
        </div>
      ) : guestFlowStep === 'weeks' ? (
        <div className="mt-6 flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
           <div className="flex items-center justify-center gap-6 p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-100 dark:border-slate-800">
              <button 
                onClick={() => setTempWeeks(prev => Math.max(2, prev - 1))}
                className="w-12 h-12 flex items-center justify-center rounded-xl bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white hover:border-[#3B65F5] transition-all"
              >
                <Icons.Minus size={20} />
              </button>
              <div className="text-center min-w-[100px]">
                <div className="text-4xl font-black text-[#3B65F5]">{tempWeeks}</div>
                <div className="text-sm font-bold text-slate-500 uppercase tracking-widest">Wochen</div>
              </div>
              <button 
                onClick={() => setTempWeeks(prev => Math.min(52, prev + 1))}
                className="w-12 h-12 flex items-center justify-center rounded-xl bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white hover:border-[#3B65F5] transition-all"
              >
                <Icons.Plus size={20} />
              </button>
           </div>

           <div className="flex gap-3">
            <button
              onClick={() => onStepChange?.('selection')}
              className="flex-1 py-4 px-4 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Andere Option
            </button>
            <button
              onClick={() => onSaveWeeks?.(tempWeeks)}
              className="flex-[2] py-4 px-4 rounded-2xl text-base font-black text-white bg-gradient-to-r from-[#3B65F5] to-[#2551E8] shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98]"
            >
              Plan erstellen
            </button>
          </div>
        </div>
      ) : guestFlowStep === 'date' ? (
        <div className="mt-6 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <input
            type="date"
            value={tempDate}
            onChange={(e) => setTempDate(e.target.value)}
            className="w-full px-4 py-3.5 rounded-[18px] border-2 border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white font-bold focus:outline-none focus:border-[#3B65F5] transition-all"
            min={new Date().toISOString().split('T')[0]}
            autoFocus
          />
          <div className="flex gap-3">
            <button
              onClick={() => onStepChange?.(variant === 'guest' ? 'selection' : 'initial')}
              className="flex-1 py-3 px-4 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Abbrechen
            </button>
            <button
              disabled={!tempDate}
              onClick={() => tempDate && onSaveDate?.(tempDate)}
              className="flex-1 py-3 px-4 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-[#3B65F5] to-[#2551E8] shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:shadow-none transition-all active:scale-[0.98]"
            >
              Speichern
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleAction}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#3B65F5] to-[#2551E8] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 transition-all active:scale-[0.98]"
        >
          <BookOpen size={16} />
          {variant === 'missing-date' ? 'Datum wählen' : 'Lernplan erstellen'}
        </button>
      )}
    </div>
  );
}

function SectionCard({
  section,
  isExpanded,
  canToggle,
  onToggle,
  renderNodes,
  isCompleted = false,
  embedded = false,
}: {
  section: LernplanSection;
  isExpanded: boolean;
  canToggle: boolean;
  onToggle: () => void;
  renderNodes: () => React.ReactNode;
  isCompleted?: boolean;
  embedded?: boolean;
}) {
  if (!canToggle) {
    return (
      <div className="overflow-hidden">
        <div className="px-5 pt-8 pb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[12px] font-black uppercase tracking-[0.2em] text-[#3B65F5]">{section.label}</p>
              <h2 className="text-[22px] font-black text-slate-900 dark:text-white mt-1">Dein aktuelles Soll</h2>
            </div>
          </div>
        </div>
        {renderNodes()}
      </div>
    );
  }

  return (
    <div className={`overflow-hidden transition-all duration-300 ${isCompleted ? 'bg-white dark:bg-slate-800/80 rounded-[28px] shadow-sm border border-slate-100 dark:border-slate-800/50' : ''}`}>
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between gap-4 text-left group transition-all duration-300 ${isCompleted ? 'px-6 py-4' : (embedded ? 'px-5 py-6' : 'px-5 py-8')}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className={`font-black text-slate-900 dark:text-white tracking-tight leading-tight transition-all ${isCompleted ? 'text-[18px]' : (embedded ? 'text-[22px]' : 'text-[24px]')}`}>
              {isCompleted && <CheckCircle2 size={18} className="inline-block mr-2 text-emerald-500" strokeWidth={3} />}
              {section.label}
            </h2>
            {section.dateRange && (
              <span className={`font-bold transition-all px-3 py-1 rounded-full backdrop-blur-sm ${isCompleted ? 'text-slate-400 bg-slate-50 dark:bg-slate-900/30 text-[11px]' : 'text-[#3B65F5] bg-blue-50/80 dark:bg-blue-900/30 text-[14px]'}`}>
                {section.dateRange}
              </span>
            )}
          </div>
        </div>
        <div className={`shrink-0 flex items-center justify-center rounded-full text-slate-400 group-hover:bg-[#3B65F5]/10 group-hover:text-[#3B65F5] transition-all ${isCompleted ? 'w-8 h-8 bg-slate-50 dark:bg-slate-900/40' : 'w-10 h-10 bg-slate-100 dark:bg-slate-800'}`}>
          {isExpanded ? <ChevronUp size={isCompleted ? 16 : 20} /> : <ChevronDown size={isCompleted ? 16 : 20} />}
        </div>
      </button>
      {isExpanded && (
        <div className={isCompleted ? 'animate-in fade-in slide-in-from-top-2 duration-300' : ''}>
          {renderNodes()}
        </div>
      )}
    </div>
  );
}

function NodeCircle({ node }: { node: NodeWithStatus }) {
  const isExam = node.moduleId === 'exam';

  let IconComponent: React.ElementType = HelpCircle;
  if (isExam) {
    IconComponent = GraduationCap;
  } else if (node.status === 'completed') {
    IconComponent = CheckCircle2;
  } else if (node.status === 'current') {
    IconComponent = BookOpen;
  } else if (node.status === 'upcoming') {
    IconComponent = Lock;
  }

  if (node.status !== 'upcoming' && !isExam && node.moduleIcon) {
    const DynamicIcon = (Icons as any)[node.moduleIcon];
    if (DynamicIcon) IconComponent = DynamicIcon;
  }

  const baseClasses = 'relative z-10 w-12 h-12 rounded-[18px] flex items-center justify-center shrink-0 transition-all duration-300';

  if (node.status === 'completed') {
    return (
      <div className={`${baseClasses} bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/50`}>
        <CheckCircle2 size={20} strokeWidth={2.5} />
      </div>
    );
  }

  if (node.status === 'current') {
    return (
      <div className={`${baseClasses} bg-blue-50 dark:bg-blue-900/30 text-[#3B65F5] dark:text-blue-400 border border-blue-100 dark:border-blue-800/50`}>
        <IconComponent size={20} strokeWidth={2.5} />
      </div>
    );
  }

  return (
    <div className={`${baseClasses} bg-slate-100 dark:bg-slate-800`}>
      <Lock size={18} className="text-slate-400 dark:text-slate-600" />
    </div>
  );
}

function ConnectorLine({ node, nextNode }: { node: NodeWithStatus; nextNode: NodeWithStatus }) {
  let colorClass = 'bg-slate-200 dark:bg-slate-700/50';
  if (node.status === 'completed' && nextNode.status === 'completed') {
    colorClass = 'bg-emerald-200 dark:bg-emerald-800/50';
  } else if (node.status === 'completed' && nextNode.status === 'current') {
    colorClass = 'bg-gradient-to-b from-emerald-200 to-blue-300 dark:from-emerald-800/50 dark:to-blue-800/50';
  } else if (node.status === 'current') {
    colorClass = 'bg-gradient-to-b from-blue-300 to-slate-200 dark:from-blue-800/50 dark:to-slate-700/50';
  }

  return (
    <div className={`flex-1 w-[2px] min-h-[24px] ${colorClass} transition-colors duration-500`} />
  );
}

function NodeCard({
  node,
  showArabic,
  onClick,
  compact = false,
  isExpanded = false,
  onNavigate,
  embedded = false,
}: {
  node: NodeWithStatus;
  showArabic: boolean;
  onClick: () => void;
  compact?: boolean;
  isExpanded?: boolean;
  onNavigate?: () => void;
  embedded?: boolean;
}) {
  const isClickable = node.status !== 'upcoming';
  const isExam = node.moduleId === 'exam';

  const stateLabel = node.status === 'completed'
    ? 'Abgeschlossen'
    : node.status === 'current'
      ? 'Jetzt dran'
      : 'Als Nächstes';

  return (
    <button
      onClick={isClickable ? onClick : undefined}
      disabled={!isClickable}
      className={[
        'w-full text-left rounded-[32px] transition-all duration-300 flex flex-col border-none group',
        node.status === 'completed'
          ? (isExpanded 
              ? `bg-white dark:bg-slate-800 shadow-lg ring-1 ring-emerald-500/20 ${embedded ? 'p-4' : 'p-5'} opacity-100 mb-0` 
              : `bg-white/60 dark:bg-slate-850 opacity-90 shadow-sm ${embedded ? 'p-2.5' : 'p-3'} mb-0`)
          : (node.status === 'current'
              ? `bg-white dark:bg-slate-800 shadow-[0_20px_40px_rgba(59,101,245,0.08)] ring-1 ring-blue-500/10 ${embedded ? 'p-4' : 'p-5'}`
              : `bg-slate-100/50 dark:bg-slate-900/40 shadow-none ${embedded ? 'p-4' : 'p-5'} opacity-70`),
        isClickable ? 'cursor-pointer active:scale-[0.98]' : 'cursor-default',
      ].join(' ')}
    >
      <div className="flex items-center gap-4">
        {/* Symbol on the left */}
        <div className="shrink-0">
          <NodeCircle node={node} />
        </div>

        {/* Content in the middle */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={[
              'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider',
              node.status === 'completed' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : '',
              node.status === 'current' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : '',
              node.status === 'upcoming' ? 'bg-slate-200/70 text-slate-600 dark:bg-slate-800 dark:text-slate-400' : '',
            ].join(' ')}>
              {node.status === 'upcoming' && <Lock size={10} className="mr-1" />}
              {stateLabel}
            </span>
          </div>

          <h3 className={[
            'font-[900] leading-snug tracking-tight transition-all',
            compact ? (embedded ? 'text-[15.5px]' : 'text-[16px]') : (embedded ? 'text-[18px]' : 'text-[19px]'),
            node.status === 'completed' ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-white',
          ].join(' ')}>
            {isExam ? '🏆 ' : ''}{node.moduleTitle}
          </h3>
          {!compact && showArabic && node.moduleDescriptionAR && (
            <p className="text-[14px] font-bold text-slate-400 mt-1" dir="rtl">{node.moduleTitleAR}</p>
          )}
        </div>

        {/* Navigation arrow on the right */}
        <div className={[
          'w-10 h-10 rounded-[18px] flex items-center justify-center shrink-0 transition-all border',
          node.status === 'completed' ? 'border-emerald-100 bg-emerald-50/50 text-emerald-500' : '',
          node.status === 'current' ? 'border-blue-100 bg-[#3B65F5] text-white shadow-blue-500/20' : '',
          node.status === 'upcoming' ? 'border-slate-100 bg-slate-50 text-slate-300' : '',
          isExpanded && node.status === 'completed' ? 'rotate-180' : '',
        ].join(' ')}>
          {node.status === 'upcoming' ? <Lock size={18} /> : (node.status === 'completed' ? <ChevronDown size={20} /> : <ChevronRight size={22} />)}
        </div>
      </div>

      {!compact && node.lessons.length > 0 && (
        <div className="space-y-4 rounded-[24px] bg-slate-50/80 dark:bg-slate-900/40 p-5 mt-2 border border-slate-100/50">
          <p className="text-[11px] font-[900] uppercase tracking-widest text-slate-400 mb-2">Lerninhalte</p>
          {node.lessons.map((lesson, index) => (
            <div key={lesson.id} className="flex items-start gap-4">
              <span className="w-5 shrink-0 text-[13px] font-black text-[#3B65F5] opacity-50 mt-0.5">
                {index + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className={[
                    'text-[14px] font-bold leading-relaxed',
                    lesson.isCompleted
                      ? 'text-emerald-600 dark:text-emerald-400 opacity-60 line-through'
                      : 'text-slate-800 dark:text-slate-200',
                  ].join(' ')}
                >
                  {lesson.titleDE}
                </p>
                {showArabic && lesson.titleAR && (
                  <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-1 font-medium" dir="rtl">
                    {lesson.titleAR}
                  </p>
                )}
              </div>
      {lesson.isCompleted && (
        <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
          <CheckCircle2 size={12} className="text-white" />
        </div>
      )}
    </div>
  ))}
</div>
)}

{!compact && (
<div className="space-y-3">
  {node.tasks.map((task, index) => {
    const taskProgress = node.taskProgress[index];
    const isTaskDone = taskProgress.completed >= taskProgress.target;
    const percent = taskProgress.target > 0
      ? Math.min(Math.round((taskProgress.completed / taskProgress.target) * 100), 100)
      : 0;

    return (
      <div key={`${node.id}-${task.type}`}>
        <div className="flex items-center gap-3 text-[13px]">
          {isTaskDone ? (
            <CheckCircle2 size={16} className="text-emerald-500 shrink-0" strokeWidth={2.5} />
          ) : (
            <div className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600 shrink-0" />
          )}
          <span className={`flex-1 font-medium ${isTaskDone ? 'text-emerald-600 dark:text-emerald-400 opacity-80 line-through decoration-emerald-600/30' : 'text-slate-700 dark:text-slate-300'}`}>
            {task.label}
            {task.type === 'questions' && node.questionStats?.accuracy !== null && (
              <span className="ml-2 text-[11px] font-black text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">
                {node.questionStats.accuracy}% Genauigkeit
              </span>
            )}
          </span>
          <span className={`text-[12px] font-bold ${isTaskDone ? 'text-emerald-500' : 'text-slate-500 dark:text-slate-400'}`}>
            {taskProgress.completed}/{taskProgress.target}
          </span>
        </div>
        {showArabic && task.labelAR && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 ml-7 mt-1 font-medium" dir="rtl">{task.labelAR}</p>
        )}
        {task.type !== 'exam' && !isTaskDone && (
          <div className="ml-7 mt-2 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${node.status === 'current' ? 'bg-[#3B65F5]' : 'bg-slate-300 dark:bg-slate-600'}`}
              style={({ '--progress-width': `${percent}%` } as React.CSSProperties)}
            />
          </div>
        )}
      </div>
    );
  })}
</div>
)}

{isExpanded && node.status === 'completed' && (
<div className="mt-2 flex justify-end">
  <button
    onClick={(e) => {
      e.stopPropagation();
      onNavigate?.();
    }}
    className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
  >
    <Icons.RotateCcw size={14} />
    Wiederholen
  </button>
</div>
)}
  </button>
  );
}

function LernplanGeneratingAnimation({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const steps = [
    'Prüfungstermin analysieren...',
    '9 Themenbereiche werden strukturiert...',
    '728 Übungsfragen werden verteilt...',
    'Lernplan wird für dich optimiert...',
    'Individueller Erfolgsplan erstellt!'
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((prev) => {
        if (prev === steps.length - 1) {
          clearInterval(interval);
          setTimeout(onComplete, 800);
          return prev;
        }
        return prev + 1;
      });
    }, 600);
    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[28px] p-8 min-h-[400px] flex flex-col items-center justify-center text-center shadow-card border border-slate-100 dark:border-slate-800 transition-all duration-500">
      <div className="relative mb-10">
        <div className="w-24 h-24 rounded-[32px] bg-blue-500/5 flex items-center justify-center">
          <Icons.Loader2 size={48} className="text-[#3B65F5] animate-spin-slow opacity-20" />
          <div className="absolute inset-0 flex items-center justify-center">
             <Icons.RefreshCw size={32} className="text-[#3B65F5] animate-spin duration-[3000ms]" />
          </div>
        </div>
      </div>
      
      <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2 leading-tight">
        Plan wird erstellt
      </h2>
      <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-[200px]">
        Gleich fertig! Wir berechnen deinen Weg zum Bestehen.
      </p>

      <div className="w-full max-w-[240px] space-y-4">
        {steps.map((text, i) => (
          <div 
            key={i} 
            className={`flex items-center gap-3 transition-all duration-300 ${i === step ? 'scale-105 opacity-100' : i < step ? 'opacity-40' : 'opacity-10'}`}
          >
            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${i <= step ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
              {i < step ? <CheckCircle2 size={12} strokeWidth={3} /> : <div className="w-1.5 h-1.5 rounded-full bg-current" />}
            </div>
            <span className={`text-sm font-bold text-left ${i === step ? 'text-[#3B65F5] dark:text-blue-400' : 'text-slate-600 dark:text-slate-400'}`}>
              {text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LernplanSummaryView({ plan, onUnlock }: { plan: StoredLernplan; onUnlock: () => void }) {
  const { flashcards } = useDataCache();
  
  const stats = useMemo(() => {
    const totalQuestions = plan.nodes.reduce((sum, n) => {
      const qTask = n.tasks.find(t => t.type === 'questions');
      return sum + (qTask?.target || 0);
    }, 0);
    
    const totalLessons = plan.nodes.reduce((sum, n) => {
      const lTask = n.tasks.find(t => t.type === 'lessons');
      return sum + (lTask?.target || 0);
    }, 0);

    // Calculate oral questions (flashcards) for all modules in the plan
    const moduleIdsInPlan = new Set(plan.nodes.map(n => n.moduleId));
    const totalOralQuestions = flashcards.filter(f => moduleIdsInPlan.has(f.moduleId)).length;

    const topics = plan.nodes.filter(n => n.moduleId !== 'exam').slice(0, 5).map(n => n.moduleTitle);

    return { totalQuestions, totalLessons, totalOralQuestions, topics };
  }, [plan, flashcards]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      {/* Redesigned Compact Header */}
      <div className="text-center px-4 pt-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-[#3B65F5] dark:text-blue-400 rounded-full text-[10px] font-black uppercase tracking-widest mb-4">
          <Icons.CheckCircle2 size={12} />
          Bereitschaftsanalyse abgeschlossen
        </div>
        <h2 className="text-[26px] font-black text-slate-900 dark:text-white mb-2 leading-tight">
          Dein Erfolgsplan wurde erstellt
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-[14px] font-bold">
          Alle IHK-Inhalte nach offiziellem Rahmenstoffplan.
        </p>
      </div>

      {/* Locked Modules Preview */}
      <div className="bg-white dark:bg-slate-900 rounded-[32px] p-6 border border-slate-100 dark:border-slate-800 shadow-xl overflow-hidden relative">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-[12px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
            Inhalte deiner Reise
          </h3>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 dark:bg-slate-800 rounded-full text-[10px] font-black text-slate-400 border border-slate-100 dark:border-slate-700">
            <Icons.Lock size={10} />
            GESPERRT
          </div>
        </div>

        <div className="space-y-4">
          {stats.topics.map((topic, i) => (
            <div 
              key={i} 
              className="flex items-center gap-4 group opacity-50 blur-[0.5px]"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                 <IconByName name={['Shield', 'Scale', 'Users', 'Zap', 'GraduationCap'][i % 5]} size={18} />
              </div>
              <div className="flex-1">
                <div className="text-[15px] font-bold text-slate-800 dark:text-slate-200">{topic}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">IHK Modul • {i + 1}. Abschnitt</div>
              </div>
              <Icons.Lock size={14} className="text-slate-300" />
            </div>
          ))}
          
          {/* Fading bottom modules */}
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-white dark:from-slate-900 to-transparent z-10 flex items-end justify-center pb-8">
            <div className="text-center px-6">
              <p className="text-[12px] font-bold text-slate-500 dark:text-slate-400 mb-2">
                Melde dich an, um alle 9 Module und 728 Fragen freizuschalten.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-2 space-y-4">
        {/* Simplified Stats Row - Positioned above CTA */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white dark:bg-slate-900/50 rounded-2xl p-3 border border-slate-100 dark:border-slate-800 text-center shadow-sm">
            <div className="text-xl font-black text-slate-900 dark:text-white">{stats.totalLessons}</div>
            <div className="text-[9px] font-black uppercase tracking-wider text-slate-400 mt-0.5">Lektionen</div>
          </div>
          <div className="bg-white dark:bg-slate-900/50 rounded-2xl p-3 border border-slate-100 dark:border-slate-800 text-center shadow-sm">
            <div className="text-xl font-black text-slate-900 dark:text-white">{stats.totalQuestions}</div>
            <div className="text-[9px] font-black uppercase tracking-wider text-slate-400 mt-0.5">Testfragen</div>
          </div>
          <div className="bg-white dark:bg-slate-900/50 rounded-2xl p-3 border border-slate-100 dark:border-slate-800 text-center shadow-sm">
            <div className="text-xl font-black text-slate-900 dark:text-white">{stats.totalOralQuestions || 204}</div>
            <div className="text-[9px] font-black uppercase tracking-wider text-slate-400 mt-0.5">Mündl. Fragen</div>
          </div>
        </div>

        <button
          onClick={onUnlock}
          className="w-full bg-[#3B65F5] hover:bg-[#2551E8] text-white py-5 rounded-[24px] font-black text-[18px] tracking-tight flex items-center justify-center gap-3 shadow-[0_20px_40px_rgba(59,101,245,0.3)] animate-cta-pulse active:scale-95 transition-all"
        >
          Kostenlos freischalten
          <Icons.ChevronRight size={22} />
        </button>

        <p className="text-center text-[11px] text-slate-400 dark:text-slate-500 font-medium pb-4 px-4">
          Sichere dir deinen Prüfungserfolg. Über 15.000 Lernende nutzen bereits 34a Master.
        </p>
      </div>
    </div>
  );
}

function IconByName({ name, size }: { name: string; size: number }) {
  const Icon = (Icons as any)[name] || Icons.HelpCircle;
  return <Icon size={size} />;
}

// --- NEW DESIGNS ---

/**
 * Design 1: Timeline / Path Style
 */
function LernplanDesignTimeline({ sections, showArabic, onNavigate }: { sections: LernplanSection[], showArabic: boolean, onNavigate: (node: NodeWithStatus, isCurrentlyActive?: boolean) => void }) {
  return (
    <div className="relative px-4 pb-12 overflow-hidden">
      {/* Central Timeline Line with Gradient */}
      <div className="absolute left-[35px] top-6 bottom-6 w-1 bg-gradient-to-b from-primary/20 via-primary/5 to-transparent rounded-full" />
      
      <div className="space-y-12 relative">
        {sections.map((section, sIdx) => (
          <div key={section.id} className="space-y-8">
            <div className="flex items-center gap-4 ml-[12px] animate-in slide-in-from-left duration-500" style={{ animationDelay: `${sIdx * 100}ms` }}>
              <div className="w-12 h-12 rounded-[18px] bg-white dark:bg-slate-850 shadow-premium border border-slate-100 dark:border-slate-800 flex items-center justify-center z-10">
                <Icons.Map size={20} className="text-primary" />
              </div>
              <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-md px-4 py-1.5 rounded-2xl border border-white/20">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  {section.title}
                </h3>
              </div>
            </div>

            <div className="space-y-10">
              {section.nodes.map((node, nIdx) => {
                const isCompleted = node.status === 'completed';
                const isCurrent = node.status === 'current';
                
                return (
                  <div 
                    key={node.id} 
                    className={`flex items-start gap-6 relative group cursor-pointer transition-all duration-500 hover:-translate-y-1 ${isCurrent ? 'scale-[1.03]' : ''}`}
                    onClick={() => onNavigate(node, isCurrent || isCompleted)}
                  >
                    <div className="relative flex flex-col items-center shrink-0">
                      <div className={`w-[48px] h-[48px] rounded-full flex items-center justify-center border-4 z-10 transition-all duration-500 ${
                        isCompleted 
                          ? 'bg-emerald-500 border-emerald-100 dark:border-emerald-400/20 text-white shadow-lg shadow-emerald-500/20' 
                          : isCurrent
                            ? 'bg-primary border-primary-light dark:border-primary-light text-white shadow-2xl shadow-primary/40 animate-pulse'
                            : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-300'
                      }`}>
                        {isCompleted ? <Icons.Check size={24} /> : isCurrent ? <Icons.Play size={20} fill="white" /> : <span className="font-black text-xs opacity-50">{nIdx + 1}</span>}
                      </div>
                      {isCurrent && (
                         <div className="absolute -inset-2 bg-primary/20 rounded-full blur-xl animate-pulse" />
                      )}
                    </div>

                    <div className={`flex-1 p-5 rounded-[24px] border transition-all duration-500 ${
                      isCurrent 
                        ? 'bg-white dark:bg-slate-850 border-primary/20 shadow-premium ring-1 ring-primary/5' 
                        : 'bg-white/30 dark:bg-slate-900/30 border-transparent group-hover:bg-white dark:group-hover:bg-slate-800 group-hover:shadow-card group-hover:border-slate-100 dark:group-hover:border-slate-700'
                    }`}>
                      <div className="flex justify-between items-start mb-2">
                        <span className={`text-[10px] font-black tracking-widest uppercase ${isCurrent ? 'text-primary' : 'text-slate-400'}`}>
                          {node.type === 'lesson' ? 'Lerneinheit' : 'Überprüfung'}
                        </span>
                        {node.durationMinutes && (
                          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-50 dark:bg-slate-800/50 rounded-full text-[10px] font-black text-slate-400 border border-slate-100 dark:border-slate-700">
                             <Icons.Clock3 size={10} /> {node.durationMinutes} MIN
                          </div>
                        )}
                      </div>
                      <h4 className={`text-[15px] font-bold leading-tight ${isCurrent ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>
                        {node.titleDE}
                      </h4>
                      {showArabic && node.titleAR && (
                        <p className="text-xs font-medium text-slate-400 mt-2 leading-relaxed" dir="rtl">{node.titleAR}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Design 2: Tile Based / Strategy Style
 */
function LernplanDesignTiles({ sections, showArabic, onNavigate }: { sections: LernplanSection[], showArabic: boolean, onNavigate: (node: NodeWithStatus, isCurrentlyActive?: boolean) => void }) {
  return (
    <div className="px-5 pb-10 space-y-10">
      {sections.map((section) => {
        const completedCount = section.nodes.filter(n => n.status === 'completed').length;
        const totalCount = section.nodes.length;
        const progressPercent = Math.round((completedCount / totalCount) * 100);

        return (
          <div key={section.id} className="space-y-5">
            <div className="flex items-end justify-between px-2">
              <div className="space-y-1">
                <span className="text-[10px] font-black text-primary uppercase tracking-widest opacity-60">Modul</span>
                <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight leading-none">{section.title}</h3>
              </div>
              <div className="flex flex-col items-end">
                 <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">{completedCount}/{totalCount} DONE</div>
                 <div className="w-24 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${progressPercent}%` }} />
                 </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {section.nodes.map((node) => {
                const isCompleted = node.status === 'completed';
                const isCurrent = node.status === 'current';

                return (
                  <div
                    key={node.id}
                    onClick={() => onNavigate(node, isCurrent || isCompleted)}
                    className={`group p-5 rounded-[28px] border transition-all duration-500 cursor-pointer ${
                      isCurrent 
                        ? 'bg-gradient-to-br from-primary to-blue-600 text-white border-primary shadow-premium hover:shadow-2xl hover:shadow-primary/20 active:scale-95' 
                        : isCompleted
                          ? 'bg-white dark:bg-slate-850 border-emerald-100 dark:border-emerald-900/20 active:scale-95'
                          : 'bg-white/50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800 opacity-60 filter grayscale-[0.5]'
                    }`}
                  >
                    <div className="flex items-center gap-5">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-500 group-hover:scale-110 ${
                        isCurrent 
                          ? 'bg-white/10 backdrop-blur-md' 
                          : isCompleted 
                            ? 'bg-emerald-50 dark:bg-emerald-400/10 text-emerald-500' 
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                      }`}>
                        {isCompleted ? <Icons.CheckCircle2 size={24} /> : <Icons.Rocket size={22} fill={isCurrent ? "white" : "none"} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <span className={`text-[9px] font-black uppercase tracking-widest ${isCurrent ? 'text-white/60' : 'text-slate-400'}`}>
                            {node.type === 'lesson' ? 'INTENSIVE LERNEN' : 'ZERTIFIKATS-CHECK'}
                          </span>
                        </div>
                        <h4 className={`text-[16px] font-bold truncate ${isCurrent ? 'text-white' : 'text-slate-800 dark:text-slate-200'}`}>
                          {node.titleDE}
                        </h4>
                      </div>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isCurrent ? 'bg-white/10' : 'bg-slate-50 dark:bg-slate-800'}`}>
                        <Icons.ChevronRight size={16} className={isCurrent ? 'text-white' : 'text-slate-400'} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Design 3: Minimalist List / Clean Flow
 */
function LernplanDesignMinimalist({ sections, showArabic, onNavigate }: { sections: LernplanSection[], showArabic: boolean, onNavigate: (node: NodeWithStatus, isCurrentlyActive?: boolean) => void }) {
  return (
    <div className="pb-16 bg-white dark:bg-slate-900 rounded-t-[40px] shadow-2xl border-t border-slate-100 dark:border-slate-800">
      <div className="px-6 py-6 sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl z-20 border-b border-slate-50 dark:border-slate-800/50">
         <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Dein Lernfortschritt</h3>
         <p className="text-xs font-bold text-slate-400">Übersicht aller Lektionen und Tests</p>
      </div>

      {sections.map((section, sIdx) => (
        <div key={section.id}>
          <div className="bg-slate-50/50 dark:bg-slate-850/50 px-6 py-3">
             <span className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">
               {String(sIdx + 1).padStart(2, '0')} — {section.title}
             </span>
          </div>

          <div className="divide-y divide-slate-50 dark:divide-slate-800/30">
            {section.nodes.map((node) => {
              const isCompleted = node.status === 'completed';
              const isCurrent = node.status === 'current';

              return (
                <div 
                  key={node.id}
                  onClick={() => onNavigate(node, isCurrent || isCompleted)}
                  className={`flex items-center gap-5 px-6 py-6 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850/30 transition-all duration-300 active:bg-slate-100 dark:active:bg-slate-800 ${
                    isCurrent ? 'bg-primary/5' : ''
                  }`}
                >
                   <div className={`shrink-0 transition-transform duration-500 scale-110 ${
                     isCompleted ? 'text-emerald-500' : isCurrent ? 'text-primary animate-bounce-subtle' : 'text-slate-200 dark:text-slate-700'
                   }`}>
                     {isCompleted ? <Icons.CheckCircle2 size={24} fill="currentColor" className="text-white" /> : <Icons.Circle size={24} strokeWidth={isCurrent ? 3 : 2} />}
                   </div>
                   
                   <div className="flex-1 min-w-0">
                     <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md ${
                          isCurrent ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                        }`}>
                          {node.type === 'lesson' ? 'THEORIE' : 'TEST'}
                        </span>
                     </div>
                     <h4 className={`text-[15px] font-bold leading-snug ${
                       isCurrent ? 'text-slate-900 dark:text-white font-black' : 'text-slate-600 dark:text-slate-400'
                     }`}>
                       {node.titleDE}
                     </h4>
                   </div>

                   <div className="text-right shrink-0">
                     {node.durationMinutes && (
                       <div className="text-[11px] font-black text-slate-900 dark:text-slate-200">{node.durationMinutes} min</div>
                     )}
                     <div className="text-[8px] font-black text-slate-300 uppercase mt-0.5">Vorbereitung</div>
                   </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
