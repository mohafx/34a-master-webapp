import { useCallback, useEffect, useState } from 'react';
import { Bug, CheckCircle2, Crown, Loader2, LogIn, LogOut, RefreshCw, Rocket, Sparkles, Ticket, X } from 'lucide-react';
import { useDevPanel, type DevAccountState, type DevShortcutId } from '../../devpanel/DevPanelContext';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { isAdminEmail } from '../../utils/userRoles';
import { getOralExamEntitlement } from '../../services/oralExam';
import { adminResetOralExamTickets, adminSetPremium } from '../../services/oralExamAdmin';
import type { OralExamEntitlement } from '../../types';

const stateButtons: Array<{
  id: DevAccountState;
  label: string;
  icon: typeof LogIn;
}> = [
  { id: 'guest', label: 'Unangemeldet', icon: LogOut },
  { id: 'user', label: 'Angemeldet', icon: LogIn },
  { id: 'premium', label: 'Premium', icon: Crown },
];

const shortcuts: Array<{
  id: DevShortcutId;
  label: string;
}> = [
  { id: 'onboarding', label: 'Erst-Onboarding öffnen' },
  { id: 'tiktok', label: 'TikTok-Funnel öffnen' },
  { id: 'auth', label: 'Auth öffnen' },
  { id: 'paywall', label: 'Paywall öffnen' },
  { id: 'lernplan', label: 'Lernplan öffnen' },
  { id: 'oralExamLive', label: 'Mündliche Prüfung UI anzeigen' },
];


