import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { toast } from './ToastContext';
import { usePostHog } from './PostHogProvider';

export interface Subscription {
  id: string;
  user_id: string;
  status: 'free' | 'active' | 'canceled' | 'past_due' | 'trialing';
  plan: 'free' | 'monthly' | '6months';
  provider: 'stripe' | 'apple' | 'google';
  current_period_end: string | null;
  created_at?: string;
  provider_customer_id?: string;
}

interface SubscriptionContextType {
  subscription: Subscription | null;
  isPremium: boolean;
  loading: boolean;
  refreshSubscription: () => Promise<void>;
  restorePurchases: () => Promise<void>;
  manageSubscription: () => Promise<void>;
  openCheckout: (plan: 'monthly' | '6months') => Promise<string | null>;
  processPaymentSuccess: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { trackEvent } = usePostHog();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  // ===== ENTITLEMENT LOGIC =====
  // TEMPORARY: All content is free for maximum reach.
  // Original entitlement logic preserved in git history.
  // To re-enable premium gating, revert this single line.
  const isPremium = true;

  const fetchSubscription = async () => {
    if (!user) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching subscription:', error);
      }

      setSubscription(data || null);
    } catch (err) {
      console.error('Error fetching subscription:', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshSubscription = async () => {
    setLoading(true);
    await fetchSubscription();
  };

  const manageSubscription = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-portal-session');
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No portal URL returned');
      }
    } catch (err) {
      console.error('Error opening customer portal:', err);
      toast.error('Konnte Abo-Verwaltung nicht öffnen. Bitte versuche es später erneut.');
    } finally {
      setLoading(false);
    }
  };

  const restorePurchases = async () => {
    const traceId = `restore_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (!user) {
      console.log(`[RESTORE-TRACE] ${traceId} - No user, showing warning`);
      toast.warning('Bitte melde dich zuerst an.');
      return;
    }

    console.log(`[RESTORE-TRACE] ${traceId} - START`, {
      userId: user.id,
      email: user.email,
      ts: new Date().toISOString(),
      userAgent: navigator.userAgent,
      isSafari: /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)
    });

    toast.info('Suche nach bestehendem Abo...');
    setLoading(true);

    try {
      console.log(`[RESTORE-TRACE] ${traceId} - Invoking sync-subscription...`);
      const startTime = performance.now();

      const { data, error } = await supabase.functions.invoke('sync-subscription');

      const duration = Math.round(performance.now() - startTime);
      console.log(`[RESTORE-TRACE] ${traceId} - Response received`, {
        duration: `${duration}ms`,
        hasData: !!data,
        hasError: !!error,
        data: data,
        error: error
      });

      if (error) {
        console.error(`[RESTORE-TRACE] ${traceId} - Supabase invoke error:`, {
          message: error.message,
          name: error.name,
          context: error.context,
          status: error.status
        });
        throw error;
      }

      console.log(`[RESTORE-TRACE] ${traceId} - Sync result:`, data);
      await fetchSubscription();

      // Always show feedback to user
      if (data && data.restored) {
        const details = data.details;
        let message = data.message || 'Einkäufe erfolgreich wiederhergestellt!';
        let planText = 'Abo';

        if (details) {
          const statusText = details.status === 'canceled' ? 'Gekündigt' : 'Aktiv';
          planText = details.plan === '6months' ? '6-Monate Paket' : 'Premium Abo';
          message = `✅ ${planText} gefunden!\nStatus: ${statusText}`;
          if (details.periodEnd) {
            message += `\nGültig bis: ${new Date(details.periodEnd).toLocaleDateString('de-DE')}`;
          }
        }

        console.log(`[RESTORE-TRACE] ${traceId} - SUCCESS: Subscription found`, { planText, details });
        toast.success(message, planText + ' gefunden!');
      } else {
        console.log(`[RESTORE-TRACE] ${traceId} - No valid subscription restored`, data);

        // Show server message if available (e.g., "Kauf wurde erstattet")
        if (data?.message) {
          const isNegative = data.message.includes('storniert') || data.message.includes('rückerstattet') || data.message.includes('abgelaufen');
          if (isNegative) {
            toast.error(data.message, 'Zugriff verweigert');
          } else {
            toast.info(data.message, 'Keine Käufe gefunden');
          }
        } else {
          toast.info('Kein bestehendes Abo gefunden.\n\nFalls du bereits ein Abo hast, stelle sicher, dass du mit der gleichen E-Mail angemeldet bist.', 'Keine Käufe gefunden');
        }
      }

    } catch (err: any) {
      console.error(`[RESTORE-TRACE] ${traceId} - CAUGHT ERROR:`, {
        name: err?.name,
        message: err?.message,
        stack: err?.stack,
        cause: err?.cause,
        // Safari specific: check if it's a fetch/network error
        isFetchError: err?.name === 'TypeError' && err?.message?.includes('Failed to fetch'),
        isNetworkError: err?.message?.includes('Load failed') || err?.message?.includes('NetworkError'),
        fullError: JSON.stringify(err, Object.getOwnPropertyNames(err))
      });

      // More specific error messages based on error type
      let errorMessage = 'Fehler bei der Suche nach Abos.';
      if (err?.message?.includes('Load failed') || err?.message?.includes('Failed to fetch')) {
        errorMessage = 'Netzwerkfehler. Bitte prüfe deine Internetverbindung.';
      } else if (err?.message?.includes('authentifiziert')) {
        errorMessage = 'Sitzung abgelaufen. Bitte melde dich erneut an.';
      } else if (err?.status === 500) {
        errorMessage = 'Serverfehler. Bitte versuche es später erneut.';
      }

      toast.error(errorMessage);
    } finally {
      console.log(`[RESTORE-TRACE] ${traceId} - FINISHED`);
      setLoading(false);
    }
  };

  const openCheckout = async (plan: 'monthly' | '6months') => {
    if (!user) {
      console.error('User must be logged in to checkout');
      return null;
    }

    console.log('Opening checkout for plan:', plan, 'user:', user.id);

    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          priceId: plan
        }
      });

      console.log('Edge function response:', { data, error });

      if (error) {
        console.error('Edge function error:', error);
        // Extract error details from data if available (Supabase often returns error details in data)
        const errorDetails = data?.error || data?.details || JSON.stringify(data) || 'No details';
        const enhancedError = new Error(`Server Error: ${error.message} | Backend: ${errorDetails}`);
        throw enhancedError;
      }

      // Even if no error, check if data contains an error field (for non-2xx responses that return JSON)
      if (data?.error) {
        console.error('Backend returned error:', data);
        throw new Error(`Backend Error: ${data.error} | Details: ${data.details || data.stack || 'none'}`);
      }

      if (!data?.clientSecret) {
        console.error('No clientSecret in response:', data);
        throw new Error('No client secret returned from server');
      }

      // Track checkout started
      trackEvent('checkout_started', {
        plan: plan,
        price: plan === '6months' ? 49 : 19.90
      });

      console.log('Got clientSecret, length:', data.clientSecret?.length);
      return data.clientSecret;
    } catch (err) {
      console.error('Error creating checkout session:', err);
      throw err;
    }
  };

  // Called directly after embedded checkout completes - more reliable than URL-based detection
  const processPaymentSuccess = async () => {
    const debugLog = (msg: string, data?: any) => {
      const ts = new Date().toISOString().substr(11, 12);
      console.log(`[PAYMENT-SUCCESS ${ts}] ${msg}`, data || '');
    };

    debugLog('processPaymentSuccess CALLED');
    setLoading(true);

    try {
      // Sync from Stripe to ensure database is updated
      debugLog('Calling sync-subscription edge function...');
      const { data: syncData, error: syncError } = await supabase.functions.invoke('sync-subscription');
      debugLog('Sync result:', { syncData, syncError });

      // Fetch subscription data to update state
      debugLog('Fetching subscription from DB...');
      await fetchSubscription();
      debugLog('Subscription fetched, state should be updated');

      // Show success toast based on actual sync result
      if (syncData?.restored) {
        const details = syncData.details;
        const planText = details?.plan === '6months' ? '6-Monate Paket' : 'Premium Abo';
        debugLog('SUCCESS: Subscription restored', { planText, details });

        // Track subscription activated
        trackEvent('subscription_activated', {
          plan: details?.plan,
          price: details?.plan === '6months' ? 49 : 19.90,
          source: 'checkout'
        });

        toast.success(`${planText} erfolgreich aktiviert!\n\nDu hast jetzt vollen Zugang zu allen Inhalten.`, '🎉 Willkommen bei 34a Master Premium!');
        setLoading(false);
      } else {
        // Webhook might still be processing - show optimistic message but trigger background polling
        debugLog('Sync did not return restored, starting polling...');
        toast.info('Zahlung wird verarbeitet...', '⏳ Bitte warten');

        // Poll a few times in case webhook is slightly delayed
        let attempts = 0;
        const maxAttempts = 10;
        const interval = setInterval(async () => {
          attempts++;
          debugLog(`Poll attempt ${attempts}/${maxAttempts}`);

          // Try sync again
          const { data: pollSyncData } = await supabase.functions.invoke('sync-subscription');
          debugLog('Poll sync result:', pollSyncData);

          await fetchSubscription();

          if (pollSyncData?.restored) {
            debugLog('SUCCESS via polling!');
            const details = pollSyncData.details;
            const planText = details?.plan === '6months' ? '6-Monate Paket' : 'Premium Abo';
            toast.success(`${planText} erfolgreich aktiviert!`, '🎉 Premium freigeschaltet!');
            clearInterval(interval);
            setLoading(false);
          } else if (attempts >= maxAttempts) {
            debugLog('Max attempts reached, stopping poll');
            toast.warning('Falls dein Abo nicht erscheint, klicke bitte auf "Käufe wiederherstellen".', 'Zahlung wird verarbeitet');
            clearInterval(interval);
            setLoading(false);
          }
        }, 2000);
      }

    } catch (err) {
      console.error('Error in processPaymentSuccess:', err);
      toast.error('Fehler beim Laden des Abos. Bitte "Käufe wiederherstellen" klicken.', 'Zahlung wurde verarbeitet');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscription();
  }, [user]);

  // Listen for subscription changes in real-time
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('subscription-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscriptions',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          fetchSubscription();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Check for checkout return (handles HashRouter URLs like /#/profile?payment=success)
  useEffect(() => {
    const checkPaymentReturn = async () => {
      // For HashRouter, params can be in the hash (e.g., /#/profile?payment=success)
      const hash = window.location.hash; // e.g., "#/profile?payment=success&session_id=cs_xxx"
      const hashParams = hash.includes('?') ? new URLSearchParams(hash.split('?')[1]) : null;

      // Also check regular query string (fallback)
      const regularParams = new URLSearchParams(window.location.search);

      // Combine: prefer hash params, fallback to regular
      const paymentParam = hashParams?.get('payment') || regularParams.get('payment');
      const sessionId = hashParams?.get('session_id') || regularParams.get('session_id');
      const portalParam = hashParams?.get('portal') || regularParams.get('portal');

      // Clean up URL (remove query params from hash)
      const cleanUrl = () => {
        const baseHash = hash.split('?')[0];
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + baseHash;
        window.history.replaceState({ path: newUrl }, '', newUrl);
      };

      // Handle payment return (could be success OR cancel coming back from Klarna etc.)
      if (paymentParam === 'success' || paymentParam === 'return') {
        console.log('[PAY-TRACE] Payment return detected', { paymentParam, sessionId, source: 'checkPaymentReturn' });
        cleanUrl();

        // CRITICAL: If we have a session_id, verify actual payment status
        // This prevents false success on Klarna cancel
        if (sessionId) {
          console.log('[PAY-TRACE] Verifying session status...', { sessionId });
          setLoading(true);

          try {
            // Call verify-checkout to get actual Stripe session status
            const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-checkout', {
              body: { sessionId }
            });

            console.log('[PAY-TRACE] Session verification result:', {
              sessionId,
              isSuccess: verifyData?.isSuccess,
              sessionStatus: verifyData?.sessionStatus,
              paymentStatus: verifyData?.paymentStatus,
              subscriptionStatus: verifyData?.subscriptionStatus,
              error: verifyError
            });

            // ONLY show success if Stripe confirms payment was successful
            if (verifyData?.isSuccess && verifyData?.paymentStatus === 'paid') {
              console.log('[PAY-TRACE] ✅ VERIFIED SUCCESS - payment_status is paid');

              // Sync subscription to DB
              const { data: syncData } = await supabase.functions.invoke('sync-subscription');
              await fetchSubscription();

              toast.success(
                'Du hast jetzt vollen Zugang zu allen Inhalten.',
                '🎉 Willkommen bei 34a Master Premium!'
              );
            } else if (verifyData?.sessionStatus === 'open' || verifyData?.sessionStatus === 'expired') {
              // Session still open or expired = user cancelled/didn't complete
              console.log('[PAY-TRACE] ❌ Session not completed:', verifyData?.sessionStatus);
              toast.info(
                'Die Zahlung wurde nicht abgeschlossen. Du kannst es jederzeit erneut versuchen.',
                'Zahlung abgebrochen'
              );
            } else {
              // Unknown state - don't show success, but also don't alarm user
              console.log('[PAY-TRACE] ⚠️ Unknown session state:', verifyData);
              // Just refresh subscription silently
              await supabase.functions.invoke('sync-subscription');
              await fetchSubscription();
            }

          } catch (err) {
            console.error('[PAY-TRACE] Error verifying session:', err);
            // On error, try sync but don't show success automatically
            await supabase.functions.invoke('sync-subscription');
            await fetchSubscription();
          } finally {
            setLoading(false);
          }

        } else {
          // No session_id in URL - legacy flow or direct navigation
          // Just try to sync, but don't auto-show success toast
          console.log('[PAY-TRACE] No session_id in return URL, syncing silently...');
          setLoading(true);
          try {
            await supabase.functions.invoke('sync-subscription');
            await fetchSubscription();
          } catch (err) {
            console.error('[PAY-TRACE] Sync error:', err);
          } finally {
            setLoading(false);
          }
        }
      }

      // Handle portal return (after managing subscription)
      if (portalParam === 'return') {
        console.log('Portal return detected, syncing subscription from Stripe...');
        setLoading(true);
        cleanUrl();

        try {
          // Call sync-subscription to fetch latest status from Stripe
          await supabase.functions.invoke('sync-subscription');
        } catch (err) {
          console.error('Error syncing after portal return:', err);
        }

        // Poll for updates
        let attempts = 0;
        const maxAttempts = 3;
        await fetchSubscription();

        const interval = setInterval(async () => {
          attempts++;
          await fetchSubscription();
          if (attempts >= maxAttempts) {
            clearInterval(interval);
            setLoading(false);
          }
        }, 1000);
      }
    };

    // Only run if user is authenticated (to avoid running before login)
    if (user) {
      checkPaymentReturn();
    }
  }, [user]);

  return (
    <SubscriptionContext.Provider value={{ subscription, isPremium, loading, refreshSubscription, restorePurchases, manageSubscription, openCheckout, processPaymentSuccess }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) throw new Error('useSubscription must be used within SubscriptionProvider');
  return context;
};
