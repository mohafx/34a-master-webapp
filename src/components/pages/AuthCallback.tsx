import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { trackOAuthLoginOnce } from '../../services/serverAnalytics';

export default function AuthCallback() {
    const navigate = useNavigate();

    useEffect(() => {
        let finished = false;

        const finish = (session: Session | null) => {
            if (finished) return;
            finished = true;
            if (session) {
                console.log('OAuth successful, user logged in');
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

        // The client is configured with `detectSessionInUrl: true`. For a PKCE
        // code that lands in `window.location.search` (the usual case: GoTrue
        // appends `?code=` *before* the `#` of our HashRouter redirect, so the
        // URL becomes `https://app/?code=...#/auth/callback`), the client
        // already exchanges it automatically at startup. Calling
        // exchangeCodeForSession again here would fail — a PKCE code is
        // single-use — and wrongly bounce the user to the error page.
        //
        // So: listen for the session that detectSessionInUrl establishes, and
        // only manually exchange a code that lives in the URL *hash*, which
        // detectSessionInUrl cannot see.
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session) finish(session);
        });

        const run = async () => {
            // 1. Maybe detectSessionInUrl already established the session.
            const { data: { session } } = await supabase.auth.getSession();
            if (session) return finish(session);

            // 2. A code in the hash (e.g. `#/auth/callback?code=...`) is NOT seen
            //    by detectSessionInUrl — exchange it ourselves.
            const hashQuery = window.location.hash.includes('?')
                ? window.location.hash.split('?')[1]
                : '';
            const hashCode = new URLSearchParams(hashQuery).get('code');
            if (hashCode) {
                try {
                    const { data, error } = await supabase.auth.exchangeCodeForSession(hashCode);
                    if (!error && data.session) return finish(data.session);
                } catch (err) {
                    console.warn('Manual code exchange failed (likely already handled):', err);
                }
            }
            // 3. Otherwise wait: detectSessionInUrl may still be in flight; the
            //    onAuthStateChange listener or the timeout fallback resolves it.
        };

        run();

        // Fallback: re-check the session after a short delay. Covers the race
        // where detectSessionInUrl exchanged the code but the SIGNED_IN event
        // had already fired before this component mounted.
        const timer = setTimeout(async () => {
            const { data: { session } } = await supabase.auth.getSession();
            finish(session);
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
            </div>
        </div>
    );
}
