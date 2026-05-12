import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const sinceArg = process.argv.find((arg) => arg.startsWith('--since='));
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const since = sinceArg ? new Date(sinceArg.split('=')[1]) : new Date('2025-01-01T00:00:00.000Z');
const maxSessions = limitArg ? Number(limitArg.split('=')[1]) : Number.POSITIVE_INFINITY;

const stripeKey = process.env.STRIPE_SECRET_KEY;
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.Supabase_Service_Role_Key;
const posthogKey = process.env.POSTHOG_PROJECT_API_KEY || process.env.VITE_POSTHOG_KEY;
const posthogHost = (process.env.POSTHOG_HOST || process.env.VITE_POSTHOG_HOST || 'https://eu.i.posthog.com').replace(/\/$/, '');

if (!stripeKey) throw new Error('STRIPE_SECRET_KEY fehlt.');
if (!supabaseUrl || !supabaseServiceRoleKey) throw new Error('SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt.');
if (!posthogKey) throw new Error('POSTHOG_PROJECT_API_KEY oder VITE_POSTHOG_KEY fehlt.');
if (Number.isNaN(since.getTime())) throw new Error('Ungültiges --since Datum.');

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const stripeFetch = async (path, params = {}) => {
  const url = new URL(`https://api.stripe.com${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const entry of value) url.searchParams.append(`${key}[]`, String(entry));
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${stripeKey}` },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Stripe ${response.status}: ${body}`);
  }

  return response.json();
};

const posthogCapture = async ({ event, distinctId, timestamp, properties = {}, set, setOnce }) => {
  const payloadProperties = {
    ...properties,
    source_type: 'server',
    source: properties.source || 'stripe_posthog_backfill',
    backfilled: true,
    timestamp,
  };

  if (set && Object.keys(set).length) payloadProperties.$set = set;
  if (setOnce && Object.keys(setOnce).length) payloadProperties.$set_once = setOnce;

  if (!apply) return { skipped: true };

  const response = await fetch(`${posthogHost}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: posthogKey,
      event,
      distinct_id: distinctId,
      timestamp,
      properties: payloadProperties,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`PostHog ${response.status}: ${body}`);
  }

  return response.json().catch(() => ({ ok: true }));
};

const identifyPosthogUser = async (userId, anonymousDistinctId, properties = {}) => {
  if (!anonymousDistinctId || anonymousDistinctId === userId) return;
  await posthogCapture({
    event: '$identify',
    distinctId: userId,
    timestamp: new Date().toISOString(),
    properties: {
      $anon_distinct_id: anonymousDistinctId,
      ...properties,
    },
  });
};

let userEmailIndex = null;
async function findUserIdByEmail(email) {
  if (!email) return null;

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('email', email)
    .maybeSingle();

  if (subscription?.user_id) return subscription.user_id;

  if (!userEmailIndex) {
    userEmailIndex = new Map();
    for (let page = 1; ; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      for (const user of data.users || []) {
        if (user.email) userEmailIndex.set(user.email.toLowerCase(), user.id);
      }
      if (!data.users || data.users.length < 1000) break;
    }
  }

  return userEmailIndex.get(email.toLowerCase()) || null;
}

async function* listPaidCheckoutSessions() {
  let startingAfter;
  let yielded = 0;
  const createdGte = Math.floor(since.getTime() / 1000);

  while (yielded < maxSessions) {
    const page = await stripeFetch('/v1/checkout/sessions', {
      limit: Math.min(100, maxSessions - yielded),
      starting_after: startingAfter,
      'created[gte]': createdGte,
      expand: ['data.payment_intent'],
    });

    for (const session of page.data || []) {
      if (session.payment_status === 'paid') {
        yielded += 1;
        yield session;
        if (yielded >= maxSessions) return;
      }
    }

    if (!page.has_more || !page.data?.length) return;
    startingAfter = page.data[page.data.length - 1].id;
  }
}

function getEmail(session) {
  return session.customer_details?.email || session.customer_email || session.metadata?.guest_email || null;
}

function getUserId(session) {
  return session.client_reference_id || session.metadata?.user_id || null;
}

async function backfillSession(session) {
  const email = getEmail(session);
  const userId = getUserId(session) || await findUserIdByEmail(email);
  const timestamp = new Date(session.created * 1000).toISOString();
  const plan = session.metadata?.plan_type || (session.mode === 'payment' ? '6months' : 'monthly');
  const checkoutMode = session.metadata?.guest_checkout === 'true' ? 'guest' : 'authenticated';
  const sessionFunnelId = session.metadata?.session_funnel_id;

  if (!userId) {
    return { status: 'skipped_no_user', sessionId: session.id, email };
  }

  await identifyPosthogUser(userId, sessionFunnelId, {
    source: 'stripe_posthog_backfill',
    checkout_session_id: session.id,
    funnel: session.metadata?.funnel,
  });

  await posthogCapture({
    event: 'payment_succeeded_server',
    distinctId: userId,
    timestamp,
    properties: {
      $insert_id: `stripe_backfill_payment_succeeded_${session.id}`,
      checkout_session_id: session.id,
      payment_status: session.payment_status,
      plan,
      checkout_mode: checkoutMode,
      email,
      source: 'stripe_posthog_backfill',
      tiktok_lernplan_id: session.metadata?.tiktok_lernplan_id,
      session_funnel_id: sessionFunnelId,
      funnel: session.metadata?.funnel,
      stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id,
      stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
      amount_total: session.amount_total,
      currency: session.currency,
    },
    set: {
      email,
      is_premium: true,
      premium_source: 'stripe',
      premium_plan: plan,
      last_payment_at: timestamp,
      stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id,
    },
    setOnce: {
      first_payment_at: timestamp,
      first_paid_plan: plan,
      first_checkout_mode: checkoutMode,
    },
  });

  if (session.metadata?.tiktok_lernplan_id || session.metadata?.funnel === 'tiktok_pruefungscheck') {
    await posthogCapture({
      event: 'tiktok_payment_succeeded_server',
      distinctId: userId,
      timestamp,
      properties: {
        $insert_id: `stripe_backfill_tiktok_payment_succeeded_${session.id}`,
        funnel: 'tiktok_pruefungscheck',
        funnel_version: '2026-04-29',
        source: 'stripe_posthog_backfill',
        tiktok_lernplan_id: session.metadata?.tiktok_lernplan_id,
        checkout_session_id: session.id,
        payment_status: session.payment_status,
        plan_status: 'payment_succeeded',
        session_funnel_id: sessionFunnelId,
        checkout_mode: checkoutMode,
      },
    });
  }

  return { status: apply ? 'sent' : 'dry_run', sessionId: session.id, userId, email, timestamp };
}

const results = {
  mode: apply ? 'apply' : 'dry-run',
  since: since.toISOString(),
  scanned_paid_sessions: 0,
  sent: 0,
  dry_run: 0,
  skipped_no_user: 0,
  failures: 0,
};

for await (const session of listPaidCheckoutSessions()) {
  results.scanned_paid_sessions += 1;
  try {
    const result = await backfillSession(session);
    results[result.status] = (results[result.status] || 0) + 1;
    console.log(JSON.stringify(result));
  } catch (error) {
    results.failures += 1;
    console.error(JSON.stringify({ status: 'failed', sessionId: session.id, message: error.message }));
  }
}

console.log(JSON.stringify(results, null, 2));
