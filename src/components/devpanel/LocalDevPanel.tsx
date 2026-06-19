import { Bug, CheckCircle2, Crown, LogIn, LogOut, Rocket, Sparkles, X } from 'lucide-react';
import { useDevPanel, type DevAccountState, type DevShortcutId } from '../../devpanel/DevPanelContext';

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

  if (!enabled) return null;

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
        </div>
      )}
    </>
  );
}
