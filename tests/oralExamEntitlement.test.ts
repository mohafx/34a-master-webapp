import { describe, expect, it } from 'vitest';
import {
  getOralExamEntitlement,
  pickPremiumSubscription,
} from '../supabase/functions/_shared/oral-exam-entitlement';

type TableName = 'subscriptions' | 'access_grants' | 'oral_exam_sessions';

interface MockDb {
  subscriptions: any[];
  access_grants: any[];
  oral_exam_sessions: any[];
}

class MockQuery {
  private filters: Array<{ column: string; value: unknown; op: 'eq' | 'gte' | 'lte' }> = [];
  private limitValue: number | null = null;
  private selectOptions: { count?: string; head?: boolean } | undefined;

  constructor(private db: MockDb, private table: TableName) {}

  select(_columns: string, options?: { count?: string; head?: boolean }) {
    this.selectOptions = options;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value, op: 'eq' });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ column, value, op: 'gte' });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ column, value, op: 'lte' });
    return this;
  }

  order(_column: string, _options?: unknown) {
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  maybeSingle() {
    const rows = this.rows();
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  }

  then(resolve: (value: any) => void) {
    const rows = this.rows();
    if (this.selectOptions?.head && this.selectOptions?.count === 'exact') {
      return Promise.resolve({ count: rows.length, error: null }).then(resolve);
    }
    return Promise.resolve({ data: rows, error: null }).then(resolve);
  }

  private rows() {
    let rows = [...this.db[this.table]];
    for (const filter of this.filters) {
      rows = rows.filter((row) => {
        const value = row[filter.column];
        if (filter.op === 'eq') return value === filter.value;
        if (filter.op === 'gte') return new Date(value).getTime() >= new Date(String(filter.value)).getTime();
        return new Date(value).getTime() <= new Date(String(filter.value)).getTime();
      });
    }
    if (this.limitValue !== null) rows = rows.slice(0, this.limitValue);
    return rows;
  }
}

function createClient(db: MockDb) {
  return {
    from(table: TableName) {
      return new MockQuery(db, table);
    },
  } as any;
}

describe('oral exam entitlement', () => {
  it('selects an active premium subscription even when older/free rows exist', async () => {
    const userId = 'user-premium';
    const db: MockDb = {
      subscriptions: [
        {
          user_id: userId,
          status: 'free',
          current_period_start: null,
          current_period_end: null,
          created_at: '2026-01-01T00:00:00.000Z',
        },
        {
          user_id: userId,
          status: 'active',
          current_period_start: '2026-06-01T00:00:00.000Z',
          current_period_end: '2026-07-01T00:00:00.000Z',
          created_at: '2026-06-01T00:00:00.000Z',
        },
      ],
      access_grants: [],
      oral_exam_sessions: [
        { user_id: userId, mode: 'free_test_3q', created_at: '2026-06-10T00:00:00.000Z' },
        { user_id: userId, mode: 'full_simulation', created_at: '2026-06-12T00:00:00.000Z' },
      ],
    };

    const entitlement = await getOralExamEntitlement(createClient(db), userId);

    expect(entitlement.isPremium).toBe(true);
    expect(entitlement.mode).toBe('full_simulation');
    expect(entitlement.used).toBe(1);
    expect(entitlement.limit).toBe(10);
    expect(entitlement.remaining).toBe(9);
  });

  it('falls back to free when there is no valid subscription or grant', async () => {
    const userId = 'user-free';
    const db: MockDb = {
      subscriptions: [
        {
          user_id: userId,
          status: 'free',
          current_period_start: null,
          current_period_end: null,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      access_grants: [],
      oral_exam_sessions: [
        { user_id: userId, mode: 'free_test_3q', created_at: '2026-06-12T00:00:00.000Z' },
      ],
    };

    const entitlement = await getOralExamEntitlement(createClient(db), userId);

    expect(entitlement.isPremium).toBe(false);
    expect(entitlement.mode).toBe('free_test_3q');
    expect(entitlement.used).toBe(1);
    expect(entitlement.remaining).toBe(0);
  });

  it('grants premium through active transition grants', async () => {
    const userId = 'user-grant';
    const db: MockDb = {
      subscriptions: [],
      access_grants: [
        {
          user_id: userId,
          status: 'active',
          starts_at: '2026-06-01T00:00:00.000Z',
          ends_at: '2099-01-01T00:00:00.000Z',
          created_at: '2026-06-01T00:00:00.000Z',
        },
      ],
      oral_exam_sessions: [
        { user_id: userId, mode: 'full_simulation', created_at: '2026-05-31T23:59:59.000Z' },
        { user_id: userId, mode: 'full_simulation', created_at: '2026-06-02T00:00:00.000Z' },
      ],
    };

    const entitlement = await getOralExamEntitlement(createClient(db), userId);

    expect(entitlement.isPremium).toBe(true);
    expect(entitlement.mode).toBe('full_simulation');
    expect(entitlement.used).toBe(1);
    expect(entitlement.remaining).toBe(9);
  });

  it('prefers valid premium rows over invalid rows', () => {
    expect(
      pickPremiumSubscription([
        { status: 'free' },
        { status: 'active', current_period_end: '2026-07-01T00:00:00.000Z' },
      ])?.status,
    ).toBe('active');
  });
});
