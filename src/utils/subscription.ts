export type SubscriptionStatus = 'free' | 'active' | 'canceled' | 'past_due' | 'trialing';
export type SubscriptionPlan = 'free' | 'monthly' | '6months';
export type SubscriptionProvider = 'stripe' | 'apple' | 'google';

export interface SubscriptionLike {
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  provider: SubscriptionProvider;
  current_period_end: string | null;
}

export function hasPremiumAccess(subscription: SubscriptionLike | null | undefined, isTestMode = false): boolean {
  if (isTestMode) {
    return true;
  }

  if (!subscription) {
    return false;
  }

  if (subscription.status === 'active' || subscription.status === 'trialing') {
    return true;
  }

  if (subscription.status === 'canceled' && subscription.current_period_end) {
    return new Date(subscription.current_period_end) > new Date();
  }

  return false;
}
