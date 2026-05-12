import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, ChevronRight, Clock, FileText, Trophy, XCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../services/database';
import { FULL_EXAM_PASSING_POINTS, FULL_EXAM_TOTAL_POINTS, WrittenExamSession } from '../../types';

const SESSION_STORAGE_PREFIX = 'written_exam_session_';

function getGuestCompletedExamSessions(): WrittenExamSession[] {
  return Object.keys(localStorage)
    .filter(key => key.startsWith(SESSION_STORAGE_PREFIX))
    .map(key => {
      try {
        return JSON.parse(localStorage.getItem(key) || '') as WrittenExamSession;
      } catch {
        return null;
      }
    })
    .filter((session): session is WrittenExamSession => Boolean(session?.completedAt))
    .sort((a, b) => new Date(b.completedAt || b.startedAt).getTime() - new Date(a.completedAt || a.startedAt).getTime());
}

function formatDate(value?: string) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function WrittenExamHistory() {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<WrittenExamSession[]>([]);

  useEffect(() => {
    async function loadHistory() {
      try {
        setLoading(true);
        if (authUser) {
          const loadedSessions = await db.getWrittenExamSessions(authUser.id, { completedOnly: true, examType: 'full' });
          setSessions(loadedSessions as WrittenExamSession[]);
        } else {
          setSessions(getGuestCompletedExamSessions().filter(session => session.totalQuestions === 82));
        }
      } catch (error) {
        console.error('Error loading written exam history:', error);
        setSessions([]);
      } finally {
        setLoading(false);
      }
    }

    loadHistory();
  }, [authUser]);

  const summary = useMemo(() => {
    const completed = sessions.length;
    const passed = sessions.filter(session => (session.score || 0) >= FULL_EXAM_PASSING_POINTS).length;
    return { completed, passed };
  }, [sessions]);

  return (
    <div className="max-w-4xl mx-auto px-4 pb-32">
      <div className="pt-3 mb-6">
        <div className="bg-gradient-to-br from-slate-800 to-slate-950 text-white rounded-3xl md:rounded-[2rem] p-5 md:p-8 shadow-card">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => navigate('/exam')}
              className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-2xl flex items-center justify-center transition-all active:scale-95"
              aria-label="Zurück"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="text-right">
              <p className="text-xs font-bold uppercase tracking-wider text-white/60">Archiv</p>
              <h1 className="text-xl md:text-2xl font-black">Abgeschlossene Prüfungen</h1>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/10 rounded-2xl p-4">
              <p className="text-2xl font-black">{summary.completed}</p>
              <p className="text-xs text-white/70">Prüfungen</p>
            </div>
            <div className="bg-white/10 rounded-2xl p-4">
              <p className="text-2xl font-black">{summary.passed}</p>
              <p className="text-xs text-white/70">Bestanden</p>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="min-h-[280px] flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-slate-500 dark:text-slate-400">Prüfungen werden geladen...</p>
          </div>
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-[24px] p-8 text-center border border-slate-100 dark:border-slate-700">
          <FileText className="mx-auto mb-4 text-slate-400" size={42} />
          <h2 className="text-lg font-black text-slate-900 dark:text-white mb-2">Noch keine abgeschlossene Prüfung</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
            Sobald du eine echte Prüfungssimulation abschließt, erscheint sie hier.
          </p>
          <button
            onClick={() => navigate('/exam/intro')}
            className="px-5 py-3 rounded-2xl bg-primary text-white text-sm font-bold hover:bg-primary-hover transition-colors"
          >
            Prüfung starten
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(session => {
            const score = session.score || 0;
            const answeredCount = Object.keys(session.userAnswers || {}).length;
            const passed = score >= FULL_EXAM_PASSING_POINTS;

            return (
              <button
                key={session.id}
                onClick={() => navigate(`/written-exam/results/${session.id}`)}
                className="w-full bg-white dark:bg-slate-800 rounded-[20px] p-4 border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-all active:scale-[0.99] text-left"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${passed ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-rose-50 dark:bg-rose-900/20'}`}>
                    {passed ? (
                      <Trophy className="text-emerald-600 dark:text-emerald-400" size={24} />
                    ) : (
                      <XCircle className="text-rose-600 dark:text-rose-400" size={24} />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {passed ? (
                        <CheckCircle className="text-emerald-500 flex-shrink-0" size={14} />
                      ) : (
                        <XCircle className="text-rose-500 flex-shrink-0" size={14} />
                      )}
                      <span className={`text-xs font-black uppercase tracking-wider ${passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {passed ? 'Bestanden' : 'Nicht bestanden'}
                      </span>
                    </div>
                    <h3 className="font-black text-slate-900 dark:text-white">
                      {score} / {FULL_EXAM_TOTAL_POINTS} Punkte
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>{answeredCount} von {session.totalQuestions} beantwortet</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {formatDate(session.completedAt)}
                      </span>
                    </div>
                  </div>

                  <ChevronRight className="text-slate-400 flex-shrink-0" size={20} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
