import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPendingPaymentSession,
  getRecentPendingPaymentSession,
  PENDING_PAYMENT_SEEN_AT_KEY,
  PENDING_PAYMENT_SESSION_KEY,
  rememberPendingPaymentSession,
} from '../src/utils/paymentRecovery';

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string) {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, value);
  }

  removeItem(key: string) {
    this.store.delete(key);
  }
}

describe('payment recovery storage', () => {
  beforeEach(() => {
    vi.useRealTimers();
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
    });
  });

  it('stores and returns a recent checkout session', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-21T12:00:00.000Z'));

    rememberPendingPaymentSession('cs_live_recent');

    expect(localStorage.getItem(PENDING_PAYMENT_SESSION_KEY)).toBe('cs_live_recent');
    expect(localStorage.getItem(PENDING_PAYMENT_SEEN_AT_KEY)).toBe('2026-06-21T12:00:00.000Z');
    expect(getRecentPendingPaymentSession(new Date('2026-06-21T13:00:00.000Z'))).toBe('cs_live_recent');
  });

  it('clears expired pending checkout sessions', () => {
    localStorage.setItem(PENDING_PAYMENT_SESSION_KEY, 'cs_live_old');
    localStorage.setItem(PENDING_PAYMENT_SEEN_AT_KEY, '2026-06-19T12:00:00.000Z');

    expect(getRecentPendingPaymentSession(new Date('2026-06-21T12:00:00.000Z'))).toBeNull();
    expect(localStorage.getItem(PENDING_PAYMENT_SESSION_KEY)).toBeNull();
    expect(localStorage.getItem(PENDING_PAYMENT_SEEN_AT_KEY)).toBeNull();
  });

  it('clears pending checkout sessions explicitly', () => {
    localStorage.setItem(PENDING_PAYMENT_SESSION_KEY, 'cs_live_clear');
    localStorage.setItem(PENDING_PAYMENT_SEEN_AT_KEY, '2026-06-21T12:00:00.000Z');

    clearPendingPaymentSession();

    expect(localStorage.getItem(PENDING_PAYMENT_SESSION_KEY)).toBeNull();
    expect(localStorage.getItem(PENDING_PAYMENT_SEEN_AT_KEY)).toBeNull();
  });

  it('does not throw when browser storage is unavailable', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      get() {
        throw new Error('storage blocked');
      },
      configurable: true,
    });

    expect(() => rememberPendingPaymentSession('cs_live_blocked')).not.toThrow();
    expect(() => clearPendingPaymentSession()).not.toThrow();
    expect(getRecentPendingPaymentSession()).toBeNull();
  });
});
