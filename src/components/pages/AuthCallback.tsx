import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export default function AuthCallback() {
    const navigate = useNavigate();

    useEffect(() => {
        // Handle the OAuth callback
        const handleCallback = async () => {
            try {
                // Supabase automatically handles the session from the URL hash
                const { data: { session }, error } = await supabase.auth.getSession();

                if (error) {
                    console.error('OAuth callback error:', error);
                    // Redirect to home with error
                    navigate('/?auth=error');
                    return;
                }

                if (session) {
                    console.log('OAuth successful, user logged in');
                    // Redirect to dashboard on success
                    navigate('/dashboard');
                } else {
                    // No session found, redirect to home
                    navigate('/');
                }
            } catch (err) {
                console.error('Unexpected error during OAuth callback:', err);
                navigate('/?auth=error');
            }
        };

        handleCallback();
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
