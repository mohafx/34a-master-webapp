import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    ArrowLeft, ChevronLeft, ChevronRight, BookOpen, Languages,
    Target, Zap, CheckCircle2, Hash, Quote, Info, Star, Settings, Check, Circle, AlertCircle
} from 'lucide-react';
import { QuizSettingsDialog } from './QuizSettingsDialog';
import { useDataCache } from '../../contexts/DataCacheContext';
import { usePostHog } from '../../contexts/PostHogProvider';
import { db } from '../../services/database'; // Restored import
import { useApp } from '../../App';
import {
    buildLessonQuestionPath,
    findFirstOpenQuestionInLesson,
    getLessonQuestionProgress,
    getLessonQuestions,
    getUnassignedModuleQuestions,
    isLessonCompleted,
    isQuestionBasedLesson,
} from '../../services/lessonFlow';

interface Lesson {
    id: string;
    moduleId: string;
    titleDE: string;
    contentDE: string;
    titleAR?: string; // Add optional Arabic title
    contentAR?: string; // Add optional Arabic content
    orderIndex: number;
    imageUrl?: string;
    imageStatus?: 'none' | 'queued' | 'in_progress' | 'generated' | 'failed';
    imageStyleCode?: string;
}

// Helper functions for content rendering
const isImageBlock = (text: string) => text.trim().startsWith('![') && text.trim().endsWith(')');
const isHrBlock = (text: string) => text.trim() === '---' || text.trim() === '***';
const removeAlertMarkers = (text: string) => text.replace(/^> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\n/, '');

// Helper to slugify text for anchors
const slugify = (text: string) => {
    return text
        .toLowerCase()
        .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[c as any] || c))
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
};

// Helper to clean lesson title
const cleanTitle = (title: string) => {
    return title.replace(/^Lektion\s+\d+\s*[:\-.]?\s*/i, '');
};

