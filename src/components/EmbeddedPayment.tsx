import { useState, useEffect, useRef, useCallback } from 'react';
import { loadStripe, Stripe, StripeEmbeddedCheckout } from '@stripe/stripe-js';
import { Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { usePostHog, type AnalyticsEventProperties } from '../contexts/PostHogProvider';
import { trackTikTokServerEvent } from '../utils/tiktokAnalytics';

interface EmbeddedPaymentProps {
    clientSecret: string;
    onComplete?: (sessionId: string) => void | Promise<void>;
    trackingContext?: AnalyticsEventProperties;
}

const isInsecureLanOrigin = () => {
    if (typeof window === 'undefined') return false;
    const { protocol, hostname } = window.location;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    return protocol !== 'https:' && !isLocalhost;
};

export const EmbeddedPayment = ({ clientSecret, onComplete, trackingContext }: EmbeddedPaymentProps) => {
    const { trackEvent } = usePostHog();
    const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const onCompleteCalledRef = useRef(false);
    const pollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const checkoutContainerRef = useRef<HTMLDivElement | null>(null);
    const embeddedCheckoutRef = useRef<StripeEmbeddedCheckout | null>(null);
    const stripeMountNodeRef = useRef<HTMLDivElement | null>(null);
    const isMountedRef = useRef(false);
    const onCompleteRef = useRef(onComplete);
    const trackingContextRef = useRef(trackingContext);

    useEffect(() => {
        onCompleteRef.current = onComplete;
        trackingContextRef.current = trackingContext;
    }, [onComplete, trackingContext]);

    useEffect(() => {
        isMountedRef.current = true;
        const sessionId = clientSecret.split('_secret_')[0];
        console.log('[EmbeddedPayment] Mounted, session:', sessionId);
        const currentTrackingContext = trackingContextRef.current;
        if (currentTrackingContext) {
            const context = {
                ...currentTrackingContext,
                checkout_session_id: sessionId,
            };
            trackEvent('tiktok_checkout_embedded_loaded', context);
            trackTikTokServerEvent('tiktok_checkout_embedded_loaded', context);
        }

        const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

        if (!key) {
            if (isMountedRef.current) {
                setError("Stripe ist nicht konfiguriert. Bitte kontaktiere den Support.");
                setLoading(false);
            }
            const currentTrackingContext = trackingContextRef.current;
            if (currentTrackingContext) {
                const context = {
                    ...currentTrackingContext,
                    checkout_session_id: sessionId,
                    reason: 'missing_stripe_key',
                };
                trackEvent('tiktok_checkout_poll_failed', context);
                trackTikTokServerEvent('tiktok_checkout_poll_failed', context);
            }
            return;
        }

        try {
            const promise = loadStripe(key);
            setStripePromise(promise);

            promise.then((stripe) => {
                if (!stripe) {
                    if (isMountedRef.current) {
                        setError(
                            isInsecureLanOrigin()
                                ? "Stripe braucht für den Handy-Test eine HTTPS-Adresse."
                                : "Stripe konnte nicht geladen werden."
                        );
                    }
                    const currentTrackingContext = trackingContextRef.current;
                    if (currentTrackingContext) {
                        const context = {
                            ...currentTrackingContext,
                            checkout_session_id: sessionId,
                            reason: 'stripe_load_empty',
                        };
                        trackEvent('tiktok_checkout_poll_failed', context);
                        trackTikTokServerEvent('tiktok_checkout_poll_failed', context);
                    }
                }
                if (isMountedRef.current) {
                    setLoading(false);
                }
            }).catch((err) => {
                console.error("Stripe load error:", err);
                if (isMountedRef.current) {
                    setError(
                        isInsecureLanOrigin()
                            ? "Stripe braucht für den Handy-Test eine HTTPS-Adresse."
                            : "Stripe konnte nicht geladen werden."
                    );
                    setLoading(false);
                }
                const currentTrackingContext = trackingContextRef.current;
                if (currentTrackingContext) {
                    const context = {
                        ...currentTrackingContext,
                        checkout_session_id: sessionId,
                        reason: 'stripe_load_failed',
                        error_message: err?.message,
                    };
                    trackEvent('tiktok_checkout_poll_failed', context);
                    trackTikTokServerEvent('tiktok_checkout_poll_failed', context);
                }
            });
        } catch (err) {
            console.error("Stripe init error:", err);
            if (isMountedRef.current) {
                setError(
                    isInsecureLanOrigin()
                        ? "Stripe braucht für den Handy-Test eine HTTPS-Adresse."
                        : "Stripe konnte nicht initialisiert werden."
                );
                setLoading(false);
            }
            const currentTrackingContext = trackingContextRef.current;
            if (currentTrackingContext) {
                const context = {
                    ...currentTrackingContext,
                    checkout_session_id: sessionId,
                    reason: 'stripe_init_failed',
                    error_message: err instanceof Error ? err.message : 'Unknown error',
                };
                trackEvent('tiktok_checkout_poll_failed', context);
                trackTikTokServerEvent('tiktok_checkout_poll_failed', context);
            }
        }

        // Cleanup on unmount
        return () => {
            isMountedRef.current = false;
            if (pollingTimeoutRef.current) {
                clearTimeout(pollingTimeoutRef.current);
            }
        };
    }, [clientSecret]);

    // FALLBACK: Poll the specific Checkout Session.
    // This catches cases where Embedded Checkout shows success but does not invoke onComplete.
    useEffect(() => {
        if (loading) return;

        let pollCount = 0;
        const maxPolls = 10;
        const backoffDelays = [3000, 5000, 8000, 12000, 18000];
        const sessionId = clientSecret.split('_secret_')[0];

        const currentTrackingContext = trackingContextRef.current;
        if (currentTrackingContext) {
            const context = {
                ...currentTrackingContext,
                checkout_session_id: sessionId,
                max_polls: maxPolls,
            };
            trackEvent('tiktok_checkout_poll_started', context);
            trackTikTokServerEvent('tiktok_checkout_poll_started', context);
        }

        const checkPaymentStatus = async () => {
            pollCount++;
            console.log(`[EmbeddedPayment] Polling attempt ${pollCount}/${maxPolls}`);

            try {
                const { data, error: verifyError } = await supabase.functions.invoke('verify-checkout', {
                    body: { sessionId },
                });
                if (verifyError) throw verifyError;

                if (data?.isSuccess && data?.paymentStatus === 'paid' && !onCompleteCalledRef.current) {
                    console.log('[EmbeddedPayment] Paid checkout detected via polling');
                    onCompleteCalledRef.current = true;
                    const currentTrackingContext = trackingContextRef.current;
                    if (currentTrackingContext) {
                        const context = {
                            ...currentTrackingContext,
                            checkout_session_id: sessionId,
                            poll_count: pollCount,
                        };
                        trackEvent('tiktok_checkout_poll_success', context);
                        trackTikTokServerEvent('tiktok_checkout_poll_success', context);
                    }

                    setTimeout(() => {
                        if (isMountedRef.current && onCompleteRef.current) {
                            onCompleteRef.current(sessionId);
                        }
                    }, 500);
                    return;
                }
            } catch (err) {
                console.error('[EmbeddedPayment] Polling error:', err);
            }

            // Schedule next poll if not at max
            if (pollCount < maxPolls) {
                scheduleNextPoll();
            } else {
                console.log('[EmbeddedPayment] Max polls reached, stopping');
                const currentTrackingContext = trackingContextRef.current;
                if (currentTrackingContext) {
                    const context = {
                        ...currentTrackingContext,
                        checkout_session_id: sessionId,
                        reason: 'max_polls_reached',
                        poll_count: pollCount,
                    };
                    trackEvent('tiktok_checkout_poll_failed', context);
                    trackTikTokServerEvent('tiktok_checkout_poll_failed', context);
                }
            }
        };

        const scheduleNextPoll = () => {
            const delay = backoffDelays[Math.min(pollCount, backoffDelays.length - 1)];
            pollingTimeoutRef.current = setTimeout(checkPaymentStatus, delay);
        };

        // Start first poll after 3s delay
        const startDelay = setTimeout(checkPaymentStatus, 3000);

        return () => {
            clearTimeout(startDelay);
            if (pollingTimeoutRef.current) {
                clearTimeout(pollingTimeoutRef.current);
            }
        };
    }, [clientSecret, loading, trackEvent]);

    const handleStripeComplete = useCallback(() => {
        if (onCompleteCalledRef.current) {
            return; // Already called via polling
        }

        const sessionId = clientSecret.split('_secret_')[0];
        console.log('[EmbeddedPayment] Stripe onComplete callback fired');
        onCompleteCalledRef.current = true;
        const currentTrackingContext = trackingContextRef.current;
        if (currentTrackingContext) {
            const context = {
                ...currentTrackingContext,
                checkout_session_id: sessionId,
                completion_source: 'stripe_callback',
            };
            trackEvent('tiktok_checkout_completed_client', context);
            trackTikTokServerEvent('tiktok_checkout_completed_client', context);
        }

        // Stop polling since we got the callback
        if (pollingTimeoutRef.current) {
            clearTimeout(pollingTimeoutRef.current);
        }

        // Small delay to show Stripe's success animation
        setTimeout(() => {
            if (isMountedRef.current && onCompleteRef.current) {
                onCompleteRef.current(sessionId);
            }
        }, 1500);
    }, [clientSecret, trackEvent]);

    useEffect(() => {
        if (loading || !stripePromise || error) return;

        let cancelled = false;
        const container = checkoutContainerRef.current;
        if (!container) return;

        const mountNode = document.createElement('div');
        mountNode.className = 'h-full';
        container.replaceChildren(mountNode);
        stripeMountNodeRef.current = mountNode;

        stripePromise
            .then(async (stripe) => {
                if (cancelled || !stripe || !stripeMountNodeRef.current) return;

                const embeddedCheckout = await stripe.initEmbeddedCheckout({
                    clientSecret,
                    onComplete: handleStripeComplete,
                });

                if (cancelled || !stripeMountNodeRef.current) {
                    embeddedCheckout.destroy();
                    return;
                }

                embeddedCheckoutRef.current = embeddedCheckout;
                embeddedCheckout.mount(stripeMountNodeRef.current);
            })
            .catch((err) => {
                console.error("Stripe embedded checkout error:", err);
                if (!cancelled && isMountedRef.current) {
                    setError(
                        isInsecureLanOrigin()
                            ? "Stripe braucht für den Handy-Test eine HTTPS-Adresse."
                            : "Stripe konnte nicht geladen werden."
                    );
                    const currentTrackingContext = trackingContextRef.current;
                    if (currentTrackingContext) {
                        const context = {
                            ...currentTrackingContext,
                            checkout_session_id: clientSecret.split('_secret_')[0],
                            reason: 'embedded_checkout_init_failed',
                            error_message: err?.message,
                        };
                        trackEvent('tiktok_checkout_poll_failed', context);
                        trackTikTokServerEvent('tiktok_checkout_poll_failed', context);
                    }
                }
            });

        return () => {
            cancelled = true;
            const embeddedCheckout = embeddedCheckoutRef.current;
            embeddedCheckoutRef.current = null;

            if (embeddedCheckout) {
                try {
                    embeddedCheckout.destroy();
                } catch (err) {
                    console.warn('[EmbeddedPayment] Stripe checkout cleanup failed:', err);
                }
            }

            if (stripeMountNodeRef.current?.parentNode) {
                try {
                    stripeMountNodeRef.current.parentNode.removeChild(stripeMountNodeRef.current);
                } catch (err) {
                    console.warn('[EmbeddedPayment] Stripe mount node cleanup failed:', err);
                }
            }
            stripeMountNodeRef.current = null;
        };
    }, [clientSecret, error, handleStripeComplete, loading, stripePromise, trackEvent]);

    if (error) {
        const insecureLanOrigin = isInsecureLanOrigin();
        return (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                    <AlertTriangle className="text-red-500" size={24} />
                </div>
                <p className="text-red-600 dark:text-red-400 font-medium mb-2">{error}</p>
                <p className="text-sm text-slate-500">
                    {insecureLanOrigin
                        ? "Öffne die App über eine HTTPS-Preview oder einen HTTPS-Tunnel. Desktop-Tests über localhost funktionieren weiterhin."
                        : "Bitte versuche es später erneut oder kontaktiere uns über WhatsApp."}
                </p>
            </div>
        );
    }

    if (loading || !stripePromise) {
        return (
            <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-4" />
                <p className="text-slate-600 dark:text-slate-400 font-medium">Zahlung wird vorbereitet...</p>
            </div>
        );
    }

    return (
        <div id="checkout" ref={checkoutContainerRef} className="w-full min-h-[400px]" />
    );
};
