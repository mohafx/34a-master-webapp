import { supabase } from '../lib/supabase';

export type ServerAnalyticsEventName =
    | 'user_signed_up_server'
    | 'user_logged_in_server'
    | `tiktok_${string}`;

export type ServerAnalyticsProperties = Record<string, unknown>;

export function trackServerEvent(
    event: ServerAnalyticsEventName,
    properties: ServerAnalyticsProperties = {}
): void {
    supabase.functions.invoke('track-server-event', {
        body: { event, properties },
    }).then(({ error }) => {
        if (error) {
            console.warn('[server-analytics] Tracking failed:', event, error.message);
        }
    }).catch((error) => {
        console.warn('[server-analytics] Tracking failed:', event, error);
    });
}

export function trackOAuthLoginOnce(userId: string, properties: ServerAnalyticsProperties = {}): void {
    const minuteBucket = Math.floor(Date.now() / 60000);
    const provider = String(properties.method || properties.auth_provider || 'oauth');
    const key = `server_analytics_oauth_login:${userId}:${provider}:${minuteBucket}`;

    try {
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, 'true');
    } catch {
        // If sessionStorage is unavailable, still send the event once for this callback execution.
    }

    trackServerEvent('user_logged_in_server', properties);
}
