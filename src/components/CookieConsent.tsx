import React, { useState, useEffect } from 'react';
import { Cookie, Shield, Check } from 'lucide-react';
import { Link } from 'react-router-dom';

interface CookieConsentProps {
    onConsentChange?: (consent: ConsentSettings) => void;
}

export interface ConsentSettings {
    necessary: boolean;
    analytics: boolean;
}

const CONSENT_KEY = '34a_cookie_consent';
const CONSENT_VERSION = '1.0';

export function getStoredConsent(): ConsentSettings | null {
    // 1. Zuerst prüfen, ob der globale Domain-Cookie von der Website existiert
    try {
        const rootCookie = document.cookie.split("; ").find((row) => row.startsWith("34a_cookie_consent="));
        if (rootCookie) {
            const val = rootCookie.split("=")[1];
            if (val === "granted") return { necessary: true, analytics: true };
            if (val === "declined") return { necessary: true, analytics: false };
        }
    } catch(e) {
        console.error("Error reading root cookie:", e);
    }

    // 2. Fallback auf den alten LocalStorage-Weg
    try {
        const stored = localStorage.getItem(CONSENT_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.version === CONSENT_VERSION) {
                return parsed.consent;
            }
        }
    } catch (e) {
        console.error('Error reading consent:', e);
    }
    return null;
}

export function hasAnalyticsConsent(): boolean {
    const consent = getStoredConsent();
    return consent?.analytics ?? false;
}

export default function CookieConsent({ onConsentChange }: CookieConsentProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [analyticsEnabled, setAnalyticsEnabled] = useState(true); // Default enabled

    useEffect(() => {
        const stored = getStoredConsent();
        if (!stored) {
            const timer = setTimeout(() => setIsVisible(true), 1000);
            return () => clearTimeout(timer);
        }
    }, []);

    const saveConsent = (consent: ConsentSettings) => {
        localStorage.setItem(CONSENT_KEY, JSON.stringify({
            version: CONSENT_VERSION,
            consent,
            timestamp: new Date().toISOString()
        }));
        onConsentChange?.(consent);
        setIsVisible(false);
    };

    const handleAcceptAll = () => saveConsent({ necessary: true, analytics: analyticsEnabled });
    const handleAcceptNecessary = () => saveConsent({ necessary: true, analytics: false });

    if (!isVisible) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 z-[100] sm:left-auto sm:right-4 sm:max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-300">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-4">
                {/* Header */}
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                        <Cookie size={16} className="text-white" />
                    </div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        Cookie-Einstellungen
                    </p>
                </div>

                {/* Content */}
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
                    Wir nutzen notwendige Cookies für Login und Einstellungen.
                </p>

                {/* Analytics Toggle - Improved Design */}
                <div className="flex items-center justify-between mb-3 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Analyse-Cookies</span>
                    <button
                        onClick={() => setAnalyticsEnabled(!analyticsEnabled)}
                        className={`relative w-11 h-6 rounded-full transition-all duration-200 ${analyticsEnabled
                                ? 'bg-gradient-to-r from-blue-500 to-indigo-500 shadow-inner'
                                : 'bg-slate-300 dark:bg-slate-600'
                            }`}
                    >
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-200 flex items-center justify-center ${analyticsEnabled ? 'left-[22px]' : 'left-0.5'
                            }`}>
                            {analyticsEnabled && <Check size={10} className="text-blue-600" strokeWidth={3} />}
                        </span>
                    </button>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                    <button
                        onClick={handleAcceptNecessary}
                        className="flex-1 py-2 px-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                        Ablehnen
                    </button>
                    <button
                        onClick={handleAcceptAll}
                        className="flex-1 py-2 px-3 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        <Check size={14} className="inline-block mr-1 -mt-0.5" />
                        Akzeptieren
                    </button>
                </div>

                {/* Footer Links */}
                <div className="flex justify-center gap-3 mt-3 text-[10px] text-slate-400 dark:text-slate-500">
                    <Link to="/datenschutz" className="hover:text-slate-600 dark:hover:text-slate-300">Datenschutz</Link>
                    <span>•</span>
                    <Link to="/impressum" className="hover:text-slate-600 dark:hover:text-slate-300">Impressum</Link>
                </div>
            </div>
        </div>
    );
}
