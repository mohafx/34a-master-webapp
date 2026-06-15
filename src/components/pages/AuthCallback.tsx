import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { trackOAuthLoginOnce } from '../../services/serverAnalytics';
import { parseAuthTokensFromHash } from '../../utils/authHash';

// Supabase storageKey is `sb-<project-ref>-auth-token`; the PKCE verifier lives
// under `<storageKey>-code-verifier`. We read it directly only to DIAGNOSE the
// "redirected but not logged in" failure (verifier missing ⇒ wrong-origin
// redirect / allowlist misconfig).
const findCodeVerifierKey = (): string | null => {
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.endsWith('-code-verifier')) return key;
    }
    return null;
};

/**
 * Extract the PKCE `code` from wherever GoTrue may have put it. With a
 * HashRouter redirect (`…/#/auth/callback`) GoTrue can deliver the code as:
 *   a) a real query param:        https://app/?code=xxx#/auth/callback
 *   b) a query inside the hash:   https://app/#/auth/callback?code=xxx
 *   c) a second hash fragment:    https://app/#/auth/callback#code=xxx
 * Case (a) is handled by `detectSessionInUrl`; (b)/(c) are not, so we parse them.
 */
const extractCode = (): { code: string | null; where: string } => {
    const search = new URLSearchParams(window.location.search);
    if (search.get('code')) return { code: search.get('code'), where: 'search' };

    const hash = window.location.hash || '';
    // query-in-hash: split off everything after the first '?'
    if (hash.includes('?')) {
        const code = new URLSearchParams(hash.split('?')[1]).get('code');
        if (code) return { code, where: 'hash-query' };
    }
    // double-hash: take the last '#'-segment and parse as params
    const lastSegment = hash.includes('#') ? hash.substring(hash.lastIndexOf('#') + 1) : '';
    if (lastSegment) {
        const code = new URLSearchParams(lastSegment).get('code');
        if (code) return { code, where: 'double-hash' };
    }
    return { code: null, where: 'none' };
};

export default function AuthCallback() {
    const navigate = useNavigate();
    const [diag, setDiag] = useState<string>('');

    useEffect(() => {
        let finished = false;

        const finish = (session: Session | null, reason: string) => {
            if (finished) return;
            finished = true;
            console.log(`[AuthCallback] finish — session=${!!session} reason=${reason}`);
            if (session) {
                trackOAuthLoginOnce(session.user.id, {
                    email: session.user.email,
                    method: session.user.app_metadata?.provider || 'google',
                    source: 'oauth_callback',
                });
                navigate('/dashboard');
            } else {
                navigate('/?auth=error');
            }
        };

        // The client config has `detectSessionInUrl: true`, so a code that lands
        // in `window.location.search` is exchanged automatically at startup.
        // We listen for that, and additionally handle codes that land in the
        // URL *hash* (which detectSessionInUrl cannot see) ourselves.
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            console.log(`[AuthCallback] onAuthStateChange event=${event} session=${!!session}`);
            if (session) finish(session, `event:${event}`);
        });

        const run = async () => {
            console.log('[AuthCallback] URL =', window.location.href);

            // 1. Maybe detectSessionInUrl already established the session
            //    (getSession awaits the client's initialize/exchange).
            const { data: { session } } = await supabase.auth.getSession();
            if (session) return finish(session, 'getSession-initial');

            // 2. IMPLICIT FLOW (the actual Google case): GoTrue returns the tokens
            //    directly in the URL hash. Because this app uses HashRouter, the
            //    redirect target already has a hash route, so the result is a
            //    DOUBLE hash: `…/#/auth/callback#access_token=…&refresh_token=…`.
            //    Supabase's detectSessionInUrl mis-parses the double hash (it reads
            //    `/auth/callback#access_token` as the key) and never sets a session.
            //    We parse the tokens from the LAST '#' segment ourselves and set
            //    the session explicitly — same approach as reset-password/confirm.
            const { access_token, refresh_token } = parseAuthTokensFromHash(window.location.hash);
            if (access_token && refresh_token) {
                console.log('[AuthCallback] implicit tokens found in hash → setSession');
                const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
                if (!error && data.session) return finish(data.session, 'implicit-setSession');
                if (error) console.error('[AuthCallback] setSession error:', error.message);
            }

            // 3. PKCE FLOW: look for a code we must exchange manually.
            const { code, where } = extractCode();
            const verifierKey = findCodeVerifierKey();
            const hasVerifier = !!verifierKey;
            console.log(`[AuthCallback] code=${code ? `found(${where})` : 'NONE'} verifier=${hasVerifier ? 'present' : 'MISSING'}`);

            if (code && !hasVerifier) {
                // Root cause for "redirected but not logged in": the PKCE verifier
                // was stored on a DIFFERENT origin than this callback. Almost
                // always a Supabase redirect-allowlist / Site-URL mismatch.
                setDiag('Verifier fehlt — wahrscheinlich Redirect auf andere Domain. Siehe Konsole.');
                console.error(
                    '[AuthCallback] PKCE code present but code-verifier MISSING in this origin\'s localStorage. ' +
                    'The OAuth flow started on a different origin than this callback. Check Supabase ' +
                    'Auth → URL Configuration: Site URL + Redirect allowlist must include ' +
                    `${window.location.origin}/#/auth/callback (current origin: ${window.location.origin}).`
                );
                // Still wait for the timeout fallback in case detectSessionInUrl is mid-flight.
            } else if (code && hasVerifier && where !== 'search') {
                // detectSessionInUrl won't have touched a hash-borne code — exchange it.
                try {
                    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
                    if (!error && data.session) return finish(data.session, `manual-exchange:${where}`);
                    if (error) console.error('[AuthCallback] exchangeCodeForSession error:', error.message);
                } catch (err) {
                    console.warn('[AuthCallback] manual exchange threw (maybe already handled):', err);
                }
            }
            // 4. Otherwise wait: onAuthStateChange or the timeout fallback resolves it.
        };

        run();

        // Fallback: re-check after a delay. Covers the race where SIGNED_IN fired
        // before this component mounted, or detectSessionInUrl is still in flight.
        const timer = setTimeout(async () => {
            const { data: { session } } = await supabase.auth.getSession();
            finish(session, 'timeout-fallback');
        }, 4000);

        return () => {
            subscription.unsubscribe();
            clearTimeout(timer);
        };
    }, [navigate]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-secondary/5 dark:from-slate-900 dark:to-slate-950">
            <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mb-4"></div>
                <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">
                    Anmeldung wird abgeschlossen...
                </h2>
                <p className="text-slate-600 dark:text-slate-400 mt-2">
                    Du wirst gleich weitergeleitet.
                </p>
                {diag && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-4 max-w-xs mx-auto">
                        {diag}
                    </p>
                )}
            </div>
        </div>
    );
}
