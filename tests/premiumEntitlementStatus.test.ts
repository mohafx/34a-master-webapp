import { describe, expect, it } from 'vitest';
import {
  getPremiumEntitlementStatus,
  pickPremiumSubscription,
  subscriptionGrantsPremium,
} from '../supabase/functions/_shared/entitlement-status';

type TableName = 'subscriptions' | 'access_grants';

interface MockDb {
  subscriptions: any[];
  access_grants: any[];
}

class MockQuery {
  private filters: Array<{ column: string; value: unknown; op: 'eq' }> = [];
  private limitValue: number | null = null;

  constructor(private db: MockDb, private table: TableName) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value, op: 'eq' });
    return this;
  }

  order() {
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  then(resolve: (value: any) => void) {
    let rows = [...this.db[this.table]];
    for (const filter of this.filters) {
      rows = rows.filter((row) => row[filter.column] === filter.value);
    }
    if (this.limitValue !== null) rows = rows.slice(0, this.limitValue);
    return Promise.resolve({ data: rows, error: null }).then(resolve);
  }
}

function createClient(db: MockDb) {
  return {
    from(table: TableName) {
      return new MockQuery(db, table);
    },
  };
}

describe('premium entitlement status', () => {
  const now = new Date('2026-06-21T12:00:00.000Z');

  it('picks a valid paid subscription instead of free/refunded rows', async () => {
    const userId = 'user-1';
    const entitlement = await getPremiumEntitlementStatus(createClient({
      subscriptions: [
        { user_id: userId, status: 'refunded', plan: '6months', current_period_end: '2026-12-01T00:00:00.000Z' },
        { user_id: userId, status: 'active', plan: '6months', current_period_start: '2026-06-20T00:00:00.000Z', current_period_end: '2026-12-20T00:00:00.000Z' },
      ],
      access_grants: [],
    }), userId, now);

    expect(entitlement.isPremium).toBe(true);
    expect(entitlement.source).toBe('stripe');
    expect(entitlement.plan).toBe('6months');
    expect(entitlement.diagnostics.activeSubscriptionCount).toBe(1);
  });

  it('treats refunded and free rows as non-premium', () => {
    expect(subscriptionGrantsPremium({ status: 'refunded', current_period_end: '2026-12-01T00:00:00.000Z' }, now)).toBe(false);
    expect(subscriptionGrantsPremium({ status: 'free', current_period_end: '2026-12-01T00:00:00.000Z' }, now)).toBe(false);
    expect(pickPremiumSubscription([{ status: 'refunded' }, { status: 'free' }], now)).toBeNull();
  });

  it('falls back to an active transition grant', async () => {
    const userId = 'user-2';
    const entitlement = await getPremiumEntitlementStatus(createClient({
      subscriptions: [],
      access_grants: [
        { user_id: userId, status: 'active', starts_at: '2026-06-01T00:00:00.000Z', ends_at: '2026-06-30T00:00:00.000Z' },
      ],
    }), userId, now);

    expect(entitlement.isPremium).toBe(true);
    expect(entitlement.source).toBe('transition');
  });

  it('keeps canceled paid access only until the period ends', () => {
    expect(subscriptionGrantsPremium({
      status: 'canceled',
      current_period_end: '2026-06-22T00:00:00.000Z',
    }, now)).toBe(true);

    expect(subscriptionGrantsPremium({
      status: 'canceled',
      current_period_end: '2026-06-20T00:00:00.000Z',
    }, now)).toBe(false);
  });

  it('does not activate a future transition grant early', async () => {
    const userId = 'user-future-grant';
    const entitlement = await getPremiumEntitlementStatus(createClient({
      subscriptions: [],
      access_grants: [
        { user_id: userId, status: 'active', starts_at: '2026-06-22T00:00:00.000Z', ends_at: '2026-06-30T00:00:00.000Z' },
      ],
    }), userId, now);

    expect(entitlement.isPremium).toBe(false);
    expect(entitlement.source).toBeNull();
    expect(entitlement.diagnostics.reason).toBe('no_active_entitlement');
  });
});
