import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useApp } from '../../App';
import { db } from '../../services/database';
import { WrittenExamQuestion, WrittenExamSession, TOPIC_DISTRIBUTION, MINI_EXAM_TOPIC_DISTRIBUTION, WrittenExamTopic } from '../../types';
import { CheckCircle, XCircle, Trophy, RotateCcw, ChevronLeft, ChevronRight, AlertCircle, Share2, Clock, ChevronDown, ChevronUp, BarChart3, ListChecks, Languages } from 'lucide-react';

const TOPIC_TRANSLATIONS: Record<string, string> = {
  'Recht der öffentlichen Sicherheit und Ordnung': 'قانون الأمن والنظام العام',
  'Gewerberecht': 'القانون التجاري',
  'Datenschutz': 'حماية البيانات',
  'BGB': 'القانون المدني (BGB)',
  'Strafrecht': 'القانون الجنائي',
  'Umgang mit Menschen': 'التعامل مع الناس',
  'Waffenrecht': 'قانون الأسلحة',
  'Sicherheitstechnik': 'تكنولوجيا الأمن',
  'DGUV': 'لوائح الوقاية من الحوادث (DGUV)'
};

export default function WrittenExamResults() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user: authUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<WrittenExamSession | null>(null);
  const [questions, setQuestions] = useState<WrittenExamQuestion[]>([]);
  const [currentReviewIndex, setCurrentReviewIndex] = useState<number | null>(null);
  const { language } = useApp();
  const showTranslation = language === 'DE_AR';
  const [showExplanation, setShowExplanation] = useState(true);

  // Collapse states - expanded by default
  const [showTopicStats, setShowTopicStats] = useState(true);
  const [showTimeStats, setShowTimeStats] = useState(true);
  const [showQuestionReview, setShowQuestionReview] = useState(true);

  useEffect(() => {
    async function loadResults() {
      if (!sessionId) {
        navigate('/exam/intro');
        return;
      }

      try {
        setLoading(true);

        let loadedSession: WrittenExamSession | null = null;

        // Check if it's a guest session (starts with "guest_")
        if (sessionId.startsWith('guest_')) {
          // Load from localStorage
          const sessionData = localStorage.getItem(`written_exam_session_${sessionId}`);
          if (sessionData) {
            loadedSession = JSON.parse(sessionData);
          }
        } else if (authUser) {
          // Load from database for logged in users
          loadedSession = await db.getWrittenExamSession(sessionId);
          if (loadedSession && loadedSession.userId !== authUser.id) {
            navigate('/exam/intro');
            return;
          }
        }

        if (!loadedSession) {
          navigate('/exam/intro');
          return;
        }

        setSession(loadedSession);

        // Load questions
        const loadedQuestions = await db.getWrittenExamQuestionsByIds(loadedSession.questionIds);
        setQuestions(loadedQuestions as WrittenExamQuestion[]);

        setLoading(false);
      } catch (error) {
        console.error('Error loading results:', error);
        navigate('/exam/intro');
      }
    }

    loadResults();
  }, [sessionId, authUser, navigate]);

  const isAnswerCorrect = (question: WrittenExamQuestion, userAnswer: string): boolean => {
    if (!userAnswer) return false;

    const correctAnswer = question.correctAnswer.trim().toUpperCase();
    const userAnswerNormalized = userAnswer.trim().toUpperCase();

    if (correctAnswer.includes(',')) {
      // Multiple choice
      const correctAnswers = correctAnswer.split(',').map(a => a.trim()).sort();
      const userAnswers = userAnswerNormalized.split(',').map(a => a.trim()).sort();
      return (
        correctAnswers.length === userAnswers.length &&
        correctAnswers.every((val, idx) => val === userAnswers[idx])
      );
    } else {
      // Single choice
      return correctAnswer === userAnswerNormalized;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">Ergebnisse werden geladen...</p>
        </div>
      </div>
    );
  }

  if (!session || questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-4 text-amber-500" size={48} />
          <p className="text-slate-600 dark:text-slate-400">Fehler beim Laden der Ergebnisse</p>
        </div>
      </div>
    );
  }

  const score = session.score || 0;
  const totalQuestions = session.totalQuestions;
  const percentage = Math.round((score / totalQuestions) * 100);
  const examType = (session as any).examType || 'full';
  const passingThreshold = Math.ceil(totalQuestions * 0.5); // 50% for both types
  const passed = score >= passingThreshold;

  const handleShareResult = async () => {
    const status = passed ? 'Bestanden ✅' : 'Nicht bestanden ❌';
    const shareText = `🎓 34a Master Prüfungssimulation\n\nErgebnis: ${score}/${totalQuestions} (${percentage}%)\nStatus: ${status}\n\nBereite dich auch auf die §34a Prüfung vor!`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: '34a Master Prüfungsergebnis',
          text: shareText,
        });
      } catch (error) {
        // User cancelled or share failed - do nothing
        console.log('Share cancelled or failed:', error);
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(shareText);
        alert('Ergebnis wurde in die Zwischenablage kopiert!');
      } catch (error) {
        console.error('Clipboard copy failed:', error);
      }
    }
  };

  // --- Statistics Calculations ---

  const calculateTopicStats = () => {
    const stats: Record<string, { total: number; correct: number; percentage: number }> = {};

    // Initialize with all topics from distribution
    Object.keys(TOPIC_DISTRIBUTION).forEach(topic => {
      stats[topic] = { total: 0, correct: 0, percentage: 0 };
    });

    // Aggregate data
    questions.forEach(q => {
      // Normalize topic name (accounting for potential slight variations if any)
      // For now assuming exact matches or fallback
      const topic = q.topic || 'Unbekannt';

      if (!stats[topic]) {
        stats[topic] = { total: 0, correct: 0, percentage: 0 };
      }

      stats[topic].total++;

      const userAnswer = session.userAnswers[q.id];
      if (userAnswer && isAnswerCorrect(q, userAnswer)) {
        stats[topic].correct++;
      }
    });

    // Calculate percentages
    Object.keys(stats).forEach(topic => {
      if (stats[topic].total > 0) {
        stats[topic].percentage = Math.round((stats[topic].correct / stats[topic].total) * 100);
      }
    });

    return stats;
  };

  const calculateTimeStats = () => {
    if (!session.completedAt) return null;

    const start = new Date(session.startedAt).getTime();
    const end = new Date(session.completedAt).getTime();
    const totalMinutes = (end - start) / 1000 / 60;
    const avgSecondsPerQuestion = Math.round(((end - start) / 1000) / totalQuestions);

    return {
      totalMinutes: Math.round(totalMinutes),
      avgSecondsPerQuestion
    };
  };

  const topicStats = calculateTopicStats();
  const timeStats = calculateTimeStats();

  // Radar Chart Helpers
  const getPolarCoordinates = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
      x: centerX + (radius * Math.cos(angleInRadians)),
      y: centerY + (radius * Math.sin(angleInRadians))
    };
  };

  const generateRadarPath = (stats: typeof topicStats, size: number) => {
    // We want only the 9 official topics for the chart
    const officialTopics = Object.keys(TOPIC_DISTRIBUTION) as WrittenExamTopic[];
    const center = size / 2;
    const radius = size * 0.4;
    const angleStep = 360 / officialTopics.length;

    const points = officialTopics.map((topic, i) => {
      const percentage = stats[topic]?.percentage || 0;
      // Scale radius by percentage (min 10% for visibility)
      const valueRadius = radius * (Math.max(percentage, 10) / 100);
      const coords = getPolarCoordinates(center, center, valueRadius, i * angleStep);
      return `${coords.x},${coords.y}`;
    });

    return points.join(' ');
  };

  const generateRadarGrid = (size: number) => {
    const officialTopics = Object.keys(TOPIC_DISTRIBUTION) as WrittenExamTopic[];
    const center = size / 2;
    const maxRadius = size * 0.4;
    const angleStep = 360 / officialTopics.length;

    // Generate concentric polygons (20%, 40%, 60%, 80%, 100%)
    const levels = [0.2, 0.4, 0.6, 0.8, 1];
    const gridPaths = levels.map(level => {
      const radius = maxRadius * level;
      const points = officialTopics.map((_, i) => {
        const coords = getPolarCoordinates(center, center, radius, i * angleStep);
        return `${coords.x},${coords.y}`;
      });
      return points.join(' ');
    });

    // Generate axes
    const axes = officialTopics.map((_, i) => {
      const coords = getPolarCoordinates(center, center, maxRadius, i * angleStep);
      return { x1: center, y1: center, x2: coords.x, y2: coords.y };
    });

    return { gridPaths, axes };
  };

  const correctCount = questions.filter(q => {
    const userAnswer = session.userAnswers[q.id];
    return userAnswer && isAnswerCorrect(q, userAnswer);
  }).length;

  const incorrectCount = questions.filter(q => {
    const userAnswer = session.userAnswers[q.id];
    return userAnswer && !isAnswerCorrect(q, userAnswer);
  }).length;

  const unansweredCount = questions.filter(q => !session.userAnswers[q.id]).length;

  const currentQuestion = currentReviewIndex !== null ? questions[currentReviewIndex] : null;
  const currentUserAnswer = currentQuestion ? session.userAnswers[currentQuestion.id] : '';
  const currentIsCorrect = currentQuestion && currentUserAnswer
    ? isAnswerCorrect(currentQuestion, currentUserAnswer)
    : false;

  return (
    <div className="min-h-screen bg-[#F2F4F6] dark:bg-slate-950 pb-32">
      <div className="px-4 pt-6 pb-4 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Score Card */}
          <div className={`relative bg-gradient-to-br rounded-[20px] p-6 shadow-lg ${passed
            ? 'from-green-500 to-emerald-600'
            : 'from-red-500 to-rose-600'
            }`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex flex-col">
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-3xl font-black text-white">
                    {score} / {totalQuestions}
                  </h1>
                  <button
                    onClick={handleShareResult}
                    className="flex items-center gap-2 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg transition-all active:scale-95 text-white text-[10px] font-bold uppercase tracking-wider"
                  >
                    <Share2 size={12} />
                    Teilen
                  </button>
                </div>
                <p className="text-white/90 text-sm">
                  {percentage}% richtig beantwortet
                </p>
                {showTranslation && (
                  <p className="text-white/80 text-xs mt-0.5" dir="rtl">
                    {percentage}% إجابات صحيحة
                  </p>
                )}
              </div>
              <div className={`w-20 h-20 rounded-full flex items-center justify-center bg-white/20 ${passed ? 'text-green-100' : 'text-red-100'
                }`}>
                {passed ? (
                  <Trophy size={40} className="text-white" />
                ) : (
                  <XCircle size={40} className="text-white" />
                )}
              </div>
            </div>

            <div className={`bg-white/20 backdrop-blur-sm rounded-xl p-4 ${passed ? 'border border-white/30' : 'border border-white/30'
              }`}>
              <div className="flex items-center gap-2 mb-2">
                {passed ? (
                  <>
                    <CheckCircle size={20} className="text-white" />
                    <span className="text-white font-bold text-lg">Bestanden!</span>
                  </>
                ) : (
                  <>
                    <XCircle size={20} className="text-white" />
                    <span className="text-white font-bold text-lg">Nicht bestanden</span>
                  </>
                )}
              </div>
              {showTranslation && (
                <div className="text-right mb-2" dir="rtl">
                  <span className="text-white/90 font-bold text-base">
                    {passed ? 'ناجح!' : 'لم تنجح'}
                  </span>
                </div>
              )}
              <p className="text-white/90 text-sm">
                {passed
                  ? 'Sie haben die Prüfung erfolgreich bestanden. Herzlichen Glückwunsch!'
                  : `Sie benötigen mindestens ${passingThreshold} richtige Antworten (50%) zum Bestehen.`}
              </p>
              {showTranslation && (
                <p className="text-white/80 text-xs mt-1 text-right" dir="rtl">
                  {passed
                    ? 'لقد اجتزت الامتحان بنجاح. مبروك!'
                    : `تحتاج إلى ${passingThreshold} إجابة صحيحة على الأقل (50%) للنجاح.`}
                </p>
              )}
            </div>
          </div>

          {/* Statistics - Redesigned */}
          <div className="bg-white dark:bg-slate-800 rounded-[20px] p-6 shadow-sm border border-slate-100 dark:border-slate-700 h-full flex flex-col justify-center">

            {/* Stacked Horizontal Bar */}
            <div className="mb-8">
              <div className="flex h-4 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700">
                {/* Correct (Green) */}
                {correctCount > 0 && (
                  <div
                    className="bg-green-500 transition-all"
                    style={{ width: `${(correctCount / totalQuestions) * 100}%` }}
                  />
                )}
                {/* Incorrect (Red) */}
                {incorrectCount > 0 && (
                  <div
                    className="bg-red-500 transition-all"
                    style={{ width: `${(incorrectCount / totalQuestions) * 100}%` }}
                  />
                )}
                {/* Unanswered takes remaining space via background */}
              </div>
              <div className="flex justify-between mt-2 text-xs text-slate-400">
                <span>0</span>
                <span>{Math.round(totalQuestions / 2)}</span>
                <span>{totalQuestions}</span>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-4">
              {/* Correct */}
              <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-4 text-center border border-green-100 dark:border-green-800/30">
                <div className="text-2xl sm:text-3xl font-black text-green-600 dark:text-green-400">{correctCount}</div>
                <div className="text-xs font-semibold text-green-700 dark:text-green-300 mt-1">Richtig</div>
                {showTranslation && <div className="text-[10px] text-green-600 dark:text-green-400">صحيح</div>}
                <div className="text-[10px] text-green-500/80 mt-0.5">{Math.round((correctCount / totalQuestions) * 100)}%</div>
              </div>

              {/* Incorrect */}
              <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-4 text-center border border-red-100 dark:border-red-800/30">
                <div className="text-2xl sm:text-3xl font-black text-red-600 dark:text-red-400">{incorrectCount}</div>
                <div className="text-xs font-semibold text-red-700 dark:text-red-300 mt-1">Falsch</div>
                {showTranslation && <div className="text-[10px] text-red-600 dark:text-red-400">خطأ</div>}
                <div className="text-[10px] text-red-500/80 mt-0.5">{Math.round((incorrectCount / totalQuestions) * 100)}%</div>
              </div>

              {/* Unanswered */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 text-center border border-slate-200 dark:border-slate-700">
                <div className="text-2xl sm:text-3xl font-black text-slate-500 dark:text-slate-400">{unansweredCount}</div>
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mt-1">Offen</div>
                {showTranslation && <div className="text-[10px] text-slate-500 dark:text-slate-500">غير مجاب</div>}
                <div className="text-[10px] text-slate-400 mt-0.5">{Math.round((unansweredCount / totalQuestions) * 100)}%</div>
              </div>
            </div>
          </div>
        </div>

        {/* --- Advanced Statistics (Collapsible) --- */}
        <div className="bg-white dark:bg-slate-800 rounded-[20px] shadow-sm border border-slate-100 dark:border-slate-700 mb-6 overflow-hidden">
          <button
            onClick={() => setShowTopicStats(!showTopicStats)}
            className="w-full flex items-center justify-between p-6 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <div className="flex items-center gap-3">
              <BarChart3 className="text-primary" size={24} />
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Performance nach Themengebiet
                </h2>
                {showTranslation && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5 text-right" dir="rtl">
                    الأداء حسب الموضوع
                  </p>
                )}
              </div>
            </div>
            {showTopicStats ? <ChevronUp className="text-slate-400" /> : <ChevronDown className="text-slate-400" />}
          </button>

          {showTopicStats && (
            <div className="p-6 pt-0">
              <div className="flex flex-col md:flex-row gap-8">
                {/* Radar Chart */}
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="relative w-full max-w-[400px] aspect-square">
                    <svg width="100%" height="100%" viewBox="0 0 420 420">
                      {/* Grid Levels */}
                      {(() => {
                        const center = 210; // Updated center for 420x420 viewBox
                        const maxRadius = 100;
                        const officialTopics = Object.keys(TOPIC_DISTRIBUTION) as WrittenExamTopic[];
                        const angleStep = 360 / officialTopics.length;
                        const levels = [0.2, 0.4, 0.6, 0.8, 1];

                        return levels.map((level, i) => {
                          const radius = maxRadius * level;
                          const points = officialTopics.map((_, idx) => {
                            const angle = (idx * angleStep - 90) * Math.PI / 180;
                            return `${center + radius * Math.cos(angle)},${center + radius * Math.sin(angle)}`;
                          }).join(' ');
                          return (
                            <polygon
                              key={`grid-${i}`}
                              points={points}
                              fill="none"
                              stroke={i === 4 ? '#94a3b8' : '#e2e8f0'}
                              strokeWidth="1"
                              className="dark:stroke-slate-700"
                            />
                          );
                        });
                      })()}

                      {/* Axes */}
                      {(() => {
                        const center = 210;
                        const maxRadius = 100;
                        const officialTopics = Object.keys(TOPIC_DISTRIBUTION) as WrittenExamTopic[];
                        const angleStep = 360 / officialTopics.length;

                        return officialTopics.map((_, i) => {
                          const angle = (i * angleStep - 90) * Math.PI / 180;
                          return (
                            <line
                              key={`axis-${i}`}
                              x1={center}
                              y1={center}
                              x2={center + maxRadius * Math.cos(angle)}
                              y2={center + maxRadius * Math.sin(angle)}
                              stroke="#e2e8f0"
                              strokeWidth="1"
                              className="dark:stroke-slate-700"
                            />
                          );
                        });
                      })()}

                      {/* Data Area - Green if >=80%, Red otherwise */}
                      {(() => {
                        const center = 210;
                        const maxRadius = 100;
                        const officialTopics = Object.keys(TOPIC_DISTRIBUTION) as WrittenExamTopic[];
                        const angleStep = 360 / officialTopics.length;

                        const points = officialTopics.map((topic, i) => {
                          const pct = topicStats[topic]?.percentage || 0;
                          const valueRadius = maxRadius * (Math.max(pct, 10) / 100);
                          const angle = (i * angleStep - 90) * Math.PI / 180;
                          return `${center + valueRadius * Math.cos(angle)},${center + valueRadius * Math.sin(angle)}`;
                        }).join(' ');

                        // Calculate overall average
                        const allPercentages = Object.values(topicStats).map(s => s.percentage);
                        const avgPercentage = allPercentages.length > 0
                          ? allPercentages.reduce((a, b) => a + b, 0) / allPercentages.length
                          : 0;

                        // Gradient color: Red (<20%) -> Yellow (20-50%) -> Light Green (50-80%) -> Green (80%+)
                        let fillColor: string;
                        let strokeColor: string;

                        if (avgPercentage < 20) {
                          // Red
                          fillColor = 'rgba(239, 68, 68, 0.25)';
                          strokeColor = '#ef4444';
                        } else if (avgPercentage < 50) {
                          // Orange/Amber
                          fillColor = 'rgba(245, 158, 11, 0.25)';
                          strokeColor = '#f59e0b';
                        } else if (avgPercentage < 80) {
                          // Yellow-Green (Lime)
                          fillColor = 'rgba(132, 204, 22, 0.25)';
                          strokeColor = '#84cc16';
                        } else {
                          // Bright Green
                          fillColor = 'rgba(34, 197, 94, 0.3)';
                          strokeColor = '#22c55e';
                        }

                        return (
                          <g>
                            <polygon
                              points={points}
                              fill={fillColor}
                              stroke={strokeColor}
                              strokeWidth="2.5"
                            />
                          </g>
                        );
                      })()}

                      {/* Labels - Abbreviated outside the chart */}
                      {(() => {
                        const center = 210;
                        const labelRadius = 140; // Increased radius for better spacing
                        const officialTopics = Object.keys(TOPIC_DISTRIBUTION) as WrittenExamTopic[];
                        const angleStep = 360 / officialTopics.length;

                        // Short abbreviations for each topic with dots where appropriate
                        const abbreviations: Record<string, string> = {
                          'Recht der öffentlichen Sicherheit und Ordnung': 'Öff. Recht',
                          'Gewerberecht': 'Gewerbe.',
                          'Datenschutz': 'Daten.',
                          'BGB': 'BGB',
                          'Strafrecht': 'Straf.',
                          'Umgang mit Menschen': 'Menschen.',
                          'Waffenrecht': 'Waffen.',
                          'Sicherheitstechnik': 'Technik.',
                          'DGUV': 'DGUV'
                        };

                        return officialTopics.map((topic, i) => {
                          const angle = (i * angleStep - 90) * Math.PI / 180;
                          // Adjust label position logic to prevent cutoff
                          const x = center + labelRadius * Math.cos(angle);
                          const y = center + labelRadius * Math.sin(angle);

                          let textAnchor: React.SVGProps<SVGTextElement>['textAnchor'] = 'middle';
                          // More aggressive anchor adjustment
                          if (x > center + 10) textAnchor = 'start';
                          if (x < center - 10) textAnchor = 'end';

                          return (
                            <text
                              key={`label-${i}`}
                              x={x}
                              y={y}
                              dy="0.35em"
                              textAnchor={textAnchor}
                              className="text-[11px] fill-slate-600 dark:fill-slate-300 font-bold select-none"
                            >
                              {abbreviations[topic]}
                            </text>
                          );
                        });
                      })()}
                    </svg>
                  </div>
                </div>

                {/* Topic List */}
                <div className="flex-1 space-y-4">
                  {(Object.keys(TOPIC_DISTRIBUTION) as WrittenExamTopic[]).map((topic) => {
                    const stats = topicStats[topic] || { total: 0, correct: 0, percentage: 0 };
                    let colorClass = 'bg-red-500';
                    let textClass = 'text-red-600 dark:text-red-400';

                    if (stats.percentage >= 80) {
                      colorClass = 'bg-green-500';
                      textClass = 'text-green-600 dark:text-green-400';
                    } else if (stats.percentage >= 50) {
                      colorClass = 'bg-amber-500';
                      textClass = 'text-amber-600 dark:text-amber-400';
                    }

                    return (
                      <div key={topic}>
                        <div className="flex justify-between items-end mb-1">
                          <div>
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate max-w-[200px] block" title={topic}>
                              {topic}
                            </span>
                            {showTranslation && (
                              <span className="text-xs text-slate-500 dark:text-slate-400 block text-right" dir="rtl">
                                {TOPIC_TRANSLATIONS[topic] || ''}
                              </span>
                            )}
                          </div>
                          <span className={`text-sm font-bold ${textClass}`}>
                            {stats.percentage}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2.5">
                          <div
                            className={`h-2.5 rounded-full transition-all ${colorClass}`}
                            style={{ width: `${stats.percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* --- Time Management (Collapsible) --- */}
        {timeStats && (
          <div className="bg-white dark:bg-slate-800 rounded-[20px] shadow-sm border border-slate-100 dark:border-slate-700 mb-6 overflow-hidden">
            <button
              onClick={() => setShowTimeStats(!showTimeStats)}
              className="w-full flex items-center justify-between p-6 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <div className="flex items-center gap-3">
                <Clock className="text-primary" size={24} />
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Zeitmanagement
                  </h2>
                  {showTranslation && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5 text-right w-full" dir="rtl">
                      إدارة الوقت
                    </p>
                  )}
                </div>
              </div>
              {showTimeStats ? <ChevronUp className="text-slate-400" /> : <ChevronDown className="text-slate-400" />}
            </button>

            {showTimeStats && (
              <div className="p-6 pt-0">
                <div className="flex flex-col sm:flex-row gap-6">
                  <div className="flex-1 bg-slate-50 dark:bg-slate-700 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
                    <div className="text-2xl font-black text-slate-900 dark:text-white mb-0.5">
                      {timeStats.totalMinutes} Min
                    </div>
                    <div className="text-xs text-slate-500">Gesamtzeit</div>
                    {showTranslation && <div className="text-[10px] text-slate-400 mt-0.5">الوقت الإجمالي</div>}
                  </div>

                  <div className="flex-1 bg-slate-50 dark:bg-slate-700 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
                    <div className="text-2xl font-black text-slate-900 dark:text-white mb-0.5">
                      {timeStats.avgSecondsPerQuestion}s
                    </div>
                    <div className="text-xs text-slate-500">Ø pro Frage</div>
                    {showTranslation && <div className="text-[10px] text-slate-400 mt-0.5">معدل / سؤال</div>}
                  </div>

                  <div className="flex-1 bg-slate-50 dark:bg-slate-700 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
                    <div className="text-2xl font-black text-slate-900 dark:text-white mb-0.5">
                      87s
                    </div>
                    <div className="text-xs text-slate-500">Idealzeit pro Frage</div>
                    {showTranslation && <div className="text-[10px] text-slate-400 mt-0.5">الوقت المثالي</div>}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2.5 mb-2 overflow-hidden">
                    {/* Marker for Optimal Time (87s) - visualized relatively */}
                    <div
                      className={`h-2.5 rounded-full transition-all ${timeStats.avgSecondsPerQuestion > 87 ? 'bg-amber-500' : 'bg-green-500'}`}
                      style={{ width: `${Math.min((timeStats.avgSecondsPerQuestion / 120) * 100, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 uppercase font-medium">
                    <span>0s</span>
                    <span>60s</span>
                    <span>120s+</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Question Review List (Collapsible) */}
        <div className="bg-white dark:bg-slate-800 rounded-[20px] shadow-sm border border-slate-100 dark:border-slate-700 mb-6 overflow-hidden">
          <button
            onClick={() => setShowQuestionReview(!showQuestionReview)}
            className="w-full flex items-center justify-between p-6 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <div className="flex items-center gap-3">
              <ListChecks className="text-primary" size={24} />
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Fragen-Übersicht
                </h2>
                {showTranslation && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5 text-right w-full" dir="rtl">
                    نظرة عامة على الأسئلة
                  </p>
                )}
              </div>
            </div>
            {showQuestionReview ? <ChevronUp className="text-slate-400" /> : <ChevronDown className="text-slate-400" />}
          </button>

          {showQuestionReview && (
            <div className="p-6 pt-0">
              <div className="space-y-2">
                {questions.map((question, index) => {
                  const userAnswer = session.userAnswers[question.id];
                  const isCorrect = userAnswer ? isAnswerCorrect(question, userAnswer) : false;
                  const isAnswered = !!userAnswer;

                  return (
                    <button
                      key={question.id}
                      onClick={() => setCurrentReviewIndex(index)}
                      className={`w-full text-left p-3 rounded-xl border-2 transition-all ${currentReviewIndex === index
                        ? 'border-primary bg-primary/5 dark:bg-primary/10'
                        : 'border-slate-200 dark:border-slate-700 hover:border-primary/50'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                            {index + 1}.
                          </span>
                          <span className={`text-sm ${isAnswered ? 'font-medium' : 'text-slate-400'}`}>
                            {question.questionTextDE.substring(0, 50) + '...'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {isAnswered ? (
                            isCorrect ? (
                              <CheckCircle className="text-green-600 dark:text-green-400" size={20} />
                            ) : (
                              <XCircle className="text-red-600 dark:text-red-400" size={20} />
                            )
                          ) : (
                            <AlertCircle className="text-slate-400" size={20} />
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/exam')}
            className="flex-1 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors font-medium"
          >
            Zurück
          </button>
          <button
            onClick={handleShareResult}
            className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors font-medium flex items-center justify-center gap-2"
          >
            <Share2 size={18} />
            Teilen
          </button>
          <button
            onClick={() => navigate(examType === 'mini' ? '/mini-exam' : '/written-exam')}
            className="flex-1 px-4 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
          >
            <RotateCcw size={18} />
            Neue Prüfung
          </button>
        </div>
      </div>

      {/* Question Review Modal */}
      {currentReviewIndex !== null && currentQuestion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white dark:bg-slate-800 rounded-[20px] p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Frage {currentReviewIndex + 1} / {questions.length}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowExplanation(prev => !prev)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium border ${showExplanation
                    ? 'bg-primary text-white border-primary'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                >
                  Erklärung
                </button>
                <button
                  onClick={() => setCurrentReviewIndex(null)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="mb-6">
              <h4 className="text-base font-medium text-slate-900 dark:text-white mb-4">
                {currentQuestion.questionTextDE}
              </h4>
              {showTranslation && currentQuestion.questionTextAR && (
                <h4 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-4">
                  {currentQuestion.questionTextAR}
                </h4>
              )}

              <div className="space-y-2">
                {(['A', 'B', 'C', 'D'] as const).map((key) => {
                  const answer = currentQuestion.answers[key];
                  const answerText = answer.de;
                  const answerTextAR = answer.ar;
                  const isCorrect = currentQuestion.correctAnswer.includes(key);
                  const isUserAnswer = currentUserAnswer?.includes(key);

                  return (
                    <div
                      key={key}
                      className={`p-3 rounded-xl border-2 ${isCorrect
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                        : isUserAnswer
                          ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                          : 'border-slate-200 dark:border-slate-700'
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-sm ${isCorrect
                            ? 'bg-green-500 text-white'
                            : isUserAnswer
                              ? 'bg-red-500 text-white'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                            }`}
                        >
                          {key}
                        </div>
                        <div className="flex-1">
                          <div>{answerText}</div>
                          {showTranslation && answerTextAR && (
                            <div className="text-sm text-slate-600 dark:text-slate-300">
                              {answerTextAR}
                            </div>
                          )}
                        </div>
                        {isCorrect && (
                          <CheckCircle className="text-green-600 dark:text-green-400" size={20} />
                        )}
                        {isUserAnswer && !isCorrect && (
                          <XCircle className="text-red-600 dark:text-red-400" size={20} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {showExplanation && (
                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                    Erklärung
                  </p>
                  {currentQuestion.explanationDE ? (
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      {currentQuestion.explanationDE}
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-slate-500 mt-2 text-center max-w-[250px]">
                        Die Grafik zeigt Ihre Stärken und Schwächen über alle 9 Sachgebiete.
                      </p>
                      {showTranslation && (
                        <p className="text-[10px] text-slate-400 mt-1 text-center max-w-[250px]" dir="rtl">
                          يوضح الرسم البياني نقاط قوتك وضعفك في جميع المجالات التسعة.
                        </p>
                      )}
                    </>
                  )}
                  {showTranslation && currentQuestion.explanationAR && (
                    <p className="text-sm text-blue-800 dark:text-blue-200 mt-2">
                      {currentQuestion.explanationAR}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (currentReviewIndex > 0) {
                    setCurrentReviewIndex(currentReviewIndex - 1);
                  }
                }}
                disabled={currentReviewIndex === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={18} />
                Zurück
              </button>
              <button
                onClick={() => setCurrentReviewIndex(null)}
                className="flex-1 px-4 py-2 rounded-xl bg-primary text-white font-bold"
              >
                Schließen
              </button>
              <button
                onClick={() => {
                  if (currentReviewIndex < questions.length - 1) {
                    setCurrentReviewIndex(currentReviewIndex + 1);
                  }
                }}
                disabled={currentReviewIndex === questions.length - 1}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Weiter
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
