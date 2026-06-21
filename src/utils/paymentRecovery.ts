export const PENDING_PAYMENT_SESSION_KEY = '34a_pending_payment_session_id';
export const PENDING_PAYMENT_SEEN_AT_KEY = '34a_pending_payment_seen_at';
export const PENDING_PAYMENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function rememberPendingPaymentSession(sessionId: string) {
  try {
    const storage = getStorage();
    storage?.setItem(PENDING_PAYMENT_SESSION_KEY, sessionId);
    storage?.setItem(PENDING_PAYMENT_SEEN_AT_KEY, new Date().toISOString());
  } catch {
    // Payment recovery is best-effort. A blocked storage API must not break checkout return.
  }
}

export function clearPendingPaymentSession() {
  try {
    const storage = getStorage();
    storage?.removeItem(PENDING_PAYMENT_SESSION_KEY);
    storage?.removeItem(PENDING_PAYMENT_SEEN_AT_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

export function getRecentPendingPaymentSession(now = new Date()): string | null {
  try {
    const storage = getStorage();
    const sessionId = storage?.getItem(PENDING_PAYMENT_SESSION_KEY);
    if (!sessionId) return null;

    const seenAt = storage?.getItem(PENDING_PAYMENT_SEEN_AT_KEY);
    if (!seenAt) return sessionId;

    const ageMs = now.getTime() - new Date(seenAt).getTime();
    if (Number.isFinite(ageMs) && ageMs <= PENDING_PAYMENT_MAX_AGE_MS) {
      return sessionId;
    }

    clearPendingPaymentSession();
    return null;
  } catch {
    return null;
  }
}
