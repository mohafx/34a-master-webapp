import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import posthog from 'posthog-js';
import { hasAnalyticsConsent, getStoredConsent } from '../components/CookieConsent';

// PostHog Configuration
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || '';
// Proxy über eigene Domain (/ingest) um Ad-Blocker zu umgehen
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || '/ingest';

// Type-safe Event Names
export type AnalyticsEventName =
    // Authentication Events
    | 'user_signed_up'
    | 'signup_completed'
    | 'user_logged_in'
    | 'user_logged_out'
    // Learning Events
    | 'module_viewed'
    | 'lesson_started'
    | 'lesson_completed'
    | 'question_answered'
    | 'quiz_started'
    | 'quiz_completed'
    | 'flashcard_rated'
    // Exam Events
    | 'written_exam_started'
    | 'written_exam_completed'
    | 'mini_exam_started'
    | 'mini_exam_completed'
    // Premium Events
    | 'paywall_shown'
    | 'upgrade_clicked'
    | 'checkout_started'
    | 'subscription_activated'
    // Session Events
    | 'session_started'
    | 'session_ended'
    | 'session_heartbeat'
    // Engagement Events
    | 'bookmark_toggled'
    | 'language_toggled'
    | 'onboarding_completed'
    | 'settings_changed'
    // Error Events
    | 'error_occurred'
    // Navigation Events
    | 'page_viewed';

export interface AnalyticsEventProperties {
    // Common properties
    timestamp?: string;
    // Module/Lesson properties
    module_id?: string;
    module_name?: string;
    lesson_id?: string;
    lesson_name?: string;
    // Question/Flashcard properties
    question_id?: string;
    flashcard_id?: string;
    is_correct?: boolean;
    known?: boolean;
    // Premium properties
    feature_name?: string;
    plan?: string;
    price?: number;
    source?: string;
    // Language properties
    from_language?: string;
    to_language?: string;
    language?: string;
    // Bookmark properties
    action?: 'add' | 'remove';
    // User properties
    is_premium?: boolean;
    // Page properties
    page_path?: string;
    page_title?: string;
    session_id?: string;
    // Generic
    [key: string]: any;
}

interface PostHogContextType {
    isInitialized: boolean;
    isEnabled: boolean;
    trackEvent: (eventName: AnalyticsEventName, properties?: AnalyticsEventProperties) => void;
    identifyUser: (userId: string, traits?: Record<string, any>) => void;
    resetUser: () => void;
    setUserProperties: (properties: Record<string, any>) => void;
}

const PostHogContext = createContext<PostHogContextType | undefined>(undefined);

