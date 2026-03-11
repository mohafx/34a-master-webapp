import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    signUp: (email: string, password: string, displayName: string) => Promise<void>;
    signIn: (email: string, password: string) => Promise<void>;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
    resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        // Timeout to prevent infinite loading
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Auth check timeout')), 10000);
        });

        // Get current session with race against timeout
        Promise.race([
            supabase.auth.getSession(),
            timeoutPromise
        ])
            .then((result: any) => {
                if (isMounted) {
                    // Check if result is from getSession (has data property)
                    if (result && result.data) {
                        setUser(result.data.session?.user ?? null);
                    }

                    // CRITICAL FIX: Clear the hash if it contains OAuth tokens
                    // This prevents HashRouter from getting confused by access_token parameters
                    // and rendering a blank screen (no matching route)
                    if (window.location.hash && (window.location.hash.includes('access_token') || window.location.hash.includes('error_description'))) {
                        console.log("Cleaning OAuth hash...");
                        window.location.hash = '';
                    }

                    setLoading(false);
                }
            })
            .catch((error) => {
                console.warn('Auth check failed or timed out:', error);
                if (isMounted) {
                    // Fallback to guest mode on error/timeout
                    setUser(null);
                    setLoading(false);
                }
            });

        // Listen to auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
                setUser(session?.user ?? null);

                // Migrate guest data when user signs in - DO NOT await to prevent blocking
                if (event === 'SIGNED_IN' && session?.user) {
                    migrateGuestData(session.user.id).catch(err =>
                        console.error('Error migrating guest data:', err)
                    );
                }
            }
        );

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, []);

    const signUp = async (email: string, password: string, displayName: string) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { display_name: displayName },
                emailRedirectTo: window.location.origin
            }
        });

        if (error) throw error;

        // Check if email already exists (Supabase returns user but with empty identities)
        if (data.user && (!data.user.identities || data.user.identities.length === 0)) {
            throw new Error('Email already registered');
        }

        console.log("SignUp Result:", data);

        // Create user profile only if this is a new user
        if (data.user && data.user.identities && data.user.identities.length > 0) {
            await supabase.from('user_profiles').insert({
                id: data.user.id,
                display_name: displayName
            });
        }
    };

    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        if (error) throw error;
    };

    const signInWithGoogle = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent',
                }
            }
        });
        if (error) throw error;
    };

    const signOut = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    };

    const resetPassword = async (email: string) => {
        // Get the current origin (works for both localhost and production)
        const redirectUrl = `${window.location.origin}/#/reset-password`;

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: redirectUrl
        });
        if (error) throw error;
    };

    return (
        <AuthContext.Provider value={{ user, loading, signUp, signIn, signInWithGoogle, signOut, resetPassword }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};

// Migrate guest data to user account
async function migrateGuestData(userId: string) {
    try {
        const guestProgress = JSON.parse(localStorage.getItem('guest_progress') || '{}');
        const guestBookmarks = JSON.parse(localStorage.getItem('guest_bookmarks') || '[]');
        const guestSettings = JSON.parse(localStorage.getItem('34a_settings') || 'null');

        // Migrate progress and bookmarks in parallel for better performance
        const progressPromises = Object.entries(guestProgress).map(([questionId, isCorrect]) =>
            supabase.from('user_progress').upsert({
                user_id: userId,
                question_id: questionId,
                is_correct: isCorrect as boolean
            })
        );

        const bookmarkPromises = guestBookmarks.map((questionId: string) =>
            supabase.from('user_bookmarks').upsert({
                user_id: userId,
                question_id: questionId
            }, { onConflict: 'user_id, question_id', ignoreDuplicates: true })
        );

        // Migrate settings if they exist
        if (guestSettings) {
            // We can't easily fire-and-forget this in the promise array because it's a single update
            // and we might want to prioritize it or handle it cleanly.
            // But for simplicity, we can await it or add to promises.
            // Let's add it to the wait list but we need to treat it as a promise.
            // Actually, let's just await it separately or add to array.

            await supabase.from('user_profiles').upsert({
                id: userId,
                settings: guestSettings,
                updated_at: new Date().toISOString()
            }, { onConflict: 'id' });
        }

        // Execute all migrations in parallel
        await Promise.all([...progressPromises, ...bookmarkPromises]);

        // Clear guest data
        localStorage.removeItem('guest_progress');
        localStorage.removeItem('guest_bookmarks');
        // We do NOT clear settings from localStorage because we want them to persist as cache

        // Guest data migrated successfully
    } catch (error) {
        console.error('Error migrating guest data:', error);
    }
}
