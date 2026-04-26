import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { CheckCircle, Lock, User, Eye, EyeOff, Loader2 } from 'lucide-react';

/**
 * CompleteRegistration — shown when a guest clicks the recovery link in their
 * post-purchase email. Supabase has already processed the token (via the hash
 * in the URL), so the user is logged in when they arrive here. They just need
 * to set a display name and a password.
 */
export default function CompleteRegistration() {
    const navigate = useNavigate();

    const [displayName, setDisplayName] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [sessionReady, setSessionReady] = useState(false);

    // Wait for Supabase to process the recovery token from the URL hash
    useEffect(() => {
        const checkSession = async () => {
            const { data } = await supabase.auth.getSession();
            if (data.session) {
                setSessionReady(true);
                // Pre-fill display name from metadata if available
                const meta = data.session.user?.user_metadata;
                if (meta?.display_name) {
                    setDisplayName(meta.display_name);
                }
            } else {
                // No session — might need to wait for auth state change
                const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
                    if (session && (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY')) {
                        setSessionReady(true);
                        const meta = session.user?.user_metadata;
                        if (meta?.display_name) {
                            setDisplayName(meta.display_name);
                        }
                        subscription.unsubscribe();
                    }
                });
                return () => subscription.unsubscribe();
            }
        };
        checkSession();
    }, []);

    const handleSubmit = async () => {
        if (!displayName.trim()) {
            setError('Bitte gib einen Namen ein.');
            return;
        }
        if (password.length < 8) {
            setError('Das Passwort muss mindestens 8 Zeichen lang sein.');
            return;
        }
        if (password !== passwordConfirm) {
            setError('Die Passwörter stimmen nicht überein.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            // 1. Set password
            const { error: updateError } = await supabase.auth.updateUser({
                password,
                data: { display_name: displayName.trim(), guest_checkout: false },
            });
            if (updateError) throw updateError;

            // 2. Update profile table
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await supabase.from('user_profiles').upsert({
                    id: user.id,
                    display_name: displayName.trim(),
                });
            }

            // 3. Done — go to dashboard
            navigate('/', { replace: true });
        } catch (err: any) {
            setError(err.message || 'Fehler beim Speichern. Bitte versuche es erneut.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#F0F4FF] to-[#EEF2FF] flex flex-col items-center justify-center px-4 py-10 font-sans">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-black text-[#2663EB] tracking-tight">34a Master</h1>
                    <p className="text-slate-500 text-sm mt-1">Konto einrichten</p>
                </div>

                {/* Card */}
                <div className="bg-white rounded-[2rem] shadow-xl shadow-blue-500/10 p-6 sm:p-8 border border-slate-100">
                    {/* Icon */}
                    <div className="flex justify-center mb-6">
                        <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
                            <CheckCircle size={32} className="text-blue-600" />
                        </div>
                    </div>

                    <h2 className="text-xl font-black text-slate-900 text-center mb-1">
                        Zahlung erfolgreich! 🎉
                    </h2>
                    <p className="text-slate-500 text-sm text-center mb-6 leading-relaxed">
                        Richte jetzt dein Konto ein, um auf deinen Premium-Zugang zuzugreifen.
                    </p>

                    {!sessionReady ? (
                        <div className="flex flex-col items-center gap-3 py-8">
                            <Loader2 className="animate-spin text-blue-500" size={28} />
                            <p className="text-slate-400 text-sm">Sitzung wird geprüft…</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Display Name */}
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                                    Dein Name
                                </label>
                                <div className="relative">
                                    <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        value={displayName}
                                        onChange={(e) => { setDisplayName(e.target.value); setError(''); }}
                                        placeholder="Max Mustermann"
                                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                                    Passwort wählen
                                </label>
                                <div className="relative">
                                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => { setPassword(e.target.value); setError(''); }}
                                        placeholder="Mindestens 8 Zeichen"
                                        className="w-full pl-10 pr-10 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            {/* Confirm Password */}
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                                    Passwort bestätigen
                                </label>
                                <div className="relative">
                                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={passwordConfirm}
                                        onChange={(e) => { setPasswordConfirm(e.target.value); setError(''); }}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                                        placeholder="Passwort wiederholen"
                                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                                    />
                                </div>
                            </div>

                            {/* Error */}
                            {error && (
                                <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
                                    {error}
                                </div>
                            )}

                            {/* Submit */}
                            <button
                                onClick={handleSubmit}
                                disabled={loading}
                                className="w-full bg-[#2563EB] text-white font-black py-4 rounded-2xl shadow-lg hover:bg-blue-700 active:scale-[0.99] transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-60"
                            >
                                {loading ? (
                                    <><Loader2 size={18} className="animate-spin" /> Wird gespeichert…</>
                                ) : (
                                    'Konto einrichten & loslegen →'
                                )}
                            </button>
                        </div>
                    )}
                </div>

                <p className="text-center text-xs text-slate-400 mt-6">
                    Du hast Fragen? Schreib uns:{' '}
                    <a href="mailto:support@34a-master.app" className="text-blue-600 hover:underline">
                        support@34a-master.app
                    </a>
                </p>
            </div>
        </div>
    );
}
