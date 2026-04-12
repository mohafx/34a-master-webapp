export const TRANSITION_GRANT_SOURCE = 'paywall_transition_2026_04';

export type TransitionGrantType = 'premium_transition';
export type TransitionGrantStatus = 'active' | 'revoked';
export type TransitionNoticeStage = 'first' | 'two_days' | 'last_day' | 'expired';

export interface AccessGrant {
  id: string;
  user_id: string;
  type: TransitionGrantType;
  source: string;
  status: TransitionGrantStatus;
  starts_at: string;
  ends_at: string;
  first_seen_at: string | null;
  last_notice_at: string | null;
  last_notice_stage: TransitionNoticeStage | string | null;
  created_at?: string;
  metadata?: Record<string, unknown> | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function isTransitionGrantActive(grant: AccessGrant | null | undefined, now = new Date()): boolean {
  if (!grant || grant.status !== 'active') return false;
  const startsAt = new Date(grant.starts_at).getTime();
  const endsAt = new Date(grant.ends_at).getTime();
  const nowTime = now.getTime();
  return startsAt <= nowTime && endsAt > nowTime;
}

export function isTransitionGrantExpired(grant: AccessGrant | null | undefined, now = new Date()): boolean {
  if (!grant || grant.status !== 'active') return false;
  return new Date(grant.ends_at).getTime() <= now.getTime();
}

export function getTransitionDaysRemaining(grant: AccessGrant | null | undefined, now = new Date()): number {
  if (!grant) return 0;
  const diff = new Date(grant.ends_at).getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / DAY_MS));
}

export function formatTransitionDate(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('de-DE');
}

function getUtcDateKey(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

export function getTransitionNoticeStage(
  grant: AccessGrant | null | undefined,
  now = new Date(),
): TransitionNoticeStage | null {
  if (!grant || grant.status !== 'active') return null;
  if (isTransitionGrantExpired(grant, now)) return 'expired';

  if (!grant.first_seen_at) return 'first';

  const daysRemaining = getTransitionDaysRemaining(grant, now);
  if (daysRemaining <= 1) return 'last_day';
  if (daysRemaining <= 2) return 'two_days';
  return null;
}

export function shouldShowTransitionNotice(
  grant: AccessGrant | null | undefined,
  stage: TransitionNoticeStage | null,
  now = new Date(),
): boolean {
  if (!grant || !stage) return false;

  if (stage === 'first') {
    return !grant.first_seen_at;
  }

  if (stage === 'expired') {
    return false;
  }

  if (!grant.last_notice_at) return true;
  return getUtcDateKey(grant.last_notice_at) !== getUtcDateKey(now);
}