export function PostHogProvider({ children }: { children: ReactNode }) {
    const [isInitialized, setIsInitialized] = useState(false);
    const [isEnabled, setIsEnabled] = useState(false);

    // Initialize PostHog when consent is given
    useEffect(() => {
        // Check for existing consent
        const consent = getStoredConsent();

        if (consent?.analytics && POSTHOG_KEY) {
            initializePostHog();
        }

        // Listen for storage changes (consent updates)
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === '34a_cookie_consent') {
                const newConsent = getStoredConsent();
                if (newConsent?.analytics && !isInitialized) {
                    initializePostHog();
                } else if (!newConsent?.analytics && isInitialized) {
                    // User revoked consent - disable tracking
                    posthog.opt_out_capturing();
                    setIsEnabled(false);
                }
            }
        };

        window.addEventListener('storage', handleStorageChange);

        // Also check on mount if consent was just given
        const checkConsentInterval = setInterval(() => {
            const currentConsent = getStoredConsent();
            if (currentConsent?.analytics && !isInitialized && POSTHOG_KEY) {
                initializePostHog();
                clearInterval(checkConsentInterval);
            }
        }, 1000);

        // Clear interval after 30 seconds
        setTimeout(() => clearInterval(checkConsentInterval), 30000);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            clearInterval(checkConsentInterval);
        };
    }, [isInitialized]);

    const initializePostHog = () => {
        // Don't initialize PostHog on localhost - no events will be sent
        const isLocalhost = window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname.includes('localhost');

        if (isLocalhost) {
            console.log('🚫 PostHog disabled on localhost - no events will be sent');
            return;
        }

        if (isInitialized || !POSTHOG_KEY) return;

        try {
            posthog.init(POSTHOG_KEY, {
                api_host: POSTHOG_HOST,
                ui_host: 'https://eu.posthog.com', // PostHog UI/Toolbar verwendet echte Domain
                // Privacy settings
                autocapture: false, // Manual tracking only
                capture_pageview: false, // We'll track page views manually
                capture_pageleave: true,
                
                // Erlaubt das Verfolgen über Website (34a-master.de) und App (app.34a-master.de)
                cross_subdomain_cookie: true,

                // Session Replay - enabled with privacy protections
                disable_session_recording: false,
                session_recording: {
                    maskAllInputs: true, // Mask all form inputs for privacy
                    maskTextSelector: '.sensitive-data', // Additional masking
                    recordCrossOriginIframes: false,
                },

                // Error Tracking - enabled
                capture_exceptions: true, // Automatically capture JavaScript errors

                // Performance
                loaded: (posthog) => {
                    // Debug mode in development
                    if (import.meta.env.DEV) {
                        console.log('PostHog initialized with Session Replay & Error Tracking');
                    }
                },
                // Persistence
                persistence: 'localStorage+cookie',
                // EU compliance
                respect_dnt: true,
            });


            setIsInitialized(true);
            setIsEnabled(true);

            // Track session start
            posthog.capture('session_started', {
                timestamp: new Date().toISOString(),
                session_id: posthog.get_session_id()
            });

            console.log('🔍 PostHog Analytics initialized (EU Server)');
        } catch (error) {
            console.error('Failed to initialize PostHog:', error);
        }
    };


    const trackEvent = useCallback((
        eventName: AnalyticsEventName,
        properties?: AnalyticsEventProperties
    ) => {
        if (!isEnabled || !hasAnalyticsConsent()) {
            if (import.meta.env.DEV) {
                console.log(`[PostHog - Disabled] ${eventName}`, properties);
            }
            return;
        }

        try {
            posthog.capture(eventName, {
                ...properties,
                session_id: posthog.get_session_id(),
                timestamp: new Date().toISOString(),
            });

            if (import.meta.env.DEV) {
                console.log(`[PostHog] ${eventName}`, properties);
            }
        } catch (error) {
            console.error('PostHog tracking error:', error);
        }
    }, [isEnabled]);

    // Handle session lifecycle (Heartbeat and End)
    useEffect(() => {
        if (!isEnabled || !isInitialized) return;

        // 1. Session Heartbeat (every 5 minutes)
        const heartbeatInterval = setInterval(() => {
            trackEvent('session_heartbeat');
        }, 5 * 60 * 1000);

        // 2. Session End tracking
        const handleSessionEnd = () => {
            trackEvent('session_ended');
        };

        // Track when user leaves the page/tab
        window.addEventListener('pagehide', handleSessionEnd);
        window.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                handleSessionEnd();
            }
        });

        return () => {
            clearInterval(heartbeatInterval);
            window.removeEventListener('pagehide', handleSessionEnd);
        };
    }, [isEnabled, isInitialized, trackEvent]);

    const identifyUser = useCallback((userId: string, traits?: Record<string, any>) => {
        if (!isEnabled || !hasAnalyticsConsent()) return;

        try {
            posthog.identify(userId, traits);
            if (import.meta.env.DEV) {
                console.log('[PostHog] User identified:', userId, traits);
            }
        } catch (error) {
            console.error('PostHog identify error:', error);
        }
    }, [isEnabled]);

    const resetUser = useCallback(() => {
        if (!isInitialized) return;

        try {
            posthog.reset();
            if (import.meta.env.DEV) {
                console.log('[PostHog] User reset');
            }
        } catch (error) {
            console.error('PostHog reset error:', error);
        }
    }, [isInitialized]);

    const setUserProperties = useCallback((properties: Record<string, any>) => {
        if (!isEnabled || !hasAnalyticsConsent()) return;

        try {
            posthog.people.set(properties);
        } catch (error) {
            console.error('PostHog set properties error:', error);
        }
    }, [isEnabled]);

    return (
        <PostHogContext.Provider value={{
            isInitialized,
            isEnabled,
            trackEvent,
            identifyUser,
            resetUser,
            setUserProperties,
        }}>
            {children}
        </PostHogContext.Provider>
    );
}

// Custom hook for using PostHog
export function usePostHog() {
    const context = useContext(PostHogContext);

    if (!context) {
        // Return no-op functions if used outside provider
        return {
            isInitialized: false,
            isEnabled: false,
            trackEvent: () => { },
            identifyUser: () => { },
            resetUser: () => { },
            setUserProperties: () => { },
        };
    }

    return context;
}

// Utility hook for tracking page views
export function usePageTracking() {
    const { trackEvent, isEnabled } = usePostHog();

    useEffect(() => {
        if (!isEnabled) return;

        // Track initial page view
        trackEvent('page_viewed', {
            page_path: window.location.hash || '/',
            page_title: document.title,
        });

        // Track hash changes for SPA navigation
        const handleHashChange = () => {
            trackEvent('page_viewed', {
                page_path: window.location.hash || '/',
                page_title: document.title,
            });
        };

        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, [isEnabled, trackEvent]);
}