export function LocalDevPanel() {
  const {
    enabled,
    panelOpen,
    setPanelOpen,
    overrideState,
    setOverrideState,
    clearOverrideState,
    openShortcut,
    showExplanationImages,
    setShowExplanationImages,
  } = useDevPanel();

  const { user } = useAuth();
  const isAdmin = isAdminEmail(user?.email);
  const visible = enabled || isAdmin;

  if (!visible) return null;

  const simulateSuccessfulPayment = () => {
    setOverrideState('premium');
    window.location.hash = '#/payment-success?dev_payment=success&session_id=cs_dev_success';
    setPanelOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setPanelOpen(!panelOpen)}
        className="fixed bottom-5 right-5 z-[90] inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-2xl shadow-slate-900/25 transition hover:bg-slate-800 active:scale-[0.98]"
      >
        <Bug size={16} />
        Dev
      </button>

      {panelOpen && (
        <div className="fixed inset-x-4 bottom-20 z-[95] max-h-[calc(100vh-7rem)] max-w-sm overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-900/15 dark:border-slate-800 dark:bg-slate-900 dark:text-white sm:right-5 sm:left-auto sm:w-[360px]">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-black tracking-tight text-slate-900 dark:text-white">Dev-Panel</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Nur lokal aktiv. Schnell zwischen Login und Premium wechseln.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
              aria-label="Dev-Panel schließen"
            >
              <X size={18} />
            </button>
          </div>

          {isAdmin && <AdminSection />}

          {enabled && (
          <>
          <div className="mb-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Zustände
            </p>
            <div className="grid grid-cols-1 gap-2">
              {stateButtons.map(({ id, label, icon: Icon }) => {
                const isActive = overrideState === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setOverrideState(id)}
                    className={`inline-flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                      isActive
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-500/15 dark:text-blue-200'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>{label}</span>
                    <Icon size={16} />
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={clearOverrideState}
              className="mt-2 w-full rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              App normal nutzen
            </button>
          </div>

          <div className="mb-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Optionen
            </p>
            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Bilder in Erklärungen</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Grafiken ein- oder ausschalten</p>
              </div>
              <button
                type="button"
                onClick={() => setShowExplanationImages(!showExplanationImages)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  showExplanationImages ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
                role="switch"
                aria-checked={showExplanationImages}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    showExplanationImages ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Zahlung testen
            </p>
            <button
              type="button"
              onClick={simulateSuccessfulPayment}
              className="mb-4 inline-flex w-full items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-100 dark:hover:bg-emerald-900/30"
            >
              <span>Zahlung erfolgreich simulieren</span>
              <CheckCircle2 size={16} />
            </button>

            <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Shortcuts
            </p>
            <div className="grid grid-cols-1 gap-2">
              {shortcuts.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => openShortcut(id)}
                  className="inline-flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  <span>{label}</span>
                  {id === 'paywall' ? <Crown size={16} /> : id === 'tiktok' ? <Sparkles size={16} /> : <Rocket size={16} />}
                </button>
              ))}
            </div>
          </div>
          </>
          )}
        </div>
      )}
    </>
  );
}

function AdminSection() {
  const { refreshSubscription } = useSubscription();
  const [entitlement, setEntitlement] = useState<OralExamEntitlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | 'premium' | 'reset'>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadEntitlement = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntitlement(await getOralExamEntitlement());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEntitlement();
  }, [loadEntitlement]);

  const handleTogglePremium = async () => {
    if (busy) return;
    setBusy('premium');
    setMessage(null);
    setError(null);
    try {
      const next = !entitlement?.isPremium;
      await adminSetPremium(next);
      await refreshSubscription();
      await loadEntitlement();
      setMessage(next ? 'Konto ist jetzt Premium.' : 'Konto ist jetzt Free.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Premium-Wechsel fehlgeschlagen.');
    } finally {
      setBusy(null);
    }
  };

  const handleReset = async () => {
    if (busy) return;
    setBusy('reset');
    setMessage(null);
    setError(null);
    try {
      const deleted = await adminResetOralExamTickets();
      await loadEntitlement();
      setMessage(`Tickets zurückgesetzt (${deleted} Sessions gelöscht).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Zurücksetzen fehlgeschlagen.');
    } finally {
      setBusy(null);
    }
  };

  const isPremium = Boolean(entitlement?.isPremium);

  return (
    <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
        Admin (echtes Konto)
      </p>

      <div className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
        {loading ? (
          <span className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <Loader2 size={14} className="animate-spin" /> Status wird geladen…
          </span>
        ) : entitlement ? (
          <span>
            {isPremium ? 'Premium' : 'Free'} · {entitlement.remaining}/{entitlement.limit} Tickets ·{' '}
            {entitlement.mode === 'full_simulation' ? 'Vollsimulation' : 'Mini-Test'}
          </span>
        ) : (
          <span className="text-slate-500 dark:text-slate-400">Status unbekannt</span>
        )}
      </div>

      <button
        type="button"
        onClick={handleTogglePremium}
        disabled={busy !== null || loading}
        className={`mb-2 inline-flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition disabled:opacity-50 ${
          isPremium
            ? 'border-amber-400 bg-amber-100 text-amber-900 dark:border-amber-600 dark:bg-amber-800/30 dark:text-amber-100'
            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <span>{isPremium ? 'Premium aktiv → auf Free wechseln' : 'Auf Premium wechseln'}</span>
        {busy === 'premium' ? <Loader2 size={16} className="animate-spin" /> : <Crown size={16} />}
      </button>

      <button
        type="button"
        onClick={handleReset}
        disabled={busy !== null || loading}
        className="inline-flex w-full items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-100 dark:hover:bg-emerald-900/30"
      >
        <span>Tickets aufladen / zurücksetzen</span>
        {busy === 'reset' ? <Loader2 size={16} className="animate-spin" /> : <Ticket size={16} />}
      </button>

      <button
        type="button"
        onClick={() => void loadEntitlement()}
        disabled={busy !== null}
        className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-slate-800 disabled:opacity-50 dark:text-slate-400 dark:hover:text-slate-100"
      >
        <RefreshCw size={12} /> Status aktualisieren
      </button>

      {message && <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">{message}</p>}
      {error && <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-300">{error}</p>}
    </div>
  );
}
