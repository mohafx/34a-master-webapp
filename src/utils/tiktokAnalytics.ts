import type { AnalyticsEventProperties } from '../contexts/PostHogProvider';
import { trackServerEvent } from '../services/serverAnalytics';

export const TIKTOK_FUNNEL_NAME = 'tiktok_pruefungscheck';
export const TIKTOK_FUNNEL_VERSION = '2026-04-29';

const SESSION_FUNNEL_ID_KEY = '34a_tiktok_session_funnel_id';
const ENTRY_PATH_KEY = '34a_tiktok_entry_path';

function createFunnelId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    return `tiktok_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function resetTikTokFunnelSession(): string {
    const funnelId = createFunnelId();
    sessionStorage.setItem(SESSION_FUNNEL_ID_KEY, funnelId);
    sessionStorage.setItem(ENTRY_PATH_KEY, window.location.hash || window.location.pathname || '/tiktok');
    return funnelId;
}

export function getTikTokFunnelSessionId(): string {
    const existing = sessionStorage.getItem(SESSION_FUNNEL_ID_KEY);
    if (existing) return existing;
    return resetTikTokFunnelSession();
}

export function getTikTokAnalyticsContext(
    screen: string,
    language: string,
    extra: AnalyticsEventProperties = {},
): AnalyticsEventProperties {
    return {
        funnel: TIKTOK_FUNNEL_NAME,
        funnel_version: TIKTOK_FUNNEL_VERSION,
        entry_path: sessionStorage.getItem(ENTRY_PATH_KEY) || window.location.hash || window.location.pathname || '/tiktok',
        language,
        is_arabic_enabled: language === 'DE_AR',
        session_funnel_id: getTikTokFunnelSessionId(),
        screen,
        ...extra,
    };
}

export function getEmailDomain(email: string): string | undefined {
    return email.trim().toLowerCase().split('@')[1] || undefined;
}

export function trackTikTokServerEvent(eventName: `tiktok_${string}`, properties: AnalyticsEventProperties): void {
    trackServerEvent(eventName, properties);
}
