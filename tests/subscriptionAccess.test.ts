import { describe, expect, it } from 'vitest';
import { hasPremiumAccess } from '../src/utils/subscription';

describe('subscription access helper', () => {
  it('does not grant premium for refunded access', () => {
    expect(hasPremiumAccess({
      status: 'refunded',
      plan: '6months',
      provider: 'stripe',
      current_period_end: '2026-12-20T00:00:00.000Z',
    })).toBe(false);
  });

  it('keeps canceled subscriptions active until their paid period ends', () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    expect(hasPremiumAccess({
      status: 'canceled',
      plan: '6months',
      provider: 'stripe',
      current_period_end: tomorrow,
    })).toBe(true);
  });
});