export default function LessonView() {
    const { moduleId, lessonId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { getModuleById, getQuestionsByModule } = useDataCache();
    const { trackEvent } = usePostHog();
    const { language, toggleLanguage, showLanguageToggle, isPremium, openPaywall, settings, setLessonCompletion, progress } = useApp();

    const [lessons, setLessons] = useState<Lesson[]>([]);
    const [currentLesson, setCurrentLesson] = useState<Lesson | null>(null);
    const [loading, setLoading] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [lessonStartTime] = useState(Date.now());
    const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});
    const questionSectionRef = useRef<HTMLDivElement>(null);

    // Load checklist state from localStorage
    useEffect(() => {
        if (lessonId) {
            const saved = localStorage.getItem(`lesson_checklist_${lessonId}`);
            if (saved) {
                try {
                    setChecklistState(JSON.parse(saved));
                } catch (e) {
                    console.error("Error loading checklist state:", e);
                }
            } else {
                setChecklistState({}); // Reset for new lesson
            }
        }
    }, [lessonId]);

    // Save checklist state to localStorage
    const toggleChecklistItem = (itemText: string) => {
        setChecklistState(prev => {
            const newState = { ...prev, [itemText]: !prev[itemText] };
            localStorage.setItem(`lesson_checklist_${lessonId}`, JSON.stringify(newState));
            trackEvent('checklist_item_toggled', {
                lesson_id: lessonId,
                item: itemText,
                is_checked: newState[itemText]
            });
            return newState;
        });
    };

    // Smart Sticky Header State
    const [showHeader, setShowHeader] = useState(true);
    const lastScrollY = useRef(0);
    const ticking = useRef(false);

    const module = moduleId ? getModuleById(moduleId) : null;
    const m = module as any;
    const moduleQuestions = useMemo(
        () => (moduleId ? getQuestionsByModule(moduleId) : []),
        [getQuestionsByModule, moduleId],
    );

    // Track lesson started
    useEffect(() => {
        if (currentLesson && moduleId) {
            trackEvent('lesson_started', {
                lesson_id: currentLesson.id,
                lesson_name: currentLesson.titleDE,
                module_id: moduleId
            });
        }
    }, [currentLesson, moduleId]);

    // Scroll tracking for smart header
    useEffect(() => {
        const handleScroll = (e: Event) => {
            const target = e.target as HTMLElement;
            if (!ticking.current) {
                window.requestAnimationFrame(() => {
                    const currentScrollY = target.scrollTop || window.scrollY;

                    // Show header if scrolling UP or at the very top
                    if (currentScrollY < lastScrollY.current || currentScrollY <= 100) {
                        setShowHeader(true);
                    } else if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
                        setShowHeader(false);
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

    useEffect(() => {
        if (moduleId) {
            setLoading(true);
            db.getLessonsByModuleId(moduleId)
                .then(data => {
                    setLessons(data);
                    setLoading(false);
                })
                .catch(err => {
                    console.error(err);
                    setLoading(false);
                });
        }
    }, [moduleId]);


    useEffect(() => {
        if (lessons.length > 0 && lessonId) {
            const found = lessons.find(l => l.id === lessonId);
            if (found) {
                // Check if user has access to this lesson
                const lessonIndex = lessons.findIndex(l => l.id === lessonId);
                const isFirstLesson = lessonIndex === 0;
                // All lessons in "Einführung und Grundlagen" module are free
                const isIntroModule = m?.title_de === 'Einführung und Grundlagen' || m?.titleDE === 'Einführung und Grundlagen';

                // Check access: first lesson is always free, or all lessons in intro module are free
                if (!isFirstLesson && !isPremium && !isIntroModule) {
                    console.warn('🔒 [LessonView] Access denied - Premium lesson');
                    openPaywall('Premium Lektionen');
                    // Navigate away immediately and return - don't set current lesson
                    navigate(`/learn/${moduleId}`, { replace: true });
                    return;
                }

                setCurrentLesson(found);
            }
        }
    }, [lessons, lessonId, isPremium, moduleId, m]);

    const lessonQuestions = useMemo(
        () => (currentLesson ? getLessonQuestions(currentLesson.id, moduleQuestions) : []),
        [currentLesson, moduleQuestions],
    );

    const questionProgress = useMemo(
        () => currentLesson
            ? getLessonQuestionProgress(currentLesson.id, moduleQuestions, progress)
            : { total: 0, answered: 0, correct: 0, wrong: 0, unanswered: 0, allAnswered: false },
        [currentLesson, moduleQuestions, progress],
    );

    const isQuestionLesson = useMemo(
        () => !!currentLesson && isQuestionBasedLesson(currentLesson.id, moduleQuestions),
        [currentLesson, moduleQuestions],
    );

    const isCompleted = useMemo(() => {
        if (!currentLesson) return false;
        return isLessonCompleted(currentLesson.id, moduleQuestions, progress);
    }, [currentLesson, moduleQuestions, progress]);

    useEffect(() => {
        if (!moduleId) return;
        const orphanQuestions = getUnassignedModuleQuestions(moduleId, moduleQuestions);
        if (orphanQuestions.length > 0) {
            console.warn(
                `[LessonView] ${orphanQuestions.length} Fragen ohne lessonId in Modul ${moduleId} werden im Lektionsfluss ignoriert.`,
            );
        }
    }, [moduleId, moduleQuestions]);

    // Handle Deep Linking / Scrolling to Content
    // First tries anchor-based matching, falls back to text-based keyword search
    useEffect(() => {
        if (!currentLesson || !location.state) return;

        const state = location.state as any;
        const highlightText = state.highlightText as string;
        const anchorId = state.anchorId as string;

        if (!highlightText && !anchorId) return;

        console.log("DeepScroll: Anchor:", anchorId, "Text:", highlightText);

        const attemptScroll = (attempt: number) => {
            const article = document.querySelector('article');
            if (!article) {
                if (attempt < 5) setTimeout(() => attemptScroll(attempt + 1), 500);
                return;
            }

            // 1. Try Anchor ID First (Precision Match)
            if (anchorId && anchorId !== 'NO_MATCH') {
                const element = document.getElementById(anchorId);
                if (element) {
                    console.log(`DeepScroll: Found anchor #${anchorId}`);
                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });

                    // Find content to highlight after the heading
                    let contentToHighlight: HTMLElement | null = null;
                    let candidate = element.nextElementSibling;

                    while (candidate) {
                        const tag = candidate.tagName.toLowerCase();
                        if (tag === 'div' && candidate.id) break;
                        if (['p', 'ul', 'ol', 'blockquote'].includes(tag) && (candidate.textContent?.trim().length || 0) > 10) {
                            contentToHighlight = candidate as HTMLElement;
                            break;
                        }
                        candidate = candidate.nextElementSibling;
                    }

                    // Also check parent's siblings
                    if (!contentToHighlight && element.parentElement) {
                        let parentCandidate = element.parentElement.nextElementSibling;
                        let hops = 0;
                        while (parentCandidate && hops < 3) {
                            const tag = parentCandidate.tagName.toLowerCase();
                            if (tag === 'div' && parentCandidate.id) break;
                            if (['p', 'ul', 'ol', 'blockquote'].includes(tag) && (parentCandidate.textContent?.trim().length || 0) > 10) {
                                contentToHighlight = parentCandidate as HTMLElement;
                                break;
                            }
                            parentCandidate = parentCandidate.nextElementSibling;
                            hops++;
                        }
                    }

                    if (contentToHighlight) {
                        const originalBg = contentToHighlight.style.backgroundColor;
                        contentToHighlight.style.backgroundColor = '#fef08a';
                        contentToHighlight.style.padding = '8px';
                        contentToHighlight.style.borderRadius = '8px';
                        contentToHighlight.style.transition = 'background-color 1s ease';
                        setTimeout(() => { contentToHighlight!.style.backgroundColor = originalBg; }, 3000);
                    } else {
                        // Fallback: highlight heading text
                        const heading = element.querySelector('h1, h2, h3') as HTMLElement;
                        if (heading) {
                            const originalBg = heading.style.backgroundColor;
                            heading.style.backgroundColor = '#fef08a';
                            heading.style.padding = '4px 8px';
                            heading.style.borderRadius = '4px';
                            setTimeout(() => { heading.style.backgroundColor = originalBg; }, 3000);
                        }
                    }
                    return;
                }
            }

            // 2. Fallback to Text Matching
            const cleanText = (t: string) => t.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()'\"?]/g, "").replace(/\s{2,}/g, " ");
            const searchWords = cleanText(highlightText || "").split(' ').filter(w => w.length > 3);
            if (searchWords.length === 0) return;

            const elements = Array.from(article.querySelectorAll('p, li, h2, h3'));
            let bestMatch: HTMLElement | null = null;
            let maxScore = 0;

            elements.forEach(el => {
                const text = cleanText(el.textContent || "");
                let score = 0;
                searchWords.forEach(w => { if (text.includes(w)) score++; });
                if (score > maxScore) {
                    maxScore = score;
                    bestMatch = el as HTMLElement;
                }
            });

            if (bestMatch && maxScore >= 2) {
                bestMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const originalBg = bestMatch.style.backgroundColor;
                bestMatch.style.backgroundColor = '#fef08a';
                bestMatch.style.padding = '8px';
                bestMatch.style.borderRadius = '8px';
                setTimeout(() => { bestMatch!.style.backgroundColor = originalBg; }, 3000);
            } else if (attempt < 3) {
                setTimeout(() => attemptScroll(attempt + 1), 500);
            }
        };

        setTimeout(() => attemptScroll(1), 300);
    }, [currentLesson, location.state]);

    // Font size configuration based on settings
    const lessonFontSizes = {
        large: {
            body: 'text-[16px] sm:text-lg md:text-[17px]',
            heading1: 'text-2xl sm:text-3xl md:text-[28px]',
            heading2: 'text-xl sm:text-2xl md:text-[22px]',
            heading3: 'text-xl md:text-[19px]',
            list: 'text-[16px] sm:text-lg md:text-[17px]'
        },
        normal: {
            body: 'text-sm sm:text-base md:text-[15px]',
            heading1: 'text-xl sm:text-2xl md:text-[24px]',
            heading2: 'text-lg sm:text-xl md:text-[19px]',
            heading3: 'text-base sm:text-lg md:text-base',
            list: 'text-sm sm:text-base md:text-[15px]'
        },
        small: {
            body: 'text-xs sm:text-sm md:text-[13px]',
            heading1: 'text-lg sm:text-xl md:text-[22px]',
            heading2: 'text-base sm:text-lg md:text-[17px]',
            heading3: 'text-sm sm:text-base md:text-sm',
            list: 'text-xs sm:text-sm md:text-[13px]'
        },
        smaller: {
            body: 'text-[11px] sm:text-xs md:text-[11px]',
            heading1: 'text-base sm:text-lg md:text-[18px]',
            heading2: 'text-sm sm:text-base md:text-[14px]',
            heading3: 'text-xs sm:text-sm md:text-xs',
            list: 'text-[11px] sm:text-xs md:text-[11px]'
        }
    };

    const currentFontSize = lessonFontSizes[settings?.cardSize || 'normal'];

    // Memoize Custom Markdown Components to prevent re-renders on scroll
    const MDComponents = useMemo(() => ({
        h1: ({ children }: any) => {
            const text = typeof children === 'string' ? children : String(children);
            return (
                <div className="scroll-mt-24 mb-6 mt-2 pb-3 border-b-2 border-primary/20 flex items-start gap-3">
                    <div className="p-1.5 md:p-1 rounded-xl bg-primary/10 text-primary mt-1 hidden sm:block">
                        <Target size={24} className="md:w-5 md:h-5" />
                    </div>
                    <h1 className={`${currentFontSize.heading1} font-black text-slate-900 dark:text-white tracking-tight leading-tight`}>
                        {cleanTitle(text)}
                    </h1>
                </div>
            );
        },
        h2: ({ children }: any) => {
            const text = typeof children === 'string' ? children : String(children);
            return (
                <div id={slugify(text)} className="scroll-mt-24 flex items-center gap-3 mt-8 mb-4 group">
                    <div className="w-8 h-8 md:w-7 md:h-7 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-sm border border-blue-100 dark:border-blue-800 transition-transform group-hover:scale-110">
                        <Zap size={18} fill="currentColor" className="opacity-80 md:w-4 md:h-4" />
                    </div>
                    <h2 className={`${currentFontSize.heading2} font-bold text-slate-800 dark:text-slate-100 m-0`}>
                        {children}
                    </h2>
                </div>
            );
        },
        h3: ({ children }: any) => {
            const text = typeof children === 'string' ? children : String(children);
            return (
                <div id={slugify(text)} className="scroll-mt-24 flex items-center gap-2.5 mt-6 mb-3">
                    <div className="text-emerald-500 dark:text-emerald-400">
                        <Hash size={18} />
                    </div>
                    <h3 className={`${currentFontSize.heading3} font-bold text-slate-700 dark:text-slate-200 m-0`}>
                        {children}
                    </h3>
                </div>
            );
        },
        p: ({ children }: any) => (
            <p className={`${currentFontSize.body} text-slate-600 dark:text-slate-300 leading-[1.7] mb-5 font-medium`}>
                {children}
            </p>
        ),
        ul: ({ children }: any) => (
            <ul className="space-y-3 mb-6 bg-white dark:bg-slate-900/50 rounded-2xl">
                {children}
            </ul>
        ),
        ol: ({ children }: any) => (
            <ol className="space-y-3 mb-6 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 list-decimal list-inside marker:text-primary marker:font-bold">
                {children}
            </ol>
        ),
        li: (props: any) => {
            const { children, checked, index, ordered } = props;
            
            // Advanced task detection: check props or children for an input checkbox
            const hasCheckboxChild = React.Children.toArray(children).some(
                (child: any) => child?.type === 'input' && child?.props?.type === 'checkbox'
            );
            const isTask = checked !== null && checked !== undefined || hasCheckboxChild;

            // Extract text for the state key, while filtering out any input elements
            const getTextAndFilter = (nodes: any): { text: string; filtered: any } => {
                const nodesArray = React.Children.toArray(nodes);
                let text = '';
                const filtered = nodesArray.filter((node: any) => {
                    if (node?.type === 'input' && node?.props?.type === 'checkbox') return false;
                    
                    const extractText = (n: any): string => {
                        if (!n) return '';
                        if (typeof n === 'string') return n;
                        if (Array.isArray(n)) return n.map(extractText).join('');
                        if (n.props?.children) return extractText(n.props.children);
                        return '';
                    };
                    text += extractText(node);
                    return true;
                });
                return { text: text.trim(), filtered };
            };

            const { text: textContent, filtered: filteredChildren } = getTextAndFilter(children);
            const isChecked = isTask ? (checklistState[textContent] ?? (checked || false)) : false;

            if (isTask) {
                return (
                    <li
                        className="flex items-start gap-4 mb-5 group cursor-pointer select-none"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleChecklistItem(textContent);
                        }}
                    >
                        <div className={`mt-1 w-6 h-6 rounded-lg flex items-center justify-center border-2 transition-all duration-300 transform active:scale-95 shadow-sm ${isChecked
                            ? 'bg-[#3B65F5] border-[#3B65F5] text-white rotate-0'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 group-hover:border-[#3B65F5]/50'
                            }`}>
                            {isChecked ? (
                                <Check size={16} strokeWidth={4} className="animate-in zoom-in-50 duration-300" />
                            ) : null}
                        </div>
                        <div className="flex-1">
                            <span className={`${currentFontSize.list} leading-relaxed transition-all duration-300 ${isChecked
                                ? 'text-slate-400 dark:text-slate-600 line-through decoration-slate-300/50 dark:decoration-slate-700 font-medium italic opacity-80'
                                : 'text-slate-700 dark:text-slate-200 font-bold'
                                }`}>
                                {filteredChildren}
                            </span>
                        </div>
                    </li>
                );
            }

            return (
                <li className="flex items-start gap-3 mb-3 group">
                    <div className="mt-1.5 flex-shrink-0 text-[#3B65F5]/60 group-hover:text-[#3B65F5] transition-colors">
                        <CheckCircle2 size={16} />
                    </div>
                    <span className={`${currentFontSize.list} text-slate-700 dark:text-slate-300 leading-relaxed font-medium`}>
                        {children}
                    </span>
                </li>
            );
        },
        blockquote: ({ children }: any) => (
            <div className="my-6 lg:my-8 relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800/50 border border-blue-100 dark:border-slate-700 shadow-sm p-5 sm:p-7 md:p-8 lg:p-10">
                <div className="absolute top-0 left-0 w-1.5 md:w-2 h-full bg-blue-500" />
                <div className="flex gap-4 relative z-10">
                    <div className="w-8 h-8 rounded-full bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-sm flex-shrink-0">
                        <Info size={18} />
                    </div>
                    <div className={`text-slate-700 dark:text-slate-200 italic font-medium leading-relaxed ${currentFontSize.body}`}>
                        {children}
                    </div>
                </div>
                <Quote className="absolute -bottom-4 -right-4 text-blue-200 dark:text-slate-700/50 opacity-50 rotate-12" size={60} />
            </div>
        ),
        strong: ({ children }: any) => (
            <span className="relative inline-block px-1 rounded mx-0.5 bg-slate-100 dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 font-black decoration-clone box-decoration-clone">
                {children}
            </span>
        ),
        hr: () => (
            <div className="flex items-center justify-center gap-4 my-8 opacity-40">
                <div className="h-px bg-slate-300 dark:bg-slate-700 flex-1 rounded-full" />
                <Star size={12} className="text-slate-400" />
                <div className="h-px bg-slate-300 dark:bg-slate-700 flex-1 rounded-full" />
            </div>
        ),
        img: ({ src, alt }: any) => (
            <div className="my-6 contain-content isolation-isolate">
                <div className="relative rounded-2xl overflow-hidden shadow-lg shadow-slate-200/50 dark:shadow-black/20 border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
                    <img
                        src={src}
                        alt={alt}
                        className="w-full h-auto object-cover block"
                        decoding="async"
                    />
                </div>
                {alt && <p className="text-center text-xs font-bold uppercase tracking-wider text-slate-400 mt-2">{alt}</p>}
            </div>
        ),
        table: ({ children }: any) => (
            <div className="my-6 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300 border-collapse">
                    {children}
                </table>
            </div>
        ),
        thead: ({ children }: any) => (
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500 font-bold tracking-wider">
                {children}
            </thead>
        ),
        tbody: ({ children }: any) => (
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900/20">
                {children}
            </tbody>
        ),
        tr: ({ children }: any) => (
            <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                {children}
            </tr>
        ),
        th: ({ children }: any) => (
            <th className="px-6 py-4 font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap first:pl-6 last:pr-6">
                {children}
            </th>
        ),
        td: ({ children }: any) => (
            <td className="px-6 py-4 leading-relaxed min-w-[140px] border-l first:border-l-0 border-slate-50 dark:border-slate-800/50 first:pl-6 last:pr-6 align-top">
                {children}
            </td>
        )
    }), [currentFontSize]);

    // Content Loading Skeleton
    const ContentSkeleton = () => (
        <div className="animate-pulse">
            <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded mb-6"></div>
            <div className="space-y-4">
                <div className="h-8 w-3/4 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
                <div className="h-4 w-full bg-slate-100 dark:bg-slate-900 rounded"></div>
                <div className="h-4 w-full bg-slate-100 dark:bg-slate-900 rounded"></div>
                <div className="h-4 w-2/3 bg-slate-100 dark:bg-slate-900 rounded"></div>
                <div className="h-64 w-full bg-slate-100 dark:bg-slate-900 rounded-2xl mt-8"></div>
            </div>
        </div>
    );

    // Navigation logic
    const currentIndex = currentLesson ? lessons.findIndex(l => l.id === currentLesson.id) : 0;
    const prevLesson = currentIndex > 0 ? lessons[currentIndex - 1] : null;
    const nextLesson = currentIndex < lessons.length - 1 ? lessons[currentIndex + 1] : null;

    // Use German title always (as requested to remove translation from "Kern"/Header)
    const displayTitle = currentLesson?.titleDE || '';
    const displayModuleTitle = m?.titleDE || 'Modul';
    const firstOpenQuestion = currentLesson
        ? findFirstOpenQuestionInLesson(currentLesson.id, moduleQuestions, progress)
        : null;
    const primaryQuestionId = firstOpenQuestion?.id || lessonQuestions[0]?.id;




    // Helper to remove alert markers like [!TIP], [!WARNING]
    const removeAlertMarkers = (text: string) => {
        return text.replace(/\[!(TIP|WARNING|NOTE|IMPORTANT|CAUTION)\]/gi, '');
    };

    const lessonNavigationState = {
        fromLernplan: Boolean((location.state as any)?.fromLernplan),
        fromPractice: Boolean((location.state as any)?.fromPractice),
    };

    const navigateBackFromLesson = () => {
        if (location.state && (location.state as any).fromLernplan) {
            navigate('/');
        } else if (location.state && (location.state as any).fromPractice) {
            navigate(`/practice/${moduleId}`);
        } else {
            navigate(`/learn/${moduleId}`);
        }
    };

    const navigateToLessonQuestions = (questionId?: string) => {
        if (!moduleId || !currentLesson) return;

        navigate(
            buildLessonQuestionPath(moduleId, currentLesson.id, questionId),
            {
                state: {
                    ...lessonNavigationState,
                    fromLesson: true,
                },
            },
        );
    };

    const goToNextLesson = () => {
        if (!moduleId) return;

        const nextIndex = lessons.findIndex(l => l.id === nextLesson?.id);
        const isNextFirstLesson = nextIndex === 0;
        const isIntroModule = m?.title_de === 'Einführung und Grundlagen' || m?.titleDE === 'Einführung und Grundlagen';
        if (nextLesson && !isNextFirstLesson && !isPremium && !isIntroModule) {
            openPaywall('Premium Lektionen');
            return;
        }

        if (nextLesson) {
            navigate(`/learn/${moduleId}/lesson/${nextLesson.id}`, { state: location.state });
            return;
        }

        navigateBackFromLesson();
    };

    const handleQuestionlessCompletion = async () => {
        if (!currentLesson) return;

        try {
            if (!isCompleted) {
                await setLessonCompletion(currentLesson.id, true);
                const timeSpent = Math.round((Date.now() - lessonStartTime) / 1000);
                trackEvent('lesson_completed', {
                    lesson_id: currentLesson.id,
                    lesson_name: currentLesson.titleDE,
                    module_id: moduleId,
                    time_spent_seconds: timeSpent
                });
            }
        } catch (e) {
            console.error("Error completing lesson:", e);
        }
    };

    useEffect(() => {
        if (!(location.state as any)?.scrollToQuestions || !questionSectionRef.current) return;

        const timer = window.setTimeout(() => {
            questionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 250);

        return () => window.clearTimeout(timer);
    }, [currentLesson, location.state]);

    // If data is fully loaded and no lesson found
    if (!loading && !currentLesson) {
        return <div className="p-8 text-center bg-[#F2F4F6] dark:bg-slate-950 min-h-screen pt-24 text-slate-500 font-bold">Lektion nicht gefunden.</div>;
    }



    return (
        <div className="min-h-screen bg-[#F2F4F6] dark:bg-slate-950 pb-10 pt-[72px]">
            {/* Header */}
            <div
                className={`fixed top-0 left-0 lg:left-[280px] right-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 h-[72px] flex items-center justify-between transition-transform duration-300 shadow-sm will-change-transform ${showHeader ? 'translate-y-0' : '-translate-y-full'}`}
            >
                <button
                    onClick={navigateBackFromLesson}
                    aria-label="Zurück"
                    className="md:hidden w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-800 border-2 border-transparent text-slate-600 dark:text-slate-300 hover:border-slate-200 dark:hover:border-slate-700 active:scale-95 transition-all flex items-center justify-center p-0"
                >
                    <ArrowLeft size={28} strokeWidth={2.5} />
                </button>

                {/* Center Container: Desktop Back Button + Title */}
                <div className="flex-1 flex items-center justify-center min-h-[64px] px-4 overflow-hidden relative">

                    {/* Desktop Back Button (Visible only on md+) */}
                    <button
                        onClick={navigateBackFromLesson}
                        aria-label="Zurück"
                        className="hidden md:flex items-center gap-2 px-3 py-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/50 rounded-lg transition-all absolute left-4 xl:left-8"
                    >
                        <ArrowLeft size={20} strokeWidth={2.5} />
                        <span className="font-bold text-sm">Zurück</span>
                    </button>

                    {/* Title Column */}
                    <div className="flex flex-col items-center justify-center">
                        {loading || !currentLesson ? (
                            <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
                        ) : (
                            <span className="font-bold text-slate-900 dark:text-white text-[12px] sm:text-sm text-center leading-tight line-clamp-2 break-words w-full max-w-[300px] md:max-w-md">
                                {cleanTitle(displayTitle)}
                            </span>
                        )}
                        {language === 'DE_AR' && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">Arabisch aktiv</span>
                        )}
                    </div>
                </div>

                {/* Header Actions Group */}
                <div className="flex items-center bg-white dark:bg-slate-800 rounded-xl border-2 border-slate-100 dark:border-slate-700 p-1 shadow-sm h-14">
                    {showLanguageToggle && (
                        <>
                            <button
                                onClick={toggleLanguage}
                                aria-label="Sprache wechseln"
                                className={`w-14 h-full rounded-lg flex items-center justify-center transition-all active:scale-95 ${language === 'DE_AR'
                                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                                    : 'text-slate-400 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                                    }`}
                            >
                                <Languages size={24} strokeWidth={2} />
                            </button>
                            {/* Divider */}
                            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />
                        </>
                    )}

                    {/* Settings Button */}
                    <button
                        onClick={() => setShowSettings(true)}
                        aria-label="Einstellungen"
                        className="w-14 h-full rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-95"
                    >
                        <Settings size={24} strokeWidth={2} />
                    </button>
                </div>
            </div>

            {/* Settings Dialog */}
            {showSettings && (
                <QuizSettingsDialog onClose={() => setShowSettings(false)} />
            )}

            {/* Content */}
            <div className="max-w-3xl lg:max-w-5xl mx-auto px-4 py-6 sm:py-8 lg:py-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <article className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-800 p-4 sm:p-8 md:p-12 lg:p-16 relative overflow-hidden">
                    {/* Background decoration - Hidden on mobile for performance */}
                    <div className="hidden sm:block absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                    {/* Lesson Title Badge */}
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold uppercase tracking-wider mb-2 max-w-full">
                        <BookOpen size={14} className="text-primary flex-shrink-0" />
                        <span className="whitespace-nowrap flex-shrink-0">Lektion {currentIndex + 1}</span>
                        {language === 'DE_AR' && <span className="text-emerald-600 dark:text-emerald-400 whitespace-nowrap flex-shrink-0">الدرس {currentIndex + 1}</span>}
                        <span className="text-slate-300 dark:text-slate-600 flex-shrink-0">•</span>
                        <span className="truncate min-w-0">{displayModuleTitle}</span>
                    </div>


                    {/* Content Rendering - Paragraph by Paragraph */}
                    <div className="relative z-10 text-slate-600 dark:text-slate-300">
                        {loading || !currentLesson ? (
                            <ContentSkeleton />
                        ) : (
                            (() => {
                                // Split content by double newlines (paragraphs/blocks)
                                const germanBlocks = currentLesson.contentDE ? currentLesson.contentDE.split(/\n\n+/) : [];
                                const arabicBlocks = (language === 'DE_AR' && currentLesson.contentAR)
                                    ? currentLesson.contentAR.split(/\n\n+/)
                                    : [];

                                // Check if a block contains an image
                                const isImageBlock = (block: string) => /!\[.*?\]\(.*?\)/.test(block);
                                // Check if block is just a horizontal rule
                                const isHrBlock = (block: string) => /^---+$/.test(block.trim());

                                return germanBlocks.map((block, index) => {
                                    const arabicBlock = arabicBlocks[index];
                                    // Skip showing Arabic for image blocks or hr blocks
                                    const showArabic = language === 'DE_AR' && arabicBlock && !isImageBlock(block) && !isHrBlock(block) && !isImageBlock(arabicBlock);

                                    return (
                                        <div key={index} className="mb-6">
                                            {/* German Block */}
                                            <div dir="ltr">
                                                <Markdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={MDComponents}
                                                >
                                                    {removeAlertMarkers(block)}
                                                </Markdown>
                                            </div>

                                            {/* Arabic Block - Subtle with visual separator */}
                                            {showArabic && (
                                                <div
                                                    dir="rtl"
                                                    className="mt-3 mb-4 pr-3 border-r-2 border-emerald-300/50 dark:border-emerald-700/50 bg-gradient-to-l from-emerald-50/50 to-transparent dark:from-emerald-900/10 dark:to-transparent rounded-r-lg py-2"
                                                >
                                                    <Markdown
                                                        remarkPlugins={[remarkGfm]}
                                                        components={{
                                                            // Hide images in Arabic blocks
                                                            img: () => null,
                                                            // Very subtle Arabic styling - smaller, lighter
                                                            p: ({ children }: any) => (
                                                                <p className="text-[14px] text-slate-500 dark:text-slate-400 leading-relaxed m-0 font-medium">
                                                                    {children}
                                                                </p>
                                                            ),
                                                            h1: ({ children }: any) => (
                                                                <h1 className="text-lg font-bold text-slate-600 dark:text-slate-300 mb-1 mt-0">
                                                                    {children}
                                                                </h1>
                                                            ),
                                                            h2: ({ children }: any) => (
                                                                <h2 className="text-base font-bold text-slate-500 dark:text-slate-400 mt-0 mb-1">
                                                                    {children}
                                                                </h2>
                                                            ),
                                                            h3: ({ children }: any) => (
                                                                <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 mt-0 mb-1">
                                                                    {children}
                                                                </h3>
                                                            ),
                                                            ul: ({ children }: any) => (
                                                                <ul className="space-y-1 my-1">
                                                                    {children}
                                                                </ul>
                                                            ),
                                                            ol: ({ children }: any) => (
                                                                <ol className="space-y-1 my-1 list-decimal list-inside text-sm">
                                                                    {children}
                                                                </ol>
                                                            ),
                                                            li: ({ children }: any) => (
                                                                <li className="flex items-start gap-1.5 text-slate-500 dark:text-slate-400 text-[14px]">
                                                                    <div className="mt-1.5 w-1 h-1 rounded-full bg-emerald-400 dark:bg-emerald-600 flex-shrink-0" />
                                                                    <span>{children}</span>
                                                                </li>
                                                            ),
                                                            blockquote: ({ children }: any) => (
                                                                <div className="my-2 pr-3 border-r-2 border-emerald-300 dark:border-emerald-700 text-[13px] text-slate-500 dark:text-slate-400 italic">
                                                                    {children}
                                                                </div>
                                                            ),
                                                            strong: ({ children }: any) => (
                                                                <strong className="font-bold text-emerald-700 dark:text-emerald-400">{children}</strong>
                                                            ),
                                                            table: ({ children }: any) => (
                                                                <div className="my-2 overflow-x-auto rounded-lg border border-emerald-200 dark:border-emerald-800/50">
                                                                    <table className="w-full text-right text-[13px] text-slate-500 dark:text-slate-400 border-collapse">
                                                                        {children}
                                                                    </table>
                                                                </div>
                                                            ),
                                                            thead: ({ children }: any) => (
                                                                <thead className="bg-emerald-50/50 dark:bg-emerald-900/20 text-[11px] uppercase text-emerald-700 dark:text-emerald-400 font-semibold">
                                                                    {children}
                                                                </thead>
                                                            ),
                                                            tbody: ({ children }: any) => (
                                                                <tbody className="divide-y divide-emerald-100 dark:divide-emerald-800/30">
                                                                    {children}
                                                                </tbody>
                                                            ),
                                                            tr: ({ children }: any) => (
                                                                <tr className="hover:bg-emerald-50/30 dark:hover:bg-emerald-900/10">
                                                                    {children}
                                                                </tr>
                                                            ),
                                                            th: ({ children }: any) => (
                                                                <th className="px-3 py-2 font-semibold">
                                                                    {children}
                                                                </th>
                                                            ),
                                                            td: ({ children }: any) => (
                                                                <td className="px-3 py-2 leading-snug">
                                                                    {children}
                                                                </td>
                                                            )
                                                        }}
                                                    >
                                                        {removeAlertMarkers(arabicBlock)}
                                                    </Markdown>
                                                </div>
                                            )}
                                        </div>
                                    );
                                });
                            })()
                        )}
                    </div>

                    <section
                        ref={questionSectionRef}
                        className="mt-12 rounded-[28px] border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/70 p-5 sm:p-6 scroll-mt-28"
                    >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-5">
                            <div>
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 mb-3">
                                    <AlertCircle size={14} className="text-primary" />
                                    Fragen zu dieser Lektion
                                </div>
                                <h3 className="text-xl font-black text-slate-900 dark:text-white">
                                    {isQuestionLesson
                                        ? `${questionProgress.answered} von ${questionProgress.total} Fragen beantwortet`
                                        : 'Diese Lektion hat keine zugeordneten Fragen'}
                                </h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                    {isQuestionLesson
                                        ? 'Sobald alle Fragen mindestens einmal beantwortet wurden, gilt die Lektion als abgeschlossen.'
                                        : 'Diese Lektion schließt du über den Weiter-Button unten ab.'}
                                </p>
                            </div>

                            {isQuestionLesson && primaryQuestionId && (
                                <button
                                    onClick={() => navigateToLessonQuestions(primaryQuestionId)}
                                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary hover:bg-primary-hover text-white px-5 py-3 font-bold shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98]"
                                >
                                    <span>{questionProgress.answered > 0 ? 'Fragen fortsetzen' : 'Fragen starten'}</span>
                                    <ChevronRight size={18} />
                                </button>
                            )}
                        </div>

                        {isQuestionLesson ? (
                            <div className="space-y-3">
                                {lessonQuestions.map((question, index) => {
                                    const hasAnswer = Object.prototype.hasOwnProperty.call(progress.answeredQuestions, question.id);
                                    const isCorrect = progress.answeredQuestions[question.id] === true;
                                    const statusLabel = !hasAnswer
                                        ? 'Offen'
                                        : isCorrect
                                            ? 'Richtig beantwortet'
                                            : 'Falsch beantwortet';

                                    return (
                                        <button
                                            key={question.id}
                                            onClick={() => navigateToLessonQuestions(question.id)}
                                            className={`w-full rounded-2xl border px-4 py-4 text-left transition-all active:scale-[0.99] ${!hasAnswer
                                                ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-primary/40'
                                                : isCorrect
                                                    ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/60 hover:border-emerald-300'
                                                    : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/60 hover:border-amber-300'
                                                }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl font-black ${!hasAnswer
                                                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'
                                                    : isCorrect
                                                        ? 'bg-emerald-500 text-white'
                                                        : 'bg-amber-500 text-white'
                                                    }`}>
                                                    {!hasAnswer ? (
                                                        <Circle size={16} />
                                                    ) : isCorrect ? (
                                                        <Check size={18} strokeWidth={3} />
                                                    ) : (
                                                        <AlertCircle size={16} />
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                                        <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                                                            Frage {index + 1}
                                                        </span>
                                                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${!hasAnswer
                                                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'
                                                            : isCorrect
                                                                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                                                                : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                                                            }`}>
                                                            {statusLabel}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm font-bold text-slate-900 dark:text-white leading-relaxed">
                                                        {question.textDE}
                                                    </p>
                                                </div>
                                                <ChevronRight size={18} className="mt-1 text-slate-400" />
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className={`rounded-2xl border px-4 py-4 text-sm font-medium ${isCompleted
                                ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-300'
                                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                                }`}>
                                {isCompleted
                                    ? 'Diese Lektion wurde bereits abgeschlossen.'
                                    : 'Lies die Inhalte in Ruhe durch. Danach kannst du unten direkt mit der nächsten Lektion weitermachen.'}
                            </div>
                        )}
                    </section>
                </article>
            </div>

            {/* Footer / Navigation */}
            <div className="w-full max-w-3xl mx-auto p-4 mt-8 flex flex-col gap-6">

                {/* Progress bar Row */}
                <div className="flex flex-col items-center gap-2">
                    <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary rounded-full transition-all duration-500 ease-out shadow-[0_0_8px_rgba(59,130,246,0.4)]"
                            style={{ width: `${((currentIndex + 1) / lessons.length) * 100}%` }}
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Fortschritt</span>
                        {language === 'DE_AR' && <span className="text-[9px] text-slate-400" dir="rtl">التقدم</span>}
                        <span className="text-[10px] font-bold text-primary">{Math.round(((currentIndex + 1) / lessons.length) * 100)}%</span>
                    </div>
                </div>

                {/* Buttons Row */}
                <div className="flex items-center justify-between gap-3">
                    <button
                        onClick={() => prevLesson && navigate(`/learn/${moduleId}/lesson/${prevLesson.id}`)}
                        disabled={!prevLesson}
                        className={`h-14 px-6 flex items-center justify-center gap-2 rounded-2xl font-bold transition-all ${prevLesson
                            ? 'bg-slate-200/50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95'
                            : 'opacity-0 pointer-events-none'
                            }`}
                    >
                        <ChevronLeft size={20} />
                        <span className="text-sm sm:text-base">Zurück</span>
                    </button>

                    <button
                        onClick={async () => {
                            if (isQuestionLesson) {
                                if (primaryQuestionId && !questionProgress.allAnswered) {
                                    navigateToLessonQuestions(primaryQuestionId);
                                    return;
                                }

                                goToNextLesson();
                            } else {
                                await handleQuestionlessCompletion();
                                goToNextLesson();
                            }
                        }}
                        className={`h-14 flex-1 sm:flex-none sm:px-10 flex items-center justify-center gap-2 rounded-2xl font-bold text-white shadow-lg transition-all active:scale-95 ${nextLesson || isQuestionLesson
                            ? 'bg-primary hover:bg-primary-hover shadow-primary/25'
                            : 'bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600'
                            }`}
                    >
                        <span className="text-sm sm:text-base">
                            {isQuestionLesson && !questionProgress.allAnswered
                                ? (questionProgress.answered > 0 ? 'Fragen fortsetzen' : 'Fragen starten')
                                : nextLesson
                                    ? 'Weiter zur nächsten Lektion'
                                    : (location.state && (location.state as any).fromLernplan)
                                        ? 'Zurück zum Lernplan'
                                        : 'Zurück zur Übersicht'
                            }
                        </span>
                        {isQuestionLesson && !questionProgress.allAnswered
                            ? <AlertCircle size={18} />
                            : nextLesson
                                ? <ChevronRight size={20} />
                                : <BookOpen size={20} />}
                    </button>
                </div>
            </div>
        </div>
    );
}
