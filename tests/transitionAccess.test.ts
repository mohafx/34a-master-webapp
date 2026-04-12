import { describe, expect, it } from 'vitest';
import {
  getTransitionDaysRemaining,
  getTransitionNoticeStage,
  isTransitionGrantActive,
  isTransitionGrantExpired,
  shouldShowTransitionNotice,
  type AccessGrant,
} from '../src/utils/transitionAccess';

function grant(overrides: Partial<AccessGrant> = {}): AccessGrant {
  return {
    id: 'grant-1',
    user_id: 'user-1',
    type: 'premium_transition',
    source: 'paywall_transition_2026_04',
    status: 'active',
    starts_at: '2026-04-10T10:00:00.000Z',
    ends_at: '2026-04-18T10:00:00.000Z',
    first_seen_at: '2026-04-11T10:00:00.000Z',
    last_notice_at: null,
    last_notice_stage: null,
    ...overrides,
  };
}

describe('transition access helpers', () => {
  const now = new Date('2026-04-11T10:00:00.000Z');

  it('treats an active grant as premium-capable', () => {
    expect(isTransitionGrantActive(grant(), now)).toBe(true);
    expect(isTransitionGrantExpired(grant(), now)).toBe(false);
  });

  it('detects expired grants', () => {
    const expired = grant({ ends_at: '2026-04-11T09:59:59.000Z' });

    expect(isTransitionGrantActive(expired, now)).toBe(false);
    expect(isTransitionGrantExpired(expired, now)).toBe(true);
    expect(getTransitionNoticeStage(expired, now)).toBe('expired');
  });

  it('uses first notice before reminder stages', () => {
    const unseen = grant({ first_seen_at: null, ends_at: '2026-04-13T10:00:00.000Z' });

    expect(getTransitionNoticeStage(unseen, now)).toBe('first');
    expect(shouldShowTransitionNotice(unseen, 'first', now)).toBe(true);
  });

  it('shows the two-day reminder at most once per day', () => {
    const twoDays = grant({ ends_at: '2026-04-13T09:00:00.000Z' });
    const alreadySeenToday = grant({
      ends_at: '2026-04-13T09:00:00.000Z',
      last_notice_at: '2026-04-11T07:00:00.000Z',
      last_notice_stage: 'two_days',
    });

    expect(getTransitionNoticeStage(twoDays, now)).toBe('two_days');
    expect(shouldShowTransitionNotice(twoDays, 'two_days', now)).toBe(true);
    expect(shouldShowTransitionNotice(alreadySeenToday, 'two_days', now)).toBe(false);
  });

  it('calculates remaining days with ceiling semantics', () => {
    const lastDay = grant({ ends_at: '2026-04-11T22:00:00.000Z' });

    expect(getTransitionDaysRemaining(lastDay, now)).toBe(1);
    expect(getTransitionNoticeStage(lastDay, now)).toBe('last_day');
  });
});
