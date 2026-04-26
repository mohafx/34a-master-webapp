import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, CheckCircle, ArrowRight } from 'lucide-react';

/**
 * GuestPaymentSuccess — shown after a guest completes Stripe Embedded Checkout.
 * The user is NOT logged in yet. We tell them to check their email.
 * The webhook will have sent a recovery/registration email already.
 */
export default function GuestPaymentSuccess() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const sessionId = searchParams.get('session_id');

    // Auto-redirect to dashboard after 30s (in case they're already logged in somehow)
    useEffect(() => {
        const timer = setTimeout(() => navigate('/'), 30_000);
        return () => clearTimeout(timer);
    }, [navigate]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#F0F4FF] to-[#EEF2FF] flex flex-col items-center justify-center px-4 py-10 font-sans">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-black text-[#2663EB] tracking-tight">34a Master</h1>
                </div>

                {/* Success card */}
                <div className="bg-white rounded-[2rem] shadow-xl shadow-green-500/10 p-6 sm:p-8 border border-slate-100 text-center">
                    {/* Animated checkmark */}
                    <div className="flex justify-center mb-6">
                        <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center animate-in zoom-in duration-500">
                            <CheckCircle size={44} className="text-green-500" strokeWidth={1.5} />
                        </div>
                    </div>

                    <h2 className="text-2xl font-black text-slate-900 mb-2">
                        Zahlung erfolgreich! 🎉
                    </h2>
                    <p className="text-slate-500 text-sm leading-relaxed mb-8">
                        Vielen Dank für deinen Kauf. Dein Premium-Zugang wurde aktiviert.
                    </p>

                    {/* Email instruction */}
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 mb-6 text-left">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
                                <Mail size={20} className="text-white" />
                            </div>
                            <div>
                                <p className="text-[14px] font-bold text-slate-900 mb-1">
                                    Schau in dein Postfach!
                                </p>
                                <p className="text-[13px] text-slate-500 leading-relaxed">
                                    Wir haben dir eine E-Mail geschickt. Klicke auf den Link, um deinen Namen und
                                    dein Passwort einzurichten und direkt loszulegen.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Steps */}
                    <div className="space-y-3 text-left mb-8">
                        {[
                            { step: '1', label: 'E-Mail öffnen', desc: 'Betreff: Registrierung abschließen' },
                            { step: '2', label: 'Link klicken', desc: 'Dich zur App weiterleiten lassen' },
                            { step: '3', label: 'Passwort setzen', desc: 'Name & Passwort eingeben' },
                            { step: '4', label: 'Loslegen!', desc: 'Alle Inhalte sind freigeschaltet 🚀' },
                        ].map(({ step, label, desc }) => (
                            <div key={step} className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-[12px] font-black flex items-center justify-center shrink-0">
                                    {step}
                                </div>
                                <div>
                                    <span className="text-[13px] font-bold text-slate-800">{label}</span>
                                    <span className="text-[12px] text-slate-400 ml-2">{desc}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* CTA — if already logged in */}
                    <button
                        onClick={() => navigate('/')}
                        className="w-full bg-slate-100 text-slate-700 font-bold py-3 rounded-2xl hover:bg-slate-200 active:scale-[0.99] transition-all flex items-center justify-center gap-2 text-sm"
                    >
                        Zur Startseite <ArrowRight size={16} />
                    </button>
                </div>

                <p className="text-center text-xs text-slate-400 mt-6">
                    Keine E-Mail erhalten?{' '}
                    <a href="mailto:support@34a-master.app" className="text-blue-600 hover:underline">
                        support@34a-master.app
                    </a>
                </p>
            </div>
        </div>
    );
}
