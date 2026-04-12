import { useEffect, useRef } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Crown, Timer } from 'lucide-react';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useToast } from '../contexts/ToastContext';
import {
  formatTransitionDate,
  getTransitionDaysRemaining,
  getTransitionNoticeStage,
  isTransitionGrantActive,
  isTransitionGrantExpired,
  shouldShowTransitionNotice,
  type AccessGrant,
  type TransitionNoticeStage,
} from '../utils/transitionAccess';

type TransitionAccessNoticeProps = {
  variant?: 'controller' | 'banner' | 'profile' | 'paywall';
};

function getNoticeCopy(stage: TransitionNoticeStage) {
  if (stage === 'first') {
    return {
      title: 'Übergangszugang aktiviert',
      message:
        'Danke, dass du bereits mit 34a Master gelernt hast. Weil du schon aktiv dabei bist, bekommst du einmalig 7 Tage Übergangszugang zu Premium. Dein Fortschritt bleibt gespeichert. Danach brauchst du Premium, um alle Inhalte weiter zu nutzen.',
    };
  }

  if (stage === 'two_days') {
    return {
      title: 'Noch 2 Tage Übergangszugang',
      message: 'Dein Übergangszugang endet in 2 Tagen. Danach brauchst du Premium, um weiter auf alle Inhalte zuzugreifen.',
    };
  }

  if (stage === 'last_day') {
    return {
      title: 'Übergang endet heute',
      message: 'Dein Übergangszugang endet heute. Dein Fortschritt bleibt gespeichert.',
    };
  }

  return {
    title: 'Übergangszugang abgelaufen',
    message: 'Dein Übergangszugang ist abgelaufen. Dein Fortschritt bleibt gespeichert. Mit Premium kannst du weiterlernen.',
  };
}

function isDevGrant(grant: AccessGrant | null): boolean {
  return grant?.id.startsWith('dev-transition-') || grant?.metadata?.devPanel === true;
}

function getDevReplayStage(grant: AccessGrant, now: Date): TransitionNoticeStage {
  if (isTransitionGrantExpired(grant, now)) return 'expired';
  const daysRemaining = getTransitionDaysRemaining(grant, now);
  if (daysRemaining <= 1) return 'last_day';
  if (daysRemaining <= 2) return 'two_days';
  return 'first';
}

export function TransitionAccessNotice({ variant = 'controller' }: TransitionAccessNoticeProps) {
  const {
    transitionGrant,
    premiumSource,
    markTransitionNotice,
    transitionNoticeReplayNonce,
  } = useSubscription();
  const { showToast } = useToast();
  const replayHandledRef = useRef(0);

  const isActive = isTransitionGrantActive(transitionGrant);
  const isExpired = isTransitionGrantExpired(transitionGrant);
  const daysRemaining = getTransitionDaysRemaining(transitionGrant);
  const endDate = formatTransitionDate(transitionGrant?.ends_at);

  useEffect(() => {
    if (variant !== 'controller') return;
    if (!transitionGrant || premiumSource === 'stripe') return;

    const devReplay =
      isDevGrant(transitionGrant) &&
      transitionNoticeReplayNonce > 0 &&
      replayHandledRef.current !== transitionNoticeReplayNonce;

    if (devReplay) {
      replayHandledRef.current = transitionNoticeReplayNonce;
    }

    const now = new Date();
    const stage = devReplay
      ? getDevReplayStage(transitionGrant, now)
      : getTransitionNoticeStage(transitionGrant, now);

    if (!stage) return;
    if (!devReplay && !shouldShowTransitionNotice(transitionGrant, stage, now)) return;
    if (stage === 'expired' && !devReplay) return;

    const copy = getNoticeCopy(stage);
    showToast({
      title: copy.title,
      message: copy.message,
      type: stage === 'first' ? 'premium' : stage === 'expired' ? 'warning' : 'info',
      duration: stage === 'first' ? 9000 : 7000,
    });

    if (stage !== 'expired') {
      markTransitionNotice(stage);
    }
  }, [
    transitionGrant?.id,
    transitionGrant?.first_seen_at,
    transitionGrant?.last_notice_at,
    transitionGrant?.last_notice_stage,
    transitionGrant?.ends_at,
    variant,
    premiumSource,
    transitionNoticeReplayNonce,
    isActive,
    isExpired,
    showToast,
    markTransitionNotice,
  ]);

  if (variant === 'controller') return null;

  if (variant === 'paywall') {
    if (!transitionGrant || !isExpired || premiumSource === 'stripe') return null;

    return (
      <div className="mb-5 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-100">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300" />
          <div>
            <p className="font-black">Übergangszugang abgelaufen</p>
            <p className="mt-1 text-sm leading-relaxed text-amber-900/80 dark:text-amber-100/80">
              Dein Übergangszugang ist abgelaufen. Dein Fortschritt bleibt gespeichert. Mit Premium kannst du weiterlernen.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!transitionGrant || !isActive || premiumSource !== 'transition') return null;

  if (variant === 'profile') {
    return (
      <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4 dark:border-amber-800/30 dark:from-amber-900/20 dark:to-orange-900/20">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <span className="block font-bold leading-tight text-amber-900 dark:text-amber-300">
              Übergangszugang Premium
            </span>
            <span className="mt-1 flex items-center gap-1 text-xs text-amber-700/80 dark:text-amber-400/80">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
              Aktiv
            </span>
          </div>
          <Crown className="h-5 w-5 text-amber-500" />
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-amber-800/70 dark:text-amber-400/70">Läuft ab am:</span>
            <span className="font-medium text-amber-900 dark:text-amber-300">{endDate}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-amber-800/70 dark:text-amber-400/70">Restlaufzeit:</span>
            <span className="font-medium text-amber-900 dark:text-amber-300">
              {daysRemaining === 1 ? 'Letzter Tag' : `${daysRemaining} Tage`}
            </span>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-amber-900/80 dark:text-amber-100/80">
          Dein Fortschritt bleibt gespeichert. Danach brauchst du Premium, um weiter auf alle Inhalte zuzugreifen.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-5 rounded-[24px] border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-white p-4 shadow-sm dark:border-amber-800/40 dark:from-amber-950/30 dark:via-slate-900 dark:to-slate-900">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/20">
          <CalendarClock size={21} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p className="font-black text-amber-950 dark:text-amber-100">Übergangszugang aktiv</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
              <Timer size={12} />
              {daysRemaining === 1 ? 'letzter Tag' : `${daysRemaining} Tage`}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-amber-900/80 dark:text-amber-100/80">
            Übergangszugang aktiv bis {endDate}. Dein Fortschritt bleibt gespeichert.
          </p>
          {daysRemaining <= 2 && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300">
              <CheckCircle2 size={14} />
              Danach brauchst du Premium, um alle Inhalte weiter zu nutzen.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
